/**
 * Pure SRT line-wrap / char-limit logic. No filesystem, no process spawning.
 *
 * Goal: short-style subtitles, max 32 characters per line, 1-3 lines adaptive.
 * Clause-aware segmentation (punctuation, conjunctions) preferred over raw
 * word-counting. Cues under 1.5s get extended to the next cue to avoid
 * flashing.
 */

export interface SrtCueInput {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface SrtCueOutput extends SrtCueInput {
  lines: string[]; // 1 to 3 lines, each <= MAX_CHARS
}

/** Hard cap per visual line. */
export const MAX_CHARS = 32;

/** Preferred line length; wrap prefers to stay under this when clauses allow. */
export const SOFT_CHARS = 28;

/** Maximum number of lines we will produce for a single cue. */
export const MAX_LINES = 3;

/** A cue shorter than this looks like a flash and is hard to read. */
export const MIN_CUE_DURATION = 1.5;

/** Don't extend past the next cue's start; we have to stop somewhere. */
const MAX_LINE_DURATION = 6.0;

/** Word that opens a clause (used to avoid orphans + balance split). */
const CLAUSE_OPENERS = new Set([
  'yang',
  'dan',
  'atau',
  'tapi',
  'karena',
  'ketika',
  'sehingga',
  'supaya',
  'walaupun',
  'meskipun',
  'kalau',
  'jika',
  'biar',
  'sambil',
  'setelah',
  'sebelum',
  'sampai',
  'selama',
  'padahal',
  'makanya',
  'jadi',
  'trus',
  'terus',
]);

/** Hard sentence terminators. */
const HARD_PUNCT = /[.!?;]/;

/** Soft clause separators — wrap prefers to break on these. */
const SOFT_PUNCT = /[,/—:]/;

/**
 * Wrap a single cue's text into 1-3 lines, each <= MAX_CHARS, on clause
 * boundaries (hard/soft punctuation, conjunctions) when possible. Falls back
 * to word-boundary wrapping when no clause break fits, and to hard-cut
 * with ellipsis when the text simply does not fit even in 3 lines.
 */
export function wrapCueText(text: string, maxChars: number = MAX_CHARS): string[] {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) return [''];
  if (cleaned.length <= maxChars) return [cleaned];

  // Try clause-aware split first, escalating from 1 → 2 → 3 lines.
  for (let n = 1; n <= MAX_LINES; n++) {
    const lines = tryClauseAwareSplit(cleaned, n, maxChars);
    if (lines) {
      return balanceAndDedupe(lines, maxChars);
    }
  }

  // No clause split worked in 3 lines. Pack as much as we can into 3 lines,
  // truncating the last line with an ellipsis if needed.
  const lines = greedyWordPack(cleaned, maxChars, MAX_LINES);
  return balanceAndDedupe(lines, maxChars);
}

/**
 * Try to split `text` into exactly `nLines` lines using clause boundaries.
 * Returns the split if every line fits in `maxChars` AND no line is an orphan
 * (1 word) AND clauses were actually used (a clause-aware split beats a raw
 * greedy pack). Returns null if no valid clause split exists.
 */
function tryClauseAwareSplit(text: string, nLines: number, maxChars: number): string[] | null {
  // Find all candidate clause break points. Each is an index in `text` where
  // the next character (after the break char) starts the next segment.
  const breaks: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (HARD_PUNCT.test(ch) || SOFT_PUNCT.test(ch)) {
      // Place break after the run of punctuation+whitespace.
      let end = i + 1;
      while (end < text.length && /[ \t]/.test(text[end]!)) end++;
      if (end < text.length) breaks.push(end);
    } else if (ch === ' ' && i + 1 < text.length) {
      // Conjunction break: word at i+1 is a clause opener.
      const nextWordMatch = text.slice(i + 1).match(/^([\w]+)/);
      if (nextWordMatch) {
        const w = nextWordMatch[1]!.toLowerCase();
        if (CLAUSE_OPENERS.has(w)) {
          breaks.push(i + 1);
        }
      }
    }
  }
  if (breaks.length === 0) return null;

  // Greedy: pick the break that produces the most balanced first segment.
  // For nLines lines we need nLines-1 breaks. Try all combinations of
  // (nLines-1) breaks out of `breaks` (already in order) and keep the most
  // balanced (smallest variance in line lengths).
  const combos = combinations(breaks, nLines - 1);
  let best: string[] | null = null;
  let bestSpread = Number.POSITIVE_INFINITY;
  for (const combo of combos) {
    const segs = splitAt(text, combo);
    if (segs.length !== nLines) continue;
    if (!segs.every((s) => s.length <= maxChars)) continue;
    if (segs.some((s) => s.trim().split(' ').length < 2)) continue; // orphan guard
    const lens = segs.map((s) => s.length);
    const spread = Math.max(...lens) - Math.min(...lens);
    if (spread < bestSpread) {
      bestSpread = spread;
      best = segs;
    }
  }
  return best;
}

function splitAt(text: string, indices: number[]): string[] {
  const out: string[] = [];
  let prev = 0;
  for (const idx of indices) {
    out.push(text.slice(prev, idx).trim());
    prev = idx;
  }
  out.push(text.slice(prev).trim());
  return out;
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  const withHead = combinations(tail, k - 1).map((c) => [head, ...c]);
  const withoutHead = combinations(tail, k);
  return [...withHead, ...withoutHead];
}

/**
 * Pack `text` into at most `nLines` lines using greedy word boundary wrapping.
 * Truncates the last line with ellipsis if the text still does not fit.
 */
function greedyWordPack(text: string, maxChars: number, nLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    if (lines.length >= nLines) break;
    const w = words[i]!;
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
  if (current.length > 0 && lines.length < nLines) {
    lines.push(current);
  }
  // If we exhausted words but still have more, the last line is truncated
  // — mark it explicitly so the caller can decide.
  const consumed = lines.join(' ').split(' ').length;
  if (consumed < words.length && lines.length > 0) {
    const last = lines[lines.length - 1]!;
    if (!last.endsWith('…')) {
      if (last.length + 1 <= maxChars) {
        lines[lines.length - 1] = last + '…';
      } else {
        lines[lines.length - 1] = last.slice(0, maxChars - 1) + '…';
      }
    }
  }
  return lines;
}

/**
 * Post-process: avoid orphan words and dedupe empty trailing entries.
 * Strategy: if the last line holds a single word, first try to merge it up
 * into the previous line; if that would overflow, instead shift the previous
 * line's last word down so the final line holds >= 2 words.
 */
function balanceAndDedupe(lines: string[], maxChars: number): string[] {
  const out = lines.filter((l) => l.length > 0);
  while (out.length >= 2) {
    const last = out[out.length - 1]!;
    if (last.split(' ').length > 1) break; // no orphan
    const prev = out[out.length - 2]!;
    const merged = `${prev} ${last}`;
    if (merged.length <= maxChars) {
      // Pull the orphan up into the previous line.
      out.splice(out.length - 2, 2, merged);
      continue;
    }
    // Shift the previous line's last word down into the orphan line.
    const prevWords = prev.split(' ');
    if (prevWords.length < 2) break; // cannot rebalance further
    const shifted = prevWords.pop()!;
    const newLast = `${shifted} ${last}`;
    if (newLast.length <= maxChars) {
      out[out.length - 2] = prevWords.join(' ');
      out[out.length - 1] = newLast;
      continue;
    }
    break;
  }
  return out;
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
