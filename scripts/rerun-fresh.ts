/**
 * Fresh pipeline re-run with the new features:
 *   - 3.0x audio boost in TRANSCRIBE
 *   - 32-char SRT line wrap in SUBTITLE
 *   - Per-clip style picker in COMPRESS
 *   - Empty-frame filter in CUT
 *
 * Resets the previous job to PENDING and re-runs the full pipeline.
 */
import 'dotenv/config';
import { jobService } from '../src/server/services/jobService';
import { db } from '../src/server/db';
import { logger } from '../src/server/logger';

const PREV_JOB_ID = 'cmtn2fic10000fb81wcwzxviv';

async function main() {
  console.log('\n🧪 Fresh pipeline re-run with new features\n');
  console.log('═'.repeat(60));

  // Delete prior clips/logs so the re-run doesn't hit unique-constraint errors.
  await db.clip.deleteMany({ where: { jobId: PREV_JOB_ID } }).catch((e) => console.warn(e.message));
  await db.jobLog.deleteMany({ where: { jobId: PREV_JOB_ID } }).catch(() => {});

  // Reset prev job (if any) to PENDING so startJob re-runs the full pipeline.
  try {
    await db.job.update({
      where: { id: PREV_JOB_ID },
      data: { status: 'PENDING', stageEndedAt: null, startedAt: null },
    });
    console.log(`✓ Reset previous job ${PREV_JOB_ID} to PENDING`);
  } catch (err: any) {
    console.warn(`Could not reset previous job (may not exist): ${err.message}`);
  }

  const started = await jobService.startJob(PREV_JOB_ID);
  console.log(`✓ Phase 1 started: status=${started.status}, stage=${started.currentStage}`);

  // Poll until PHASE1_DONE, then trigger Phase 2
  let attempts = 0;
  const maxAttempts = 60 * 5; // 10 min for Phase 1
  let phase2Started = false;
  let completed = false;
  while (attempts < maxAttempts && !completed) {
    await new Promise((r) => setTimeout(r, 2000));
    const j = await jobService.getJob(PREV_JOB_ID);
    if (j.status === 'PHASE1_DONE' && !phase2Started) {
      console.log('\n▶ Phase 1 complete. Starting Phase 2...');
      try {
        await jobService.startPhase2(PREV_JOB_ID);
        phase2Started = true;
      } catch (e: any) {
        console.error('Phase 2 kickoff error:', e.message);
      }
    }
    if (
      j.status === 'COMPLETED' ||
      j.status === 'FAILED' ||
      j.status === 'CANCELLED' ||
      j.status === 'REJECTED_AD'
    ) {
      console.log(`\n📦 Final: status=${j.status} stage=${j.currentStage}`);
      completed = true;
    } else if (attempts % 15 === 0) {
      console.log(`  [${attempts * 2}s] ${j.status} / ${j.currentStage}`);
    }
    attempts++;
  }
  // If Phase 2 was kicked off, wait for completion
  if (phase2Started && !completed) {
    console.log('\n⏳ Phase 2 running. Polling for completion...');
    while (attempts < maxAttempts * 4 && !completed) {
      await new Promise((r) => setTimeout(r, 3000));
      const j = await jobService.getJob(PREV_JOB_ID);
      if (
        j.status === 'COMPLETED' ||
        j.status === 'FAILED' ||
        j.status === 'CANCELLED' ||
        j.status === 'REJECTED_AD'
      ) {
        console.log(`\n📦 Final: status=${j.status} stage=${j.currentStage}`);
        completed = true;
      } else if (attempts % 10 === 0) {
        console.log(`  [${attempts * 3}s] Phase 2: ${j.status} / ${j.currentStage}`);
      }
      attempts++;
    }
  }
  if (!completed) {
    console.log('⏱ Timeout. Job may still be running.');
  }
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error('FAIL:', e);
  await db.$disconnect();
  process.exit(1);
});
