#!/usr/bin/env npx tsx
/**
 * Cleanup: delete old work/exports dirs and orphaned DB jobs.
 * Run before repeated E2E tests.
 */
import { db } from '../src/server/db';
import { logger } from '../src/server/logger';
import fs from 'fs/promises';
import path from 'path';

const PATHS = {
  work: 'media/work',
  exports: 'media/exports',
};

async function main() {
  console.log('🧹 Starting cleanup...');

  // 1. Delete work dirs (keep only recent 3)
  const workDir = await fs.opendir(PATHS.work);
  const workDirs: { name: string; mtime: Date }[] = [];
  for await (const dirent of workDir) {
    if (dirent.isDirectory()) {
      const stat = await fs.stat(path.join(PATHS.work, dirent.name));
      workDirs.push({ name: dirent.name, mtime: stat.mtime });
    }
  }
  workDirs.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  const toDeleteWork = workDirs.slice(3);
  for (const d of toDeleteWork) {
    await fs.rm(path.join(PATHS.work, d.name), { recursive: true, force: true });
    console.log(`  🗑️  deleted work/${d.name}`);
  }

  // 2. Delete exports dirs (keep only recent 3)
  const exportDir = await fs.opendir(PATHS.exports);
  const exportDirs: { name: string; mtime: Date }[] = [];
  for await (const dirent of exportDir) {
    if (dirent.isDirectory()) {
      const stat = await fs.stat(path.join(PATHS.exports, dirent.name));
      exportDirs.push({ name: dirent.name, mtime: stat.mtime });
    }
  }
  exportDirs.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  const toDeleteExport = exportDirs.slice(3);
  for (const d of toDeleteExport) {
    await fs.rm(path.join(PATHS.exports, d.name), { recursive: true, force: true });
    console.log(`  🗑️  deleted exports/${d.name}`);
  }

  // 3. Delete all jobs from DB (clean slate for repeatable tests)
  const oldJobs = await db.job.findMany({
    select: { id: true },
    take: 20,
  });
  for (const j of oldJobs) {
    await db.clip.deleteMany({ where: { jobId: j.id } }).catch(() => {});
    await db.jobLog.deleteMany({ where: { jobId: j.id } }).catch(() => {});
    await db.job.delete({ where: { id: j.id } }).catch(() => {});
    console.log(`  🗑️  deleted job ${j.id}`);
  }

  console.log('✅ Cleanup done');
  await db.$disconnect();
}

main().catch((e) => {
  console.error('Cleanup failed:', e);
  process.exit(1);
});
