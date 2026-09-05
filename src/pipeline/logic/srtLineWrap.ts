/**
 * Pure SRT line-wrap / char-limit logic. No filesystem, no process spawning.
 *
 * Goal: short-style subtitles, max 32 characters per line.
 * Word boundaries preferred. Cues under 1.5s get extended to the next cue
 * to avoid flashing.
 */

export interface SrtCueInput {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface SrtCueOutput extends SrtCueInput {
  lines: string[]; // 1 or 2 lines, each <= MAX_CHARS
}

/** Hard cap per visual line. */
export const MAX_CHARS = 32;

/** A cue shorter than this looks like a flash and is hard to read. */
export const MIN_CUE_DURATION = 1.5;

/** Don't extend past the next cue's start; we have to stop somewhere. */
const MAX_LINE_DURATION = 6.0;

/**
 * Wrap a single cue's text into <=2 lines, each <= MAX_CHARS, on word
 * boundaries. If the text is too long for 2 lines we hard-cut with ellipsis.
 */
export function wrapCueText(text: string, maxChars: number = MAX_CHARS): string[] {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) return [''];
  if (cleaned.length <= maxChars) return [cleaned];

  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if (lines.length === 2) break; // already have 2 lines
    const candidate = current.length === 0 ? w : `${current} ${w}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current.length > 0) {
        lines.push(current);
        current = w.length <= maxChars ? w : hardCut(w, maxChars);
      } else {
        current = hardCut(w, maxChars);
      }
    }
  }
  if (current.length > 0 && lines.length < 2) {
    lines.push(current);
  }

  // If we still have leftover text and only 2 lines, mark last line with …
  if (lines.length === 2 && words.join(' ').length > lines.join(' ').length) {
    const last = lines[1]!;
    if (last.length + 1 <= maxChars) {
      lines[1] = last + '…';
    } else {
      lines[1] = last.slice(0, maxChars - 1) + '…';
    }
  }
  return lines;
}

function hardCut(word: string, maxChars: number): string {
  if (word.length <= maxChars) return word;
  return word.slice(0, maxChars - 1) + '…';
}

/**
 * Process an SRT transcript: wrap each cue, optionally extend sub-MIN_DURATION
 * cues to fill MIN_CUE_DURATION against the next cue's start.
 */
export function wrapSrtCues(
  cues: SrtCueInput[],
  opts: { maxChars?: number; minDuration?: number } = {},
): SrtCueOutput[] {
  const maxChars = opts.maxChars ?? MAX_CHARS;
  const minDur = opts.minDuration ?? MIN_CUE_DURATION;

  const out: SrtCueOutput[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]!;
    const duration = cue.end - cue.start;
    let end = cue.end;
    if (duration < minDur) {
      const target = cue.start + minDur;
      const nextStart = cues[i + 1]?.start ?? Number.POSITIVE_INFINITY;
      // Extend to whichever is smaller: MIN_DURATION, or next cue start
      const candidate = Math.min(target, nextStart);
      const capped = Math.min(candidate, cue.start + MAX_LINE_DURATION);
      if (capped > cue.end) end = capped;
    }
    out.push({
      start: cue.start,
      end,
      text: cue.text,
      lines: wrapCueText(cue.text, maxChars),
    });
  }
  return out;
}

/** Format seconds → SRT timestamp `HH:MM:SS,mmm`. */
export function formatSrtTimestamp(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.round((safe - Math.floor(safe)) * 1000);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(ms)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * Apply a leading-offset trim to a wrapped cue list. Cues that fall entirely
 * inside the lead window are dropped; the first cue that overlaps the window
 * is pushed forward to the window edge and its duration is preserved.
 *
 * Used so the subtitle does not appear before the speaker actually starts
 * talking (whisper sometimes aligns the first cue to t=0 even when the
 * speaker is still reading notes / the clip has a brief pre-roll silence).
 */
export function applyLeadOffset(cues: SrtCueOutput[], leadSeconds: number): SrtCueOutput[] {
  if (leadSeconds <= 0 || cues.length === 0) return cues;
  const kept: SrtCueOutput[] = [];
  for (const c of cues) {
    if (c.end <= leadSeconds) continue; // entirely inside lead window
    if (c.start < leadSeconds) {
      const dur = c.end - c.start;
      kept.push({ ...c, start: leadSeconds, end: leadSeconds + dur });
    } else {
      kept.push(c);
    }
  }
  return kept;
}

/** Render wrapped cues as a complete SRT document. */
export function renderSrt(cues: SrtCueOutput[]): string {
  const blocks: string[] = [];
  let idx = 0;
  for (const c of cues) {
    if (c.lines.length === 0 || (c.lines.length === 1 && c.lines[0] === '')) continue;
    idx++;
    blocks.push(String(idx));
    blocks.push(`${formatSrtTimestamp(c.start)} --> ${formatSrtTimestamp(c.end)}`);
    blocks.push(c.lines.join('\n'));
    blocks.push('');
  }
  return blocks.join('\n');
}
