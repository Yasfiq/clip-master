import 'dotenv/config';
import { db } from '../src/server/db';
import { PATHS } from '../src/server/paths';
import { CompressStage } from '../src/pipeline/stages/compress';
import { SubtitleStage } from '../src/pipeline/stages/subtitle';
import { reassembleWhisperTokens } from '../src/pipeline/logic/tokenReassembler';
import { chunkWords, renderSrt } from '../src/pipeline/logic/wordChunker';
import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { BINARIES } from '../src/server/paths';

const JOB_ID = 'cmttukln100001r81oomjso3j';
const CLIP_INDEX = 6; // clip_006 (420s-480s)

async function main() {
  console.log('=== Starting Verification for Clip 006 ===');

  const job = await db.job.findUnique({ where: { id: JOB_ID } });
  if (!job) throw new Error('Job not found');

  const clips = await db.clip.findMany({
    where: { jobId: JOB_ID },
    orderBy: { startTime: 'asc' },
  });

  const clip = clips[CLIP_INDEX];
  if (!clip) throw new Error(`Clip at index ${CLIP_INDEX} not found`);

  console.log(`Target clip: ${clip.id}, [${clip.startTime}s - ${clip.endTime}s]`);

  const workDir = path.join(PATHS.work, JOB_ID);
  const jsonPath = path.join(workDir, 'transcript', 'full.json');
  const raw = await fs.readFile(jsonPath, 'utf8');
  const parsed = JSON.parse(raw);

  // 1. Re-generate subtitle for Clip 006 using reassembleWhisperTokens
  const subtitleDir = path.join(workDir, 'subtitles');
  await fs.mkdir(subtitleDir, { recursive: true });
  const srtPath = path.join(subtitleDir, `${clip.id}.srt`);

  const relevant = (parsed.transcription || []).filter(
    (s: any) => s.offsets.to / 1000 > clip.startTime && s.offsets.from / 1000 < clip.endTime,
  );

  const clipWords: any[] = [];
  for (const seg of relevant) {
    const words = reassembleWhisperTokens(seg.tokens || []);
    for (const w of words) {
      if (w.end <= clip.startTime || w.start >= clip.endTime) continue;
      clipWords.push({
        text: w.text,
        start: Math.max(0, w.start - clip.startTime),
        end: Math.min(clip.endTime - clip.startTime, w.end - clip.startTime),
      });
    }
  }

  const cues = chunkWords(clipWords, 3);
  const srtContent = renderSrt(cues);
  await fs.writeFile(srtPath, srtContent, 'utf8');
  console.log(`✓ Re-generated clean SRT: ${srtPath} (${cues.length} cues)`);

  // Copy to exports
  const exportSrtPath = path.join(PATHS.exports, `clip_${JOB_ID}_006_06_default_1080p.srt`);
  await fs.writeFile(exportSrtPath, srtContent, 'utf8');
  console.log(`✓ Updated export SRT: ${exportSrtPath}`);

  // 2. Re-run CompressStage for Clip 006
  // Clear isExported temporarily on DB so CompressStage processes it
  await db.clip.update({
    where: { id: clip.id },
    data: { isExported: false },
  });

  const exportMp4Path = path.join(PATHS.exports, `clip_${JOB_ID}_006_06_default_1080p.mp4`);
  const editedFullPath = path.join(PATHS.work, clip.editedPath!);
  await fs.copyFile(editedFullPath, exportMp4Path);
  console.log(`✓ Copied edited source to ${exportMp4Path} for re-compression`);

  const compressStage = new CompressStage();
  const ctx: any = {
    jobId: JOB_ID,
    sourcePath: job.sourcePath ? path.join(PATHS.root, job.sourcePath) : '',
    workDir,
    outputDir: PATHS.exports,
    configId: job.configId,
    sourceTitle: job.sourceFilename || 'Test Video',
    metadata: (job.sourceMetadata as any) || { width: 1280, height: 720 },
    config: {
      targetResolution: '1080x1920',
      colorGrading: 'natural',
    },
    stageData: {
      clips: [
        {
          id: clip.id,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.duration,
          cutPath: clip.cutPath ? path.join(PATHS.work, clip.cutPath) : undefined,
          editedPath: editedFullPath,
          subtitlePath: srtPath,
          exportPath: exportMp4Path,
          viralScore: clip.viralScore,
          confidence: clip.confidence,
          isExported: false,
        },
      ],
    },
  };

  console.log('Running CompressStage with dynamic crop and clean subtitles...');
  await compressStage.execute(ctx, async (p, msg) => {
    console.log(`[Progress ${Math.round(p * 100)}%] ${msg || ''}`);
  });

  console.log('✓ Clip 006 re-compressed successfully!');

  // 3. Extract sample frames for verification
  const artifactDir =
    '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

  await new Promise<void>((resolve, reject) => {
    const p = spawn(BINARIES.ffmpeg, [
      '-y',
      '-ss',
      '3',
      '-i',
      exportMp4Path,
      '-frames:v',
      '1',
      path.join(artifactDir, 'fixed_clip006_frame_3s.png'),
    ]);
    p.on('close', resolve);
    p.on('error', reject);
  });

  await new Promise<void>((resolve, reject) => {
    const p = spawn(BINARIES.ffmpeg, [
      '-y',
      '-ss',
      '10',
      '-i',
      exportMp4Path,
      '-frames:v',
      '1',
      path.join(artifactDir, 'fixed_clip006_frame_10s.png'),
    ]);
    p.on('close', resolve);
    p.on('error', reject);
  });

  console.log('✓ Extracted sample verification frames to artifact directory');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
