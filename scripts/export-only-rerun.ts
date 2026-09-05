import 'dotenv/config';
import { db } from '../src/server/db';
import { ExportStage } from '../src/pipeline/stages/export';
import { CompressStage } from '../src/pipeline/stages/compress';
import { PATHS } from '../src/server/paths';
import path from 'path';
import fs from 'fs/promises';

const JOB_ID = 'cmtn2fic10000fb81wcwzxviv';

async function main() {
  const job = await db.job.findUnique({ where: { id: JOB_ID }, include: { config: true } });
  if (!job) throw new Error('Job not found');
  console.log('Using config targetResolution:', job.config?.targetResolution);

  const clips = await db.clip.findMany({
    where: { jobId: JOB_ID },
    orderBy: { startTime: 'asc' },
  });

  const stageLogs = (job.stageLogs as any) || {};

  const workDir = path.join(PATHS.work, JOB_ID);
  const ctx: any = {
    jobId: JOB_ID,
    sourcePath: job.sourcePath ? path.join(PATHS.root, job.sourcePath) : '',
    workDir,
    outputDir: PATHS.exports,
    config: job.config,
    sourceTitle: job.sourceFilename || job.sourceUrl || 'Untitled',
    metadata: (job.sourceMetadata as any) || {},
    stageData: {
      transcript: stageLogs.transcript,
      clips: clips.map((c) => ({
        id: c.id,
        startTime: c.startTime,
        endTime: c.endTime,
        duration: c.duration,
        cutPath: c.cutPath ? path.join(PATHS.work, c.cutPath) : undefined,
        editedPath: c.editedPath ? path.join(PATHS.work, c.editedPath) : undefined,
        subtitlePath: c.subtitlePath ? path.join(PATHS.work, c.subtitlePath) : undefined,
        exportPath: undefined,
        viralScore: c.viralScore,
        confidence: c.confidence,
      })),
    },
  };

  console.log('\n▶ Running EXPORT stage (burn subtitles into cut → vertical 9:16)');
  const exportStage = new ExportStage();
  await exportStage.execute(ctx, async () => {});
  console.log('✓ EXPORT done\n');

  console.log('▶ Running COMPRESS stage (apply per-clip subtitle styles)');
  const compressStage = new CompressStage();
  await compressStage.execute(ctx, async () => {});
  console.log('✓ COMPRESS done\n');

  // Show resulting exports
  for (const clip of clips) {
    const updated = await db.clip.findUnique({ where: { id: clip.id } });
    console.log(`  ${clip.id} → ${updated?.exportPath}`);
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
