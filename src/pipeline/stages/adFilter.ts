import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class AdFilterStage implements PipelineStageHandler {
  stage = PipelineStage.AD_FILTER;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    // TODO: Phase 4 implementation
    // - Extract title/description from metadata
    // - Compute ad signals (temporal, visual, audio)
    // - Call evaluateAd() from logic/adFilter.ts
    // - Store verdict in ctx.stageData.adFilter
    // - Throw if isAd === true with reason
    await onProgress(1.0, 'AD_FILTER stage stub (placeholder)');
  }
}
