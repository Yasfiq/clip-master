/**
 * AI moment scorer — effectful side of moment detection.
 *
 * Calls the local Ollama daemon (qwen2.5) to score transcript windows for
 * hook potential, then merges with audio-interest features from the
 * ANALYZE stage. Pure scoring math stays in `../logic/momentDetection`.
 *
 * Kept separate from the logic module so unit tests never touch a network.
 */

import { ollamaGenerateJson, ollamaPing } from '../../server/ollama';
import { logger } from '../../server/logger';
import { TranscriptSegment } from '../runner-types';
import { scoreSegment, classifyConfidence } from '../logic/momentDetection';
import { detectHook, composeHookAudio } from '../logic/hookDetect';

export interface WindowInput {
  startTime: number;
  endTime: number;
  /** Transcript joined text for this window. */
  transcriptText: string;
  /** Normalized loudness 0..1 from ANALYZE audio features. */
  audioInterest: number;
}

export interface AIScoredWindow {
  startTime: number;
  endTime: number;
  transcriptHook: number;
  audioInterest: number;
  visualInterest: number;
  viralPotential: number;
  reasons: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  hasKineticTrigger: boolean;
  /** Short hook sentence for kinetic typography/thumbnail. */
  hookLine?: string;
}

/** JSON contract the LLM must produce per window. */
interface LlmWindowScore {
  hook_score: number; // 0-100 importance/virality of what's said
  interest_reason: string; // one-line why
  hook_line: string; // quotable 4-10 word sentence for the overlay
  has_kinetic_trigger: boolean;
}

const MAX_WINDOW_CHARS = 6000; // keep prompt under context budget

function truncate(s: string): string {
  return s.length > MAX_WINDOW_CHARS ? s.slice(0, MAX_WINDOW_CHARS) + '…' : s;
}

/**
 * Score a batch of transcript windows via Ollama.
 * Returns enriched windows. When Ollama is unreachable, falls back to
 * heuristic scores so the pipeline still produces output.
 */
export async function scoreWindowsWithAI(
  windows: WindowInput[],
): Promise<{ scored: AIScoredWindow[]; aiUsed: boolean }> {
  const up = await ollamaPing();
  if (!up) {
    logger.warn('Ollama unreachable — using heuristic window scoring');
    const videoDuration = Math.max(0, ...windows.map((w) => w.endTime));
    const scored = windows.map((w) => {
      // detectHook combines lexical patterns + position bias.
      const hookResult = detectHook({
        text: w.transcriptText,
        windowStart: w.startTime,
        windowEnd: w.endTime,
        videoDuration,
      });
      const transcriptHook = hookResult.score;
      const viral = scoreSegment(transcriptHook, w.audioInterest, 0.35);
      return {
        startTime: w.startTime,
        endTime: w.endTime,
        transcriptHook,
        audioInterest: w.audioInterest,
        visualInterest: 0.35,
        viralPotential: viral,
        reasons: ['Ollama offline — heuristic scoring (detectHook)'],
        confidence: classifyConfidence(viral),
        hasKineticTrigger: transcriptHook > 0.6,
        hookLine: firstHookLine(w.transcriptText, hookResult.hits),
      };
    });
    return { scored, aiUsed: false };
  }

  const scored: AIScoredWindow[] = [];
  const total = windows.length;
  let done = 0;
  const videoDuration = Math.max(0, ...windows.map((w) => w.endTime));

  for (const w of windows) {
    const llmScore = await scoreOneWindow(w);
    // Use detectHook when LLM parse fails; otherwise trust LLM hook_score.
    const fallbackHook = detectHook({
      text: w.transcriptText,
      windowStart: w.startTime,
      windowEnd: w.endTime,
      videoDuration,
    }).score;
    const transcriptHook = llmScore ? clamp01(llmScore.hook_score / 100) : fallbackHook;
    const visualInterest = 0.35; // vision analysis lands in a later phase
    const viral = scoreSegment(transcriptHook, w.audioInterest, visualInterest);

    scored.push({
      startTime: w.startTime,
      endTime: w.endTime,
      transcriptHook,
      audioInterest: w.audioInterest,
      visualInterest,
      viralPotential: viral,
      reasons: llmScore
        ? [llmScore.interest_reason]
        : ['Ollama parse failed — detectHook fallback'],
      confidence: classifyConfidence(viral),
      hasKineticTrigger: llmScore?.has_kinetic_trigger ?? transcriptHook > 0.6,
      hookLine: llmScore?.hook_line ?? firstHookLine(w.transcriptText, fallbackHook),
    });
    done++;
  }

  // Keep unused but referenced: composeHookAudio available for future re-blends.
  void composeHookAudio;
  return { scored, aiUsed: true };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isNaN(n) ? 0 : n));
}

async function scoreOneWindow(w: WindowInput): Promise<LlmWindowScore | null> {
  const prompt = `You are a video-editing analyst. Score this transcript window from an Indonesian / mixed-language long-form video (podcast, interview, gaming, sports talk).

Return STRICT JSON only:
{
  "hook_score": 0-100 — how important/viral/quotable the content here is. 100 = explosive revelation, shocking number, laugh-out-loud moment, crucial conclusion. 20 = filler chat.
  "interest_reason": "one short line in Indonesian why",
  "hook_line": "the single strongest quotable sentence (4-10 words, in the transcript's language)",
  "has_kinetic_trigger": true/false — true if this window deserves a big animated on-screen text overlay
}

TRANSCRIPT WINDOW [${w.startTime.toFixed(0)}s - ${w.endTime.toFixed(0)}s]:
"""${truncate(w.transcriptText)}
"""`;

  try {
    const parsed = await ollamaGenerateJson<LlmWindowScore>(prompt, {
      maxTokens: 300,
      temperature: 0.0,
    });
    if (!parsed) return null;
    if (
      typeof parsed.hook_score !== 'number' ||
      typeof parsed.hook_line !== 'string' ||
      typeof parsed.has_kinetic_trigger !== 'boolean'
    ) {
      logger.warn(`Ollama window score malformed: ${JSON.stringify(parsed).slice(0, 200)}`);
      return null;
    }
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Ollama window score error: ${msg.slice(0, 200)}`);
    return null;
  }
}

/**
 * Heuristic hook strength: keyword + exclamation + duration signals.
 * Used when Ollama is offline or per-window parse fails.
 */
export function heuristicHook(text: string): number {
  const t = text.toLowerCase();
  let score = 0;

  const hookWords = [
    'gila',
    'wow',
    'wah',
    'mahal',
    'murah',
    'ternyata',
    'serius',
    'penting',
    'fakta',
    'data',
    'angka',
    'grafik',
    'diagram',
    'jutaan',
    'miliar',
    'pertama',
    'terakhir',
    'misteri',
    'rahasia',
    'buktinya',
    'justru',
  ];
  for (const w of hookWords) {
    if (t.includes(w)) score += 0.12;
  }

  const bw = ['sangat', 'banget', 'sekali', 'parah', 'luar biasa', 'craz', 'amazing', 'incredible'];
  for (const w of bw) {
    if (t.includes(w)) score += 0.06;
  }

  score += Math.min(0.15, t.split(/[.!?]/).length / 100); // sentence density

  return Math.min(1, score);
}

/** Merge transcript segments into per-window text. */
export function windowText(segments: TranscriptSegment[], start: number, end: number): string {
  return segments
    .filter((s) => s.start >= start && s.start < end)
    .map((s) => s.text)
    .join(' ')
    .trim();
}

/**
 * Pick a short hook sentence from transcript text when the LLM didn't return
 * one. Heuristic: first sentence with a question mark, exclamation, or hook
 * keyword; trimmed to 4-10 words.
 */
function firstHookLine(
  text: string,
  _fallbackHookOrSignals: number | unknown[] | undefined,
): string | undefined {
  if (!text) return undefined;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const hookish = sentences.find((s) => /[!?]/.test(s)) ?? sentences[0];
  if (!hookish) return undefined;
  const words = hookish.trim().split(/\s+/);
  if (words.length <= 10) return hookish.trim();
  return words.slice(0, 10).join(' ') + '…';
}
