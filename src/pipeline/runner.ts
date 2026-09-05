/**
 * Pipeline runner: background execution wrapper for orchestrator.
 * Handles preflight checks and spawns orchestrator.runPhase1/2().
 */

import { JobErrorCode, JobStatus } from '@prisma/client';
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

const orchestrator = new PipelineOrchestrator();

/**
 * Execute Phase 1: DISCOVER → AD_FILTER → TRANSCRIBE → ANALYZE → CUT
 */
export async function runPhase1(config: RunnerConfig): Promise<void> {
  const { jobId } = config;

  logger.info('Phase 1 runner started', { jobId });

  try {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.status !== JobStatus.RUNNING_PHASE1) {
      throw new Error(`Job ${jobId} is not in RUNNING_PHASE1 state`);
    }

    logger.info('Running preflight checks', { jobId });
    const preflight = await runPreflight();
    if (!preflight.success) {
      throw new Error(
        `Preflight failed: dirs=${JSON.stringify(preflight.directories)}, bins=${JSON.stringify(preflight.binaries)}`,
      );
    }

    const workDir = path.join(PATHS.work, jobId);
    await fs.mkdir(workDir, { recursive: true });

    const outputDir = path.join(PATHS.exports, jobId);
    await fs.mkdir(outputDir, { recursive: true });

    await orchestrator.runPhase1(jobId);

    const clips = await db.clip.findMany({
      where: { jobId },
      orderBy: { startTime: 'asc' },
    });

    await jobService.completePhase1(jobId, clips.length);
    logger.info('Phase 1 completed', { jobId, clipsCount: clips.length });
  } catch (err: any) {
    const msg = err.message || String(err);
    logger.error('Phase 1 failed', { jobId, error: msg });

    let code: JobErrorCode = JobErrorCode.INTERNAL;
    if (msg.includes('ad')) code = JobErrorCode.PURE_AD_REJECTED;
    else if (msg.includes('segment')) code = JobErrorCode.NO_QUALIFYING_SEGMENTS;
    else if (msg.includes('binary') || msg.includes('not found') || msg.includes('Preflight')) {
      code = JobErrorCode.BINARY_NOT_FOUND;
    }

    try {
      await jobService.failJob(jobId, code, msg);
    } catch (e: any) {
      logger.error('Failed to update job status', { jobId, error: e.message });
    }
  } finally {
    logger.info('Phase 1 runner finished', { jobId });
  }
}

/**
 * Execute Phase 2: EDIT → SUBTITLE → EXPORT → COMPRESS
 */
export async function runPhase2(config: RunnerConfig): Promise<void> {
  const { jobId } = config;

  logger.info('Phase 2 runner started', { jobId });

  try {
    const job = await db.job.findUnique({
      where: { id: jobId },
      include: { config: true },
    });
    if (!job) throw new Error(`Job ${jobId} not found`);
    if (job.status !== JobStatus.PHASE1_DONE && job.status !== JobStatus.RUNNING_PHASE2) {
      throw new Error(`Job ${jobId} not in PHASE1_DONE/RUNNING_PHASE2 (status: ${job.status})`);
    }

    const clips = await db.clip.findMany({
      where: { jobId },
      orderBy: { startTime: 'asc' },
    });
    if (clips.length === 0) throw new Error('No clips — Phase 1 must complete first');

    const ctx: any = {
      jobId,
      sourcePath: job.sourcePath ? path.join(PATHS.root, job.sourcePath) : '',
      workDir: path.join(PATHS.work, jobId),
      outputDir: PATHS.exports,
      config: job.config,
      sourceTitle: job.sourceFilename || job.sourceUrl || 'Untitled Source',
      metadata: (job.sourceMetadata as any) || {},
      stageData: {
        clips: clips.map((c) => ({
          id: c.id,
          startTime: c.startTime,
          endTime: c.endTime,
          duration: c.duration,
          // Resolve relative paths to absolute for stages
          cutPath: c.cutPath ? path.join(PATHS.work, c.cutPath) : undefined,
          editedPath: c.editedPath ? path.join(PATHS.work, c.editedPath) : undefined,
          subtitlePath: c.subtitlePath ? path.join(PATHS.work, c.subtitlePath) : undefined,
          exportPath: c.exportPath ? path.join(PATHS.exports, c.exportPath) : undefined,
          viralScore: c.viralScore,
          confidence: c.confidence,
        })),
        transcript: (job.stageLogs as any)?.transcript || {
          segments: [],
          language: null,
          text: '',
        },
        moments: (job.stageLogs as any)?.moments || [],
        segments: (job.stageLogs as any)?.segments || [],
      },
    };

    await orchestrator.runPhase2(jobId, ctx);

    const finalClips = await db.clip.findMany({
      where: { jobId },
      orderBy: { startTime: 'asc' },
    });

    const totalDuration = finalClips.reduce((sum, c) => sum + c.duration, 0);
    const exportPaths = finalClips.map((c) => c.exportPath).filter((p): p is string => p !== null);

    await jobService.completeJob(jobId, finalClips.length, totalDuration, exportPaths);
    logger.info('Phase 2 completed', { jobId, clipsCount: finalClips.length, totalDuration });
  } catch (err: any) {
    const msg = err.message || String(err);
    logger.error('Phase 2 failed', { jobId, error: msg });

    let code: JobErrorCode = JobErrorCode.INTERNAL;
    if (msg.includes('ad')) code = JobErrorCode.PURE_AD_REJECTED;
    else if (msg.includes('segment') || msg.includes('Clip'))
      code = JobErrorCode.NO_QUALIFYING_SEGMENTS;
    else if (msg.includes('binary') || msg.includes('not found'))
      code = JobErrorCode.BINARY_NOT_FOUND;

    try {
      await jobService.failJob(jobId, code, msg);
    } catch (e: any) {
      logger.error('Failed to update job status', { jobId, error: e.message });
    }
  } finally {
    logger.info('Phase 2 runner finished', { jobId });
  }
}

export async function cancelPipeline(jobId: string): Promise<boolean> {
  logger.info('Cancelling pipeline', { jobId });
  return orchestrator.cancelJob(jobId);
}
