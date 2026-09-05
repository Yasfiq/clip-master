import 'dotenv/config';
import { db } from '../src/server/db';
import { jobService } from '../src/server/services/jobService';
import path from 'path';

async function main() {
  // Use local file instead of YouTube URL
  const sourcePath = 'media/sources/test_phase1_8min.mp4';
  console.log(`Menyiapkan job untuk: ${sourcePath}`);

  const defaultConfig = await db.pipelineConfig.findFirst({
    where: { isDefault: true },
  });

  const jobData: any = {
    sourcePath: sourcePath,
    sourceFilename: 'test_phase1_8min.mp4',
    status: 'PENDING',
    stageProgress: 0,
    exportedClipsCount: 0,
  };
  if (defaultConfig?.id) {
    jobData.configId = defaultConfig.id;
  }

  const job = await db.job.create({
    data: jobData,
  });

  console.log(`✅ Job dibuat: ${job.id}`);
  console.log('🚀 Memulai Phase 1 pipeline via startJob...');

  await jobService.startJob(job.id);

  const interval = setInterval(async () => {
    const current = await db.job.findUnique({
      where: { id: job.id },
      select: {
        status: true,
        currentStage: true,
        stageProgress: true,
        exportedClipsCount: true,
        errorCode: true,
        errorMessage: true,
      },
    });

    if (current) {
      console.log(
        `[${current.status}] Stage: ${current.currentStage || 'N/A'} - ${current.stageProgress ?? 0}% | Clips: ${current.exportedClipsCount}`,
      );

      if (
        ['PHASE1_DONE', 'COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED_AD'].includes(current.status)
      ) {
        console.log(`\n🎉 SELESAI DENGAN STATUS: ${current.status}`);
        if (current.errorCode) console.log(`Error: ${current.errorCode} - ${current.errorMessage}`);

        const clips = await db.clip.findMany({ where: { jobId: job.id } });
        if (clips.length > 0) {
          console.log('\n🎬 CLIPS HASIL GENERATE:');
          clips.forEach((c, i) => {
            console.log(`  ${i + 1}. [${c.startTime}s - ${c.endTime}s] cutPath: ${c.cutPath}`);
          });
        }

        clearInterval(interval);
        process.exit(0);
      }
    }
  }, 3000);
}

main().catch(console.error);
