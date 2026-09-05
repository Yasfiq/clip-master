/**
 * Crash recovery module.
 * Runs on server startup to recover jobs that were left in RUNNING state
 * due to unexpected server termination (crash, restart, SIGKILL, etc.)
 */

import { db } from './db';
import { JobStatus, JobErrorCode } from '@prisma/client';
import { logger } from './logger';

/**
 * Recover stale jobs on server startup.
 * Finds all jobs with status=RUNNING and marks them as FAILED.
 *
 * Rationale: If server restarts/crashes while a job is running,
 * the runner process is terminated and job is left in RUNNING state forever.
 * We assume any RUNNING job at boot time is stale and should be marked FAILED.
 */
export async function recoverStaleJobs(): Promise<void> {
  logger.info('Running crash recovery: scanning for stale RUNNING jobs');

  try {
    // Find all jobs stuck in RUNNING state
    // RUNNING* should not exist without an active process; PHASE1_DONE is safe to leave
    const staleJobs = await db.job.findMany({
      where: {
        OR: [{ status: JobStatus.RUNNING_PHASE1 }, { status: JobStatus.RUNNING_PHASE2 }],
      },
      select: {
        id: true,
        currentStage: true,
        startedAt: true,
      },
    });

    if (staleJobs.length === 0) {
      logger.info('Crash recovery: no stale jobs found');
      return;
    }

    logger.warn(`Crash recovery: found ${staleJobs.length} stale RUNNING jobs, marking as FAILED`);

    // Mark each as FAILED
    const updates = staleJobs.map((job) => {
      return db.job.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          errorCode: JobErrorCode.INTERNAL,
          errorMessage: 'Job failed due to server restart/crash during execution',
          stageEndedAt: new Date(),
          currentStage: null,
        },
      });
    });

    await Promise.all(updates);

    logger.info(`Crash recovery: successfully recovered ${staleJobs.length} stale jobs`, {
      jobIds: staleJobs.map((j) => j.id),
    });
  } catch (err: any) {
    logger.error('Crash recovery failed', { error: err.message });
    // Non-fatal: don't block server startup
  }
}
