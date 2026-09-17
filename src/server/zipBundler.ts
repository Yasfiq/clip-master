import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';
import { PATHS, BINARIES } from './paths';
import { generateClipCopywriting, ClipCopywriting } from '../pipeline/logic/copywriting';
import { parseSrt } from '../pipeline/logic/srtParser';

export interface ZipFileEntry {
  /** Path on disk to the existing file */
  sourcePath?: string;
  /** In-memory text or buffer content to be written to archiveName */
  content?: string | Buffer;
  /** Relative path and filename inside the ZIP archive */
  archiveName: string;
}

export interface CreateZipOptions {
  /** Identifier used in default filename, e.g. jobId or timestamp */
  identifier?: string;
  /** Custom directory to save the ZIP file (defaults to media/work/exports or media/exports) */
  outputDir?: string;
  /** Explicit filename to override automatic naming */
  outputFilename?: string;
  /** Custom zip binary path (defaults to BINARIES.zip or /usr/bin/zip) */
  zipBinaryPath?: string;
}

export interface ZipArchiveResult {
  zipPath: string;
  zipSize: number;
  stagingDir: string;
  cleanup: () => Promise<void>;
}

export interface ClipWithJobDetails {
  id: string;
  jobId: string;
  isExported?: boolean;
  exportPath?: string | null;
  editedPath?: string | null;
  cutPath?: string | null;
  subtitlePath?: string | null;
  duration?: number | null;
  startTime?: number | null;
  endTime?: number | null;
  viralScore?: number | null;
  hookHeadline?: string | null;
  studioConfig?: any;
  metadata?: any;
  job?: {
    id?: string;
    sourceTitle?: string | null;
    sourceFilename?: string | null;
    sourceChannel?: string | null;
  } | null;
}

export interface BundleClipsOptions extends CreateZipOptions {
  jobTitle?: string;
}

/**
 * Remove a temporary ZIP file safely.
 */
export async function cleanupZipFile(zipPath: string): Promise<void> {
  try {
    await fs.unlink(zipPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Failed to remove temporary zip file ${zipPath}: ${err.message}`);
    }
  }
}

/**
 * Remove a temporary staging directory and all its contents.
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Failed to cleanup temp directory ${dirPath}: ${err.message}`);
    }
  }
}

/**
 * Format a ClipCopywriting object into a structured, readable plain-text file.
 */
export function formatCopywritingText(copy: ClipCopywriting): string {
  const sections: string[] = [];

  sections.push('================================================================');
  sections.push(`JUDUL: ${copy.title}`);
  sections.push('================================================================\n');

  sections.push('--- HOOK SUMMARY ---');
  sections.push(copy.hookSummary);
  sections.push('');

  sections.push('--- CAPTION LENGKAP (ALL-IN-ONE) ---');
  sections.push(copy.fullCaption);
  sections.push('');

  sections.push('--- YOUTUBE SHORTS ---');
  sections.push(`Judul: ${copy.platforms.youtubeShorts.title}`);
  sections.push('Deskripsi:');
  sections.push(copy.platforms.youtubeShorts.description);
  sections.push('');

  sections.push('--- TIKTOK ---');
  sections.push('Caption:');
  sections.push(copy.platforms.tiktok.caption);
  sections.push('');

  sections.push('--- INSTAGRAM REELS ---');
  sections.push('Caption:');
  sections.push(copy.platforms.reels.caption);
  sections.push('');

  sections.push('--- HASHTAGS ---');
  sections.push(copy.hashtagString);
  sections.push('');

  if (copy.attribution) {
    sections.push('--- ATRIBUSI ---');
    sections.push(copy.attribution);
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Check if a file exists on disk.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the best available video file for a clip.
 * Prefers exportPath -> editedPath -> cutPath.
 */
export async function resolveClipVideoPath(clip: {
  exportPath?: string | null;
  editedPath?: string | null;
  cutPath?: string | null;
}): Promise<string | null> {
  const candidates: string[] = [];

  if (clip.exportPath) {
    candidates.push(
      path.isAbsolute(clip.exportPath)
        ? clip.exportPath
        : path.join(PATHS.exports, clip.exportPath),
    );
    candidates.push(
      path.isAbsolute(clip.exportPath) ? clip.exportPath : path.join(PATHS.work, clip.exportPath),
    );
  }

  if (clip.editedPath) {
    candidates.push(
      path.isAbsolute(clip.editedPath) ? clip.editedPath : path.join(PATHS.work, clip.editedPath),
    );
  }

  if (clip.cutPath) {
    candidates.push(
      path.isAbsolute(clip.cutPath) ? clip.cutPath : path.join(PATHS.work, clip.cutPath),
    );
  }

  for (const cand of candidates) {
    if (await fileExists(cand)) {
      return cand;
    }
  }

  return null;
}

/**
 * Resolve the spoken transcript for a clip from its SRT file, if present.
 */
export async function resolveClipTranscriptText(clip: {
  id: string;
  jobId: string;
  subtitlePath?: string | null;
  exportPath?: string | null;
}): Promise<string> {
  const candidates: string[] = [];

  if (clip.subtitlePath) {
    candidates.push(
      path.isAbsolute(clip.subtitlePath)
        ? clip.subtitlePath
        : path.join(PATHS.work, clip.subtitlePath),
    );
  }

  candidates.push(path.join(PATHS.work, clip.jobId, 'subtitles', `${clip.id}.srt`));

  if (clip.exportPath) {
    const raw = clip.exportPath.replace(/\.mp4$/i, '.srt');
    candidates.push(path.isAbsolute(raw) ? raw : path.join(PATHS.exports, raw));
  }

  for (const cand of candidates) {
    if (await fileExists(cand)) {
      try {
        const rawSrt = await fs.readFile(cand, 'utf8');
        const cues = parseSrt(rawSrt);
        const text = cues
          .map((c) => c.text.trim())
          .filter(Boolean)
          .join(' ');
        if (text) return text;
      } catch (err: any) {
        logger.warn(`Failed reading SRT transcript from ${cand}: ${err.message}`);
      }
    }
  }

  return '';
}

/**
 * Execute native `/usr/bin/zip` via child_process.spawn with argument arrays only.
 */
function spawnZipProcess(
  zipBinary: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(zipBinary, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn zip binary (${zipBinary}): ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `ZIP process exited with code ${code}: ${stderr.trim() || stdout.trim() || 'Unknown error'}`,
          ),
        );
      }
    });
  });
}

/**
 * Create a ZIP archive from a list of ZipFileEntry objects using native /usr/bin/zip.
 */
export async function createZipArchive(
  entries: ZipFileEntry[],
  options?: CreateZipOptions,
): Promise<ZipArchiveResult> {
  if (!entries || entries.length === 0) {
    throw new Error('Tidak ada file untuk dimasukkan ke dalam arsip ZIP');
  }

  const zipBinary = options?.zipBinaryPath || BINARIES.zip || '/usr/bin/zip';
  const targetDir = options?.outputDir || path.join(PATHS.work, 'exports');
  await fs.mkdir(targetDir, { recursive: true });

  const rawId = options?.identifier || `${Date.now()}`;
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const uniqueToken = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const zipFilename = options?.outputFilename || `batch_clips_${safeId}_${uniqueToken}.zip`;
  const zipPath = path.resolve(targetDir, zipFilename);

  const stagingDir = path.join(PATHS.work, 'staging_zip', `${safeId}_${uniqueToken}`);
  await fs.mkdir(stagingDir, { recursive: true });

  try {
    for (const entry of entries) {
      if (!entry.archiveName) {
        throw new Error('Setiap entry harus memiliki archiveName yang valid');
      }

      const destPath = path.resolve(stagingDir, entry.archiveName);
      // Prevent directory traversal inside staging dir
      if (!destPath.startsWith(stagingDir + path.sep)) {
        throw new Error(`Invalid archiveName path traversal: ${entry.archiveName}`);
      }

      await fs.mkdir(path.dirname(destPath), { recursive: true });

      if (entry.content !== undefined) {
        await fs.writeFile(destPath, entry.content);
      } else if (entry.sourcePath) {
        if (!(await fileExists(entry.sourcePath))) {
          throw new Error(`File sumber tidak ditemukan di disk: ${entry.sourcePath}`);
        }
        try {
          await fs.symlink(path.resolve(entry.sourcePath), destPath);
        } catch {
          // If symlink fails (e.g. cross-volume or permission issues), fallback to copy
          await fs.copyFile(entry.sourcePath, destPath);
        }
      } else {
        throw new Error(`Entry ${entry.archiveName} tidak memiliki sourcePath atau content`);
      }
    }

    // Spawn /usr/bin/zip -r <zipPath> .
    await spawnZipProcess(zipBinary, ['-r', zipPath, '.'], stagingDir);

    const st = await fs.stat(zipPath);

    // Clean up staging directory immediately after zip is created
    await cleanupTempDir(stagingDir);

    let cleaned = false;
    const cleanup = async () => {
      if (cleaned) return;
      cleaned = true;
      await cleanupZipFile(zipPath);
      await cleanupTempDir(stagingDir);
    };

    return {
      zipPath,
      zipSize: st.size,
      stagingDir,
      cleanup,
    };
  } catch (err) {
    // On failure, clean up both staging directory and incomplete zip file
    await cleanupTempDir(stagingDir);
    await cleanupZipFile(zipPath);
    throw err;
  }
}

/**
 * High-level helper: bundles video clips, copywriting text files, and manifest.json
 * into a single downloadable ZIP archive.
 */
export async function bundleClipsToZip(
  clips: ClipWithJobDetails[],
  options?: BundleClipsOptions,
): Promise<ZipArchiveResult> {
  if (!clips || clips.length === 0) {
    throw new Error('Tidak ada klip untuk di-bundle ke dalam arsip ZIP');
  }

  const entries: ZipFileEntry[] = [];
  const manifestClips: Array<Record<string, any>> = [];

  for (let idx = 0; idx < clips.length; idx++) {
    const clip = clips[idx];
    const videoPath = await resolveClipVideoPath(clip);

    if (!videoPath) {
      logger.warn(`Klip ${clip.id} tidak memiliki file video valid di disk, dilewati`);
      continue;
    }

    const pad = String(idx + 1).padStart(2, '0');
    const rawTitle =
      clip.hookHeadline ||
      clip.job?.sourceTitle ||
      clip.job?.sourceFilename ||
      `clip_${clip.id.slice(0, 6)}`;
    const safeTitle =
      rawTitle
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 40) || `clip_${clip.id.slice(0, 6)}`;

    const baseName = `Clip_${pad}_${safeTitle}`;
    const videoArchiveName = `${baseName}.mp4`;
    const copywritingArchiveName = `${baseName}_copywriting.txt`;

    // 1. Video MP4 file entry
    entries.push({
      sourcePath: videoPath,
      archiveName: videoArchiveName,
    });

    // 2. Generate Copywriting
    const transcriptText = await resolveClipTranscriptText({
      id: clip.id,
      jobId: clip.jobId,
      subtitlePath: clip.subtitlePath,
      exportPath: clip.exportPath,
    });

    const studioConfig = clip.studioConfig as Record<string, any> | null;
    const hookHeadline =
      (typeof studioConfig?.hookText === 'string' && studioConfig.hookText.trim()) ||
      clip.hookHeadline ||
      undefined;

    const sourceChannel = clip.job?.sourceChannel || undefined;
    const sourceTitle = clip.job?.sourceTitle || clip.job?.sourceFilename || undefined;

    const copywriting = generateClipCopywriting({
      hookHeadline,
      sourceChannel,
      sourceTitle,
      transcriptText,
      duration: clip.duration ?? undefined,
    });

    const copywritingContent = formatCopywritingText(copywriting);

    entries.push({
      content: copywritingContent,
      archiveName: copywritingArchiveName,
    });

    // 3. Add to manifest metadata
    manifestClips.push({
      clipId: clip.id,
      jobId: clip.jobId,
      videoFile: videoArchiveName,
      copywritingFile: copywritingArchiveName,
      startTime: clip.startTime ?? 0,
      endTime: clip.endTime ?? clip.duration ?? 0,
      duration: clip.duration ?? 0,
      viralScore: clip.viralScore ?? null,
      hookHeadline: hookHeadline || null,
      title: copywriting.title,
      hookSummary: copywriting.hookSummary,
      hashtags: copywriting.hashtags,
      attribution: copywriting.attribution,
    });
  }

  if (entries.length === 0) {
    throw new Error('Tidak ada file video klip yang valid ditemukan di disk untuk di-bundle');
  }

  // 4. Manifest JSON file entry
  const manifestData = {
    generatedAt: new Date().toISOString(),
    jobId: options?.identifier || (clips.length > 0 ? clips[0].jobId : undefined),
    jobTitle: options?.jobTitle || clips[0]?.job?.sourceTitle || undefined,
    totalClips: manifestClips.length,
    clips: manifestClips,
  };

  entries.push({
    content: JSON.stringify(manifestData, null, 2),
    archiveName: 'manifest.json',
  });

  return createZipArchive(entries, options);
}
