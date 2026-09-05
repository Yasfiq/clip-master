import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { buildColorGradeFilter, ColorGradePreset } from '../logic/colorGrade';
import { shouldPassThroughVideo } from '../logic/editWiring';
import { buildAudioDuckFilter, DEFAULT_AUDIO_CONFIG } from '../logic/audioDuck';
import {
  detectSilenceRegions,
  buildSilenceRemoveFilter,
  type SilenceDetectConfig,
  type SilenceWindow,
} from '../logic/silenceCompress';
export { detectSilenceRegions, buildSilenceRemoveFilter } from '../logic/silenceCompress';
import { logger } from '../../server/logger';
import { db } from '../../server/db';
import { PATHS } from '../../server/paths';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// TBD — requires user confirmation: silence removal policy.
// Defaults chosen to preserve natural speech pacing while trimming
// obvious dead-air (pauses > 500ms). Padding 80ms each side keeps the
// leading/trailing consonant of surrounding words intact.
export const SILENCE_CONFIG: SilenceDetectConfig = {
  thresholdDb: -35,
  minSilenceMs: 500,
  padMs: 80,
};

export class EditStage implements PipelineStageHandler {
  stage = PipelineStage.EDIT;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting EDIT stage: color grading + audio mixing');

    const clips = ctx.stageData.clips;
    if (!clips || clips.length === 0) {
      throw new Error('No clips found from CUT stage');
    }

    // Prepare edited clips directory
    const editedDir = path.join(ctx.workDir, 'edited');
    await fs.mkdir(editedDir, { recursive: true });

    // Color grading preset from config. Defaults to natural (no grading) —
    // the source footage passes through untouched unless the user opts into
    // a filter preset. TODO: presets beyond natural are not yet exposed in UI.
    const colorPreset: ColorGradePreset =
      (ctx.config?.colorGrading as ColorGradePreset) || 'natural';

    // Get backsound settings
    const backsoundEnabled = ctx.config?.backsoundEnabled !== false;
    let backsoundPath: string | null = null;

    if (backsoundEnabled) {
      backsoundPath = await this.selectBacksound(ctx);
      if (!backsoundPath) {
        logger.warn('No backsound file found in media/assets/, proceeding without backsound');
      }
    }

    const totalClips = clips.length;
    let completed = 0;

    for (const [idx, clip] of clips.entries()) {
      await onProgress(completed / totalClips, `Editing clip ${idx + 1}/${totalClips}: ${clip.id}`);

      const editedPath = path.join(editedDir, `${clip.id}_edited.mp4`);

      // Build color grading filter
      const colorFilter = buildColorGradeFilter({
        preset: colorPreset,
        brightness: 0,
        contrast: 1.0,
        saturation: 1.0,
      });

      // Natural grading produces an empty filter. The video stream must then
      // pass through untouched: copying avoids feeding '' to ffmpeg, which
      // would corrupt the graph or produce a broken encode.
      const videoPassThrough = shouldPassThroughVideo(colorFilter);

      if (backsoundPath && ctx.metadata?.hasAudio) {
        // Apply color grading + audio mixing
        const dur = clip.duration ?? ctx.metadata?.duration ?? 0;
        await this.applyColorAndAudio(
          clip.cutPath,
          editedPath,
          colorFilter,
          backsoundPath,
          dur,
          videoPassThrough,
        );
      } else if (ctx.metadata?.hasAudio && !backsoundPath) {
        // Apply color grading only, keep original audio
        await this.applyColorOnly(clip.cutPath, editedPath, colorFilter, videoPassThrough);
      } else {
        // No audio track, just apply color grading
        await this.applyColorOnly(clip.cutPath, editedPath, colorFilter, videoPassThrough);
      }

      // Verify edited file
      const stat = await fs.stat(editedPath);
      if (stat.size < 1024) {
        throw new Error(`Edited file too small (${stat.size} bytes) for clip ${clip.id}`);
      }

      // Update clip with edited path in both context and DB
      clip.editedPath = editedPath;
      const relativeEditedPath = path.relative(PATHS.work, editedPath);
      await db.clip
        .update({
          where: { id: clip.id },
          data: { editedPath: relativeEditedPath },
        })
        .catch((err) => {
          logger.warn(`Failed to update Clip ${clip.id} editedPath in DB: ${err.message}`);
        });
      completed++;
    }

    await onProgress(1.0, `EDIT stage completed: ${totalClips} clips edited`);
    logger.info(`EDIT stage produced ${totalClips} edited clips in ${editedDir}`);
  }

  /**
   * Apply color grading filter only (no audio mixing).
   */

  /**
   * Apply color grading only (no audio mixing). When the grading filter is
   * empty (natural), pass the video through as a stream copy — no re-encode
   * of an untouched image.
   */
  private async applyColorOnly(
    inputPath: string,
    outputPath: string,
    colorFilter: string,
    videoPassThrough: boolean,
  ): Promise<void> {
    const args = [
      '-i',
      inputPath,
      ...(videoPassThrough
        ? ['-c:v', 'copy']
        : ['-vf', colorFilter, '-c:v', 'libx264', '-preset', 'medium', '-crf', '23']),
      '-c:a',
      'copy',
      '-y',
      outputPath,
    ];

    await runBinaryChecked('ffmpeg', args, { timeoutMs: 1800000 });
  }

  /**
   * Apply color grading + audio ducking with backsound.
   * Optionally removes long silences from the voice track before mixing.
   */
  private async applyColorAndAudio(
    inputPath: string,
    outputPath: string,
    colorFilter: string,
    backsoundPath: string,
    clipDuration: number,
    videoPassThrough: boolean,
  ): Promise<void> {
    // Detect silences on the voice track (input [0:a]) before mixing.
    // Skipped when the voice track is shorter than the configured minimum
    // silence, or when extraction fails (caller falls back to no-op).
    const voiceSilenceRegions = await this.detectVoiceSilences(inputPath, clipDuration);

    // Build the audio ducking graph: voice -> asplit (sidechain detect + mix),
    // music -> volume -> sidechaincompress against voice, mix, fades, limit.
    const audioFilter = buildAudioDuckFilter({
      speechGain: 1.0,
      musicBaselineGain: 0.125,
      sidechainThreshold: 0.01,
      sidechainRatio: 8,
      attackMs: 20,
      releaseMs: 600,
      peakLimit: 0.891,
      fadeSeconds: 2,
      backsoundPath,
    });

    // Compose filter graph: video on [0:v], audio on [0:a] and [1:a].
    // If voice silences were detected, prepend the atrim+concat filter on
    // [0:a] so the voice stream entering the ducking graph only contains
    // the voiced segments. The music sidechain then sees accurate voice
    // activity, and the resulting stream is shorter than the source.
    let filterComplex: string;
    if (voiceSilenceRegions.length > 0) {
      const voicePre = buildSilenceRemoveFilter(clipDuration, voiceSilenceRegions);
      // The silence-remove sub-graph ends with label [voiced]. The ducking
      // graph in audioFilter references [0:a] for the source voice; remap
      // that label to [voiced] so the trimmed stream feeds the sidechain
      // detector and the mix bus.
      const voicedLabel = '[voiced]';
      const remappedAudio = audioFilter.replaceAll('[0:a]', voicedLabel);
      filterComplex = `[0:v] ${colorFilter} [graded]; [0:a] ${voicePre}; ${remappedAudio}`;
    } else {
      filterComplex = `[0:v] ${colorFilter} [graded]; ${audioFilter}`;
    }

    // Natural grading: video passes through untouched (map + copy), and the
    // filter_complex graph must contain only audio filters — an empty video
    // filter chain would corrupt the graph. The audio branch references
    // [0:a]/[1:a] only, so drop the video edge entirely.
    if (videoPassThrough) {
      const audioOnlyGraph = filterComplex
        .replace(`[0:v] ${colorFilter} [graded]; `, '')
        .replace(`[0:v] ${colorFilter} [graded];`, '');
      filterComplex = audioOnlyGraph;
    }

    const args = [
      '-i',
      inputPath,
      '-i',
      backsoundPath,
      ...(videoPassThrough
        ? ['-map', '0:v', '-c:v', 'copy']
        : [
            '-filter_complex',
            filterComplex,
            '-map',
            '[graded]',
            '-c:v',
            'libx264',
            '-preset',
            'medium',
            '-crf',
            '23',
          ]),
      '-map',
      '[limited]',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-ar',
      '48000',
      '-y',
      outputPath,
    ];

    await runBinaryChecked('ffmpeg', args, { timeoutMs: 1800000 });
  }

  /**
   * Extract voice PCM from input and return silence windows.
   * Returns [] on any failure (caller falls back to un-trimmed audio).
   */
  private async detectVoiceSilences(
    inputPath: string,
    clipDuration: number,
  ): Promise<SilenceWindow[]> {
    if (!clipDuration || clipDuration <= 0) return [];
    // Skip for very short clips where silence detection is unreliable.
    if (clipDuration < 3) return [];
    const sampleRate = 16000;
    try {
      const pcm = await this.extractPcmMono(inputPath, sampleRate, clipDuration);
      if (!pcm || pcm.length === 0) return [];
      const regions = detectSilenceRegions(pcm, sampleRate, SILENCE_CONFIG);
      if (regions.length > 0) {
        const totalCut = regions.reduce((s, r) => s + (r.endSec - r.startSec), 0);
        logger.info(
          `Silence remove ${path.basename(inputPath)}: ${regions.length} regions, ` +
            `${totalCut.toFixed(2)}s trimmed from ${clipDuration.toFixed(2)}s`,
        );
      }
      return regions;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Silence detection skipped for ${path.basename(inputPath)}: ${msg}`);
      return [];
    }
  }

  /**
   * Pipe ffmpeg's PCM s16le mono output into a Float32Array in [-1, 1].
   */
  private async extractPcmMono(
    inputPath: string,
    sampleRate: number,
    durationSec: number,
  ): Promise<Float32Array | null> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const child = spawn('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-t',
        String(durationSec),
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(sampleRate),
        '-f',
        's16le',
        '-acodec',
        'pcm_s16le',
        'pipe:1',
      ]);
      child.stdout.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
      child.stderr.on('data', () => {
        // drain to avoid backpressure stalls
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg pcm extract exited ${code}`));
          return;
        }
        const buf = Buffer.concat(chunks);
        const samples = new Float32Array(buf.length / 2);
        for (let i = 0; i < samples.length; i++) {
          const v = buf.readInt16LE(i * 2);
          samples[i] = v / 32768;
        }
        resolve(samples);
      });
    });
  }

  /**
   * Select a backsound file from media/assets/.
   * MVP: pick first .mp3 or .wav file found.
   * Post-MVP: mood-based selection.
   */
  private async selectBacksound(ctx: StageContext): Promise<string | null> {
    const assetsDir = PATHS.assets;

    let files: string[];
    try {
      files = await fs.readdir(assetsDir);
    } catch {
      return null;
    }

    const audioFiles = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === '.mp3' || ext === '.wav' || ext === '.ogg' || ext === '.flac';
    });

    if (audioFiles.length === 0) {
      return null;
    }

    // MVP: simple selection — pick first file
    // TODO: Post-MVP mood matching (energetic vs calm)
    const selected = audioFiles[0];
    const absolutePath = path.join(assetsDir, selected);

    logger.info(`Selected backsound: ${selected}`);
    return absolutePath;
  }
}
