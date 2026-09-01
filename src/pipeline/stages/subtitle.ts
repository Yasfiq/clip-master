import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked, runBinary } from '../binaries/spawn';
import { logger } from '../../server/logger';
import { BINARIES } from '../../server/paths';
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

    // Check if subtitle generation is enabled in config
    if (ctx.config?.subtitleEnabled === false) {
      logger.info('Subtitle generation disabled in config, skipping stage');
      await onProgress(1.0, 'Subtitle stage skipped (disabled)');
      return;
    }

    // Whisper model path (models in whisper.cpp/models/, binary in whisper.cpp/build/bin/)
    const modelPath = path.join(
      path.dirname(BINARIES.whisper),
      '..',
      '..',
      'models',
      'ggml-base.bin',
    );

    // Verify model exists
    try {
      await fs.access(modelPath);
    } catch {
      throw new Error(
        `Whisper model not found at ${modelPath}. Run 'bash ./models/download-ggml-model.sh base' in whisper.cpp directory.`,
      );
    }

    // Prepare subtitles directory
    const subtitleDir = path.join(ctx.workDir, 'subtitles');
    await fs.mkdir(subtitleDir, { recursive: true });

    const totalClips = clips.length;
    let completed = 0;

    for (const [idx, clip] of clips.entries()) {
      await onProgress(
        completed / totalClips,
        `Generating subtitles for clip ${idx + 1}/${totalClips}: ${clip.id}`,
      );

      const inputPath = clip.editedPath || clip.cutPath;
      if (!inputPath || !(await this.fileExists(inputPath))) {
        logger.warn(`Clip ${clip.id} has no edited/cut path, skipping subtitle`);
        completed++;
        continue;
      }

      // 1. Extract audio to WAV 16kHz mono
      const audioTemp = path.join(subtitleDir, `${clip.id}_audio.wav`);
      await this.extractAudio(inputPath, audioTemp);

      // 2. Run whisper transcription
      const srtPath = path.join(subtitleDir, `${clip.id}.srt`);
      await this.runWhisper(audioTemp, srtPath, modelPath);

      // 3. Verify SRT output
      if (await this.fileExists(srtPath)) {
        clip.subtitlePath = srtPath;
        logger.info(`Subtitle generated: ${srtPath}`);
      } else {
        logger.warn(`Whisper produced no SRT for ${clip.id}`);
      }

      // 4. Clean up temporary audio file
      try {
        await fs.unlink(audioTemp);
      } catch {
        // ignore
      }

      completed++;
    }

    await onProgress(1.0, `SUBTITLE stage completed: ${totalClips} clips processed`);
    logger.info(`Subtitles saved in ${subtitleDir}`);
  }

  /**
   * Extract audio from video to WAV 16kHz mono.
   */
  private async extractAudio(videoPath: string, outputWav: string): Promise<void> {
    const args = [
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
      outputWav,
    ];

    await runBinaryChecked('ffmpeg', args, { timeoutMs: 30000 });
  }

  /**
   * Run whisper-cli on an audio file, producing SRT subtitles.
   */
  private async runWhisper(audioPath: string, srtPath: string, modelPath: string): Promise<void> {
    const args = [
      '--model',
      modelPath,
      '--file',
      audioPath,
      '--output-srt',
      '--output-file',
      srtPath.replace('.srt', ''), // whisper expects base name without extension
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

    try {
      await runBinaryChecked(BINARIES.whisper, args, { timeoutMs: 120000 });
    } catch (err: any) {
      const msg = err.message || String(err);
      // Check if error is about missing model or binary
      if (msg.includes('No such file') || msg.includes('model not found')) {
        throw new Error(`Whisper model/binary error: ${msg}`);
      }
      // Retry once with fallback parameters
      logger.warn(`First whisper attempt failed for ${audioPath}, retrying with simpler params`);
      const fallbackArgs = [
        '--model',
        modelPath,
        '--file',
        audioPath,
        '--output-srt',
        '--output-file',
        srtPath.replace('.srt', ''),
        '--language',
        'en',
        '--threads',
        '4',
      ];
      await runBinaryChecked(BINARIES.whisper, fallbackArgs, { timeoutMs: 120000 });
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
