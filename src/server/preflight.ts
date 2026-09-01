import fs from 'fs';
import { spawn } from 'child_process';
import { PATHS, BINARIES } from './paths';
import { logger } from './logger';

export interface PreflightReport {
  success: boolean;
  directories: Record<string, boolean>;
  binaries: Record<string, { status: boolean; version?: string }>;
}

/**
 * Probe a binary using an argument array only — never a shell string.
 * Tries `-version` (ffmpeg style) then `--version` (yt-dlp / whisper style).
 */
function probeBinary(
  binary: string,
  args: string[],
): Promise<{ success: boolean; version?: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve({ success: false });
      return;
    }

    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', () => resolve({ success: false }));
    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        resolve({ success: true, version: (output.split('\n')[0] || '').trim() });
      } else {
        resolve({ success: false });
      }
    });
  });
}

async function checkBinary(
  name: string,
  binary: string,
): Promise<{ success: boolean; version?: string }> {
  if (name === 'ffmpeg') {
    const res = await probeBinary(binary, ['-version']);
    if (res.success && res.version?.toLowerCase().includes('ffmpeg')) return res;
  }
  if (name === 'ytdlp') {
    const res = await probeBinary(binary, ['--version']);
    // Date pattern like 2026.08.19
    if (res.success && /^\d{4}\.\d{2}\.\d{2}/.test(res.version || '')) return res;
  }
  if (name === 'whisper') {
    const res = await probeBinary(binary, ['--version']);
    if (res.success && res.version?.toLowerCase().includes('whisper')) return res;
  }
  return { success: false };
}

export async function runPreflight(): Promise<PreflightReport> {
  const report: PreflightReport = {
    success: true,
    directories: {},
    binaries: {},
  };

  logger.info('Starting preflight checks...');

  const dirs = {
    media: PATHS.media,
    sources: PATHS.sources,
    work: PATHS.work,
    exports: PATHS.exports,
    assets: PATHS.assets,
  };

  for (const [name, dirPath] of Object.entries(dirs)) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info(`Directory created: ${dirPath}`);
      }
      report.directories[name] = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`Failed to verify/create directory ${name}: ${msg}`);
      report.directories[name] = false;
      report.success = false;
    }
  }

  const binChecks = {
    ffmpeg: BINARIES.ffmpeg,
    ytdlp: BINARIES.ytdlp,
    whisper: BINARIES.whisper,
  };

  for (const [name, binary] of Object.entries(binChecks)) {
    const res = await checkBinary(name, binary);
    report.binaries[name] = { status: res.success, version: res.version };

    if (res.success) {
      logger.info(`Binary verified: ${name} (${res.version})`);
    } else {
      logger.warn(`Binary missing or failing: ${name}`);
      if (name === 'ffmpeg') {
        report.success = false;
      }
    }
  }

  if (report.success) {
    logger.info('Preflight checks passed.');
  } else {
    logger.error('Preflight checks failed.');
  }

  return report;
}
