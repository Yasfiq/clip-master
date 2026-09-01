/**
 * Pipeline runner: background execution wrapper for orchestrator.
 * Handles preflight checks and spawns orchestrator.runJob().
 */

import { JobErrorCode } from '@prisma/client';
import { PipelineOrchestrator } from './orchestrator';
import { runPreflight } from '../server/preflight';
import { db } from '../server/db';
import { jobService } from '../server/services/jobService';
import { logger } from '../server/logger';
import { PATHS } from '../server/paths';
import path from 'path';
import fs from 'fs/promises';

export interface RunnerConfig {
  jobId: string;
}

/**
 * Global orchestrator instance.
 */
const orchestrator = new PipelineOrchestrator();

/**
 * Execute pipeline for a single job.
 * Called from jobService.startJob() via setTimeout.
 */
export async function runPipeline(config: RunnerConfig): Promise<void> {
  const { jobId } = config;

  logger.info('Pipeline runner started', { jobId });

  try {
    // Verify job exists and is in RUNNING state
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (job.status !== 'RUNNING') {
      throw new Error(`Job ${jobId} is not in RUNNING state`);
    }

    // Preflight check: verify all binaries available
    logger.info('Running preflight checks', { jobId });
    const preflight = await runPreflight();
    if (!preflight.success) {
      throw new Error(
        `Preflight failed: directories=${JSON.stringify(preflight.directories)}, binaries=${JSON.stringify(preflight.binaries)}`,
      );
    }

    // Prepare work directory
    const workDir = path.join(PATHS.work, jobId);
    await fs.mkdir(workDir, { recursive: true });

    // Create output directory
    const outputDir = path.join(PATHS.exports, jobId);
    await fs.mkdir(outputDir, { recursive: true });

    // Execute pipeline via orchestrator
    await orchestrator.runJob(jobId);

    // Success: get final clip count and total duration
    const clips = await db.clip.findMany({
      where: { jobId },
      orderBy: { startTime: 'asc' },
    });

    const totalDuration = clips.reduce((sum, c) => sum + c.duration, 0);
    const exportPaths = clips.map((c) => c.exportPath).filter((p): p is string => p !== null);

    // Mark job as completed
    await jobService.completeJob(jobId, clips.length, totalDuration, exportPaths);
    logger.info('Pipeline completed successfully', {
      jobId,
      clipsCount: clips.length,
      totalDuration,
    });
  } catch (err: any) {
    const message = err.message || String(err);
    logger.error('Pipeline execution failed', { jobId, error: message });

    // Map error to code
    let errorCode: JobErrorCode = JobErrorCode.INTERNAL;
    if (message.includes('ad')) {
      errorCode = JobErrorCode.PURE_AD_REJECTED;
    } else if (message.includes('segment')) {
      errorCode = JobErrorCode.NO_QUALIFYING_SEGMENTS;
    } else if (message.includes('binary') || message.includes('not found')) {
      errorCode = JobErrorCode.BINARY_NOT_FOUND;
    } else if (message.includes('Preflight')) {
      errorCode = JobErrorCode.BINARY_NOT_FOUND;
    }

    try {
      await jobService.failJob(jobId, errorCode, message);
    } catch (e: any) {
      logger.error('Failed to update job status', { jobId, error: e.message });
    }
  } finally {
    logger.info('Pipeline runner finished', { jobId });
  }
}

/**
 * Cancel a running pipeline for a job.
 * Delegates to orchestrator.cancelJob().
 */
export async function cancelPipeline(jobId: string): Promise<boolean> {
  logger.info('Cancelling pipeline', { jobId });
  return orchestrator.cancelJob(jobId);
}
