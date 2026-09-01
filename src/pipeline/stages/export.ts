import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { logger } from '../../server/logger';
import fs from 'fs/promises';
import path from 'path';

export class ExportStage implements PipelineStageHandler {
  stage = PipelineStage.EXPORT;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting EXPORT stage');

    const clips = ctx.stageData.clips;
    if (!clips || clips.length === 0) {
      throw new Error('No clips to export');
    }

    // Prepare export directory
    const exportDir = ctx.outputDir;
    await fs.mkdir(exportDir, { recursive: true });

    const totalClips = clips.length;
    let completed = 0;
    const exportedPaths: string[] = [];

    for (const [idx, clip] of clips.entries()) {
      await onProgress(
        completed / totalClips,
        `Exporting clip ${idx + 1}/${totalClips}: ${clip.id}`,
      );

      // Use edited video as base (or fallback to cut)
      const videoSource = clip.editedPath || clip.cutPath;
      if (!videoSource || !(await this.fileExists(videoSource))) {
        logger.warn(`Clip ${clip.id} has no video source, skipping`);
        completed++;
        continue;
      }

      // Prepare export filename: {sourceId}_{index:02d}_{preset}_{resolution}.mp4
      const exportFilename = this.sanitizeExportName(clip.id, idx);
      const exportVideoPath = path.join(exportDir, `${exportFilename}.mp4`);

      // Copy/link video to export directory
      // Note: For MVP we copy. Post-MVP could symlink or move.
      try {
        await fs.copyFile(videoSource, exportVideoPath);
        exportedPaths.push(path.relative(ctx.workDir, exportVideoPath));
      } catch (err: any) {
        logger.error(`Failed to copy clip ${clip.id} to export: ${err.message}`);
        throw new Error(`Export copy failed for ${clip.id}: ${err.message}`);
      }

      // Validate and copy subtitle if present
      if (clip.subtitlePath && (await this.fileExists(clip.subtitlePath))) {
        const subtitleDest = path.join(exportDir, `${exportFilename}.srt`);
        try {
          // Validate SRT before copying
          const validated = await this.validateSRT(clip.subtitlePath);
          if (!validated.valid) {
            logger.warn(`SRT validation failed for ${clip.id}: ${validated.reason}`);
            // Continue anyway (subtitle optional)
          } else {
            await fs.copyFile(clip.subtitlePath, subtitleDest);
            logger.info(`Subtitle exported: ${subtitleDest}`);
          }
        } catch (err: any) {
          logger.warn(`Failed to export subtitle for ${clip.id}: ${err.message}`);
          // Non-fatal — continue without subtitle
        }
      }

      // Register final export path in clip
      clip.exportPath = exportVideoPath;

      completed++;
    }

    // Store final export paths in context (will be saved to Job by orchestrator)
    ctx.stageData.clips = clips;

    await onProgress(1.0, `EXPORT stage completed: ${totalClips} clips exported`);
    logger.info(`Exported ${totalClips} clips to ${exportDir}`);
  }

  /**
   * Sanitize clip filename per naming convention:
   * {jobId}_{index:02d}_{preset}_{resolution}.mp4
   */
  private sanitizeExportName(clipId: string, index: number): string {
    // Remove unsafe chars from clipId
    const safe = clipId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50); // Cap at 50 chars

    const paddedIdx = String(index).padStart(2, '0');
    const preset = 'default'; // TODO: extract from config
    const resolution = '1080p'; // TODO: extract from metadata

    return `${safe}_${paddedIdx}_${preset}_${resolution}`;
  }

  /**
   * Validate SRT subtitle file format and metadata.
   * Returns { valid: boolean, reason?: string }
   */
  private async validateSRT(srtPath: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const content = await fs.readFile(srtPath, 'utf-8');
      const lines = content.split('\n');

      if (lines.length < 3) {
        return { valid: false, reason: 'SRT file too short' };
      }

      let lineCount = 0;
      let maxLineLength = 0;
      let maxLinesPerSegment = 0;
      let currentSegmentLines = 0;

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and sequence numbers
        if (!trimmed || /^\d+$/.test(trimmed)) {
          if (trimmed === '') {
            maxLinesPerSegment = Math.max(maxLinesPerSegment, currentSegmentLines);
            currentSegmentLines = 0;
          }
          continue;
        }

        // Skip timecode lines
        if (trimmed.includes('-->')) {
          continue;
        }

        // This is a subtitle line
        currentSegmentLines++;
        maxLineLength = Math.max(maxLineLength, trimmed.length);
        lineCount++;
      }

      // Architecture spec (from summary):
      // maxLineLength 42, maxLines 2, minDuration 1.0s, maxDuration 7.0s
      const maxLineSpec = 42;
      const maxLinesSpec = 2;

      if (maxLineLength > maxLineSpec) {
        return {
          valid: false,
          reason: `Line too long: ${maxLineLength} > ${maxLineSpec}`,
        };
      }

      if (maxLinesPerSegment > maxLinesSpec) {
        return {
          valid: false,
          reason: `Too many lines per segment: ${maxLinesPerSegment} > ${maxLinesSpec}`,
        };
      }

      if (lineCount === 0) {
        return { valid: false, reason: 'No subtitle lines found' };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, reason: `Parse error: ${err.message}` };
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
