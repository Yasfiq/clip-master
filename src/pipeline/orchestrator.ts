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
import { CutStage } from './stages/cut';
import { EditStage } from './stages/edit';
import { SubtitleStage } from './stages/subtitle';
import { ExportStage } from './stages/export';
import { CompressStage } from './stages/compress';

export class PipelineOrchestrator {
  private activeJobs = new Map<string, AbortController>();

  /**
   * Run a pipeline job from its current state or start from scratch.
   */
  async runJob(jobId: string): Promise<void> {
    if (this.activeJobs.has(jobId)) {
      throw new Error(`Job ${jobId} is already running in this instance`);
    }

    const abortController = new AbortController();
    this.activeJobs.set(jobId, abortController);

    try {
      await this.executePipeline(jobId, abortController.signal);
    } catch (e: any) {
      logger.error(`Orchestrator exception on job ${jobId}: ${e.message}`, { stack: e.stack });
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

  private async executePipeline(jobId: string, signal: AbortSignal): Promise<void> {
    const job = await db.job.findUnique({
      where: { id: jobId },
      include: { config: true },
    });

    if (!job) {
      logger.error(`Job ${jobId} not found in DB`);
      return;
    }

    // Set job state to RUNNING if it isn't already
    await db.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.RUNNING,
        startedAt: job.startedAt || new Date(),
      },
    });

    // Create job-specific work directory
    const workDir = path.join(PATHS.work, jobId);
    await fs.mkdir(workDir, { recursive: true });

    // Build the execution context
    const ctx: StageContext = {
      jobId,
      sourcePath: job.sourcePath ? path.join(PATHS.root, job.sourcePath) : '',
      workDir,
      outputDir: PATHS.exports,
      config: job.config,
      metadata: (job.sourceMetadata as any) || {},
      stageData: (job.stageLogs as any) || {},
    };

    // Register all stage handlers in order
    const handlers: PipelineStageHandler[] = [
      new DiscoverStage(),
      new AdFilterStage(),
      new AnalyzeStage(),
      new CutStage(),
      new EditStage(),
      new SubtitleStage(),
      new ExportStage(),
      new CompressStage(),
    ];

    // Determine starting stage (resume support)
    let startIdx = 0;
    if (job.currentStage) {
      startIdx = handlers.findIndex((h) => h.stage === job.currentStage);
      if (startIdx === -1) startIdx = 0;
    }

    logger.info(`Starting execution of job ${jobId} at stage ${handlers[startIdx]?.stage}`);

    for (let i = startIdx; i < handlers.length; i++) {
      const handler = handlers[i]!;

      if (signal.aborted) {
        await this.handleCancellation(jobId);
        return;
      }

      logger.info(`Job ${jobId}: transitioning to stage ${handler.stage}`);

      // Update job stage
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

          if (logMsg) {
            await this.logToDb(jobId, handler.stage, 'info', logMsg);
          }
        });

        // Update stage completion metadata in context
        await db.job.update({
          where: { id: jobId },
          data: {
            stageEndedAt: new Date(),
            stageLogs: ctx.stageData as any,
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
          },
        });
        return;
      }
    }

    // Complete pipeline
    const clipsCount = ctx.stageData.clips?.length || 0;
    const totalDuration = ctx.stageData.clips?.reduce((sum, c) => sum + c.duration, 0) || 0;
    const exportPaths =
      (ctx.stageData.clips?.map((c) => c.exportPath).filter(Boolean) as string[]) || [];

    await db.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        progress: 1.0,
        stageProgress: 1.0,
        currentStage: null,
        exportedClipsCount: clipsCount,
        exportedDuration: totalDuration,
        exportPaths: JSON.stringify(exportPaths),
      },
    });

    await this.logToDb(
      jobId,
      null,
      'info',
      `Pipeline finished successfully. Exported ${clipsCount} clips.`,
    );
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
