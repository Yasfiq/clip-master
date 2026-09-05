#!/usr/bin/env npx tsx
/**
 * E2E test: full Phase 1 → Phase 2 pipeline.
 * Exit 0 on success, 1 on failure.
 *
 * Usage: npx tsx scripts/e2e-test.ts [source-file]
 */
import 'dotenv/config';
import { db } from '../src/server/db';
import { jobService } from '../src/server/services/jobService';
import fs from 'fs';
import path from 'path';

const DEFAULT_SOURCE = 'media/sources/test_phase1_8min.mp4';

async function main() {
  const sourcePath = process.argv[2] || DEFAULT_SOURCE;

  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source file not found: ${sourcePath}`);
    process.exit(1);
  }

  console.log(`🎬 E2E test starting...`);
  console.log(`   Source: ${sourcePath}`);

  const defaultConfig = await db.pipelineConfig.findFirst({
    where: { isDefault: true },
  });

  const jobData: any = {
    sourcePath,
    sourceFilename: path.basename(sourcePath),
    status: 'PENDING',
    stageProgress: 0,
    exportedClipsCount: 0,
  };
  if (defaultConfig?.id) {
    jobData.configId = defaultConfig.id;
  }

  const job = await db.job.create({ data: jobData });
  console.log(`✅ Job created: ${job.id}`);

  // Start Phase 1
  await jobService.startJob(job.id);
  console.log('🚀 Phase 1 started...');

  // Wait for PHASE1_DONE or terminal status
  const phase1Result = await waitForStatus(
    job.id,
    ['PHASE1_DONE', 'FAILED', 'CANCELLED', 'REJECTED_AD'],
    300000,
  );
  if (phase1Result !== 'PHASE1_DONE') {
    console.error(`❌ Phase 1 failed: ${phase1Result}`);
    await printJobError(job.id);
    process.exit(1);
  }

  console.log('✅ Phase 1 complete. Checking clips...');
  const clipsPhase1 = await db.clip.findMany({ where: { jobId: job.id } });
  if (clipsPhase1.length === 0) {
    console.error('❌ No clips created in Phase 1');
    process.exit(1);
  }
  console.log(`   Clips: ${clipsPhase1.length}`);
  clipsPhase1.forEach((c, i) => {
    console.log(
      `   ${i + 1}. [${c.startTime}s-${c.endTime}s] viral=${c.viralScore?.toFixed(2)} cutPath=${c.cutPath}`,
    );
  });

  // Start Phase 2
  console.log('🚀 Starting Phase 2...');
  await jobService.startPhase2(job.id);

  // Wait for COMPLETED or terminal status
  const phase2Result = await waitForStatus(job.id, ['COMPLETED', 'FAILED', 'CANCELLED'], 600000);
  if (phase2Result !== 'COMPLETED') {
    console.error(`❌ Phase 2 failed: ${phase2Result}`);
    await printJobError(job.id);
    process.exit(1);
  }

  console.log('✅ Phase 2 complete. Verifying exports...');
  const clipsFinal = await db.clip.findMany({ where: { jobId: job.id, isExported: true } });
  if (clipsFinal.length === 0) {
    console.error('❌ No exported clips');
    process.exit(1);
  }

  // Verify files exist
  const exportsDir = 'media/exports';
  let filesOk = true;
  for (const c of clipsFinal) {
    if (!c.exportPath) {
      console.error(`   ❌ Clip ${c.id} has no exportPath`);
      filesOk = false;
      continue;
    }
    const filePath = path.join(exportsDir, c.exportPath);
    if (!fs.existsSync(filePath)) {
      console.error(`   ❌ Missing: ${filePath}`);
      filesOk = false;
      continue;
    }
    const stat = fs.statSync(filePath);
    console.log(`   ✅ ${c.exportPath} (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
  }

  if (!filesOk) {
    process.exit(1);
  }

  console.log(`\n🎉 E2E test PASSED: ${clipsFinal.length} clips exported`);
  await db.$disconnect();
  process.exit(0);
}

async function waitForStatus(
  jobId: string,
  targetStatuses: string[],
  timeoutMs: number,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { status: true, currentStage: true, stageProgress: true },
    });
    if (!job) throw new Error('Job not found');

    process.stdout.write(
      `\r[${job.status}] ${job.currentStage ?? '-'} ${(job.stageProgress ?? 0) * 100}%   `,
    );

    if (targetStatuses.includes(job.status)) {
      console.log('');
      return job.status;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('Timeout waiting for status');
}

async function printJobError(jobId: string) {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { errorCode: true, errorMessage: true },
  });
  if (job?.errorCode) {
    console.error(`   Error: ${job.errorCode} - ${job.errorMessage}`);
  }
}

main().catch((e) => {
  console.error('E2E test failed:', e);
  process.exit(1);
});
