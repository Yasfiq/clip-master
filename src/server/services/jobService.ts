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
    if (input.sourceUrl !== undefined && typeof input.sourceUrl !== 'string') {
      throw new Error('sourceUrl must be a string');
    }
    if (input.sourcePath !== undefined && typeof input.sourcePath !== 'string') {
      throw new Error('sourcePath must be a string');
    }
    if (input.sourceUrl && !/^https?:\/\/\S+/.test(input.sourceUrl)) {
      throw new Error('sourceUrl must be an http(s) URL');
    }
    if (input.sourcePath && !input.sourcePath.startsWith('/')) {
      throw new Error('sourcePath must be an absolute filesystem path');
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
    } else {
      // Validate an explicit config id BEFORE mutating job state: an unknown
      // id would surface as a raw Prisma FK violation instead of a clear error.
      const cfg = await db.pipelineConfig.findUnique({ where: { id: configId } });
      if (!cfg) {
        throw new Error(`Unknown configId ${configId}`);
      }
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

    // One-active-job invariant: refuse to start a second job while another
    // job is executing a phase. PENDING rows queue behind the active one.
    const active = await db.job.findFirst({
      where: {
        id: { not: jobId },
        status: { in: [JobStatus.RUNNING_PHASE1, JobStatus.RUNNING_PHASE2] },
      },
      select: { id: true },
    });
    if (active) {
      throw new Error(
        `Job ${active.id} is already running — one active job at a time (queue stays PENDING)`,
      );
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
   * Delete a job and all its child records (logs, clips).
   * Cannot delete a job that is actively running a phase — cancel it first.
   *
   * Media files on disk are NOT removed here; file retention is a pipeline-agent
   * escalation (TBD — requires user confirmation). Orphaned media files accumulate
   * until a cleanup policy is implemented.
   */
  async deleteJob(jobId: string): Promise<void> {
    const job = await db.job.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (job.status === JobStatus.RUNNING_PHASE1 || job.status === JobStatus.RUNNING_PHASE2) {
      throw new Error(`Job ${jobId} is running — cancel it before deleting`);
    }

    await db.$transaction([
      db.jobLog.deleteMany({ where: { jobId } }),
      db.clip.deleteMany({ where: { jobId } }),
      db.job.delete({ where: { id: jobId } }),
    ]);

    // Clean up temporary work files for this job
    const workDir = path.join(PATHS.work, jobId);
    await fs.rm(workDir, { recursive: true, force: true }).catch((err) => {
      logger.warn(`Failed to clean up work dir for deleted job ${jobId}: ${err.message}`);
    });

    logger.info('Job deleted', { jobId, hadStatus: job.status });
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

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await db.job.groupBy({
      by: ['status'],
      _count: true,
    });
    const counts: Record<string, number> = {
      PENDING: 0,
      RUNNING_PHASE1: 0,
      RUNNING_PHASE2: 0,
      PHASE1_DONE: 0,
      COMPLETED: 0,
      FAILED: 0,
      CANCELLED: 0,
      REJECTED_AD: 0,
    };
    for (const r of rows) counts[r.status] = r._count;
    return counts;
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
        progress: 0.6,
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

    // One-active-job invariant (phase 2 is also an active run).
    const active = await db.job.findFirst({
      where: {
        id: { not: jobId },
        status: { in: [JobStatus.RUNNING_PHASE1, JobStatus.RUNNING_PHASE2] },
      },
      select: { id: true },
    });
    if (active) {
      throw new Error(`Job ${active.id} is already running — one active job at a time`);
    }

    logger.info('Starting Phase 2', { jobId, newConfigId });

    // Validate optional config switch before mutating job state: an unknown
    // id would surface as a raw Prisma FK violation instead of a clear error.
    if (newConfigId) {
      const cfg = await db.pipelineConfig.findUnique({ where: { id: newConfigId } });
      if (!cfg) {
        throw new Error(`Unknown configId ${newConfigId} for Phase 2`);
      }
    }

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
