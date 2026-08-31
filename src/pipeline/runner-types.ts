import { PipelineStage } from '@prisma/client';

export interface StageContext {
  jobId: string;
  sourcePath: string; // Absolute path to original video
  workDir: string; // Absolute path to job working directory
  outputDir: string; // Absolute path to exports directory
  config: any; // Active PipelineConfig schema data
  metadata: {
    duration?: number;
    width?: number;
    height?: number;
    format?: string;
    hasAudio?: boolean;
    fps?: number;
  };
  // Incremental outputs passed between stages
  stageData: {
    adFilter?: {
      isAd: boolean;
      score: number;
      reason: string;
    };
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
