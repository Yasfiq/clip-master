/**
 * Word-Level Chunking Engine for Subtitles.
 *
 * Chunks normalized word-level timings from Whisper JSON into short, dynamic
 * subtitle cues (max 3 words per chunk) with exact word start/end timestamps.
 * Breaks chunks early on natural speech pauses (gap > 0.35s) or sentence
 * punctuation ('.', ',', '?', '!').
 *
 * Pure decision logic: no filesystem or process side effects.
 */

import { formatSrtTimestamp } from './srtLineWrap';

export interface WordTiming {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface SrtCueInput {
  start: number; // seconds
  end: number; // seconds
  text: string;
}

export interface FallbackOptions {
  text?: string;
  start?: number;
  end?: number;
}

/** Default pause threshold in seconds indicating a natural speech break. */
export const DEFAULT_SPEECH_PAUSE_S = 0.35;

/** Sentence-terminating punctuation that begins a new sentence. */
const SENTENCE_TERMINATOR_REGEX = /[.?!]['"”’)]*$/;

/** Sentence or clause punctuation that breaks a subtitle chunk. */
const CHUNK_BREAK_PUNCT_REGEX = /[.?!,]['"”’)]*$/;

/**
 * Split text into evenly-spaced estimated WordTiming entries over [start, end].
 * Used as a fallback when Whisper did not provide word-level tokens.
 */
export function splitTextIntoWordTimings(
  text: string,
  start: number = 0,
  end: number = 0,
): WordTiming[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);
  const duration = safeEnd - safeStart;
  const wordDuration = duration > 0 ? duration / tokens.length : 0;

  return tokens.map((token, i) => ({
    text: token,
    start: safeStart + i * wordDuration,
    end: duration > 0 ? safeStart + (i + 1) * wordDuration : safeStart,
  }));
}

function formatChunkText(words: WordTiming[], isSentenceStart: boolean): string {
  let cleaned = words
    .map((w) => w.text.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
    .replace(/\s+/g, ' ');

  if (cleaned.length === 0) return '';

  if (isSentenceStart) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Chunk word timings into subtitle cues:
 * - Max `maxWordsPerChunk` (default 3) words per cue.
 * - Exact start time of first word and end time of last word.
 * - Breaks early on natural speech pause (gap > 0.35s).
 * - Breaks early on sentence punctuation ('.', ',', '?', '!').
 * - Sentence casing applied cleanly at start of speech and after sentence terminators.
 * - Handles fallback if `words` is empty by splitting provided fallback text.
 */
export function chunkWords(
  words: WordTiming[],
  maxWordsPerChunk: number = 3,
  fallback?: string | FallbackOptions,
  fallbackStart?: number,
  fallbackEnd?: number,
): SrtCueInput[] {
  const limit = Math.max(1, Math.floor(maxWordsPerChunk || 3));

  let effectiveWords = (words || []).filter(
    (w) => w && typeof w.text === 'string' && w.text.trim().length > 0,
  );

  // Fallback when words array is empty but fallback text is provided
  if (effectiveWords.length === 0 && fallback) {
    if (typeof fallback === 'string') {
      const s = fallbackStart ?? 0;
      const e = fallbackEnd ?? s;
      effectiveWords = splitTextIntoWordTimings(fallback, s, e);
    } else if (fallback.text) {
      const s = fallback.start ?? 0;
      const e = fallback.end ?? s;
      effectiveWords = splitTextIntoWordTimings(fallback.text, s, e);
    }
  }

  if (effectiveWords.length === 0) {
    return [];
  }

  const cues: SrtCueInput[] = [];
  let currentWords: WordTiming[] = [];
  let isSentenceStart = true;

  const flushChunk = () => {
    if (currentWords.length === 0) return;

    const firstWord = currentWords[0]!;
    const lastWord = currentWords[currentWords.length - 1]!;
    const text = formatChunkText(currentWords, isSentenceStart);

    if (text.length > 0) {
      cues.push({
        start: firstWord.start,
        end: Math.max(firstWord.start, lastWord.end),
        text,
      });

      // If this chunk ends with a sentence terminator ('.', '!', '?'),
      // the next chunk should begin with sentence casing.
      isSentenceStart = SENTENCE_TERMINATOR_REGEX.test(text);
    }

    currentWords = [];
  };

  for (let i = 0; i < effectiveWords.length; i++) {
    const word = effectiveWords[i]!;
    currentWords.push(word);

    const isLastWord = i === effectiveWords.length - 1;
    if (isLastWord) {
      flushChunk();
      break;
    }

    // Rule 1: Max words reached
    if (currentWords.length >= limit) {
      flushChunk();
      continue;
    }

    // Rule 2: Word ends with sentence/clause punctuation ('.', ',', '?', '!')
    const trimmedWord = word.text.trim();
    if (CHUNK_BREAK_PUNCT_REGEX.test(trimmedWord)) {
      flushChunk();
      continue;
    }

    // Rule 3: Natural speech pause before the next word (gap > 0.35s)
    const nextWord = effectiveWords[i + 1]!;
    const gap = Math.round((nextWord.start - word.end) * 1000) / 1000;
    if (gap > DEFAULT_SPEECH_PAUSE_S) {
      flushChunk();
      continue;
    }
  }

  return cues;
}

/**
 * Render cue inputs directly to a standard SRT document string.
 */
export function renderSrt(cues: SrtCueInput[]): string {
  const blocks: string[] = [];
  let idx = 0;
  for (const c of cues) {
    const text = c.text.trim();
    if (!text) continue;
    idx++;
    blocks.push(String(idx));
    blocks.push(`${formatSrtTimestamp(c.start)} --> ${formatSrtTimestamp(c.end)}`);
    blocks.push(text);
    blocks.push('');
  }
  return blocks.join('\n');
}
