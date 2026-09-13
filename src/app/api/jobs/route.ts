import { NextRequest } from 'next/server';
import { jobService } from '@/server/services/jobService';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { logger } from '@/server/logger';
import { JobListFilter } from '@/server/services/jobService';
import { JobStatus } from '@prisma/client';

/**
 * POST /api/jobs
 * Create a new job from URL or local file path
 */
export async function POST(req: NextRequest) {
  return catchApiErrors(async () => {
    const body = (await req.json().catch(() => ({}))) || {};
    const { sourceUrl, sourcePath, configId } = body;

    // Reject empty payload
    if (!sourceUrl && !sourcePath) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        'Either sourceUrl or sourcePath must be provided',
      );
    }

    // Reject both provided
    if (sourceUrl && sourcePath) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        'Provide either sourceUrl or sourcePath, not both',
      );
    }

    // Validate URL scheme if URL provided
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return apiError(ErrorCode.VALIDATION_FAILED, 'sourceUrl must use http or https scheme');
        }
      } catch {
        return apiError(ErrorCode.VALIDATION_FAILED, 'Invalid sourceUrl format');
      }
    }

    const job = await jobService.createJob({
      sourceUrl,
      sourcePath,
      configId,
    });

    logger.info('Created job via API', { jobId: job.id });
    return apiSuccess(job, 201);
  }, req);
}

/**
 * GET /api/jobs?status=RUNNING&limit=50&offset=0
 * List jobs with optional filters
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const limitRaw = parseInt(searchParams.get('limit') || '50', 10);
    const offsetRaw = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const filter: JobListFilter = { limit, offset };
    if (status) {
      const validStatuses = Object.values(JobStatus);
      if (!validStatuses.includes(status as any)) {
        return apiError(ErrorCode.VALIDATION_FAILED, `Filter status tidak valid: ${status}`);
      }
      filter.status = status as JobStatus;
    }

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
