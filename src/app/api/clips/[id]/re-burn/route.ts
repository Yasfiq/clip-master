import { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { reBurnClipSubtitles } from '@/pipeline/stages/reBurn';

const activeReburns = new Set<string>();

/**
 * POST /api/clips/[id]/re-burn
 * Re-burn edited subtitles into video and update export.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({
      where: { id },
      include: { job: { select: { status: true } } },
    });
    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Klip ${id} tidak ditemukan`);
    }

    if (clip.job?.status === 'RUNNING_PHASE1' || clip.job?.status === 'RUNNING_PHASE2') {
      return apiError(
        ErrorCode.JOB_ALREADY_RUNNING,
        'Tidak dapat merender klip saat proses pipeline job sedang berjalan',
      );
    }

    if (activeReburns.has(id)) {
      return apiError(ErrorCode.JOB_ALREADY_RUNNING, `Klip ${id} sedang dalam proses render ulang`);
    }

    activeReburns.add(id);
    try {
      const body = await req.json().catch(() => ({}));
      const studioConfig =
        body.studioConfig && typeof body.studioConfig === 'object' ? body.studioConfig : undefined;
      const styleId =
        typeof body.styleId === 'string' && body.styleId
          ? body.styleId
          : studioConfig?.subtitleStyleId;

      const result = await reBurnClipSubtitles(id, styleId, studioConfig);
      return apiSuccess(result);
    } finally {
      activeReburns.delete(id);
    }
  }, req);
}
