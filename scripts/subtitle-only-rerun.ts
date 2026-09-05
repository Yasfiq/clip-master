import 'dotenv/config';
import { db } from '../src/server/db';
import { SubtitleStage } from '../src/pipeline/stages/subtitle';
import { PATHS } from '../src/server/paths';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../src/server/logger';

const JOB_ID = 'cmtn2fic10000fb81wcwzxviv';

async function main() {
  const job = await db.job.findUnique({ where: { id: JOB_ID } });
  if (!job) throw new Error('Job not found');

  const clips = await db.clip.findMany({
    where: { jobId: JOB_ID },
    orderBy: { startTime: 'asc' },
  });

  const stageLogs = (job.stageLogs as any) || {};
  const transcript = stageLogs.transcript || { segments: [], language: null, text: '' };
  if (transcript.segments.length === 0) throw new Error('No transcript in stageLogs');

  const workDir = path.join(PATHS.work, JOB_ID);
  const ctx: any = {
    jobId: JOB_ID,
    sourcePath: job.sourcePath ? path.join(PATHS.root, job.sourcePath) : '',
    workDir,
    outputDir: PATHS.exports,
    configId: job.configId,
    sourceTitle: job.sourceFilename || job.sourceUrl || 'Untitled',
    metadata: (job.sourceMetadata as any) || {},
    stageData: {
      transcript,
      clips: clips.map((c) => ({
        id: c.id,
        startTime: c.startTime,
        endTime: c.endTime,
        duration: c.duration,
        cutPath: c.cutPath ? path.join(PATHS.work, c.cutPath) : undefined,
        editedPath: c.editedPath ? path.join(PATHS.work, c.editedPath) : undefined,
        subtitlePath: undefined,
        exportPath: undefined,
        viralScore: c.viralScore,
        confidence: c.confidence,
      })),
    },
  };

  const subtitleDir = path.join(workDir, 'subtitles');
  await fs.mkdir(subtitleDir, { recursive: true });
  for (const clip of clips) {
    const srtPath = path.join(subtitleDir, `${clip.id}.srt`);
    try {
      await fs.unlink(srtPath);
      logger.info(`Deleted old SRT: ${srtPath}`);
    } catch {
      // ok
    }
  }

  const subtitleStage = new SubtitleStage();
  await subtitleStage.execute(ctx, async () => {});
  console.log('\n✓ Subtitle stage complete\n');

  for (const clip of clips) {
    const srtPath = path.join(subtitleDir, `${clip.id}.srt`);
    const content = await fs.readFile(srtPath, 'utf8');
    const lines = content.split('\n').slice(0, 8);
    console.log(`--- ${clip.id} (first 8 lines, ${content.length} chars) ---`);
    console.log(lines.join('\n'));
  }

  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
