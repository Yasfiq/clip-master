import { NextRequest, NextResponse } from 'next/server';
import { catchApiErrors } from '@/server/api-utils';
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
