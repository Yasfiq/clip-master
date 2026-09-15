/**
 * Pure decision logic for reassembling Whisper BPE subword tokens into whole words.
 *
 * Whisper emits Byte-Pair Encoded (BPE) tokens. New words begin with leading
 * whitespace (e.g. ' Hari', ' ini', ' ng'), while subword continuations do not
 * (e.g. 'ob', 'rol', 'ama'). Standalone punctuation tokens (e.g. ',', '.') also
 * follow without whitespace and belong attached to the preceding word.
 *
 * This module reconstructs complete words with:
 * - Full text (e.g. 'ngobrol', 'bersama', 'Tanjaya,')
 * - Exact start timestamp (from first subword token)
 * - Exact end timestamp (from final subword token or attached punctuation)
 *
 * Pure logic: no filesystem or process side effects.
 */

import { WordTiming } from './wordChunker';

export interface RawWhisperToken {
  text?: string;
  offsets?: {
    from?: number; // milliseconds
    to?: number; // milliseconds
  };
  p?: number;
}

/** Punctuation marks that should attach to the preceding word if encountered alone. */
const TRAILING_PUNCT_REGEX = /^[.,?!:;…]+$/;

/** Dialogue dashes or list bullet markers emitted by Whisper on speaker turns. */
const DIALOGUE_DASH_REGEX = /^[-—–]+$/;

/**
 * Reassembles an array of raw Whisper BPE tokens into whole words with timing.
 *
 * @param tokens Raw Whisper tokens from segment.tokens
 * @returns Array of whole WordTiming objects
 */
export function reassembleWhisperTokens(tokens: RawWhisperToken[]): WordTiming[] {
  if (!tokens || tokens.length === 0) return [];

  const words: WordTiming[] = [];
  let currentWord: { text: string; start: number; end: number } | null = null;

  for (const token of tokens) {
    if (!token || typeof token.text !== 'string') continue;

    const rawText = token.text;

    // Skip special Whisper control tokens like [_BEG_], [_TT_144], [BLANK_AUDIO]
    if (rawText.startsWith('[_') || (rawText.startsWith('[') && rawText.endsWith(']'))) {
      continue;
    }

    const trimmed = rawText.trim();
    if (!trimmed) continue;

    const fromMs = token.offsets?.from ?? 0;
    const toMs = token.offsets?.to ?? fromMs;
    const startSec = fromMs / 1000;
    const endSec = Math.max(startSec, toMs / 1000);

    // Check if this token is a standalone dialogue dash (e.g. ' -' or '-')
    if (DIALOGUE_DASH_REGEX.test(trimmed)) {
      const isStartOfSegment =
        words.length === 0 && (currentWord === null || !currentWord.text.trim());
      const followsPunctuation =
        (currentWord !== null && /[.?!]$/.test(currentWord.text.trim())) ||
        (currentWord === null &&
          words.length > 0 &&
          /[.?!]$/.test(words[words.length - 1]!.text.trim()));

      if (isStartOfSegment || followsPunctuation) {
        // Speaker turn: flush current word if any, and skip the dash
        if (currentWord && currentWord.text.trim()) {
          words.push({
            text: currentWord.text.trim(),
            start: currentWord.start,
            end: Math.max(currentWord.start, currentWord.end),
          });
          currentWord = null;
        }
        continue;
      }

      // If currentWord exists and does not end in punctuation, attach the hyphen
      // so Indonesian reduplication (jalan-jalan, anak-anak, tiba-tiba) preserves the hyphen
      if (currentWord && !/[.?!]$/.test(currentWord.text.trim())) {
        currentWord.text += trimmed;
        currentWord.end = Math.max(currentWord.end, endSec);
        continue;
      }
    }

    const hasLeadingWhitespace = /^\s/.test(rawText);

    if (currentWord === null) {
      // First word in segment
      currentWord = {
        text: trimmed,
        start: startSec,
        end: endSec,
      };
    } else if (hasLeadingWhitespace && !currentWord.text.endsWith('-')) {
      // Token starts with space -> previous word is complete, start new word
      if (currentWord.text.trim()) {
        words.push({
          text: currentWord.text.trim(),
          start: currentWord.start,
          end: Math.max(currentWord.start, currentWord.end),
        });
      }
      currentWord = {
        text: trimmed,
        start: startSec,
        end: endSec,
      };
    } else {
      // Token has NO leading space or attaches to hyphen -> subword continuation or trailing punctuation
      currentWord.text += trimmed;
      currentWord.end = Math.max(currentWord.end, endSec);
    }
  }

  // Flush remaining word
  if (currentWord && currentWord.text.trim()) {
    words.push({
      text: currentWord.text.trim(),
      start: currentWord.start,
      end: Math.max(currentWord.start, currentWord.end),
    });
  }

  return words;
}

export interface ParsedTranscriptData {
  segments: Array<{
    start: number;
    end: number;
    text: string;
    words?: WordTiming[];
  }>;
  language: string | null;
  text: string;
}

/**
 * Parses raw Whisper JSON or pre-normalized transcript JSON into
 * a normalized transcript structure with segments and word timings.
 */
export function parseWhisperTranscriptJson(raw: any): ParsedTranscriptData {
  if (!raw) {
    return { segments: [], language: null, text: '' };
  }

  // Already normalized transcript structure
  if (Array.isArray(raw.segments) && raw.segments.length > 0) {
    return {
      segments: raw.segments,
      language: raw.language ?? null,
      text: raw.text ?? raw.segments.map((s: any) => s.text).join(' '),
    };
  }

  const list = raw.transcription;
  if (!Array.isArray(list) || list.length === 0) {
    return { segments: [], language: raw.result?.language ?? null, text: raw.text ?? '' };
  }

  const out: Array<{
    start: number;
    end: number;
    text: string;
    words?: WordTiming[];
  }> = [];

  for (const seg of list) {
    const fromMs = seg.offsets?.from ?? 0;
    const toMs = seg.offsets?.to ?? fromMs;
    const text = (seg.text ?? '').trim();
    if (!text) continue;

    out.push({
      start: fromMs / 1000,
      end: toMs / 1000,
      text,
      words: reassembleWhisperTokens(seg.tokens ?? []),
    });
  }

  return {
    segments: out,
    language: raw.result?.language ?? null,
    text: out.map((s) => s.text).join(' '),
  };
}
