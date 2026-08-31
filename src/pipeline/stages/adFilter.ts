import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { evaluateAd } from '../logic/adFilter';
import { logger } from '../../server/logger';

export class AdFilterStage implements PipelineStageHandler {
  stage = PipelineStage.AD_FILTER;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.1, 'Starting AD_FILTER: evaluating whole-video ads');

    const duration = ctx.metadata?.duration || 0;
    const title = ctx.sourceTitle;
    const description = ctx.sourceDescription;
    const threshold = ctx.config?.adScoreThreshold || 0.75;

    // Check if ad filter is enabled
    if (ctx.config?.adFilterEnabled === false) {
      await onProgress(1.0, 'AD_FILTER is disabled in config. Skipping...');
      ctx.stageData.adFilter = {
        isAd: false,
        score: 0,
        reason: 'Disabled by configuration',
      };
      return;
    }

    await onProgress(0.4, `Analyzing signals: duration=${duration}s, threshold=${threshold}`);

    // Call evaluateAd
    const verdict = evaluateAd(
      {
        title,
        description,
        durationSec: duration,
        // Visual/Audio signals to be added post-MVP when analytics running
        sceneUniformity: 0.1, // Default neutral
        staticOverlayRatio: 0.0, // Default neutral
      },
      threshold,
    );

    ctx.stageData.adFilter = verdict;

    await onProgress(0.8, `Evaluation result: score=${verdict.score}, isAd=${verdict.isAd}`);

    if (verdict.isAd) {
      logger.warn(`AD_FILTER rejected job ${ctx.jobId}: ${verdict.reason}`);
      throw new Error(`PURE_AD_REJECTED: ${verdict.reason}`);
    }

    await onProgress(1.0, 'AD_FILTER stage completed (Video accepted)');
  }
}
