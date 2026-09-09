import { NextRequest } from 'next/server';
import { jobService } from '@/server/services/jobService';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { logger } from '@/server/logger';
import { JobListFilter } from '@/server/services/jobService';

/**
 * POST /api/jobs
 * Create a new job from URL or local file path
 */
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    const body = (await req.json().catch(() => ({}))) || {};
    const { sourceUrl, sourcePath, configId } = body;

    if (!sourceUrl && !sourcePath) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        'Either sourceUrl or sourcePath must be provided',
      );
    }

    if (typeof sourceUrl !== 'undefined' && typeof sourceUrl !== 'string') {
      return apiError(ErrorCode.VALIDATION_FAILED, 'sourceUrl must be a string');
    }
    if (typeof sourcePath !== 'undefined' && typeof sourcePath !== 'string') {
      return apiError(ErrorCode.VALIDATION_FAILED, 'sourcePath must be a string');
    }

    try {
      const job = await jobService.createJob({ sourceUrl, sourcePath, configId });
      logger.info('Job created via API', { jobId: job.id });
      return apiSuccess(job, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Failed to create job', { error: msg });
      // Operator input problem (missing local file, bad path, malformed URL,
      // unknown config id) is a validation failure, not a server fault.
      if (
        msg.includes('Failed to copy local file') ||
        msg.includes('Unknown configId') ||
        msg.includes('must be a string') ||
        msg.includes('must be an http(s) URL') ||
        msg.includes('must be an absolute filesystem path')
      ) {
        return apiError(ErrorCode.VALIDATION_FAILED, msg);
      }
      return apiError(ErrorCode.INTERNAL, msg);
    }
  }, req);
}

/**
 * GET /api/jobs?status=RUNNING&limit=50&offset=0
 * List jobs with optional filters
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as any;
    const limitRaw = parseInt(searchParams.get('limit') || '50', 10);
    const offsetRaw = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const filter: JobListFilter = { limit, offset };
    if (status) filter.status = status;

    try {
      const { jobs, total } = await jobService.listJobs(filter);
      const counts = await jobService.countByStatus();
      return apiSuccess({ jobs, total, limit, offset, counts });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Failed to list jobs', { error: msg });
      return apiError(ErrorCode.INTERNAL, msg);
    }
  }, req);
}
