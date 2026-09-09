/**
 * SUBTITLE stage: produce SRT subtitles for each clip.
 *
 * When a full-video transcript is available (from TRANSCRIBE stage), slices
 * the relevant segments per clip to produce the SRT — no re-transcription.
 * Falls back to per-clip whisper transcription when no full transcript exists
 * (legacy jobs, or TRANSCRIBE was skipped).
 *
 * Pure orchestration + binary invocation; no UI deps.
 */

import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext, TranscriptSegment } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { logger } from '../../server/logger';
import { db } from '../../server/db';
import { BINARIES, PATHS } from '../../server/paths';
import { chunkWords, renderSrt, splitTextIntoWordTimings, WordTiming } from '../logic/wordChunker';
import fs from 'fs/promises';
import path from 'path';

export class SubtitleStage implements PipelineStageHandler {
  stage = PipelineStage.SUBTITLE;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting SUBTITLE stage');

    const clips = ctx.stageData.clips;
    if (!clips || clips.length === 0) {
      throw new Error('No clips found for subtitling');
    }

    if (ctx.config?.subtitleEnabled === false) {
      logger.info('Subtitle generation disabled in config');
      await onProgress(1.0, 'SUBTITLE skipped (disabled)');
      return;
    }

    const transcript = ctx.stageData.transcript;
    const hasFullTranscript = transcript && transcript.segments.length > 0;

    const subtitleDir = path.join(ctx.workDir, 'subtitles');
    await fs.mkdir(subtitleDir, { recursive: true });

    const totalClips = clips.length;
    let completed = 0;

    for (const [idx, clip] of clips.entries()) {
      await onProgress(
        completed / totalClips,
        hasFullTranscript
          ? `Generating SRT for clip ${idx + 1}/${totalClips} (from full transcript)`
          : `Transcribing clip ${idx + 1}/${totalClips} (no full transcript)`,
      );

      if (hasFullTranscript) {
        // Slice transcript segments that fall within this clip's window
        const srtPath = path.join(subtitleDir, `${clip.id}.srt`);
        await this.sliceSrt(transcript.segments, clip.startTime, clip.endTime, srtPath);
        clip.subtitlePath = srtPath;

        // Update DB with subtitle path
        const relativeSubtitlePath = path.relative(PATHS.work, srtPath);
        await db.clip
          .update({
            where: { id: clip.id },
            data: { subtitlePath: relativeSubtitlePath },
          })
          .catch((err) => {
            logger.warn(`Failed to update Clip ${clip.id} subtitlePath in DB: ${err.message}`);
          });

        logger.info(`SRT sliced: ${srtPath} (${clip.duration}s)`);
      } else {
        // Fallback: run whisper per clip (legacy path)
        const inputPath = clip.editedPath || clip.cutPath;
        if (!inputPath || !(await this.fileExists(inputPath))) {
          logger.warn(`Clip ${clip.id} has no cut/edited path, skipping subtitle`);
          completed++;
          continue;
        }
        await this.transcribeClip(inputPath, clip.id, subtitleDir);
      }

      completed++;
    }

    await onProgress(1.0, `SUBTITLE completed: ${totalClips} clips`);
  }

  /**
   * Slice full-video transcript segments into an SRT file for the clip window.
   * Offsets timestamps to start at 0:00:00,000. Utilizes word-level timestamps
   * from TranscriptSegment.words to generate max 3-word chunks with exact
   * timing, falling back to evenly spaced words if word timings are absent.
   */
  private async sliceSrt(
    segments: TranscriptSegment[],
    clipStart: number,
    clipEnd: number,
    srtPath: string,
  ): Promise<void> {
    const relevant = segments.filter((s) => s.start < clipEnd && s.end > clipStart);
    if (relevant.length === 0) {
      await fs.writeFile(srtPath, '');
      return;
    }

    const clipWords: WordTiming[] = [];

    for (const seg of relevant) {
      if (seg.words && seg.words.length > 0) {
        for (const w of seg.words) {
          if (w.end <= clipStart || w.start >= clipEnd) continue;
          const s = Math.max(0, w.start - clipStart);
          const e = Math.min(clipEnd - clipStart, w.end - clipStart);
          if (e > s) {
            clipWords.push({
              text: w.text,
              start: s,
              end: e,
            });
          }
        }
      } else {
        // Fallback: estimate word timings from segment text
        const s = Math.max(0, seg.start - clipStart);
        const e = Math.min(clipEnd - clipStart, seg.end - clipStart);
        if (e > s && seg.text.trim().length > 0) {
          const estimated = splitTextIntoWordTimings(seg.text, s, e);
          clipWords.push(...estimated);
        }
      }
    }

    if (clipWords.length === 0) {
      await fs.writeFile(srtPath, '');
      return;
    }

    const cues = chunkWords(clipWords, 3);
    const srt = renderSrt(cues);
    await fs.writeFile(srtPath, srt, 'utf8');
    logger.debug(
      `SRT sliced: ${relevant.length} segments (${clipWords.length} words) → ${cues.length} cues`,
    );
  }

  private srtTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const cs = Math.round((s - Math.floor(s)) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')},${String(cs).padStart(3, '0')}`;
  }

  // ─── Legacy per-clip whisper fallback ───────────────────────────────

  private async transcribeClip(
    videoPath: string,
    clipId: string,
    subtitleDir: string,
  ): Promise<void> {
    const modelPath = path.join(
      path.dirname(BINARIES.whisper),
      '..',
      '..',
      'models',
      'ggml-small.bin',
    );
    try {
      await fs.access(modelPath);
    } catch {
      throw new Error(`Whisper model not found at ${modelPath}`);
    }

    const audioTemp = path.join(subtitleDir, `${clipId}_audio.wav`);
    const srtPath = path.join(subtitleDir, `${clipId}.srt`);

    // Extract audio
    await runBinaryChecked(
      'ffmpeg',
      [
        '-i',
        videoPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-acodec',
        'pcm_s16le',
        '-f',
        'wav',
        '-y',
        audioTemp,
      ],
      { timeoutMs: 1800000 },
    );

    // Run whisper
    try {
      await runBinaryChecked(
        BINARIES.whisper,
        [
          '--model',
          modelPath,
          '--file',
          audioTemp,
          '--output-srt',
          '--output-file',
          srtPath.replace('.srt', ''),
          '--language',
          'auto',
          '--threads',
          '8',
          '--beam-size',
          '5',
          '--temperature',
          '0.0',
          '--print-progress',
        ],
        { timeoutMs: 1800000 },
      );
    } catch {
      logger.warn(`Whisper failed for ${clipId}, retrying simpler`);
      await runBinaryChecked(
        BINARIES.whisper,
        [
          '--model',
          modelPath,
          '--file',
          audioTemp,
          '--output-srt',
          '--output-file',
          srtPath.replace('.srt', ''),
          '--language',
          'en',
          '--threads',
          '4',
        ],
        { timeoutMs: 1800000 },
      );
    }

    try {
      await fs.unlink(audioTemp);
    } catch {
      /* ok */
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
