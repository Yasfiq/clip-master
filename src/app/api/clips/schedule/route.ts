import { NextRequest } from 'next/server';
import { apiSuccess, catchApiErrors } from '@/server/api-utils';
import { getAggregatedClipsSchedule, parsePlatformsParam } from '@/server/scheduleService';

/**
 * GET /api/clips/schedule
 * Generates an aggregated multi-platform drip schedule across all exported clips (isExported: true).
 *
 * Optional Query Parameters:
 * - startDate: 'YYYY-MM-DD' (defaults to current date in WIB)
 * - platform: 'youtube' | 'tiktok' | 'reels' | 'all' (defaults to all platforms)
 * - maxClipsPerDay: number (defaults to 3)
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const { searchParams } = new URL(req.url);

    const startDate = searchParams.get('startDate') || undefined;
    const platformParam = searchParams.get('platform');
    const platforms = parsePlatformsParam(platformParam);
    const maxClipsPerDayRaw = parseInt(searchParams.get('maxClipsPerDay') || '3', 10);
    const maxClipsPerDay = Number.isFinite(maxClipsPerDayRaw) ? maxClipsPerDayRaw : 3;

    const result = await getAggregatedClipsSchedule({
      startDate,
      platforms,
      maxClipsPerDay,
    });

    return apiSuccess(result);
  }, req);
}
