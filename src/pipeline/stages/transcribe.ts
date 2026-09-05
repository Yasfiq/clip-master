/**
 * TRANSCRIBE stage: full-video transcription with whisper.
 *
 * Produces a single structured JSON transcript of the ENTIRE source video,
 * with word-level timing. This runs BEFORE ANALYZE so moment detection can
 * reason over what was said, and the SUBTITLE stage later slices this same
 * transcript instead of re-running whisper per clip.
 *
 * Pure orchestration + binary invocation; no UI deps.
 */

import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext, TranscriptSegment } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { logger } from '../../server/logger';
import { BINARIES } from '../../server/paths';
import {
  buildAudioBoostFilter,
  DEFAULT_AUDIO_BOOST,
  type AudioBoostConfig,
} from '../logic/audioBoost';
import fs from 'fs/promises';
import path from 'path';

interface WhisperToken {
  text: string;
  offsets?: { from: number; to: number };
  p?: number;
}

interface WhisperSegment {
  offsets?: { from: number; to: number };
  text?: string;
  tokens?: WhisperToken[];
}

interface WhisperJson {
  transcription?: WhisperSegment[];
  text?: string;
}

const WHISPER_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4h for very long videos

export class TranscribeStage implements PipelineStageHandler {
  stage = PipelineStage.TRANSCRIBE;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting TRANSCRIBE: full-video transcription');

    if (!ctx.metadata?.hasAudio) {
      logger.warn('Source has no audio track; skipping transcription');
      ctx.stageData.transcript = { segments: [], language: null, text: '' };
      await onProgress(1.0, 'TRANSCRIBE skipped (no audio)');
      return;
    }

    // Model path: ggml-small.bin for multilingual support (Indonesian)
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
      throw new Error(
        `Whisper model not found at ${modelPath}. Run 'bash ./models/download-ggml-model.sh base' in whisper.cpp directory.`,
      );
    }

    const transcribeDir = path.join(ctx.workDir, 'transcript');
    await fs.mkdir(transcribeDir, { recursive: true });

    // 1. Extract full audio with loudnorm + volume boost (3.0x) for clearer whisper input.
    //    Final export audio is unaffected — only the transcription input is amplified.
    await onProgress(
      0.15,
      `Extracting full audio track (loudnorm + ${DEFAULT_AUDIO_BOOST.boostFactor}x boost, 16kHz mono WAV)`,
    );
    const audioPath = path.join(transcribeDir, 'full_audio.wav');
    await this.extractFullAudio(ctx.sourcePath, audioPath, DEFAULT_AUDIO_BOOST);

    // 2. Run whisper → JSON (word-level timing)
    await onProgress(0.2, 'Transcribing full video with whisper (this can take a while)');
    const jsonBase = path.join(transcribeDir, 'full');
    await this.runWhisperJson(audioPath, jsonBase, modelPath, onProgress);

    // 3. Parse JSON into normalized TranscriptSegment[]
    const jsonPath = `${jsonBase}.json`;
    const raw = await fs.readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(raw) as WhisperJson;

    const segments = this.normalize(parsed);
    const text = segments.map((s) => s.text).join(' ');

    ctx.stageData.transcript = {
      segments,
      language: null,
      text,
    };

    logger.info(
      `TRANSCRIBE complete: ${segments.length} segments, ${Math.round(text.length / 5)} words, duration up to ${segments.length > 0 ? segments[segments.length - 1]!.end : 0}s`,
    );

    // Clean up audio (transcript JSON is enough downstream)
    try {
      await fs.unlink(audioPath);
    } catch {
      // ignore
    }

    await onProgress(1.0, `TRANSCRIBE completed: ${segments.length} transcript segments`);
  }

  /**
   * Extract full audio with ffmpeg, applying loudnorm pre-pass and a
   * volume boost for clearer whisper transcription. The boosted audio is
   * only used as the whisper input — final export audio in EDIT/EXPORT
   * is unaffected.
   */
  private async extractFullAudio(
    videoPath: string,
    outputWav: string,
    cfg: AudioBoostConfig,
  ): Promise<void> {
    const filter = buildAudioBoostFilter(cfg);
    await runBinaryChecked(
      'ffmpeg',
      ['-i', videoPath, '-vn', '-af', filter, '-acodec', 'pcm_s16le', '-f', 'wav', '-y', outputWav],
      { timeoutMs: WHISPER_TIMEOUT_MS },
    );
    logger.info(
      `Extracted boosted audio (loudnorm + ${cfg.boostFactor}x) for transcription: ${outputWav}`,
    );
  }

  /**
   * Run whisper-cli with JSON output. Progress lines arrive on stderr.
   */
  private async runWhisperJson(
    audioPath: string,
    jsonBase: string,
    modelPath: string,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    const args = [
      '--model',
      modelPath,
      '--file',
      audioPath,
      '--output-json-full',
      '--output-file',
      jsonBase,
      '--language',
      'auto',
      '--threads',
      '8',
      '--beam-size',
      '5',
      '--temperature',
      '0.0',
      '--print-progress',
    ];

    // Whisper prints progress like "whisper_print_progress_callback: 42%"
    const progressRe = /(\d+)%/;
    await runBinaryChecked(BINARIES.whisper, args, {
      timeoutMs: WHISPER_TIMEOUT_MS,
      onStderrLine: async (line) => {
        const m = line.match(progressRe);
        if (m) {
          const pct = parseInt(m[1]!, 10);
          // Map whisper 0-100 into 0.2-0.9 progress band
          await onProgress(0.2 + (pct / 100) * 0.7, `Transcribing… ${pct}%`);
        }
      },
    });
  }

  /**
   * Normalize whisper JSON (transcription[] with ms offsets) into
   * TranscriptSegment[] used by ANALYZE + SUBTITLE.
   */
  private normalize(raw: WhisperJson): TranscriptSegment[] {
    const list = raw.transcription;
    if (!list || list.length === 0) return [];

    const out: TranscriptSegment[] = [];
    for (const seg of list) {
      const fromMs = seg.offsets?.from ?? 0;
      const toMs = seg.offsets?.to ?? fromMs;
      const text = (seg.text ?? '').trim();
      if (!text) continue;

      out.push({
        start: fromMs / 1000,
        end: toMs / 1000,
        text,
        words: (seg.tokens ?? [])
          .filter((t) => t.offsets && t.text && t.text.trim() && !t.text.startsWith('['))
          .map((t) => ({
            text: t.text!.trim(),
            start: (t.offsets!.from ?? 0) / 1000,
            end: (t.offsets!.to ?? 0) / 1000,
          })),
      });
    }
    return out;
  }
}
