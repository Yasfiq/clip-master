import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class CutStage implements PipelineStageHandler {
  stage = PipelineStage.CUT;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    // TODO: Phase 4 implementation
    // - Use FFmpeg to cut each segment from source video
    // - Save raw clips to ctx.workDir
    // - Create ctx.stageData.clips with cut paths
    await onProgress(1.0, 'CUT stage stub (placeholder)');
  }
}
