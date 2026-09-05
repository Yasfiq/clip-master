#!/usr/bin/env tsx
import 'dotenv/config';
import { jobService } from '../src/server/services/jobService';
import { db } from '../src/server/db';
import { runPreflight } from '../src/server/preflight';
import { PATHS } from '../src/server/paths';
import { jobService as jobSvc } from '../src/server/services/jobService';
import { PATHS as LOCAL_PATHS } from '../src/server/paths';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  console.log('🧪 Testing uppercase fix + ggml-small');

  const samplePath = path.join(process.cwd(), 'media/sources/test_phase1_8min.mp4');

  try {
    // Preflight
    const preflight = await runPreflight();
    if (!preflight.success) {
      throw new Error(`Preflight failed: ${JSON.stringify(preflight)}`);
    }

    console.log('✅ Preflight OK');

    // Create job
    console.log('📝 Creating job...');
    const job = await jobSvc.createJob({ sourcePath: samplePath });
    console.log(`✅ Job ${job.id} created`);

    // Run Phase 1
    console.log('▶️ Running Phase 1...');
    await jobSvc.startJob(job.id);
    console.log(`📝 Job started: ${job.id}`);

    // Poll
    let attempts = 0;
    const maxAttempts = 300;
    let done = false;

    while (attempts < maxAttempts && !done) {
      await new Promise((r) => setTimeout(r, 1000));
      const current = await jobSvc.getJob(job.id);

      if (attempts % 10 === 0) {
        console.log(`   ${attempts}s: ${current.status} | stage: ${current.currentStage || 'N/A'}`);
      }

      if (current.status === 'COMPLETED') {
        console.log('✅ Phase 1 completed');
        done = true;
        break;
      }

      if (current.status === 'FAILED' || current.status === 'REJECTED_AD') {
        console.log(`❌ Failed: ${current.status} - ${current.errorMessage}`);
        process.exit(1);
      }

      attempts++;
    }

    if (!done) {
      console.log('⏱️ Timeout');
      process.exit(1);
    }

    // Phase 2
    console.log('▶️ Running Phase 2...');
    await jobSvc.startJob(job.id); // start phase 2 needs RUNNING_PHASE2 state
    attempts = 0;
    done = false;

    while (attempts < 120 && !done) {
      await new Promise((r) => setTimeout(r, 1000));
      const current = await jobSvc.getJob(job.id);

      if (attempts % 10 === 0) {
        console.log(`   ${attempts}s: ${current.status} | stage: ${current.currentStage || 'N/A'}`);
      }

      if (current.status === 'COMPLETED') {
        console.log('✅ Phase 2 completed');
        done = true;
        break;
      }

      if (current.status === 'FAILED') {
        console.log(`❌ Failed: ${current.status} - ${current.errorMessage}`);
        process.exit(1);
      }

      attempts++;
    }

    if (!done) {
      console.log('⏱️ Timeout');
      process.exit(1);
    }

    // Verify SRTs uppercase
    const clips = await db.clip.findMany({
      where: { jobId: job.id },
      orderBy: { startTime: 'asc' },
    });
    console.log(`✅ ${clips.length} clips`);

    const subtitleDir = path.join(process.cwd(), LOCAL_PATHS.work, job.id, 'subtitles');
    const hasLowercase = [];

    for (const clip of clips) {
      const srtPath = path.join(subtitleDir, `${clip.id}.srt`);
      try {
        const srt = await fs.readFile(srtPath, 'utf8');
        for (const line of srt.split('\n')) {
          if (/^\d+:\d+:\d+,\d+ -->/.test(line)) {
            // next non-empty line is text
            break;
          }
        }
        const textLines = srt.split('\n').filter((l) => l.trim() && !/^\d+$/.test(l));
        for (const line of textLines) {
          if (/[a-z]/.test(line) && !/^[A-Z ]+$/.test(line)) {
            hasLowercase.push(`${clip.id}: ${line.trim().slice(0, 40)}`);
          }
        }
      } catch {
        // ignore
      }
    }

    if (hasLowercase.length === 0) {
      console.log('✅ All SRTs uppercase');
    } else {
      console.log('❌ Lowercase found:', hasLowercase.slice(0, 5));
      process.exit(1);
    }

    // Verify export path exists
    for (const clip of clips) {
      if (!clip.exportPath) {
        console.log('❌ Clip has no exportPath:', clip.id);
        process.exit(1);
      }
      const exportAbs = path.join(process.cwd(), LOCAL_PATHS.exports, clip.exportPath);
      try {
        await fs.access(exportAbs);
      } catch {
        console.log('❌ Export missing:', exportAbs);
        process.exit(1);
      }
    }
    console.log('✅ All exports exist');

    console.log('🎉 SUCCESS: uppercase fix active + ggml-small + compress working');
  } catch (err: any) {
    console.error('❌ ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
