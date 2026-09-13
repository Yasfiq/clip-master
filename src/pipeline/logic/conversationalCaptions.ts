/**
 * Conversational Subtitle and ASS Generator.
 *
 * Implements the "Formula Standar Baku Produksi Clip Ajaib":
 * - Floating Typography Hook: Title Case 1-2 lines, bright yellow font, solid black outline,
 *   centered at middle-frame (Alignment=5) with zero rectangular background box.
 * - Conversational Dialogue Subtitles: natural spoken sentence clauses (5-10 words per cue),
 *   Indonesian dialogue convention prefix (- ), wrapped cleanly within 9:16 bounds,
 *   styled in CapCut yellow with solid black outline at chest level (Alignment=2).
 *
 * Pure decision logic: no filesystem or binary dependencies.
 */

import { WordTiming, SrtCueInput } from './wordChunker';

export interface ConversationalOptions {
  minWordsPerChunk?: number;
  maxWordsPerChunk?: number;
  maxCharsPerLine?: number;
  maxDurationPerChunk?: number;
  pauseThresholdSeconds?: number;
  addDialogueIndicator?: boolean;
}

export interface UnifiedAssOptions {
  width: number;
  height: number;
  hookText?: string;
  hookDuration?: number; // seconds
  dialogueCues?: SrtCueInput[];
  fontName?: string;
  hookFontSize?: number;
  dialogueFontSize?: number;
  dialogueOutline?: number;
  dialogueMarginV?: number;
  primaryColorHex?: string; // ASS hex e.g. &H0000EEFF
  outlineColorHex?: string; // ASS hex e.g. &H00000000
}

const DEFAULT_OPTIONS: Required<ConversationalOptions> = {
  minWordsPerChunk: 4,
  maxWordsPerChunk: 9,
  maxCharsPerLine: 28,
  maxDurationPerChunk: 3.5,
  pauseThresholdSeconds: 0.4,
  addDialogueIndicator: true,
};

/**
 * Format string into Title Case (e.g. "KEBEBASAN ADALAH SEGALANYA" -> "Kebebasan Adalah Segalanya").
 */
export function formatToTitleCase(text: string): string {
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
 * Wrap hook headline into 1 or 2 balanced lines separated by ASS hard line break (\N).
 */
export function wrapHookHeadlineAss(text: string, maxCharsPerLine: number = 22): string {
  const words = formatToTitleCase(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length <= 2) return words.join(' ');

  // If text is short enough to fit on one line
  const fullText = words.join(' ');
  if (fullText.length <= maxCharsPerLine) {
    return fullText;
  }

  // Split into 2 balanced lines
  const midPoint = Math.ceil(words.length / 2);
  const line1 = words.slice(0, midPoint).join(' ');
  const line2 = words.slice(midPoint).join(' ');
  return `${line1}\\N${line2}`;
}

/**
 * Cleanly wrap dialogue text into 1-2 lines for 9:16 mobile display using ASS newline (\N).
 */
export function wrapDialogueLinesAss(text: string, maxCharsPerLine: number = 28): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxCharsPerLine) {
    return trimmed;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= 2) {
        break;
      }
    }
  }

  if (currentLine && lines.length < 2) {
    lines.push(currentLine);
  }

  return lines.join('\\N');
}

/**
 * Group word timings into natural conversational dialogue chunks.
 */
export function chunkConversationalWords(
  words: WordTiming[],
  userOptions?: ConversationalOptions,
): SrtCueInput[] {
  const opts = { ...DEFAULT_OPTIONS, ...(userOptions || {}) };
  const effectiveWords = (words || []).filter(
    (w) => w && typeof w.text === 'string' && w.text.trim().length > 0,
  );

  if (effectiveWords.length === 0) {
    return [];
  }

  const cues: SrtCueInput[] = [];
  let currentWords: WordTiming[] = [];

  const flush = () => {
    if (currentWords.length === 0) return;

    const firstWord = currentWords[0]!;
    const lastWord = currentWords[currentWords.length - 1]!;
    const rawSentence = currentWords
      .map((w) => w.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    if (rawSentence.length > 0) {
      let formattedText = rawSentence;

      // Add conversational dialogue prefix (- ) if requested and not already present
      if (opts.addDialogueIndicator && !formattedText.startsWith('-')) {
        formattedText = `- ${formattedText}`;
      }

      cues.push({
        start: Number(firstWord.start.toFixed(3)),
        end: Number(Math.max(firstWord.start + 0.5, lastWord.end).toFixed(3)),
        text: formattedText,
      });
    }

    currentWords = [];
  };

  for (let i = 0; i < effectiveWords.length; i++) {
    const word = effectiveWords[i]!;
    currentWords.push(word);

    const isLastWord = i === effectiveWords.length - 1;
    if (isLastWord) {
      flush();
      break;
    }

    const currentDuration = word.end - currentWords[0]!.start;
    const nextWord = effectiveWords[i + 1]!;
    const gap = nextWord.start - word.end;

    // Rule 1: Natural speech pause before next word (> pauseThreshold)
    if (gap >= opts.pauseThresholdSeconds && currentWords.length >= opts.minWordsPerChunk) {
      flush();
      continue;
    }

    // Rule 2: Sentence terminator (. ? !)
    const trimmedWord = word.text.trim();
    if (/[.?!]$/.test(trimmedWord) && currentWords.length >= opts.minWordsPerChunk) {
      flush();
      continue;
    }

    // Rule 3: Reached max words or max duration
    if (
      currentWords.length >= opts.maxWordsPerChunk ||
      currentDuration >= opts.maxDurationPerChunk
    ) {
      flush();
      continue;
    }
  }

  return cues;
}

/**
 * Format seconds to ASS timestamp format (H:MM:SS.cc where cc is centiseconds 00-99).
 */
export function formatAssTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds || 0);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  const cs = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 100);

  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  const csStr = String(cs).padStart(2, '0');

  return `${h}:${mStr}:${sStr}.${csStr}`;
}

/**
 * Generate a complete, valid ASS document containing dual styles:
 * 1. HookStyle: Floating headline in center frame (no black box).
 * 2. DialogueStyle: Conversational subtitles with dialogue dash at bottom safe-zone.
 */
export function generateUnifiedAssDocument(options: UnifiedAssOptions): string {
  const {
    width,
    height,
    hookText,
    hookDuration = 3.1,
    dialogueCues = [],
    fontName = 'Montserrat',
    primaryColorHex = '&H0000EEFF', // CapCut yellow #FFEE00 in ASS &HAABBGGRR (CLIPAJAIB_STYLE)
    outlineColorHex = '&H00000000', // Solid black
  } = options;

  const is1080p = width >= 1000;
  const hookFontSize = options.hookFontSize ?? (is1080p ? 72 : 48);
  const dialogueFontSize = options.dialogueFontSize ?? 84;
  const hookOutline = is1080p ? 6 : 4;
  const dialogueOutline = options.dialogueOutline ?? 6.0;
  const dialogueMarginV = options.dialogueMarginV ?? 420;

  const events: string[] = [];

  // 1. Hook Title Event (Alignment=5 Middle Center, floating typography)
  if (hookText && hookText.trim()) {
    const wrappedHook = wrapHookHeadlineAss(hookText);
    const startStr = formatAssTime(0);
    const endStr = formatAssTime(hookDuration);
    events.push(`Dialogue: 0,${startStr},${endStr},HookStyle,,0,0,0,,${wrappedHook}`);
  }

  // 2. Dialogue Events (Alignment=2 Bottom Center)
  // Do NOT drop cues during the hook: spoken speech during the hook must remain visible
  for (const cue of dialogueCues) {
    const startSec = cue.start;
    const endSec = Math.max(startSec + 0.5, cue.end);

    if (endSec <= startSec) continue;

    const startStr = formatAssTime(startSec);
    const endStr = formatAssTime(endSec);
    const wrappedText = wrapDialogueLinesAss(cue.text);

    events.push(`Dialogue: 0,${startStr},${endStr},DialogueStyle,,0,0,0,,${wrappedText}`);
  }

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: HookStyle,${fontName},${hookFontSize},${primaryColorHex},&H000000FF,${outlineColorHex},&H00000000,-1,0,0,0,100,100,0,0,1,${hookOutline},2,5,40,40,0,1
Style: DialogueStyle,${fontName},${dialogueFontSize},${primaryColorHex},&H000000FF,${outlineColorHex},&H00000000,-1,0,0,0,100,100,0,0,1,${dialogueOutline},1,2,40,40,${dialogueMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join('\n')}
`;
}
