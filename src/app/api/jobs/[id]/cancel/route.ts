import { NextRequest } from 'next/server';
import { jobService } from '@/server/services/jobService';
import { apiError, apiSuccess, ErrorCode } from '@/server/api-utils';
import { logger } from '@/server/logger';

/**
 * POST /api/jobs/:id/cancel
 * Cancel an active running job per AGENTS.md contract.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const job = await jobService.cancelJob(id);
    logger.info('Job cancelled via /cancel route', { jobId: id });
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
