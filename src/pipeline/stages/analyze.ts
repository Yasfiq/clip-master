import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class AnalyzeStage implements PipelineStageHandler {
  stage = PipelineStage.ANALYZE;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    // TODO: Phase 4 implementation
    // - Detect scenes, shot changes, color dynamics, audio energy
    // - Compute SegmentFeatures for sliding windows
    // - Call selectSegments() from logic/analyze.ts
    // - Store segments in ctx.stageData.segments
    await onProgress(1.0, 'ANALYZE stage stub (placeholder)');
  }
}
