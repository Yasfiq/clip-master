import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';

/**
 * GET /api/clips?jobId=...&exported=true&limit=50&offset=0
 * List clips with their owning job summary.
 *
 * Response envelope: { success, data: { clips, total, limit, offset } }
 * Each clip carries `jobName` / `jobStatus` for display without a second call.
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId') || undefined;
    const exported = searchParams.get('exported');
    const limitRaw = parseInt(searchParams.get('limit') || '100', 10);
    const offsetRaw = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const where: Record<string, unknown> = {};
    if (jobId) where.jobId = jobId;
    if (exported === 'true') where.isExported = true;
    if (exported === 'false') where.isExported = false;

    const [clips, total] = await Promise.all([
      db.clip.findMany({
        where,
        include: {
          job: { select: { status: true, sourceFilename: true, sourceUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.clip.count({ where }),
    ]);

    const data = clips.map((c) => ({
      id: c.id,
      jobId: c.jobId,
      startTime: c.startTime,
      endTime: c.endTime,
      duration: c.duration,
      viralScore: c.viralScore,
      confidence: c.confidence,
      isExported: c.isExported,
      exportPath: c.exportPath,
      thumbnailPath: c.thumbnailPath,
      createdAt: c.createdAt,
      jobName: c.job.sourceFilename || c.job.sourceUrl || c.jobId,
      jobStatus: c.job.status,
    }));

    return apiSuccess({ clips: data, total, limit, offset });
  }, req);
}
