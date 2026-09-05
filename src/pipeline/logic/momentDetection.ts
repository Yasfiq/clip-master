/**
 * AI-powered moment detection for long‑form videos.
 *
 * Combines:
 *   – Whisper transcript (Indonesian/English)
 *   – FFmpeg audio events (loudness, laugh, silence)
 *   – Vision analysis via LLaVA (optional, CPU‑only)
 *   – Transcript enrichment via LLM (qwen)
 *
 * Output: ranked moments with semantic reasons.
 */

export interface TranscriptChunk {
  start: number;
  end: number;
  text: string;
  confidence?: number;
}

export interface AudioEvent {
  type: 'LAUGHTER' | 'VOLUME_SPIKE' | 'SILENCE' | 'SPEECH_START' | 'SPEECH_END';
  start: number;
  end: number;
  intensity?: number;
}

export interface VisionDetection {
  start: number;
  end: number;
  objects?: string[]; // person, car, text, diagram, scoreboard
  emotions?: ('happy' | 'angry' | 'surprised' | 'neutral')[];
  textOnScreen?: string;
}

export interface EnrichedSegment {
  /** Original window from ANALYZE stage */
  startTime: number;
  endTime: number;
  /** Multi‑sensor scores (0..1) */
  scores: {
    transcriptHook: number; // LLM‑assigned hook strength
    audioInterest: number; // loudness/laughter spike
    visualInterest: number; // vision‑detected text/face
    viralPotential: number; // composite (weighted)
  };
  reasons: string[]; // e.g. "speaker shows surprise", "text on screen: 'HARGA'", "audience laughter"
  /** Confidence (HIGH, MEDIUM, LOW) */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** If segment qualifies for a kinetic‑typography overlay */
  hasKineticTrigger: boolean;
  /** LLM‑generated hook line for this segment */
  hookLine?: string;
}

export interface MomentSelectionResult {
  moments: EnrichedSegment[];
  /** True when LLM/vision unavailable → fallback to heuristics */
  fallbackApplied: boolean;
  /** LLM reasoning summary */
  summary?: string;
}

/**
 * Weights for viral‑moment scoring (sum to 1).
 * Calibrated for Indonesian content (podcast, interview, gaming).
 */
export const MOMENT_WEIGHTS = {
  transcriptHook: 0.4,
  audioInterest: 0.3,
  visualInterest: 0.3,
} as const;

export const CONFIDENCE_HIGH = 0.75;
export const CONFIDENCE_MEDIUM = 0.5;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Pure‑function scoring: combines three sensor inputs.
 */
export function scoreSegment(
  transcriptHook: number,
  audioInterest: number,
  visualInterest: number,
): number {
  const t = clamp01(transcriptHook);
  const a = clamp01(audioInterest);
  const v = clamp01(visualInterest);
  return (
    t * MOMENT_WEIGHTS.transcriptHook +
    a * MOMENT_WEIGHTS.audioInterest +
    v * MOMENT_WEIGHTS.visualInterest
  );
}

export function classifyConfidence(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= CONFIDENCE_HIGH) return 'HIGH';
  if (score >= CONFIDENCE_MEDIUM) return 'MEDIUM';
  return 'LOW';
}

/**
 * Heuristic‑based fallback when AI sensors are unavailable.
 * Uses FFmpeg loudness + transcript keyword matching.
 */
export function fallbackMomentDetection(
  segments: Array<{ startTime: number; endTime: number }>,
  loudnessByWindow: number[],
  transcriptChunks: TranscriptChunk[],
): MomentSelectionResult {
  const moments: EnrichedSegment[] = segments.map((seg, idx) => {
    const loudness = loudnessByWindow[idx] ?? 0;
    const keywordBoost = transcriptChunks
      .filter((c) => c.start >= seg.startTime && c.end <= seg.endTime)
      .some((c) =>
        c.text
          .toLowerCase()
          .match(
            /\b(wow|wah|gila|mahal|murah|bagus|seru|keren|penting|fakta|data|angka|grafik|diagram)\b/i,
          ),
      )
      ? 0.7
      : 0.2;

    const transcriptHook = keywordBoost;
    const audioInterest = clamp01(loudness / 100); // loudness 0..100 dB
    const visualInterest = 0.4; // default neutral

    const viralScore = scoreSegment(transcriptHook, audioInterest, visualInterest);
    return {
      startTime: seg.startTime,
      endTime: seg.endTime,
      scores: {
        transcriptHook,
        audioInterest,
        visualInterest,
        viralPotential: viralScore,
      },
      reasons: keywordBoost > 0.5 ? ['Keyword match'] : ['Baseline interest'],
      confidence: classifyConfidence(viralScore),
      hasKineticTrigger: keywordBoost > 0.5,
    };
  });

  // Pick top‑1 segment (highest viralPotential)
  const top = [...moments].sort((a, b) => b.scores.viralPotential - a.scores.viralPotential)[0];
  return {
    moments: top ? [top] : [],
    fallbackApplied: true,
    summary: 'Fallback heuristic applied (no AI).',
  };
}

/**
 * AI‑powered moment detection (full pipeline).
 * Expects all three sensor outputs.
 *
 * This is a placeholder interface; the actual LLM/vision calls will be
 * implemented in a separate integration module.
 */
export async function aiMomentDetection(
  segments: Array<{ startTime: number; endTime: number }>,
  transcriptChunks: TranscriptChunk[],
  audioEvents: AudioEvent[],
  visionDetections: VisionDetection[],
): Promise<MomentSelectionResult> {
  // TODO: Integrate Ollama API calls (qwen + llava).
  // For now, return fallback.
  return fallbackMomentDetection(
    segments,
    segments.map(() => 50),
    transcriptChunks,
  );
}

/**
 * Decide which segment deserves kinetic typography.
 * A segment qualifies if:
 *   – confidence HIGH
 *   – transcriptHook > 0.6
 *   – audioInterest > 0.5
 */
export function selectKineticCandidates(moments: EnrichedSegment[]): EnrichedSegment[] {
  return moments.filter(
    (m) => m.confidence === 'HIGH' && m.scores.transcriptHook > 0.6 && m.scores.audioInterest > 0.5,
  );
}
