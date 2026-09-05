import { db } from '../db';
import { JobStatus, JobErrorCode, PipelineStage, type Job, type Clip } from '@prisma/client';
import { PATHS } from '../paths';
import { logger } from '../logger';
import { runPreflight } from '../preflight';
import { runPhase1, runPhase2, cancelPipeline } from '../../pipeline/runner';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export interface CreateJobInput {
  sourceUrl?: string;
  sourcePath?: string;
  configId?: string;
  configOverride?: Partial<{
    adFilterEnabled: boolean;
    adScoreThreshold: number;
    minSegmentDuration: number;
    targetDuration: number;
    maxClips: number;
    colorGrading: string;
    backsoundEnabled: boolean;
    subtitleEnabled: boolean;
    targetResolution: string;
  }>;
}

export interface JobListFilter {
  status?: JobStatus;
  limit?: number;
  offset?: number;
  from?: Date;
  to?: Date;
}

export interface JobUpdatePayload {
  progress?: number;
  currentStage?: PipelineStage;
  stageProgress?: number;
  stageLogs?: any;
  errorCode?: JobErrorCode;
  errorMessage?: string;
}

export class JobService {
  /**
   * Create a new job. Handles source file copying if local path provided.
   */
  async createJob(input: CreateJobInput): Promise<Job> {
    logger.info('Creating new job', { sourceUrl: input.sourceUrl, sourcePath: input.sourcePath });

    // 1. Validate at least one source
    if (!input.sourceUrl && !input.sourcePath) {
      throw new Error('Either sourceUrl or sourcePath must be provided');
    }

    // 2. Get or use default config
    let configId = input.configId;
    if (!configId) {
      const defaultConfig = await db.pipelineConfig.findFirst({ where: { isDefault: true } });
      if (!defaultConfig) {
        throw new Error('No default pipeline configuration found');
      }
      configId = defaultConfig.id;
      logger.debug('Using default config', { configId });
    }

    // 3. Generate unique source ID and filename
    const sourceId = randomUUID();
    const sourceFilename = input.sourceUrl
      ? `url_${sourceId}.tmp`
      : path.basename(input.sourcePath!);
    const targetPath = path.join(PATHS.sources, `${sourceId}_${sourceFilename}`);

    // 4. For local file, copy it to the sources directory
    let finalSourcePath: string | null = null;
    if (input.sourcePath) {
      try {
        await fs.copyFile(input.sourcePath, targetPath);
        const stats = await fs.stat(targetPath);
        logger.info('Copied local file to sources', {
          from: input.sourcePath,
          to: targetPath,
          size: stats.size,
        });
        finalSourcePath = path.relative(PATHS.root, targetPath);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error('Failed to copy local file', { sourcePath: input.sourcePath, error: msg });
        throw new Error(`Failed to copy local file: ${msg}`);
      }
    }

    // 5. Create the job record
    const job = await db.job.create({
      data: {
        status: JobStatus.PENDING,
        sourceUrl: input.sourceUrl,
        sourceFilename,
        sourcePath: finalSourcePath,
        sourceFileSize: input.sourcePath ? undefined : null,
        configId,
      },
    });

    logger.info('Job created', { jobId: job.id });
    return job;
  }

  /**
   * Start a pending job. Transitions to RUNNING, sets startedAt.
   * Verifies binaries via preflight, spawns pipeline runner in background.
   */
  async startJob(jobId: string): Promise<Job> {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (job.status !== JobStatus.PENDING) {
      throw new Error(`Job ${jobId} is not in PENDING state (current: ${job.status})`);
    }

    // Preflight check
    const preflight = await runPreflight();
    if (!preflight.success) {
      throw new Error(`Preflight failed: ${JSON.stringify(preflight)}`);
    }

    logger.info('Starting job', { jobId });

    const updated = await db.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.RUNNING_PHASE1,
        startedAt: new Date(),
        currentStage: PipelineStage.DISCOVER,
        stageStartedAt: new Date(),
      },
    });

    // Start Phase 1 in background (non-blocking)
    setTimeout(() => {
      runPhase1({ jobId }).catch((err) => {
        logger.error('Background Phase 1 runner failed', { jobId, error: err.message });
      });
    }, 10);

    return updated;
  }

  /**
   * Cancel a running job. Marks as CANCELLED, sets cancelledAt.
   */
  async cancelJob(jobId: string): Promise<Job> {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (job.status !== JobStatus.RUNNING_PHASE1 && job.status !== JobStatus.RUNNING_PHASE2) {
      throw new Error(`Job ${jobId} is not in RUNNING state (current: ${job.status})`);
    }

    logger.info('Cancelling job', { jobId });

    // Signal cancellation to runner process
    const cancelled = cancelPipeline(jobId);
    if (!cancelled) {
      logger.warn(`No active runner found for job ${jobId}, marking as cancelled anyway`);
    }

    const updated = await db.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.CANCELLED,
        cancelledAt: new Date(),
        currentStage: null,
        stageStartedAt: null,
        stageEndedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * Fetch a single job by ID with its config and clips.
   */
  async getJob(jobId: string): Promise<Job & { config: any; clips: Clip[]; logs: any[] }> {
    const job = await db.job.findUnique({
      where: { id: jobId },
      include: {
        config: true,
        clips: { orderBy: { startTime: 'asc' } },
        logs: { orderBy: { timestamp: 'desc' }, take: 100 },
      },
    });
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    return job as any;
  }

  /**
   * List jobs with optional filters.
   */
  async listJobs(filter: JobListFilter = {}): Promise<{ jobs: Job[]; total: number }> {
    const where: any = {};
    if (filter.status) where.status = filter.status;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }

    const [jobs, total] = await Promise.all([
      db.job.findMany({
        where,
        include: { config: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: filter.limit || 50,
        skip: filter.offset || 0,
      }),
      db.job.count({ where }),
    ]);

    return { jobs, total };
  }

  /**
   * Update progress for a running job.
   */
  async updateJobProgress(jobId: string, payload: JobUpdatePayload): Promise<Job> {
    const data: any = {};
    if (payload.progress !== undefined) data.progress = payload.progress;

    if (payload.currentStage !== undefined) {
      // Stage transition
      data.currentStage = payload.currentStage;
      data.stageStartedAt = new Date();
      data.stageProgress = 0.0;
      data.stageEndedAt = null;
    } else if (payload.stageProgress !== undefined) {
      data.stageProgress = payload.stageProgress;
    }

    if (payload.stageLogs !== undefined) {
      data.stageLogs = payload.stageLogs;
    }

    // Only update if there are fields to update
    if (Object.keys(data).length === 0) {
      const job = await db.job.findUnique({ where: { id: jobId } });
      return job!;
    }

    return db.job.update({
      where: { id: jobId },
      data,
    });
  }

  /**
   * Mark a job as completed.
   */
  async completeJob(
    jobId: string,
    clipsCount: number,
    totalDuration: number,
    exportPaths: string[],
  ): Promise<Job> {
    logger.info('Completing job', { jobId, clipsCount, totalDuration });
    return db.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        progress: 1.0,
        stageProgress: 1.0,
        stageEndedAt: new Date(),
        currentStage: null,
        exportedClipsCount: clipsCount,
        exportedDuration: totalDuration,
        exportPaths: JSON.stringify(exportPaths),
      },
    });
  }

  /**
   * Fail a job with a specific error code.
   */
  async failJob(jobId: string, code: JobErrorCode, message: string): Promise<Job> {
    logger.error('Failing job', { jobId, code, message });
    return db.job.update({
      where: { id: jobId },
      data: {
        status: code === JobErrorCode.PURE_AD_REJECTED ? JobStatus.REJECTED_AD : JobStatus.FAILED,
        errorCode: code,
        errorMessage: message,
        stageEndedAt: new Date(),
      },
    });
  }

  /**
   * Complete Phase 1: mark job as PHASE1_DONE, clips already persisted by CUT stage.
   */
  async completePhase1(jobId: string, clipsCount: number): Promise<Job> {
    logger.info('Completing Phase 1', { jobId, clipsCount });
    return db.job.update({
      where: { id: jobId },
      data: {
        status: JobStatus.PHASE1_DONE,
        stageEndedAt: new Date(),
        currentStage: null,
        stageProgress: 1.0,
        exportedClipsCount: clipsCount,
      },
    });
  }

  /**
   * Start Phase 2: validates PHASE1_DONE state, transitions to RUNNING_PHASE2.
   */
  async startPhase2(jobId: string, newConfigId?: string): Promise<Job> {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (job.status !== JobStatus.PHASE1_DONE) {
      throw new Error(`Job ${jobId} is not in PHASE1_DONE state (current: ${job.status})`);
    }

    logger.info('Starting Phase 2', { jobId, newConfigId });

    const updateData: any = {
      status: JobStatus.RUNNING_PHASE2,
      currentStage: PipelineStage.EDIT,
      stageStartedAt: new Date(),
      stageProgress: 0.0,
    };

    // Optionally switch to a new config for Phase 2
    if (newConfigId) {
      updateData.configId = newConfigId;
    }

    const updated = await db.job.update({
      where: { id: jobId },
      data: updateData,
    });

    // Start Phase 2 in background (non-blocking)
    setTimeout(() => {
      runPhase2({ jobId }).catch((err) => {
        logger.error('Background Phase 2 runner failed', { jobId, error: err.message });
      });
    }, 10);

    return updated;
  }
}

export const jobService = new JobService();
