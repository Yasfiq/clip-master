#!/usr/bin/env npx tsx
/**
 * Complete Data Wipe:
 * Cleans all jobs, clips, logs from SQLite DB.
 * Cleans all files in media/work, media/exports, media/sources, media/incoming.
 * Cleans YouTube & Folder Watcher state files.
 * Preserves essential assets (logo, fonts, test fixtures).
 */
import { db } from '../src/server/db';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

async function cleanDirectory(dirPath: string) {
  if (!fsSync.existsSync(dirPath)) return;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.keep') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath).catch(() => {});
    }
  }
}

async function main() {
  console.log('🧹 [WIPE ALL DATA] Starting full clean slate purge...');

  // 1. Database Wipe
  console.log('  🗑️  Purging database tables...');
  const deletedClips = await db.clip.deleteMany({});
  const deletedLogs = await db.jobLog.deleteMany({});
  const deletedJobs = await db.job.deleteMany({});
  console.log(`     - Deleted Clips: ${deletedClips.count}`);
  console.log(`     - Deleted JobLogs: ${deletedLogs.count}`);
  console.log(`     - Deleted Jobs: ${deletedJobs.count}`);

  // Ensure default PipelineConfig exists
  const configCount = await db.pipelineConfig.count();
  if (configCount === 0) {
    await db.pipelineConfig.create({
      data: {
        name: 'default',
        isDefault: true,
        adFilterEnabled: true,
        adScoreThreshold: 0.75,
        minSegmentDuration: 60,
        targetDuration: 60,
        maxClips: 5,
        colorGrading: 'natural',
        backsoundEnabled: true,
        subtitleEnabled: true,
        targetResolution: '1080x1920',
      },
    });
    console.log('     + Seeded default PipelineConfig');
  }

  // 2. Media Directory Wipe
  console.log('  🗑️  Purging media directories...');
  await cleanDirectory('media/work');
  await cleanDirectory('media/exports');
  await cleanDirectory('media/sources');
  await cleanDirectory('media/incoming');
  console.log('     - Cleaned media/work, media/exports, media/sources, media/incoming');

  // 3. Purge Watcher state files
  console.log('  🗑️  Purging watcher history & state...');
  const stateFiles = [
    'media/youtube_watcher_history.json',
    'media/youtube_watcher_state.json',
    'media/youtube_channels.json',
  ];
  for (const file of stateFiles) {
    if (fsSync.existsSync(file)) {
      await fs.unlink(file).catch(() => {});
      console.log(`     - Removed ${file}`);
    }
  }

  console.log('✨ [WIPE ALL DATA] Complete! Database & filesystem are clean.');
  await db.$disconnect();
}

main().catch((err) => {
  console.error('❌ Wipe failed:', err);
  process.exit(1);
});
