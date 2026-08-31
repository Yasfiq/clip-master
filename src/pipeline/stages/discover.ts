import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class DiscoverStage implements PipelineStageHandler {
  stage = PipelineStage.DISCOVER;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    // TODO: Phase 4 implementation
    // - Probe source with FFprobe
    // - Extract metadata (duration, resolution, fps, codec)
    // - Detect audio presence
    // - Store in ctx.metadata and job.sourceMetadata
    await onProgress(1.0, 'DISCOVER stage stub (placeholder)');
  }
}
