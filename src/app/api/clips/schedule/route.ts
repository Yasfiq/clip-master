import { NextRequest } from 'next/server';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
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
    if (startDate) {
      const parsed = new Date(startDate);
      if (isNaN(parsed.getTime())) {
        return apiError(
          ErrorCode.VALIDATION_FAILED,
          'startDate must be a valid date string (e.g. YYYY-MM-DD)',
        );
      }
    }

    const platformParam = searchParams.get('platform');
    const platforms = parsePlatformsParam(platformParam);
    if (platformParam && platforms && platforms.length === 0) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        `Invalid platform '${platformParam}'. Supported: youtube, tiktok, reels, all`,
      );
    }

    const maxClipsPerDayRaw = parseInt(searchParams.get('maxClipsPerDay') || '3', 10);
    if (
      searchParams.has('maxClipsPerDay') &&
      (!Number.isFinite(maxClipsPerDayRaw) || maxClipsPerDayRaw <= 0)
    ) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        'maxClipsPerDay must be a positive integer greater than 0',
      );
    }
    const maxClipsPerDay =
      Number.isFinite(maxClipsPerDayRaw) && maxClipsPerDayRaw > 0 ? maxClipsPerDayRaw : 3;

    const result = await getAggregatedClipsSchedule({
      startDate,
      platforms,
      maxClipsPerDay,
    });

    return apiSuccess(result);
  }, req);
}
