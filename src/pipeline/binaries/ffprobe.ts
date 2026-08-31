import { runBinaryChecked } from './spawn';
import { BINARIES } from '../../server/paths';

/** Raw ffprobe JSON subset we rely on. */
export interface ProbeResult {
  durationSec: number;
  width?: number;
  height?: number;
  fps?: number;
  formatName?: string;
  videoCodec?: string;
  audioCodec?: string;
  hasAudio: boolean;
  sampleRate?: number;
  channels?: number;
  bitRate?: number;
  fileSizeBytes?: number;
  /** Container tags — yt-dlp writes title/description here when present. */
  tags: Record<string, string>;
}

/**
 * Parse an FFmpeg rational frame rate such as "30000/1001" without eval.
 */
export function parseFrameRate(raw: unknown): number | undefined {
  if (typeof raw !== 'string') return undefined;
  const [numStr, denStr] = raw.split('/');
  const num = Number(numStr);
  const den = denStr === undefined ? 1 : Number(denStr);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return undefined;
  const fps = num / den;
  return Number.isFinite(fps) && fps > 0 ? Number(fps.toFixed(3)) : undefined;
}

function toNumber(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Probe a media file with ffprobe. Arguments are passed as an array; the path
 * never reaches a shell.
 */
export async function probeMedia(filePath: string, signal?: AbortSignal): Promise<ProbeResult> {
  const { stdout } = await runBinaryChecked(
    BINARIES.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { timeoutMs: 60_000, signal },
  );

  let parsed: any;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error('ffprobe returned output that is not valid JSON');
  }

  const streams: any[] = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const format = parsed.format ?? {};

  // Duration can be absent on the container but present on the video stream.
  const durationSec = toNumber(format.duration) ?? toNumber(video?.duration) ?? 0;

  return {
    durationSec,
    width: toNumber(video?.width),
    height: toNumber(video?.height),
    fps: parseFrameRate(video?.r_frame_rate ?? video?.avg_frame_rate),
    formatName: format.format_name,
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    hasAudio: Boolean(audio),
    sampleRate: toNumber(audio?.sample_rate),
    channels: toNumber(audio?.channels),
    bitRate: toNumber(format.bit_rate),
    fileSizeBytes: toNumber(format.size),
    tags: (format.tags as Record<string, string>) ?? {},
  };
}
