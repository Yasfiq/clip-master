/**
 * Karaoke Subtitle Generator with Active-Word Highlight.
 *
 * Implements modern Short-Form / TikTok / CapCut typography:
 * - Base text color: Pure White (&H00FFFFFF) with thick solid Black Outline (&H00000000).
 * - Currently spoken word: Dynamically highlighted in Bright CapCut Yellow (&H0000EEFF).
 * - Top/Center Hook Headline: Bold White Title Case, balanced 2-line wrap, Alignment=5.
 *
 * Pure decision logic: no filesystem or binary dependencies.
 */

import { WordTiming, SrtCueInput, splitTextIntoWordTimings } from './wordChunker';
import { formatAssTime, escapeAssText } from './conversationalCaptions';
import { wrapWhiteHookHeadlineAss } from './hookDetect';

export interface KaraokeWord {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface KaraokePhrase {
  words: KaraokeWord[];
  start: number;
  end: number;
}

export interface KaraokeAssOptions {
  width: number;
  height: number;
  hookText?: string;
  hookDuration?: number; // seconds
  words?: WordTiming[];
  cues?: SrtCueInput[];
  fontName?: string;
  hookFontSize?: number;
  dialogueFontSize?: number;
  dialogueOutline?: number;
  dialogueMarginV?: number;
  activeColorHex?: string; // ASS color format &HAABBGGRR (Default: &H0000EEFF - CapCut Yellow)
  baseColorHex?: string; // ASS color format &HAABBGGRR (Default: &H00FFFFFF - Pure White)
  outlineColorHex?: string; // ASS color format &HAABBGGRR (Default: &H00000000 - Solid Black)
  maxWordsPerPhrase?: number;
}

/**
 * Group word timings into natural conversational phrases (3 to 6 words).
 * Breaks early on punctuation ('.', ',', '?', '!') or natural speech pauses (> 0.35s).
 */
export function groupWordsIntoPhrases(
  words: WordTiming[],
  maxWords = 5,
  maxDuration = 2.8,
  pauseThreshold = 0.35,
): KaraokePhrase[] {
  if (!words || words.length === 0) return [];

  const phrases: KaraokePhrase[] = [];
  let currentWords: KaraokeWord[] = [];

  const flush = () => {
    if (currentWords.length > 0) {
      phrases.push({
        words: [...currentWords],
        start: currentWords[0]!.start,
        end: currentWords[currentWords.length - 1]!.end,
      });
      currentWords = [];
    }
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const cleanWordText = w.text.trim();
    if (!cleanWordText) continue;

    currentWords.push({
      text: cleanWordText,
      start: w.start,
      end: Math.max(w.start + 0.1, w.end),
    });

    const isLast = i === words.length - 1;
    if (isLast) {
      flush();
      break;
    }

    const nextW = words[i + 1]!;
    const gap = nextW.start - w.end;
    const phraseDuration = w.end - currentWords[0]!.start;

    // Rule 1: Speech pause
    if (gap >= pauseThreshold && currentWords.length >= 2) {
      flush();
      continue;
    }

    // Rule 2: Clause or sentence punctuation
    if (/[.?!,]$/.test(cleanWordText) && currentWords.length >= 2) {
      flush();
      continue;
    }

    // Rule 3: Word count or duration ceiling
    if (currentWords.length >= maxWords || phraseDuration >= maxDuration) {
      flush();
      continue;
    }
  }

  return phrases;
}

/**
 * Generate ASS Dialogue events for a list of karaoke phrases.
 * For each phrase, creates sequential events highlighting one word at a time.
 */
export function generateKaraokeAssEvents(
  phrases: KaraokePhrase[],
  activeColorHex = '&H0000EEFF',
  baseColorHex = '&H00FFFFFF',
): string[] {
  const events: string[] = [];

  for (const phrase of phrases) {
    const { words } = phrase;
    if (words.length === 0) continue;

    for (let activeIdx = 0; activeIdx < words.length; activeIdx++) {
      const activeWord = words[activeIdx]!;
      const nextWord = words[activeIdx + 1];

      // Event duration: from activeWord.start to either nextWord.start or activeWord.end
      const eventStart = activeWord.start;
      const eventEnd = nextWord ? Math.min(nextWord.start, activeWord.end + 0.1) : activeWord.end;

      if (eventEnd <= eventStart) continue;

      // Construct line text with ASS color tags
      // Wrap words into 2 lines if word count > 4
      const formattedWords = words.map((w, idx) => {
        const safeText = escapeAssText(w.text);
        if (idx === activeIdx) {
          // Highlighted active word
          return `{\\c${activeColorHex}&}${safeText}{\\c${baseColorHex}&}`;
        }
        return safeText;
      });

      let lineText = '';
      if (formattedWords.length > 4) {
        const mid = Math.ceil(formattedWords.length / 2);
        const l1 = formattedWords.slice(0, mid).join(' ');
        const l2 = formattedWords.slice(mid).join(' ');
        lineText = `${l1}\\N${l2}`;
      } else {
        lineText = formattedWords.join(' ');
      }

      // Initial color tag
      const fullText = `{\\c${baseColorHex}&}${lineText}`;
      const startStr = formatAssTime(eventStart);
      const endStr = formatAssTime(eventEnd);

      events.push(`Dialogue: 0,${startStr},${endStr},KaraokeStyle,,0,0,0,,${fullText}`);
    }
  }

  return events;
}

/**
 * Generate a complete, production-grade ASS document with:
 * 1. HookStyle: Centered floating white headline (Alignment=5, white font, black outline).
 * 2. KaraokeStyle: White dialogue with yellow active word highlight (Alignment=2, bottom safe-zone).
 */
export function generateKaraokeAssDocument(options: KaraokeAssOptions): string {
  const {
    width,
    height,
    hookText,
    hookDuration = 0,
    words = [],
    cues = [],
    fontName = 'Montserrat',
    activeColorHex = '&H0000EEFF', // Bright CapCut yellow in ASS &HAABBGGRR
    baseColorHex = '&H00FFFFFF', // Pure White in ASS &HAABBGGRR
    outlineColorHex = '&H00000000', // Solid black
    maxWordsPerPhrase = 5,
  } = options;

  const is1080p = width >= 1000;
  const hookFontSize = options.hookFontSize ?? (is1080p ? 74 : 50);
  const dialogueFontSize = options.dialogueFontSize ?? (is1080p ? 62 : 40);
  const hookOutline = is1080p ? 6.5 : 4.5;
  const dialogueOutline = options.dialogueOutline ?? (is1080p ? 5.0 : 3.5);
  const dialogueMarginV = options.dialogueMarginV ?? (is1080p ? 360 : 220);

  // 1. Resolve word timings
  let effectiveWords: WordTiming[] = [...words];
  if (effectiveWords.length === 0 && cues.length > 0) {
    for (const cue of cues) {
      effectiveWords.push(...splitTextIntoWordTimings(cue.text, cue.start, cue.end));
    }
  }

  const phrases = groupWordsIntoPhrases(effectiveWords, maxWordsPerPhrase);
  const dialogueEvents = generateKaraokeAssEvents(phrases, activeColorHex, baseColorHex);

  const events: string[] = [];

  // Hook headline event (White, centered, wrapped)
  if (hookText && hookText.trim() && hookDuration > 0) {
    const wrappedHook = wrapWhiteHookHeadlineAss(hookText);
    const startStr = formatAssTime(0);
    const endStr = formatAssTime(hookDuration);
    events.push(`Dialogue: 0,${startStr},${endStr},HookStyle,,0,0,0,,${wrappedHook}`);
  }

  // Append dialogue events
  events.push(...dialogueEvents);

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: HookStyle,${fontName},${hookFontSize},${baseColorHex},&H000000FF,${outlineColorHex},&H00000000,-1,0,0,0,100,100,0,0,1,${hookOutline},2,5,40,40,0,1
Style: KaraokeStyle,${fontName},${dialogueFontSize},${baseColorHex},&H000000FF,${outlineColorHex},&H00000000,-1,0,0,0,100,100,0,0,1,${dialogueOutline},1,2,40,40,${dialogueMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}
