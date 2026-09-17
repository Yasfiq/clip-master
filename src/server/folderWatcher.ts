import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { JobStatus } from '@prisma/client';
import { PATHS } from './paths';
import { logger } from './logger';
import { db } from './db';
import { jobService } from './services/jobService';
import { parseSourceFileName } from '../pipeline/logic/sourceNaming';

export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.avi'] as const;

export interface StabilityOptions {
  intervalMs?: number;
  maxAttempts?: number;
}

export interface WatcherOptions {
  incomingPath?: string;
  sourcesPath?: string;
  stabilityIntervalMs?: number;
  maxStabilityAttempts?: number;
  pollIntervalMs?: number;
  autoStartJob?: boolean;
}

export interface ProcessedFileRecord {
  id: string;
  originalFilename: string;
  destinationFilename?: string;
  destinationPath?: string;
  jobId?: string;
  fileSizeBytes?: number;
  sourceTitle?: string;
  sourceChannel?: string;
  status: 'SUCCESS' | 'FAILED';
  error?: string;
  processedAt: string;
}

export interface WatcherStatus {
  active: boolean;
  incomingPath: string;
  sourcesPath: string;
  supportedExtensions: readonly string[];
  pendingFiles: string[];
  processedFiles: ProcessedFileRecord[];
}

let activeWatcher: FSWatcher | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let isActive = false;
let activeOptions: WatcherOptions | null = null;

const pendingFiles = new Set<string>();
const processedHistory: ProcessedFileRecord[] = [];
const MAX_HISTORY = 50;

/**
 * Check if the given filename is a supported video format
 * and not a temporary/download/hidden file.
 */
export function isVideoFile(filename: string): boolean {
  if (!filename || filename.startsWith('.')) return false;

  if (
    filename.endsWith('.part') ||
    filename.endsWith('.crdownload') ||
    filename.endsWith('.tmp') ||
    filename.endsWith('.ytdl') ||
    filename.endsWith('~')
  ) {
    return false;
  }

  const ext = path.extname(filename).toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.includes(ext as any);
}

/**
 * Generate a collision-safe destination filename for media/sources/
 * with timestamp and UUID prefix.
 */
export function generateSafeSourceFilename(originalFilename: string): string {
  const ext = path.extname(originalFilename);
  const base = path.basename(originalFilename, ext);
  const cleanBase = base.replace(/[^\w\s.-]/g, '_').trim();
  const timestamp = Date.now();
  const uuidShort = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${timestamp}_${uuidShort}_${cleanBase}${ext}`;
}

/**
 * Check file size stability (debounce / copy complete check).
 * Ensures the file is non-zero, its size does not change over intervalMs,
 * and it can be opened for reading without lock errors.
 */
export async function checkFileStability(
  filePath: string,
  options: StabilityOptions = {},
): Promise<boolean> {
  const intervalMs = options.intervalMs ?? 3000;
  const maxAttempts = options.maxAttempts ?? 20;

  let previousSize = -1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > 0 && stats.size === previousSize) {
        // Size is stable and > 0, verify file readability
        const handle = await fs.open(filePath, 'r');
        await handle.close();
        return true;
      }
      previousSize = stats.size;
    } catch {
      // File could be temporarily inaccessible
      previousSize = -1;
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  return false;
}

/**
 * Move a file across filesystems or within the same filesystem.
 */
async function moveFileSafely(srcPath: string, destPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  try {
    await fs.rename(srcPath, destPath);
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      await fs.copyFile(srcPath, destPath);
      await fs.unlink(srcPath);
    } else {
      throw err;
    }
  }
}

function recordHistory(record: ProcessedFileRecord) {
  processedHistory.unshift(record);
  if (processedHistory.length > MAX_HISTORY) {
    processedHistory.pop();
  }
}

/**
 * Process a single incoming file:
 * 1. Check stability
 * 2. Move to media/sources/
 * 3. Parse naming metadata (sourceChannel & sourceTitle)
 * 4. Create Job in DB with status PENDING
 * 5. Trigger jobService.startJob()
 */
export async function processIncomingFile(
  filename: string,
  options: WatcherOptions = {},
): Promise<ProcessedFileRecord | null> {
  const incomingFolder = options.incomingPath || PATHS.incoming;
  const sourcesFolder = options.sourcesPath || PATHS.sources;
  const filePath = path.join(incomingFolder, filename);

  if (!isVideoFile(filename)) {
    return null;
  }

  if (pendingFiles.has(filename)) {
    return null;
  }

  pendingFiles.add(filename);

  const record: ProcessedFileRecord = {
    id: randomUUID(),
    originalFilename: filename,
    status: 'SUCCESS',
    processedAt: new Date().toISOString(),
  };

  try {
    // 1. Debounce / copy stability check
    const isStable = await checkFileStability(filePath, {
      intervalMs: options.stabilityIntervalMs ?? 3000,
      maxAttempts: options.maxStabilityAttempts ?? 20,
    });

    if (!isStable) {
      throw new Error(`File stability check timed out or failed for ${filename}`);
    }

    const stats = await fs.stat(filePath);
    record.fileSizeBytes = stats.size;

    // 2. Safe destination filename and path
    const safeDestFilename = generateSafeSourceFilename(filename);
    const destPath = path.join(sourcesFolder, safeDestFilename);
    record.destinationFilename = safeDestFilename;
    record.destinationPath = destPath;

    // 3. Move file to media/sources/
    await moveFileSafely(filePath, destPath);
    logger.info('Folder watcher moved incoming file to sources', { from: filePath, to: destPath });

    // 4. Parse sourceChannel and sourceTitle
    const parsedMeta = parseSourceFileName(filename);
    record.sourceTitle = parsedMeta.sourceTitle;
    record.sourceChannel = parsedMeta.sourceChannel;

    // 5. Look up default config
    let config = await db.pipelineConfig.findFirst({ where: { isDefault: true } });
    if (!config) {
      config = await db.pipelineConfig.findFirst();
    }
    if (!config) {
      throw new Error('No default pipeline configuration found in database');
    }

    const relativeSourcePath = path.relative(PATHS.root, destPath);

    // 6. Create Job in DB with status PENDING
    const job = await db.job.create({
      data: {
        status: JobStatus.PENDING,
        sourceFilename: filename,
        sourcePath: relativeSourcePath,
        sourceFileSize: stats.size,
        sourceTitle: parsedMeta.sourceTitle,
        sourceChannel: parsedMeta.sourceChannel,
        configId: config.id,
      },
    });

    record.jobId = job.id;
    logger.info('Folder watcher created job', {
      jobId: job.id,
      sourceTitle: job.sourceTitle,
      sourceChannel: job.sourceChannel,
      sourcePath: relativeSourcePath,
    });

    // 7. Trigger runner immediately unless disabled
    if (options.autoStartJob !== false) {
      try {
        await jobService.startJob(job.id);
        logger.info('Folder watcher started job', { jobId: job.id });
      } catch (err: any) {
        logger.info('Job remained in PENDING status (queue delayed or runner busy)', {
          jobId: job.id,
          reason: err.message,
        });
      }
    }

    record.status = 'SUCCESS';
    recordHistory(record);
    return record;
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('Folder watcher error processing file', { filename, error: errorMsg });
    record.status = 'FAILED';
    record.error = errorMsg;
    recordHistory(record);
    return record;
  } finally {
    pendingFiles.delete(filename);
  }
}

/**
 * Check if the folder watcher daemon is currently running.
 */
export function isWatcherActive(): boolean {
  return isActive;
}

/**
 * Get the current watcher status, paths, pending files, and history.
 */
export function getWatcherStatus(): WatcherStatus {
  return {
    active: isActive,
    incomingPath: activeOptions?.incomingPath || PATHS.incoming,
    sourcesPath: activeOptions?.sourcesPath || PATHS.sources,
    supportedExtensions: SUPPORTED_VIDEO_EXTENSIONS,
    pendingFiles: Array.from(pendingFiles),
    processedFiles: [...processedHistory],
  };
}

/**
 * Start the folder watcher daemon on media/incoming/.
 */
export async function startFolderWatcher(options: WatcherOptions = {}): Promise<void> {
  if (isActive) {
    logger.info('Folder watcher is already active');
    return;
  }

  const incomingDir = options.incomingPath || PATHS.incoming;
  const sourcesDir = options.sourcesPath || PATHS.sources;

  await fs.mkdir(incomingDir, { recursive: true });
  await fs.mkdir(sourcesDir, { recursive: true });

  isActive = true;
  activeOptions = options;

  logger.info('Folder watcher daemon started', { incomingDir, sourcesDir });

  const scanFolder = async () => {
    if (!isActive) return;
    try {
      const files = await fs.readdir(incomingDir);
      for (const file of files) {
        if (!isActive) break;
        if (isVideoFile(file) && !pendingFiles.has(file)) {
          processIncomingFile(file, options).catch((err) => {
            logger.error('Error processing incoming file', { file, error: err.message });
          });
        }
      }
    } catch (err: any) {
      logger.warn('Failed to read incoming folder during scan', { error: err.message });
    }
  };

  // Initial scan
  await scanFolder();

  // Watch for new files via fs.watch
  try {
    activeWatcher = watch(incomingDir, (eventType, filename) => {
      if (!isActive) return;
      if (filename && isVideoFile(filename) && !pendingFiles.has(filename)) {
        processIncomingFile(filename, options).catch((err) => {
          logger.error('Error processing incoming file from watch event', {
            filename,
            error: err.message,
          });
        });
      }
    });

    activeWatcher.on('error', (err) => {
      logger.warn('Folder watcher error event', { error: err.message });
    });
  } catch (err: any) {
    logger.warn('Failed to initialize fs.watch; falling back to periodic scan', {
      error: err.message,
    });
  }

  // Periodic poll fallback
  const pollIntervalMs = options.pollIntervalMs ?? 10000;
  pollTimer = setInterval(scanFolder, pollIntervalMs);
  if (pollTimer.unref) {
    pollTimer.unref();
  }
}

/**
 * Stop the folder watcher daemon.
 */
export async function stopFolderWatcher(): Promise<void> {
  if (!isActive) return;

  logger.info('Folder watcher daemon stopped');
  isActive = false;

  if (activeWatcher) {
    try {
      activeWatcher.close();
    } catch {}
    activeWatcher = null;
  }

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Initialize folder watcher at server startup.
 */
export async function initFolderWatcher(options: WatcherOptions = {}): Promise<void> {
  if (process.env.DISABLE_FOLDER_WATCHER === 'true') {
    logger.info('Folder watcher disabled by DISABLE_FOLDER_WATCHER environment variable');
    return;
  }
  await startFolderWatcher(options);
}

/**
 * Reset internal state for test isolation.
 */
export async function _resetWatcherStateForTesting(): Promise<void> {
  await stopFolderWatcher();
  pendingFiles.clear();
  processedHistory.length = 0;
  activeOptions = null;
}
