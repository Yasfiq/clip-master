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

export interface CoreHookEvaluation {
  headline: string;
  score: number;
  rationale: string;
}

/**
 * Format string to Title Case while keeping minor Indonesian prepositions lowercase.
 */
export function formatHookTitleCase(text: string): string {
  if (!text) return '';
  const minorWords = new Set([
    'dan',
    'di',
    'ke',
    'dari',
    'yang',
    'untuk',
    'pada',
    'atau',
    'ini',
    'itu',
  ]);
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (word.length === 0) return '';
      if (index > 0 && minorWords.has(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Wraps a hook headline into 1 to 2 balanced lines for 9:16 vertical display.
 * Uses ASS newline (\N) for ASS subtitle styling.
 */
export function wrapWhiteHookHeadlineAss(text: string, maxWordsPerLine = 3): string {
  const cleaned = text.replace(/[\r\n\t]+/g, ' ').trim();
  const words = formatHookTitleCase(cleaned).split(/\s+/).filter(Boolean);
  if (words.length <= maxWordsPerLine) {
    return words.join(' ');
  }

  // Split into 2 balanced lines
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');
  return `${line1}\\N${line2}`;
}

const IMPACT_KEYWORDS = [
  'rahasia',
  'sukses',
  'gagal',
  'bos',
  'uang',
  'kaya',
  'bisnis',
  'kerja',
  'bebas',
  'kebebasan',
  'cara',
  'tips',
  'trik',
  'jangan',
  'kenapa',
  'gimana',
  'ternyata',
  'faktanya',
  'terbukti',
  'kunci',
  'penting',
  'viral',
  'modal',
  'untung',
  'rugi',
  'bahaya',
  'kesalahan',
];

const FILLER_WORDS = new Set([
  'eh',
  'nah',
  'terus',
  'kan',
  'gitu',
  'kayak',
  'ya',
  'sih',
  'dong',
  'tuh',
  'lah',
  'deh',
  'oke',
]);

/**
 * Evaluates the transcript of a video segment to extract or formulate
 * a high-impact, 3-5 word viral hook headline summarizing the core message.
 */
export function evaluateCoreSegmentHook(
  segmentText?: string,
  fallbackTitle?: string,
): CoreHookEvaluation {
  const raw = (segmentText || '').trim();
  if (!raw) {
    const defaultTitle = fallbackTitle?.trim() || 'Rahasia Short Video Viral';
    return {
      headline: formatHookTitleCase(defaultTitle),
      score: 0.5,
      rationale: 'Fallback title used because segment transcript is empty',
    };
  }

  // 1. Break text into candidate clauses
  const clauses = raw
    .split(/[.?!,;\n]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 8);

  let bestClause = '';
  let bestScore = -1;
  let bestRationale = '';

  for (const clause of clauses) {
    const words = clause.toLowerCase().split(/\s+/).filter(Boolean);
    const cleanedWords = words.filter((w) => !FILLER_WORDS.has(w));
    if (cleanedWords.length < 2) continue;

    let score = 0.2; // Base score
    const matchedKeywords: string[] = [];

    // Keyword impact
    for (const kw of IMPACT_KEYWORDS) {
      if (cleanedWords.some((w) => w.includes(kw))) {
        score += 0.22;
        matchedKeywords.push(kw);
      }
    }

    // Length scoring: ideal punchline is 3-6 words
    if (cleanedWords.length >= 3 && cleanedWords.length <= 6) {
      score += 0.35;
    } else if (cleanedWords.length >= 7 && cleanedWords.length <= 9) {
      score += 0.15;
    } else if (cleanedWords.length > 12) {
      score -= 0.15;
    }

    // Strong opener / reveal signals
    if (/\b(ternyata|jangan|kenapa|gimana|tau gak)\b/i.test(clause)) {
      score += 0.15;
    }

    if (score > bestScore) {
      bestScore = score;
      let candidateWords = cleanedWords;
      if (candidateWords.length > 5 && /^(ternyata|faktanya|nyatanya)$/i.test(candidateWords[0])) {
        candidateWords = candidateWords.slice(1);
      }
      // Truncate to maximum 5-6 punchy words
      const selectedWords = candidateWords.slice(0, 6);
      bestClause = selectedWords.join(' ');
      bestRationale = `Matched keywords: [${matchedKeywords.join(', ')}], word length: ${cleanedWords.length}`;
    }
  }

  if (bestClause && bestScore >= 0.35) {
    const headline = formatHookTitleCase(bestClause);
    return {
      headline,
      score: Math.min(1.0, Math.max(0.1, Number(bestScore.toFixed(3)))),
      rationale: bestRationale || 'High-scoring punchline extracted from segment',
    };
  }

  // Fallback if no strong clause found: use fallbackTitle or formatted first 4-5 words
  const fallback = fallbackTitle?.trim()
    ? formatHookTitleCase(fallbackTitle)
    : formatHookTitleCase(
        raw
          .split(/\s+/)
          .filter((w) => !FILLER_WORDS.has(w.toLowerCase()))
          .slice(0, 4)
          .join(' '),
      );

  return {
    headline: fallback || 'Rahasia Short Video Viral',
    score: 0.5,
    rationale: 'Formulated from segment opener / title fallback',
  };
}
