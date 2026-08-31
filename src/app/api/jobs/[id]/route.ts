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
    const body = await req.json();
    const action = body.action || req.nextUrl.searchParams.get('action');

    if (action === 'start') {
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
        logger.error('Failed to start job', { jobId: id, error: msg });
        return apiError(ErrorCode.INTERNAL, msg);
      }
    }

    if (action === 'cancel') {
      try {
        const job = await jobService.cancelJob(id);
        logger.info('Job cancelled via API', { jobId: id });
        return apiSuccess(job);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not found')) {
          return apiError(ErrorCode.JOB_NOT_FOUND, msg);
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
