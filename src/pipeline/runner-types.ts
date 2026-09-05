import { PipelineStage } from '@prisma/client';

export interface StageContext {
  jobId: string;
  sourcePath: string; // Absolute path to original video
  workDir: string; // Absolute path to job working directory
  outputDir: string; // Absolute path to exports directory
  config: any; // Active PipelineConfig schema data
  /** Source title from yt-dlp metadata or filename. Feeds the ad filter. */
  sourceTitle: string;
  /** Source description from yt-dlp metadata, when available. */
  sourceDescription?: string;
  metadata: {
    duration?: number;
    width?: number;
    height?: number;
    format?: string;
    hasAudio?: boolean;
    fps?: number;
    codec?: string;
    audioCodec?: string;
    sampleRate?: number;
    channels?: number;
    bitRate?: number;
    fileSize?: number;
  };
  // Incremental outputs passed between stages
  stageData: {
    adFilter?: {
      isAd: boolean;
      score: number;
      reason: string;
    };
    /** Full-transcript (produced by TRANSCRIBE, consumed by ANALYZE + SUBTITLE) */
    transcript?: {
      segments: Array<{
        start: number;
        end: number;
        text: string;
        words?: Array<{ text: string; start: number; end: number }>;
      }>;
      language: string | null;
      text: string;
    };
    /** AI-enriched moments (produced by ANALYZE, consumed by CUT) */
    moments?: Array<{
      startTime: number;
      endTime: number;
      duration: number;
      scores: {
        transcriptHook: number;
        audioInterest: number;
        visualInterest: number;
        viralPotential: number;
      };
      reasons: string[];
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
      hasKineticTrigger: boolean;
    }>;
    segments?: Array<{
      startTime: number;
      endTime: number;
      duration: number;
      viralScore: number;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
    clips?: Array<{
      id: string;
      startTime: number;
      endTime: number;
      duration: number;
      cutPath: string; // path to raw cut
      editedPath?: string; // path to graded + audio-mixed clip
      subtitlePath?: string; // path to srt sidecar
      exportPath?: string; // path to final combined export
      viralScore?: number;
      confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
  };
}

export interface PipelineStageHandler {
  stage: PipelineStage;
  execute(
    ctx: StageContext,
    onProgress: (progress: number, logMsg?: string) => Promise<void>,
  ): Promise<void>;
}

// ─── Transcript (produced by TRANSCRIBE stage, consumed by ANALYZE + SUBTITLE) ───

export interface WordTiming {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface TranscriptSegment {
  start: number; // seconds
  end: number; // seconds
  text: string;
  /** Optional word-level timing from whisper JSON-full */
  words?: WordTiming[];
}

export interface TranscriptData {
  segments: TranscriptSegment[];
  language: string | null;
  text: string; // full concatenated text
}

// ─── Moment Detection (produced by ANALYZE stage) ───

export interface MomentScores {
  transcriptHook: number; // 0..1
  audioInterest: number; // 0..1
  visualInterest: number; // 0..1
  viralPotential: number; // 0..1 composite
}

export interface EnrichedSegment {
  startTime: number;
  endTime: number;
  duration: number;
  scores: MomentScores;
  reasons: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  hasKineticTrigger: boolean;
  /** LLM‑generated hook line for this segment */
  hookLine?: string;
}
