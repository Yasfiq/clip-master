import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { db } from '@/server/db';
import { PATHS } from '@/server/paths';
import { apiError, apiSuccess, catchApiErrors, ErrorCode } from '@/server/api-utils';
import { generateHookTtsAudio } from '@/pipeline/logic/ttsVoiceover';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/clips/[id]/tts
 * Stream the preview TTS audio generated for this clip's hook.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({
      where: { id },
      select: { id: true, jobId: true },
    });

    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Klip ${id} tidak ditemukan`);
    }

    const previewPath = path.join(PATHS.work, clip.jobId, 'tts', `${clip.id}_preview_hook.mp3`);
    let finalAudioPath = (await fileExists(previewPath)) ? previewPath : null;

    if (!finalAudioPath) {
      // Check if there are any existing tts files for this clip
      const ttsDir = path.join(PATHS.work, clip.jobId, 'tts');
      if (await fileExists(ttsDir)) {
        const files = await fsPromises.readdir(ttsDir);
        const match = files.find((f) => f.startsWith(`${clip.id}_`) && f.endsWith('.mp3'));
        if (match) {
          finalAudioPath = path.join(ttsDir, match);
        }
      }
    }

    if (!finalAudioPath) {
      return apiError(ErrorCode.JOB_NOT_FOUND, 'Berkas audio TTS belum digenerate untuk klip ini');
    }

    const st = await fsPromises.stat(finalAudioPath);
    const stream = fs.createReadStream(finalAudioPath);

    return new NextResponse(stream as any, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(st.size),
        'Cache-Control': 'no-cache, must-revalidate',
      },
    });
  }, req);
}

/**
 * POST /api/clips/[id]/tts
 * Generate or re-generate TTS audio preview for the headline hook.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return catchApiErrors(async () => {
    const { id } = await params;
    const clip = await db.clip.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!clip) {
      return apiError(ErrorCode.JOB_NOT_FOUND, `Klip ${id} tidak ditemukan`);
    }

    const body = await req.json().catch(() => ({}));
    const rawConfig =
      clip.studioConfig && typeof clip.studioConfig === 'object'
        ? (clip.studioConfig as Record<string, any>)
        : {};

    const textToSpeak: string = (
      typeof body.text === 'string' && body.text.trim()
        ? body.text
        : clip.hookHeadline || rawConfig.hookText || ''
    ).trim();

    if (!textToSpeak) {
      return apiError(
        ErrorCode.VALIDATION_FAILED,
        'Teks hook tidak boleh kosong untuk generate voiceover',
      );
    }

    const voice =
      typeof body.voice === 'string' && body.voice
        ? body.voice
        : rawConfig.hookTtsVoice || 'id-ID-GadisNeural';
    const rate = typeof body.rate === 'string' && body.rate ? body.rate : '+20%';

    const destDir = path.join(PATHS.work, clip.jobId, 'tts');
    await fsPromises.mkdir(destDir, { recursive: true });
    const previewFile = path.join(destDir, `${clip.id}_preview_hook.mp3`);

    const result = await generateHookTtsAudio({
      text: textToSpeak,
      outputPath: previewFile,
      voice,
      rate,
    });

    const duration = Number(result.duration.toFixed(2));

    // Update database studioConfig with latest detected duration
    await db.clip.update({
      where: { id: clip.id },
      data: {
        studioConfig: {
          ...rawConfig,
          hookText: textToSpeak,
          hookDuration: duration,
          freezeDuration: duration,
          hookTtsEnabled: true,
          hookTtsVoice: voice,
        } as any,
      },
    });

    return apiSuccess({
      audioUrl: `/api/clips/${clip.id}/tts?t=${Date.now()}`,
      duration,
      voice,
      text: textToSpeak,
    });
  }, req);
}
