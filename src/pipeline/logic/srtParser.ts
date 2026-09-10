export interface SubtitleCue {
  id: number;
  start: number;
  end: number;
  text: string;
}

const TIMESTAMP_REGEX =
  /(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{3})/;

function parseTimestampToSeconds(h: string, m: string, s: string, ms: string): number {
  const hours = parseInt(h, 10);
  const minutes = parseInt(m, 10);
  const seconds = parseInt(s, 10);
  const milliseconds = parseInt(ms, 10);
  return (hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds) / 1000;
}

export function formatSrtTimestamp(seconds: number): string {
  const totalMs = Math.round(Math.max(0, seconds) * 1000);
  const safe = Math.floor(totalMs / 1000);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function parseSrt(srtContent: string): SubtitleCue[] {
  if (!srtContent || typeof srtContent !== 'string') {
    return [];
  }

  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawBlocks = normalized.trim().split(/\n\s*\n+/);
  const cues: SubtitleCue[] = [];
  let fallbackId = 1;

  for (const block of rawBlocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    let id = fallbackId;
    let timeLineIdx = 0;

    if (/^\d+$/.test(lines[0])) {
      id = parseInt(lines[0], 10);
      timeLineIdx = 1;
    }

    if (timeLineIdx >= lines.length) continue;

    const timeMatch = lines[timeLineIdx].match(TIMESTAMP_REGEX);
    if (!timeMatch) continue;

    const start = parseTimestampToSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const end = parseTimestampToSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);

    const textLines = lines.slice(timeLineIdx + 1);
    const text = textLines
      .join('\n')
      .replace(/\uFEFF/g, '')
      .trim();

    cues.push({
      id,
      start,
      end,
      text,
    });
    fallbackId = id + 1;
  }

  return cues;
}

export function serializeSrt(cues: SubtitleCue[]): string {
  if (!cues || cues.length === 0) return '';
  return (
    cues
      .map((cue, idx) => {
        const id = cue.id ?? idx + 1;
        const startStr = formatSrtTimestamp(cue.start);
        const endStr = formatSrtTimestamp(cue.end);
        const text = (cue.text ?? '').trim();
        return `${id}\n${startStr} --> ${endStr}\n${text}`;
      })
      .join('\n\n') + '\n'
  );
}

export function validateCues(cues: SubtitleCue[]): string | null {
  if (!Array.isArray(cues)) {
    return 'Cues must be an array';
  }

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue || typeof cue !== 'object') {
      return `Invalid cue at index ${i}`;
    }

    if (typeof cue.start !== 'number' || !Number.isFinite(cue.start) || cue.start < 0) {
      return `Cue ${cue.id ?? i + 1}: start time must be a non-negative number`;
    }

    if (typeof cue.end !== 'number' || !Number.isFinite(cue.end) || cue.end <= cue.start) {
      return `Cue ${cue.id ?? i + 1}: end time must be greater than start time`;
    }

    if (typeof cue.text !== 'string' || cue.text.trim().length === 0) {
      return `Cue ${cue.id ?? i + 1}: cue text cannot be empty`;
    }

    if (i > 0 && cue.start < cues[i - 1].start) {
      return `Cue ${cue.id ?? i + 1}: cues must be in chronological order`;
    }
  }

  return null;
}
