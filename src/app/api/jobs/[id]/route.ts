import { NextRequest } from 'next/server';
import { jobService } from '@/server/services/jobService';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { logger } from '@/server/logger';

/**
 * GET /api/jobs/[id]
 * Fetch a single job with full details (config, clips, recent logs)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;

    try {
      const job = await jobService.getJob(id);
      return apiSuccess(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        return apiError(ErrorCode.JOB_NOT_FOUND, `Job ${id} not found`);
      }
      logger.error('Failed to fetch job', { jobId: id, error: msg });
      return apiError(ErrorCode.INTERNAL, msg);
    }
  }, req);
}

/**
 * POST /api/jobs/[id]/start
 * Transition job from PENDING to RUNNING
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) || {};
    const action =
      body && typeof body === 'object' && !Array.isArray(body) ? (body as any).action : undefined;
    const effectiveAction = action || req.nextUrl.searchParams.get('action');

    if (effectiveAction === 'start') {
      try {
        const job = await jobService.startJob(id);
        logger.info('Job started via API', { jobId: id });
        return apiSuccess(job);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return apiError(ErrorCode.JOB_NOT_FOUND, msg);
        }
        if (msg.includes('not in PENDING')) {
          return apiError(ErrorCode.JOB_ALREADY_RUNNING, msg);
        }
        if (msg.includes('already running')) {
          return apiError(ErrorCode.JOB_ALREADY_RUNNING, msg);
        }
        logger.error('Failed to start job', { jobId: id, error: msg });
        return apiError(ErrorCode.INTERNAL, msg);
      }
    }

    if (effectiveAction === 'cancel') {
      try {
        const job = await jobService.cancelJob(id);
        logger.info('Job cancelled via API', { jobId: id });
        return apiSuccess(job);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return apiError(ErrorCode.JOB_NOT_FOUND, msg);
        }
        if (msg.includes('not in RUNNING')) {
          return apiError(
            ErrorCode.JOB_NOT_READY,
            `Job ${id} is not running — only active phase runs can be cancelled`,
          );
        }
        logger.error('Failed to cancel job', { jobId: id, error: msg });
        return apiError(ErrorCode.INTERNAL, msg);
      }
    }

    return apiError(
      ErrorCode.VALIDATION_FAILED,
      'Unknown action. Use ?action=start or ?action=cancel',
    );
  }, req);
}

/**
 * DELETE /api/jobs/[id]
 * Delete a job and its logs/clips. Refuses running jobs (cancel first).
 * Media files on disk are left in place until a retention policy exists.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;

    try {
      await jobService.deleteJob(id);
      logger.info('Job deleted via API', { jobId: id });
      return apiSuccess({ deleted: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        return apiError(ErrorCode.JOB_NOT_FOUND, `Job ${id} not found`);
      }
      if (msg.includes('is running')) {
        return apiError(
          ErrorCode.JOB_NOT_READY,
          `Job ${id} is running — cancel it before deleting`,
        );
      }
      logger.error('Failed to delete job', { jobId: id, error: msg });
      return apiError(ErrorCode.INTERNAL, msg);
    }
  }, req);
}
