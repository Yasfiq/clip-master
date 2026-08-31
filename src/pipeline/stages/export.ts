import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class ExportStage implements PipelineStageHandler {
  stage = PipelineStage.EXPORT;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    // TODO: Phase 4 implementation
    // - Use FFmpeg to combine edited video with SRT sidecars (burn-in/embedded)
    // - Save final exported clips to ctx.outputDir
    // - Update ctx.stageData.clips with export paths
    await onProgress(1.0, 'EXPORT stage stub (placeholder)');
  }
}
