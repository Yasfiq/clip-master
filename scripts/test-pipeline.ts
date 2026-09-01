#!/usr/bin/env tsx
/**
 * End-to-end pipeline test script.
 * Tests full 8-stage pipeline with a sample video.
 *
 * Usage: npx tsx scripts/test-pipeline.ts
 */

import 'dotenv/config';
import { jobService } from '../src/server/services/jobService';
import { db } from '../src/server/db';
import { logger } from '../src/server/logger';
import path from 'path';

async function main() {
  console.log('\n🧪 Starting End-to-End Pipeline Test\n');
  console.log('═'.repeat(60));

  const samplePath = path.join(process.cwd(), 'media/sources/sample.mp4');

  try {
    // Step 1: Create job
    console.log('\n📝 Step 1: Creating job with sample video...');
    const job = await jobService.createJob({
      sourcePath: samplePath,
    });
    console.log(`✅ Job created: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Source: ${job.sourcePath}`);

    // Step 2: Start job
    console.log('\n▶️  Step 2: Starting pipeline execution...');
    const started = await jobService.startJob(job.id);
    console.log(`✅ Job started: ${started.status}`);
    console.log(`   Stage: ${started.currentStage}`);

    // Step 3: Poll for completion
    console.log('\n⏳ Step 3: Monitoring pipeline execution...');
    console.log('   (This may take 1-3 minutes for 53-second video)\n');

    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max
    let completed = false;

    while (attempts < maxAttempts && !completed) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second poll

      const current = await jobService.getJob(job.id);

      // Log progress every 5 seconds
      if (attempts % 5 === 0) {
        console.log(
          `   [${attempts}s] Status: ${current.status} | Stage: ${current.currentStage || 'N/A'} | Progress: ${Math.round((current.progress || 0) * 100)}%`,
        );
      }

      if (current.status === 'COMPLETED') {
        console.log(`\n✅ Pipeline COMPLETED after ${attempts} seconds`);
        console.log(`   Clips exported: ${current.exportedClipsCount}`);
        console.log(`   Total duration: ${current.exportedDuration?.toFixed(1)}s`);
        completed = true;
        break;
      }

      if (current.status === 'FAILED' || current.status === 'REJECTED_AD') {
        console.log(`\n❌ Pipeline FAILED: ${current.status}`);
        console.log(`   Error: ${current.errorCode} - ${current.errorMessage}`);
        process.exit(1);
      }

      if (current.status === 'CANCELLED') {
        console.log(`\n⚠️  Pipeline CANCELLED`);
        process.exit(1);
      }

      attempts++;
    }

    if (!completed) {
      console.log(`\n⏱️  Timeout after ${maxAttempts} seconds`);
      process.exit(1);
    }

    // Step 4: Verify outputs
    console.log('\n🔍 Step 4: Verifying outputs...');
    const clips = await db.clip.findMany({
      where: { jobId: job.id },
      orderBy: { startTime: 'asc' },
    });

    console.log(`✅ Found ${clips.length} clips in database:`);
    clips.forEach((clip, idx) => {
      console.log(
        `   Clip ${idx + 1}: ${clip.startTime.toFixed(1)}s-${clip.endTime.toFixed(1)}s (${clip.duration.toFixed(1)}s) | Score: ${clip.viralScore?.toFixed(2) || 'N/A'}`,
      );
      console.log(`            Export: ${clip.exportPath}`);
    });

    console.log('\n═'.repeat(60));
    console.log('🎉 END-TO-END TEST PASSED!\n');
  } catch (err: any) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main();
