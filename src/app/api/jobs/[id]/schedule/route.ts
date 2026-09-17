import { NextRequest } from 'next/server';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { getJobSchedule, parsePlatformsParam } from '@/server/scheduleService';

/**
 * GET /api/jobs/[id]/schedule
 * Generates the multi-platform drip schedule for a specific Job.
 *
 * Optional Query Parameters:
 * - startDate: 'YYYY-MM-DD' (defaults to current date in WIB)
 * - platform: 'youtube' | 'tiktok' | 'reels' | 'all' (defaults to all platforms)
 * - maxClipsPerDay: number (defaults to 3)
 * - exportedOnly: 'true' | 'false' (defaults to false)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const startDate = searchParams.get('startDate') || undefined;
    const platformParam = searchParams.get('platform');
    const platforms = parsePlatformsParam(platformParam);
    const maxClipsPerDayRaw = parseInt(searchParams.get('maxClipsPerDay') || '3', 10);
    const maxClipsPerDay = Number.isFinite(maxClipsPerDayRaw) ? maxClipsPerDayRaw : 3;
    const exportedOnly = searchParams.get('exportedOnly') === 'true';

    const result = await getJobSchedule(id, {
      startDate,
      platforms,
      maxClipsPerDay,
      exportedOnly,
    });

    if (!result) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Job ${id} tidak ditemukan.`);
    }

    return apiSuccess(result);
  }, req);
}
