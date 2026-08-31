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
    const body = await req.json();
    const { sourceUrl, sourcePath, configId } = body;

    if (!sourceUrl && !sourcePath) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        'Either sourceUrl or sourcePath must be provided',
      );
    }

    try {
      const job = await jobService.createJob({ sourceUrl, sourcePath, configId });
      logger.info('Job created via API', { jobId: job.id });
      return apiSuccess(job, 201);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Failed to create job', { error: msg });
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
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 50;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

    const filter: JobListFilter = { limit, offset };
    if (status) filter.status = status;

    try {
      const { jobs, total } = await jobService.listJobs(filter);
      return apiSuccess({ jobs, total, limit, offset });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('Failed to list jobs', { error: msg });
      return apiError(ErrorCode.INTERNAL, msg);
    }
  }, req);
}
