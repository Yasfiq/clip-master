import { NextRequest, NextResponse } from 'next/server';
import { apiError, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { getAggregatedClipsSchedule, parsePlatformsParam } from '@/server/scheduleService';
import { generateScheduleCsv, generateScheduleJson } from '@/pipeline/logic/dripScheduler';

/**
 * GET /api/clips/schedule/export?format=csv|json
 * Download aggregated drip schedule as CSV or JSON file for all exported clips.
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    const { searchParams } = new URL(req.url);

    const format = (searchParams.get('format') || 'csv').toLowerCase();
    if (format !== 'csv' && format !== 'json') {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        `Unsupported format '${format}'. Supported formats: 'csv', 'json'`,
      );
    }

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

    if (format === 'json') {
      const jsonContent = generateScheduleJson(result.schedule, { pretty: true });
      return new NextResponse(jsonContent, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="drip_schedule.json"',
          'Cache-Control': 'no-store',
        },
      });
    }

    // Default: CSV
    const csvContent = generateScheduleCsv(result.schedule);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="drip_schedule.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }, req);
}
