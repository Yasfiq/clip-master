import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';

export class EditStage implements PipelineStageHandler {
  stage = PipelineStage.EDIT;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    // TODO: Phase 4 implementation
    // - Apply FFmpeg color grading presets
    // - Apply audio ducking and background music
    // - Save edited clips to ctx.workDir
    // - Update ctx.stageData.clips with edited paths
    await onProgress(1.0, 'EDIT stage stub (placeholder)');
  }
}
