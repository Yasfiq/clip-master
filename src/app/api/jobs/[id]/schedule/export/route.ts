import { NextRequest, NextResponse } from 'next/server';
import { apiError, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { getJobSchedule, parsePlatformsParam } from '@/server/scheduleService';
import { generateScheduleCsv, generateScheduleJson } from '@/pipeline/logic/dripScheduler';

/**
 * GET /api/jobs/[id]/schedule/export?format=csv|json
 * Download drip schedule as CSV or JSON file for a specific Job.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const format = (searchParams.get('format') || 'csv').toLowerCase();
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
