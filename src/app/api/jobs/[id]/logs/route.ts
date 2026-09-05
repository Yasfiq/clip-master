import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';

export const dynamic = 'force-dynamic';

/**
 * GET /api/jobs/[id]/logs?since=[timestamp]
 * Returns historical logs and acts as a polling endpoint for MVP.
 * In Phase 4, we will enhance this into a true Server-Sent Events (SSE) stream,
 * but for Phase 3 API foundation, we implement the polling fallback first.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since'); // ISO date string

    const job = await db.job.findUnique({ where: { id } });
    if (!job) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Job ${id} not found`);
    }

    const where: any = { jobId: id };
    if (since) {
      where.timestamp = { gt: new Date(since) };
    }

    const logs = await db.jobLog.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: 1000,
    });

    return apiSuccess({ logs, status: job.status });
  }, req);
}
