import { NextRequest } from 'next/server';
import { jobService } from '@/server/services/jobService';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { logger } from '@/server/logger';

/**
 * POST /api/jobs/[id]/phase2
 * Start Phase 2 of a job that is currently in PHASE1_DONE state.
 *
 * Request body (optional):
 *   configId: string — new pipeline config ID for Phase 2.
 * If omitted, job continues with the same config used in Phase 1.
 *
 * Returns:
 *   Job with status=RUNNING_PHASE2 and updated fields.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    try {
      const job = await jobService.startPhase2(id, body.configId);
      logger.info('Phase 2 started via API', { jobId: id, configId: body.configId || null });
      return apiSuccess(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('not found')) {
        return apiError(ErrorCode.JOB_NOT_FOUND, `Job ${id} not found`);
      }
      if (msg.includes('not in PHASE1_DONE')) {
        return apiError(
          ErrorCode.JOB_NOT_READY,
          `Job ${id} is not ready for Phase 2 (must be in PHASE1_DONE)`,
        );
      }
      logger.error('Failed to start Phase 2', { jobId: id, error: msg });
      return apiError(ErrorCode.INTERNAL, msg);
    }
  }, req);
}
