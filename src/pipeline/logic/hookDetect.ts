/**
 * Pure hook detection: text + position patterns that signal a strong
 * opening line. Used by the ANALYZE stage to compute `transcriptHook`
 * for each candidate window when an AI model is unavailable (Ollama
 * offline / no transcript) or as a fallback heuristic.
 *
 * Returns a number in [0, 1]. Higher = stronger hook.
 *
 * No filesystem or process spawning — unit-testable.
 */

export interface HookDetectInput {
  /** Transcript text in this window (whitespace joined). */
  text: string;
  /** Start time of this window in the source video (seconds). */
  windowStart: number;
  /** End time of this window in the source video (seconds). */
  windowEnd: number;
  /** Total source video duration (seconds). */
  videoDuration: number;
  /** Optional language hint. Currently 'id' | 'en' (default 'id'). */
  language?: 'id' | 'en';
}

export interface HookSignalHit {
  signal: string;
  weight: number;
}

export interface HookDetectResult {
  score: number; // [0, 1]
  hits: HookSignalHit[]; // reasons, debug-friendly
}

interface Pattern {
  rx: RegExp;
  weight: number;
  label: string;
  exCap?: number;
}

// English hook patterns (case-insensitive).
const EN_PATTERNS: Pattern[] = [
  {
    rx: /\byou('?ll| will| never| won'?t| can'?t| have to)\b/i,
    weight: 0.18,
    label: 'en:2nd-person',
  },
  { rx: /\b(here('?s| is)|the (truth|secret|reason|answer))\b/i, weight: 0.15, label: 'en:reveal' },
  {
    rx: /\bwhy (does|do|did|is|are|should|would|won'?t)\b/i,
    weight: 0.12,
    label: 'en:why-question',
  },
  { rx: /\bhow (to|does|do|did|can|is|are|come)\b/i, weight: 0.12, label: 'en:how-question' },
  {
    rx: /\b(watch out|listen up|pay attention|stop scrolling|don't scroll)\b/i,
    weight: 0.2,
    label: 'en:cta',
  },
  {
    rx: /\b(unbelievable|shocking|insane|crazy|wild|mind-?blowing)\b/i,
    weight: 0.18,
    label: 'en:intensifier',
  },
  { rx: /\b(never|always|every|only|best|worst)\b/i, weight: 0.08, label: 'en:absolute' },
  { rx: /\d+\s?(%|percent|times|kg|km|hours?|minutes?|days?)\b/i, weight: 0.1, label: 'en:number' },
  { rx: /[!?]/g, weight: 0.03, label: 'en:punct', exCap: 3 }, // small per-match, capped
];

// Indonesian hook patterns.
const ID_PATTERNS: Pattern[] = [
  { rx: /\b(kamu|lo|lu|loe|kalian)\b/gi, weight: 0.1, label: 'id:2nd-person' },
  { rx: /\b(gue|gw|aku|saya)\b/gi, weight: 0.1, label: 'id:1st-person' },
  {
    rx: /\b(jangan|kok|bisa|gimana|gak\s+nyangka|tau\s+gak|percaya\s+gak)\b/gi,
    weight: 0.16,
    label: 'id:question-opener',
  },
  {
    rx: /\b(ternyata|bukan\s+main|terbukti|nyatanya|faktanya)\b/gi,
    weight: 0.15,
    label: 'id:reveal',
  },
  {
    rx: /\b(rahasia|alasan|kenapa|kenapa\s+gitu|alasan\s+sebenarnya)\b/gi,
    weight: 0.12,
    label: 'id:why',
  },
  { rx: /\b(cara\s+(supaya|agar|untuk)|tips|trik|panduan)\b/gi, weight: 0.1, label: 'id:how-to' },
  {
    rx: /\b(terbaik|terburuk|harus|wajib|jangan\s+lupa|berhenti)\b/gi,
    weight: 0.12,
    label: 'id:imperative',
  },
  { rx: /\b(gila|parah|beda|banget|sangat|amat)\b/gi, weight: 0.1, label: 'id:intensifier' },
  {
    rx: /\d+\s?(%|persen|ribu|jt|juta|ribu|kali|tahun|bulan|hari|jam|menit)\b/gi,
    weight: 0.1,
    label: 'id:number',
  },
  { rx: /[!?]/g, weight: 0.03, label: 'id:punct', exCap: 3 },
];

/** Compute text-pattern hook strength (0..1) capped per signal. */
function textSignal(text: string, patterns: Pattern[]): { score: number; hits: HookSignalHit[] } {
  let raw = 0;
  const hits: HookSignalHit[] = [];
  for (const p of patterns) {
    const matches = text.match(p.rx);
    if (!matches) continue;
    const capped = p.exCap !== undefined ? Math.min(matches.length, p.exCap) : matches.length;
    const contribution = p.weight * Math.min(capped, 3);
    raw += contribution;
    hits.push({ signal: p.label, weight: Number(contribution.toFixed(3)) });
  }
  // Sigmoid-like squash: text signals rarely dominate on their own.
  const score = 1 - Math.exp(-raw);
  return { score: Math.min(1, score), hits };
}

/**
 * Position bias: openings in the first ~60 s retain the audience more than
 * the same line later. Linear decay to a floor (0.35) by 25% of video.
 *
 * Returns a multiplier in [floor, 1].
 */
export function positionBias(windowStart: number, videoDuration: number, floor = 0.35): number {
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) return 1;
  const ratio = Math.min(1, Math.max(0, windowStart / videoDuration));
  // 0..0.25 of video → 1.0..floor; beyond 25% → floor.
  if (ratio <= 0.25) {
    const t = ratio / 0.25;
    return 1 - (1 - floor) * t;
  }
  return floor;
}

/**
 * Compute hook strength from transcript text + window position.
 *
 * Combines lexical patterns (English + Indonesian) with a position bias.
 * Returns score in [0, 1] plus the matched signals for debugging.
 */
export function detectHook(input: HookDetectInput): HookDetectResult {
  const text = (input.text || '').trim();
  if (!text) return { score: 0, hits: [] };

  const lang = input.language ?? 'id';
  const patterns = lang === 'en' ? EN_PATTERNS : ID_PATTERNS;
  const { score: textScore, hits } = textSignal(text, patterns);

  const bias = positionBias(input.windowStart, input.videoDuration);
  const final = Math.min(1, textScore * bias + 0.05); // tiny base floor
  return { score: Number(final.toFixed(4)), hits };
}

/** Compose with audio interest: weighted blend (0.7 hook + 0.3 audio). */
export function composeHookAudio(hookScore: number, audioInterest: number): number {
  const h = Math.min(1, Math.max(0, hookScore));
  const a = Math.min(1, Math.max(0, audioInterest));
  return Number((h * 0.7 + a * 0.3).toFixed(4));
}
