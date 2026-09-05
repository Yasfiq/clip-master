import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { buildColorGradeFilter, ColorGradePreset } from '../logic/colorGrade';
import { buildAudioDuckFilter, DEFAULT_AUDIO_CONFIG } from '../logic/audioDuck';
import { logger } from '../../server/logger';
import { db } from '../../server/db';
import { PATHS } from '../../server/paths';
import fs from 'fs/promises';
import path from 'path';

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

    // Get color grading preset from config
    const colorPreset: ColorGradePreset = (ctx.config?.colorGrading as ColorGradePreset) || 'vivid';

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

      if (backsoundPath && ctx.metadata?.hasAudio) {
        // Apply color grading + audio mixing
        await this.applyColorAndAudio(clip.cutPath, editedPath, colorFilter, backsoundPath);
      } else if (ctx.metadata?.hasAudio && !backsoundPath) {
        // Apply color grading only, keep original audio
        await this.applyColorOnly(clip.cutPath, editedPath, colorFilter);
      } else {
        // No audio track, just apply color grading
        await this.applyColorOnly(clip.cutPath, editedPath, colorFilter);
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
  private async applyColorOnly(
    inputPath: string,
    outputPath: string,
    colorFilter: string,
  ): Promise<void> {
    const args = [
      '-i',
      inputPath,
      '-vf',
      colorFilter,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-c:a',
      'copy',
      '-y',
      outputPath,
    ];

    await runBinaryChecked('ffmpeg', args, { timeoutMs: 1800000 });
  }

  /**
   * Apply color grading + audio ducking with backsound.
   */
  private async applyColorAndAudio(
    inputPath: string,
    outputPath: string,
    colorFilter: string,
    backsoundPath: string,
  ): Promise<void> {
    // Build audio ducking filter. buildAudioDuckFilter returns the complete
    // audio sub-graph terminating in [limited]. Compose video + audio graphs:
    //   [0:v] ... [graded]; <audio graph>
    const audioFilter = buildAudioDuckFilter(audioConfig);

    const args = [
      '-i',
      inputPath,
      '-i',
      backsoundPath,
      '-filter_complex',
      `[0:v] ${colorFilter} [graded]; ${audioFilter}`,
      '-map',
      '[graded]',
      '-map',
      '[limited]',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
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
