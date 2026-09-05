import { PipelineStage } from '@prisma/client';
import { PipelineStageHandler, StageContext } from '../runner-types';
import { runBinaryChecked } from '../binaries/spawn';
import { logger } from '../../server/logger';
import { scoreWindowsWithAI, windowText, AIScoredWindow } from '../ai/momentScorer';

export class AnalyzeStage implements PipelineStageHandler {
  stage = PipelineStage.ANALYZE;

  async execute(
    ctx: StageContext,
    onProgress: (progress: number, msg?: string) => Promise<void>,
  ): Promise<void> {
    await onProgress(0.05, 'Starting ANALYZE (AI moment detection)');

    const duration = ctx.metadata?.duration || 0;
    if (duration === 0) throw new Error('Missing duration metadata');

    const transcript = ctx.stageData.transcript;
    const transcriptAvailable = !!transcript && transcript.segments.length > 0;

    await onProgress(0.15, 'Building sliding analysis windows');

    // 1. Sliding windows across the full video (3-5 min target clips)
    const targetDur = ctx.config?.targetDuration || 180;
    const minDur = ctx.config?.minSegmentDuration || 120;
    const maxDur = ctx.config?.maxSegmentDuration || 300;
    const stepSize = Math.max(30, Math.floor(targetDur / 3));
    const maxClips = Math.min(ctx.config?.maxClips || 10, 10);

    const windows: Array<{ start: number; end: number }> = [];
    for (let start = 0; start < duration - minDur; start += stepSize) {
      const end = Math.min(start + targetDur, duration);
      windows.push({ start, end });
    }
    if (windows.length === 0) windows.push({ start: 0, end: Math.min(targetDur, duration) });

    logger.info(`ANALYZE: ${windows.length} candidate windows (${targetDur}s target)`);

    // 2. Audio interest per window (real FFmpeg analysis, replaces old sin/cos mock)
    await onProgress(0.25, 'Analyzing audio energy (volume spikes)');
    const audioInterest = await this.audioInterestByWindow(ctx.sourcePath, windows);

    // 3. Score windows
    //    – with AI: transcript windows → Ollama hook score
    //    – without transcript: heuristics only
    await onProgress(
      0.4,
      transcriptAvailable
        ? 'Scoring moments with local AI (qwen2.5)…'
        : 'Scoring moments with audio heuristics (no transcript)',
    );

    let scored: AIScoredWindow[];
    let aiUsed = false;

    if (transcriptAvailable) {
      const inputs = windows.map((w) => ({
        startTime: w.start,
        endTime: w.end,
        transcriptText: windowText(transcript.segments, w.start, w.end),
        audioInterest: audioInterest.get(w.start) ?? 0.3,
      }));
      const res = await scoreWindowsWithAI(inputs);
      scored = res.scored;
      aiUsed = res.aiUsed;
    } else {
      scored = windows.map((w) => {
        const hook = heuristicAudioOnly(audioInterest.get(w.start) ?? 0.3);
        return {
          startTime: w.start,
          endTime: w.end,
          transcriptHook: hook,
          audioInterest: audioInterest.get(w.start) ?? 0.3,
          visualInterest: 0.3,
          viralPotential: hook,
          reasons: ['No transcript — audio-energy heuristic'],
          confidence: 'LOW' as const,
          hasKineticTrigger: false,
        };
      });
    }

    // 4. Rank: viralPotential desc, timeline tiebreak; dedupe overlapping
    await onProgress(0.85, 'Ranking and deduplicating moments');
    const ranked = [...scored].sort(
      (a, b) => b.viralPotential - a.viralPotential || a.startTime - b.startTime,
    );

    const selected: AIScoredWindow[] = [];
    for (const w of ranked) {
      if (selected.length >= maxClips) break;
      if (selected.some((s) => overlap(s.startTime, s.endTime, w.startTime, w.endTime))) {
        continue;
      }
      selected.push(w);
    }
    selected.sort((a, b) => a.startTime - b.startTime);

    if (selected.length === 0) {
      throw new Error('NO_QUALIFYING_SEGMENTS: no window passed analysis');
    }

    // 5. Emit moments + backward-compatible segments
    ctx.stageData.moments = selected.map((w) => ({
      startTime: w.startTime,
      endTime: w.endTime,
      duration: Number((w.endTime - w.startTime).toFixed(3)),
      scores: {
        transcriptHook: w.transcriptHook,
        audioInterest: w.audioInterest,
        visualInterest: w.visualInterest,
        viralPotential: w.viralPotential,
      },
      reasons: w.reasons,
      confidence: w.confidence,
      hasKineticTrigger: w.hasKineticTrigger,
      hookLine: w.hookLine,
    }));
    ctx.stageData.segments = selected.map((w) => ({
      startTime: w.startTime,
      endTime: w.endTime,
      duration: Number((w.endTime - w.startTime).toFixed(3)),
      viralScore: w.viralPotential,
      confidence: w.confidence,
    }));

    const aiTag = aiUsed ? 'AI' : 'HEURISTIC';
    logger.info(`ANALYZE (${aiTag}): selected ${selected.length} moments`, {
      aiUsed,
      topScore: selected[0]?.viralPotential,
      topReason: selected[0]?.reasons[0],
      hookLines: selected.slice(0, 3).map((s) => s.hookLine),
    });

    await onProgress(1.0, `ANALYZE completed: ${selected.length} moments selected (${aiTag})`);
  }

  /**
   * Real per-window audio energy using FFmpeg astats.
   * Returns Map<windowStart, normalizedInterest 0..1>.
   */
  private async audioInterestByWindow(
    sourcePath: string,
    windows: Array<{ start: number; end: number }>,
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    const results: Array<{ start: number; interest: number }> = [];

    // Batch in small groups to limit total ffmpeg invocations.
    // One ffmpeg run per window: accurate but slower; acceptable for MVP.
    const BATCH = 4;
    for (let i = 0; i < windows.length; i += BATCH) {
      const batch = windows.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (w) => {
          const rms = await this.windowRms(sourcePath, w.start, w.end);
          // LUFS-ish normalize: typical speech -20..-10, shouting -5, silence -60
          const interest = Math.min(1, Math.max(0, (rms + 30) / 40));
          return { start: w.start, interest };
        }),
      );
      results.push(...batchResults);
    }

    for (const r of results) map.set(r.start, r.interest);
    return map;
  }

  /** Average RMS (dB) of a window via ffmpeg astats metadata. */
  private async windowRms(sourcePath: string, start: number, end: number): Promise<number> {
    try {
      const res = await runBinaryChecked(
        'ffmpeg',
        [
          '-ss',
          start.toFixed(1),
          '-t',
          (end - start).toFixed(1),
          '-i',
          sourcePath,
          '-map',
          'a:0',
          '-af',
          'astats=metadata=1:reset=1',
          '-f',
          'null',
          '-',
        ],
        { timeoutMs: 600000 },
      );
      const matches = [...res.stderr.matchAll(/RMS level dB:\s*(-?\d+\.?\d*)/g)];
      if (matches.length === 0) return -30;
      const vals = matches.map((m) => parseFloat(m[1]!));
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return Number.isFinite(avg) ? avg : -30;
    } catch {
      return -30; // audio probe failure → neutral
    }
  }
}

function overlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return a1 < b2 && b1 < a2;
}

/** Audio-only heuristic when no transcript: high energy = interesting. */
function heuristicAudioOnly(interest: number): number {
  return Math.min(1, 0.3 + interest * 0.6);
}
