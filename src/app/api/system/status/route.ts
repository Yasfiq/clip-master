import { NextRequest } from 'next/server';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { runPreflight } from '@/server/preflight';
import { db } from '@/server/db';

/**
 * GET /api/system/status
 * Live system health: binary preflight results, directory checks, DB online.
 * Used by the dashboard "System Status" cards instead of hardcoded values.
 *
 * Response envelope: { success, data: { pipeline, binaries, database, storage } }
 */
export async function GET(req: NextRequest) {
  return catchApiErrors(async () => {
    let preflight;
    try {
      preflight = await runPreflight();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return apiError(ErrorCode.INTERNAL, `Preflight failed: ${msg}`);
    }

    let databaseOnline = false;
    try {
      await db.job.count({ take: 1 });
      databaseOnline = true;
    } catch {
      databaseOnline = false;
    }

    const binaryNames: Record<string, string> = {
      ffmpeg: 'ffmpeg',
      ytdlp: 'yt-dlp',
      whisper: 'whisper',
    };

    const binStatus = Object.entries(preflight.binaries).map(([key, v]) => ({
      name: binaryNames[key] || key,
      ok: v.status,
      version: v.version || null,
    }));
    const binariesOk = binStatus.filter((b) => b.ok).length;

    // Stage count for the pipeline card (phase 1 + phase 2 stages).
    const pipelineStages = [
      'DISCOVER',
      'AD_FILTER',
      'TRANSCRIBE',
      'ANALYZE',
      'CUT',
      'EDIT',
      'SUBTITLE',
      'EXPORT',
      'COMPRESS',
    ];
    const allDirsOk = Object.values(preflight.directories).every(Boolean);

    return apiSuccess({
      pipeline: {
        ready: allDirsOk,
        stageCount: pipelineStages.length,
      },
      binaries: {
        ok: binariesOk,
        total: binStatus.length,
        list: binStatus,
      },
      database: {
        online: databaseOnline,
      },
      storage: {
        ok: allDirsOk,
      },
    });
  }, req);
}
