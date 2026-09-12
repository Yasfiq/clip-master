import { spawn } from 'child_process';
import { logger } from '../../server/logger';

export interface SpawnResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface SpawnOptions {
  /** Called for every stderr line — FFmpeg and yt-dlp report progress there. */
  onStderrLine?: (line: string) => void;
  onStdoutLine?: (line: string) => void;
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Spawn an external binary with an argument array only.
 * A shell is never used, so no URL, title, or config value can be interpreted
 * as shell syntax.
 */
export function runBinary(
  binary: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<SpawnResult> {
  if (options.signal?.aborted) {
    return Promise.reject(new Error('ABORTED'));
  }

  return new Promise((resolve, reject) => {
    logger.debug(`spawn: ${binary} ${args.join(' ')}`);

    let child;
    try {
      child = spawn(binary, args, {
        cwd: options.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      reject(new Error(`BINARY_NOT_FOUND: ${binary} (${msg})`));
      return;
    }

    let stdout = '';
    let stderr = '';
    let stdoutRest = '';
    let stderrRest = '';
    let settled = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          logger.warn(`Timeout after ${options.timeoutMs}ms, killing ${binary}`);
          try {
            child.kill('SIGKILL');
          } catch {}
        }, options.timeoutMs)
      : null;

    const onAbort = () => {
      logger.warn(`Abort requested, terminating ${binary}`);
      try {
        child.kill('SIGTERM');
      } catch {}
      setTimeout(() => {
        if (!settled) {
          try {
            child.kill('SIGKILL');
          } catch {}
        }
      }, 5000);
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const cleanup = () => {
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (options.onStdoutLine) {
        stdoutRest += text;
        const lines = stdoutRest.split('\n');
        stdoutRest = lines.pop() ?? '';
        for (const line of lines) {
          try {
            Promise.resolve(options.onStdoutLine(line)).catch(() => {});
          } catch {}
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (options.onStderrLine) {
        stderrRest += text;
        const lines = stderrRest.split('\n');
        stderrRest = lines.pop() ?? '';
        for (const line of lines) {
          try {
            Promise.resolve(options.onStderrLine(line)).catch(() => {});
          } catch {}
        }
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      cleanup();
      if (err.code === 'ENOENT') {
        reject(new Error(`BINARY_NOT_FOUND: ${binary} is not installed or not on PATH`));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      cleanup();
      if (stdoutRest && options.onStdoutLine) options.onStdoutLine(stdoutRest);
      if (stderrRest && options.onStderrLine) options.onStderrLine(stderrRest);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/**
 * Run a binary and throw when it exits non-zero.
 */
export async function runBinaryChecked(
  binary: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<SpawnResult> {
  const result = await runBinary(binary, args, options);
  if (result.code !== 0) {
    const tail = result.stderr.split('\n').slice(-15).join('\n');
    throw new Error(`${binary} exited with code ${result.code}:\n${tail}`);
  }
  return result;
}
