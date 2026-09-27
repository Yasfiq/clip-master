import { describe, it, expect } from 'vitest';
import { runBinary } from '@/pipeline/binaries/spawn';

describe('Binary spawn streaming and buffering', () => {
  it('buffers stdout and stderr by default', async () => {
    const res = await runBinary(process.execPath, [
      '-e',
      'console.log("hello world"); console.error("error stream");',
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('hello world');
    expect(res.stderr).toContain('error stream');
  });

  it('streams stdout line-by-line without buffering when bufferStdout is false', async () => {
    const lines: string[] = [];
    const res = await runBinary(
      process.execPath,
      ['-e', 'console.log("first"); console.log("second"); console.log("third");'],
      {
        bufferStdout: false,
        onStdoutLine: (l) => {
          lines.push(l);
        },
      },
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('');
    expect(lines).toEqual(['first', 'second', 'third']);
  });

  it('streams stderr line-by-line without buffering when bufferStderr is false', async () => {
    const errLines: string[] = [];
    const res = await runBinary(
      process.execPath,
      ['-e', 'console.error("warn1"); console.error("warn2");'],
      {
        bufferStderr: false,
        onStderrLine: (l) => {
          errLines.push(l);
        },
      },
    );
    expect(res.code).toBe(0);
    expect(res.stderr).toBe('');
    expect(errLines).toEqual(['warn1', 'warn2']);
  });
});
