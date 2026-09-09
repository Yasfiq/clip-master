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

    // Check if this token is a standalone dialogue dash (e.g. ' -' or '-')
    if (DIALOGUE_DASH_REGEX.test(trimmed)) {
      // If we have a current word, flush it before the speaker turn
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

    const fromMs = token.offsets?.from ?? 0;
    const toMs = token.offsets?.to ?? fromMs;
    const startSec = fromMs / 1000;
    const endSec = Math.max(startSec, toMs / 1000);

    const hasLeadingWhitespace = /^\s/.test(rawText);

    if (currentWord === null) {
      // First word in segment
      currentWord = {
        text: trimmed,
        start: startSec,
        end: endSec,
      };
    } else if (hasLeadingWhitespace) {
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
      // Token has NO leading space -> subword continuation or trailing punctuation
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
