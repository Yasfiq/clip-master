import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class SubtitleStage implements PipelineStageHandler {
  stage = PipelineStage.SUBTITLE;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    // TODO: Phase 4 implementation
    // - Call local Whisper binary on each clip
    // - Generate SRT subtitle sidecars
    // - Save subtitles to ctx.workDir
    // - Update ctx.stageData.clips with subtitle paths
    await onProgress(1.0, 'SUBTITLE stage stub (placeholder)');
  }
}
