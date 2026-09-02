#!/usr/bin/env node
/**
 * Deployment verification for Clip Master
 * Run after installation to verify environment is ready.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const checks = [];
const baseDir = process.cwd();

console.log('🔍 Clip Master - Deployment Verification');
console.log('='.repeat(50));

function check(name, testFn) {
  checks.push({ name, testFn });
}

function runBinaryCheck(cmd, args, expected) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { timeout: 5000 });
    let output = '';
    proc.stdout.on('data', (data) => (output += data.toString()));
    proc.stderr.on('data', (data) => (output += data.toString()));
    proc.on('close', (code) => {
      resolve({
        success: code === 0 && (expected ? output.includes(expected) : true),
        output: output.trim(),
      });
    });
    proc.on('error', () => resolve({ success: false, output: 'Failed to spawn' }));
  });
}

// Node.js version
check('Node.js >= 22', async () => {
  const major = process.version.match(/v(\d+)\./)?.[1];
  return major >= 22;
});

// Dependencies
check('npm packages installed', () => {
  const pkg = join(baseDir, 'node_modules');
  const next = join(pkg, 'next');
  return existsSync(next);
});

// Media directories
check('Media directories exist', () => {
  const dirs = ['sources', 'work', 'exports', 'assets'];
  return dirs.every((d) => existsSync(join(baseDir, 'media', d)));
});

// Database file
check('SQLite database exists', () => {
  const db = join(baseDir, 'dev.db');
  return existsSync(db) || existsSync(join(baseDir, 'prisma', 'dev.db'));
});

// FFmpeg binary
check('FFmpeg binary', async () => {
  const result = await runBinaryCheck('ffmpeg', ['-version'], 'ffmpeg version');
  return result.success;
});

// yt-dlp binary
check('yt-dlp binary', async () => {
  const result = await runBinaryCheck('yt-dlp', ['--version'], '2026.');
  return result.success;
});

// Whisper binary (path may be in .env)
check('Whisper binary (optional)', async () => {
  const whisperPath =
    process.env.WHISPER_BIN || join(homedir(), 'whisper.cpp', 'build', 'bin', 'whisper-cli');
  if (!existsSync(whisperPath)) {
    return {
      success: false,
      optional: true,
      output: 'Whisper not found — subtitles will be disabled',
    };
  }
  const result = await runBinaryCheck(whisperPath, ['--help'], 'whisper');
  return { success: result.success, optional: true, output: result.output };
});

// Whisper model
check('Whisper model (optional)', () => {
  const modelPath =
    process.env.WHISPER_MODEL || join(homedir(), 'whisper.cpp', 'models', 'ggml-base.bin');
  return { success: existsSync(modelPath), optional: true };
});

async function run() {
  let passed = 0;
  let optionalPassed = 0;
  let optionalFailed = 0;

  for (const check of checks) {
    process.stdout.write(`• ${check.name}... `);
    try {
      const result = await check.testFn();
      const isOptional = result?.optional === true;
      const success = result?.success ?? result;

      if (success) {
        console.log('✅');
        if (isOptional) optionalPassed++;
        else passed++;
      } else {
        console.log(isOptional ? '⚠️ (optional)' : '❌');
        if (isOptional) optionalFailed++;
      }

      if (result?.output) {
        console.log(`  ${result.output}`);
      }
    } catch (err) {
      console.log('❌');
      console.log(`  Error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('RESULTS:');
  console.log(`  Required: ${passed}/${checks.length - (optionalPassed + optionalFailed)}`);
  console.log(`  Optional: ${optionalPassed}/${optionalPassed + optionalFailed}`);
  console.log('='.repeat(50));

  const allRequired = passed === checks.length - (optionalPassed + optionalFailed);
  if (allRequired) {
    console.log('🎉 SUCCESS: Clip Master is ready!');
    console.log('   Run: npm run dev');
  } else {
    console.log('⚠️  WARNING: Some requirements missing.');
    console.log('   Check README.md for setup instructions.');
  }
}

run().catch(console.error);
