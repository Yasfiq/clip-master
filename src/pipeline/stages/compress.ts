import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class CompressStage implements PipelineStageHandler {
  stage = PipelineStage.COMPRESS;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    // TODO: Phase 4 implementation
    // - Apply final CRF 21 compression with configured codec settings
    // - Verify output file integrity
    // - Register Clip rows in database with final paths
    await onProgress(1.0, 'COMPRESS stage stub (placeholder)');
  }
}
