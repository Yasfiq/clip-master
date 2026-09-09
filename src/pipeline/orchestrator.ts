import { db } from '../server/db';
import { PATHS } from '../server/paths';
import { logger } from '../server/logger';
import { JobStatus, PipelineStage, JobErrorCode } from '@prisma/client';
import { StageContext, PipelineStageHandler } from './runner-types';
import fs from 'fs/promises';
import path from 'path';

// Placeholder handlers that will be implemented in subsequent tasks
import { DiscoverStage } from './stages/discover';
import { AdFilterStage } from './stages/adFilter';
import { AnalyzeStage } from './stages/analyze';
import { TranscribeStage } from './stages/transcribe';
import { CutStage } from './stages/cut';
import { EditStage } from './stages/edit';
import { SubtitleStage } from './stages/subtitle';
import { ExportStage } from './stages/export';
import { CompressStage } from './stages/compress';

export class PipelineOrchestrator {
  private activeJobs = new Map<string, AbortController>();

  /**
   * Run Phase 1: DISCOVER → AD_FILTER → TRANSCRIBE → ANALYZE → CUT
   */
  async runPhase1(jobId: string): Promise<void> {
    if (this.activeJobs.has(jobId)) {
      throw new Error(`Job ${jobId} is already running in this instance`);
    }

    const abortController = new AbortController();
    this.activeJobs.set(jobId, abortController);

    try {
      await this.executePhase1(jobId, abortController.signal);
    } catch (e: any) {
      logger.error(`Phase 1 orchestrator exception on job ${jobId}: ${e.message}`, {
        stack: e.stack,
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Run Phase 2: EDIT → SUBTITLE → EXPORT → COMPRESS
   */
  async runPhase2(jobId: string, ctx: StageContext): Promise<void> {
    if (this.activeJobs.has(jobId)) {
      throw new Error(`Job ${jobId} is already running in this instance`);
    }

    const abortController = new AbortController();
    this.activeJobs.set(jobId, abortController);

    try {
      await this.executePhase2(jobId, abortController.signal, ctx);
    } catch (e: any) {
      logger.error(`Phase 2 orchestrator exception on job ${jobId}: ${e.message}`, {
        stack: e.stack,
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Cancel an active job.
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const controller = this.activeJobs.get(jobId);
    if (!controller) {
      logger.warn(`Attempted to cancel job ${jobId} but no controller found`);
      return false;
    }
    controller.abort();
    logger.info(`Abort signal sent to job ${jobId}`);
    return true;
  }

  private async executePhase1(jobId: string, signal: AbortSignal): Promise<void> {
    const job = await db.job.findUnique({
      where: { id: jobId },
      include: { config: true },
    });

    if (!job) {
      logger.error(`Job ${jobId} not found in DB`);
      return;
    }

    // Ensure RUNNING_PHASE1
    if (job.status !== 'RUNNING_PHASE1') {
      await db.job.update({
        where: { id: jobId },
        data: { status: JobStatus.RUNNING_PHASE1, startedAt: job.startedAt || new Date() },
      });
    }

    const workDir = path.join(PATHS.work, jobId);
    await fs.mkdir(workDir, { recursive: true });

    const ctx: StageContext = {
      jobId,
      sourcePath: job.sourcePath ? path.join(PATHS.root, job.sourcePath) : '',
      workDir,
      outputDir: PATHS.exports,
      config: job.config,
      sourceTitle: job.sourceFilename || job.sourceUrl || 'Untitled Source',
      metadata: (job.sourceMetadata as any) || {},
      stageData: (job.stageLogs as any) || {},
    };

    const phase1Handlers: PipelineStageHandler[] = [
      new DiscoverStage(),
      new AdFilterStage(),
      new TranscribeStage(),
      new AnalyzeStage(),
      new CutStage(),
    ];

    await this.runHandlers(jobId, phase1Handlers, ctx, signal, { base: 0, span: 0.6 });

    // Persist stage metadata after Phase 1 completion
    await db.job.update({
      where: { id: jobId },
      data: {
        stageLogs: ctx.stageData as any,
        stageEndedAt: new Date(),
      },
    });

    const clipsCount = ctx.stageData.clips?.length || 0;
    const totalDuration = ctx.stageData.clips?.reduce((sum, c) => sum + c.duration, 0) || 0;

    await this.logToDb(
      jobId,
      null,
      'info',
      `Phase 1 finished. ${clipsCount} clips ready for review (${totalDuration.toFixed(1)}s).`,
    );
  }

  private async executePhase2(
    jobId: string,
    signal: AbortSignal,
    ctx: StageContext,
  ): Promise<void> {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) {
      logger.error(`Job ${jobId} not found in DB`);
      return;
    }

    const phase2Handlers: PipelineStageHandler[] = [
      new EditStage(),
      new SubtitleStage(),
      new ExportStage(),
      new CompressStage(),
    ];

    await this.runHandlers(jobId, phase2Handlers, ctx, signal, { base: 0.6, span: 0.4 });

    const clipsCount = ctx.stageData.clips?.length || 0;
    const totalDuration = ctx.stageData.clips?.reduce((sum, c) => sum + c.duration, 0) || 0;

    // Persist stage metadata (runner marks job COMPLETED via completeJob)
    await db.job.update({
      where: { id: jobId },
      data: {
        stageLogs: ctx.stageData as any,
        stageEndedAt: new Date(),
      },
    });

    await this.logToDb(
      jobId,
      null,
      'info',
      `Phase 2 finished successfully. Exported ${clipsCount} clips (${totalDuration.toFixed(1)}s).`,
    );
  }

  private async runHandlers(
    jobId: string,
    handlers: PipelineStageHandler[],
    ctx: StageContext,
    signal: AbortSignal,
    progressSpan?: { base: number; span: number },
  ): Promise<void> {
    const job = await db.job.findUnique({ where: { id: jobId } });
    let startIdx = 0;
    if (job?.currentStage) {
      startIdx = handlers.findIndex((h) => h.stage === job.currentStage);
      if (startIdx === -1) startIdx = 0;
    }

    logger.info(`Starting job ${jobId} at stage ${handlers[startIdx]?.stage}`);

    for (let i = startIdx; i < handlers.length; i++) {
      const handler = handlers[i]!;

      if (signal.aborted) {
        await this.handleCancellation(jobId);
        return;
      }

      logger.info(`Job ${jobId}: transitioning to stage ${handler.stage}`);

      await db.job.update({
        where: { id: jobId },
        data: {
          currentStage: handler.stage,
          stageStartedAt: new Date(),
          stageProgress: 0.0,
        },
      });

      await this.logToDb(jobId, handler.stage, 'info', `Entering pipeline stage: ${handler.stage}`);

      try {
        await handler.execute(ctx, async (progress, logMsg) => {
          if (signal.aborted) throw new Error('ABORTED');

          await db.job.update({
            where: { id: jobId },
            data: { stageProgress: progress },
          });

          // Map intra-stage progress onto the global 0..1 scale so the
          // dashboard shows real headway instead of 0% until a phase ends.
          if (progressSpan) {
            const { base, span } = progressSpan;
            const step = span / handlers.length;
            const globalProgress = Math.min(1, base + (i + progress) * step);
            await db.job.update({
              where: { id: jobId },
              data: { progress: globalProgress },
            });
          }

          if (logMsg) {
            await this.logToDb(jobId, handler.stage, 'info', logMsg);
          }
        });

        await db.job.update({
          where: { id: jobId },
          data: {
            stageEndedAt: new Date(),
            // Persist probed source duration once DISCOVER fills metadata.
            ...(ctx.metadata.duration ? { sourceDuration: Math.round(ctx.metadata.duration) } : {}),
          },
        });
      } catch (err: any) {
        if (err.message === 'ABORTED' || signal.aborted) {
          await this.handleCancellation(jobId);
          return;
        }

        const msg = err.message || String(err);
        await this.logToDb(jobId, handler.stage, 'error', `Stage failed: ${msg}`);

        let errorCode: JobErrorCode = JobErrorCode.STAGE_FAILED;
        if (msg.includes('PURE_AD_REJECTED')) errorCode = JobErrorCode.PURE_AD_REJECTED;
        if (msg.includes('NO_QUALIFYING_SEGMENTS')) errorCode = JobErrorCode.NO_QUALIFYING_SEGMENTS;
        if (msg.includes('BINARY_NOT_FOUND')) errorCode = JobErrorCode.BINARY_NOT_FOUND;

        await db.job.update({
          where: { id: jobId },
          data: {
            status:
              errorCode === JobErrorCode.PURE_AD_REJECTED
                ? JobStatus.REJECTED_AD
                : JobStatus.FAILED,
            errorCode,
            errorMessage: msg,
            currentStage: null,
            stageEndedAt: new Date(),
          },
        });
        // Re-throw so executePhase1/2 skip their post-run success logging and
        // the runner's fail path decides the final terminal state.
        throw err;
      }
    }
  }

  private async handleCancellation(jobId: string): Promise<void> {
    logger.warn(`Job ${jobId} execution aborted`);
    await db.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.CANCELLED,
        cancelledAt: new Date(),
        currentStage: null,
      },
    });
    await this.logToDb(jobId, null, 'warning', 'Job execution was cancelled by operator');
  }

  private async logToDb(
    jobId: string,
    stage: PipelineStage | null,
    level: 'info' | 'warning' | 'error' | 'debug',
    message: string,
  ): Promise<void> {
    logger.log(level === 'warning' ? 'warn' : level, `[Job ${jobId}]: ${message}`);
    await db.jobLog.create({
      data: {
        jobId,
        stage,
        level,
        message,
      },
    });
  }
}

export const orchestrator = new PipelineOrchestrator();
