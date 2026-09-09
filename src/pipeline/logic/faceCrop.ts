/**
 * Pure face-aware crop helpers.
 *
 * Why: portrait Shorts exports (1080×1920) need a vertical slice from a wider
 * landscape source (e.g. 1280×720). A static center column often leaves the
 * speaker's face cropped or pushed to a third — reference Shorts slide the
 * crop window horizontally to keep the face centered. This module turns a
 * stream of face detections into a single `x`-offset for the ffmpeg `crop=`
 * filter, with safe fallbacks when no face is found.
 *
 * No filesystem, no process spawning — unit-testable. The effectful wrapper
 * (ffmpeg frame extraction + onnx inference) lives in `binaries/faceDetect`.
 */

export interface FaceBox {
  /** Normalized left edge in [0, 1] (model output space). */
  xmin: number;
  /** Normalized top edge in [0, 1]. */
  ymin: number;
  /** Normalized right edge in [0, 1]. */
  xmax: number;
  /** Normalized bottom edge in [0, 1]. */
  ymax: number;
  /** Post-sigmoid detection confidence (0..1). */
  score: number;
  /** Optional frame timestamp in seconds. */
  timestamp?: number;
}

export interface LetterboxTransform {
  /** Scale factor applied to the longer side. */
  scale: number;
  /** Letterboxed width (after scaling, before padding). */
  newW: number;
  /** Letterboxed height. */
  newH: number;
  /** Left padding in letterbox space. */
  padLeft: number;
  /** Top padding in letterbox space. */
  padTop: number;
  /** Target model width. */
  targetW: number;
  /** Target model height. */
  targetH: number;
}

export interface FaceCropConfig {
  /** Minimum detection score to trust a box (0..1). */
  minScore: number;
  /** Extra padding added to crop width (0.15 = crop window 15% wider than target). */
  padFraction: number;
  /** Frames per second sampled for detection (1 = every ~1s). */
  sampleFps: number;
}

/**
 * Defaults: accept detections over 0.18 confidence (allows detecting small faces
 * in wide shots on letterboxed 128x128 inputs where face size is ~5x5px),
 * generous 15% crop padding so the face has breathing room, sample 1 fps.
 */
export const DEFAULT_FACE_CROP: FaceCropConfig = {
  minScore: 0.18,
  padFraction: 0.15,
  sampleFps: 1,
};

export type CropSource = 'face' | 'center-fallback' | 'low-confidence';

export interface CropWindow {
  /** Horizontal offset of the crop window (px). */
  x: number;
  /** Crop window width (px). */
  cropWidth: number;
  /** Crop window height (px). */
  cropHeight: number;
  /** Why this x was chosen. */
  source: CropSource;
}

/**
 * Choose a horizontal crop offset that keeps the (weighted) face centroid
 * near the middle of the crop window.
 *
 * @param detections Detections already in source-pixel space (after undoLetterbox).
 * @param srcW       Source video width (px).
 * @param srcH       Source video height (px).
 * @param targetAspect Width / height of the portrait output (e.g. 9/16).
 * @param config     Face crop config.
 */
export interface FaceCluster {
  /** Face detections assigned to this cluster. */
  faces: FaceBox[];
  /** Weighted centroid of the cluster in normalized coordinates [0, 1]. */
  centroid: { cx: number; cy: number };
  /** Dominance ranking score based on detection count, total confidence, and face area. */
  score: number;
}

export const DEFAULT_CLUSTER_DISTANCE_THRESHOLD = 0.18;

/**
 * Score a face cluster based on detection count, total confidence score, and
 * bounding box area (face size). Primary / foreground speakers with more screen
 * time and larger faces rank higher than background persons.
 */
export function scoreFaceCluster(faces: FaceBox[]): number {
  if (faces.length === 0) return 0;
  const count = faces.length;
  let totalScore = 0;
  let totalArea = 0;
  for (const f of faces) {
    totalScore += Math.max(0, f.score);
    const w = Math.max(0, f.xmax - f.xmin);
    const h = Math.max(0, f.ymax - f.ymin);
    totalArea += w * h;
  }
  const avgArea = Math.min(1, totalArea / count);
  return (totalScore + count * 0.1) * (1 + avgArea * 10);
}

/**
 * 1D spatial clustering for face detections along the horizontal x axis.
 * Detections within distanceThreshold normalized width are grouped into a cluster.
 */
export function clusterFaceDetections(
  detections: FaceBox[],
  distanceThreshold = DEFAULT_CLUSTER_DISTANCE_THRESHOLD,
): FaceCluster[] {
  if (detections.length === 0) return [];

  // Sort detections by horizontal x center for stable sequential clustering
  const sorted = [...detections].sort((a, b) => {
    const cxA = (a.xmin + a.xmax) / 2;
    const cxB = (b.xmin + b.xmax) / 2;
    return cxA - cxB;
  });

  const rawClusters: FaceBox[][] = [];

  for (const box of sorted) {
    const boxCx = (box.xmin + box.xmax) / 2;

    // Find the closest existing cluster within distanceThreshold
    let bestClusterIdx = -1;
    let minDistance = Infinity;

    for (let i = 0; i < rawClusters.length; i++) {
      const clusterFaces = rawClusters[i];
      const clusterCx =
        clusterFaces.reduce((sum, f) => sum + (f.xmin + f.xmax) / 2, 0) / clusterFaces.length;
      const dist = Math.abs(boxCx - clusterCx);
      if (dist <= distanceThreshold && dist < minDistance) {
        minDistance = dist;
        bestClusterIdx = i;
      }
    }

    if (bestClusterIdx >= 0) {
      rawClusters[bestClusterIdx].push(box);
    } else {
      rawClusters.push([box]);
    }
  }

  return rawClusters.map((faces) => {
    const centroid = aggregateCentroid(faces, 1, 1) || {
      cx: faces.reduce((s, f) => s + (f.xmin + f.xmax) / 2, 0) / faces.length,
      cy: faces.reduce((s, f) => s + (f.ymin + f.ymax) / 2, 0) / faces.length,
    };
    return {
      faces,
      centroid,
      score: scoreFaceCluster(faces),
    };
  });
}

/** Alias for clusterFaceDetections. */
export const clusterFaces = clusterFaceDetections;

/**
 * Select the dominant/primary speaker cluster based on cluster score.
 */
export function selectDominantCluster(clusters: FaceCluster[]): FaceCluster | null {
  if (clusters.length === 0) return null;
  let best = clusters[0];
  for (let i = 1; i < clusters.length; i++) {
    const c = clusters[i];
    if (c.score > best.score) {
      best = c;
    } else if (c.score === best.score) {
      if (c.faces.length > best.faces.length) {
        best = c;
      } else if (c.faces.length === best.faces.length) {
        if (Math.abs(c.centroid.cx - 0.5) < Math.abs(best.centroid.cx - 0.5)) {
          best = c;
        }
      }
    }
  }
  return best;
}

export function chooseCropX(
  detections: FaceBox[],
  srcW: number,
  srcH: number,
  targetAspect: number,
  config: FaceCropConfig,
): CropWindow {
  const cropHeight = srcH;
  const cropWidth = Math.max(1, Math.round(srcH * targetAspect));
  const maxX = Math.max(0, srcW - cropWidth);
  const centerX = Math.round((srcW - cropWidth) / 2);

  const accepted = detections.filter((d) => d.score >= config.minScore);
  if (accepted.length === 0) {
    return {
      x: centerX,
      cropWidth,
      cropHeight,
      source: detections.length === 0 ? 'center-fallback' : 'low-confidence',
    };
  }

  // Cluster accepted detections and select the dominant speaker
  const clusters = clusterFaceDetections(accepted);
  const dominant = selectDominantCluster(clusters);
  if (!dominant) {
    return { x: centerX, cropWidth, cropHeight, source: 'center-fallback' };
  }

  const centroid = dominant.centroid;
  const padPx = Math.round(cropWidth * (config.padFraction || 0));
  const srcCx = centroid.cx * srcW;
  const idealX = srcCx - (cropWidth + padPx) / 2;
  const x = Math.min(maxX, Math.max(0, Math.round(idealX)));

  return { x, cropWidth, cropHeight, source: 'face' };
}

export interface DynamicCropSegment {
  start: number; // seconds
  end: number; // seconds
  x: number; // px in source coordinates
  cx: number; // normalized center [0, 1]
  source: CropSource;
}

/**
 * Computes dynamic, shot-aware crop segments across the duration of a clip.
 *
 * Prevents "empty center void" framing in multi-speaker setups (e.g. podcast wide shots)
 * by tracking speaker positions per frame, debouncing brief camera jitter, and
 * creating stable framing segments for each shot or speaker cut.
 */
export function computeDynamicCropSegments(
  detections: FaceBox[],
  clipDuration: number,
  srcW: number,
  srcH: number,
  targetAspect: number,
  config: FaceCropConfig,
): DynamicCropSegment[] {
  const cropHeight = srcH;
  const cropWidth = Math.max(1, Math.round(srcH * targetAspect));
  const maxX = Math.max(0, srcW - cropWidth);
  const centerX = Math.round((srcW - cropWidth) / 2);

  const accepted = (detections || []).filter((d) => d.score >= config.minScore);
  if (accepted.length === 0) {
    return [
      {
        start: 0,
        end: clipDuration,
        x: centerX,
        cx: 0.5,
        source: detections && detections.length > 0 ? 'low-confidence' : 'center-fallback',
      },
    ];
  }

  // Check if detections carry timestamps
  const hasTimestamps = accepted.some((d) => typeof d.timestamp === 'number');
  if (!hasTimestamps) {
    const single = chooseCropX(accepted, srcW, srcH, targetAspect, config);
    return [
      {
        start: 0,
        end: clipDuration,
        x: single.x,
        cx: (single.x + cropWidth / 2) / srcW,
        source: single.source,
      },
    ];
  }

  // Find global dominant cluster across the clip for reference/continuity
  const globalClusters = clusterFaceDetections(accepted);
  const globalDominant = selectDominantCluster(globalClusters);
  const defaultCx = globalDominant ? globalDominant.centroid.cx : 0.5;

  // Group detections into temporal buckets (~0.5s)
  const timeBuckets = new Map<number, FaceBox[]>();
  for (const d of accepted) {
    const t = Math.round((d.timestamp ?? 0) * 2) / 2;
    const list = timeBuckets.get(t) || [];
    list.push(d);
    timeBuckets.set(t, list);
  }

  const sortedTimes = Array.from(timeBuckets.keys()).sort((a, b) => a - b);
  if (sortedTimes.length === 0) {
    return [
      {
        start: 0,
        end: clipDuration,
        x: centerX,
        cx: 0.5,
        source: 'center-fallback',
      },
    ];
  }

  interface TimePoint {
    t: number;
    cx: number;
    x: number;
  }
  const points: TimePoint[] = [];

  for (const t of sortedTimes) {
    const frameFaces = timeBuckets.get(t)!;
    let chosenCx = defaultCx;

    if (frameFaces.length === 1) {
      chosenCx = (frameFaces[0]!.xmin + frameFaces[0]!.xmax) / 2;
    } else {
      // Multiple faces in this frame (e.g. 2-person wide shot)
      const frameClusters = clusterFaceDetections(frameFaces);
      let bestMatch = selectDominantCluster(frameClusters);
      if (globalDominant && frameClusters.length > 1) {
        // If one cluster is closest to the primary speaker, favor that cluster
        let minDiff = Infinity;
        for (const c of frameClusters) {
          const diff = Math.abs(c.centroid.cx - globalDominant.centroid.cx);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = c;
          }
        }
      }
      if (bestMatch) {
        chosenCx = bestMatch.centroid.cx;
      }
    }

    const idealX = chosenCx * srcW - cropWidth / 2;
    const clampedX = Math.min(maxX, Math.max(0, Math.round(idealX)));
    points.push({ t, cx: chosenCx, x: clampedX });
  }

  interface MutableSegment {
    start: number;
    end: number;
    x: number;
    cx: number;
  }
  const rawSegments: MutableSegment[] = [];
  const CUT_PIXEL_THRESHOLD = Math.round(srcW * 0.12); // ~153 px on 720p

  for (const pt of points) {
    const prev = rawSegments[rawSegments.length - 1];
    if (!prev) {
      rawSegments.push({
        start: 0,
        end: pt.t,
        x: pt.x,
        cx: pt.cx,
      });
    } else {
      if (Math.abs(pt.x - prev.x) < CUT_PIXEL_THRESHOLD) {
        prev.end = pt.t;
      } else {
        prev.end = pt.t;
        rawSegments.push({
          start: pt.t,
          end: pt.t,
          x: pt.x,
          cx: pt.cx,
        });
      }
    }
  }

  if (rawSegments.length > 0) {
    rawSegments[rawSegments.length - 1]!.end = clipDuration;
  }

  // Debounce short jitter segments (< 2.0s duration) into neighboring segment
  const MIN_SEGMENT_DURATION = 2.0;
  const smoothed: MutableSegment[] = [];

  for (const seg of rawSegments) {
    const dur = seg.end - seg.start;
    if (dur < MIN_SEGMENT_DURATION && smoothed.length > 0) {
      smoothed[smoothed.length - 1]!.end = seg.end;
    } else {
      smoothed.push({ ...seg });
    }
  }

  if (smoothed.length > 0) {
    smoothed[smoothed.length - 1]!.end = clipDuration;
  }

  return smoothed.map((s) => ({
    start: s.start,
    end: s.end,
    x: s.x,
    cx: s.cx,
    source: 'face',
  }));
}

/**
 * Builds an FFmpeg crop filter string.
 * Emits a single static crop when framing is uniform, or a dynamic nested
 * time-expression when multiple distinct camera shots / speaker cuts are detected.
 */
export function buildFfmpegCropFilter(
  segments: DynamicCropSegment[],
  srcW: number,
  scaledSrcW: number,
  cropW: number,
  scaledH: number,
): { filter: string; primaryX: number; isDynamic: boolean } {
  if (!segments || segments.length === 0) {
    const defaultX = Math.max(0, Math.round((scaledSrcW - cropW) / 2));
    return {
      filter: `crop=${cropW}:${scaledH}:${defaultX}:0`,
      primaryX: defaultX,
      isDynamic: false,
    };
  }

  const scaleFactor = scaledSrcW / srcW;
  const scaledSegments = segments.map((s) => ({
    start: s.start,
    end: s.end,
    scaledX: Math.max(0, Math.min(scaledSrcW - cropW, Math.round(s.x * scaleFactor))),
  }));

  const allSameX = scaledSegments.every(
    (s) => Math.abs(s.scaledX - scaledSegments[0]!.scaledX) < 15,
  );

  if (scaledSegments.length === 1 || allSameX) {
    const primaryX = scaledSegments[0]!.scaledX;
    return {
      filter: `crop=${cropW}:${scaledH}:${primaryX}:0`,
      primaryX,
      isDynamic: false,
    };
  }

  // Build nested FFmpeg if(lt(t, T1), X1, if(lt(t, T2), X2, X_last)) expression
  let expr = `${scaledSegments[scaledSegments.length - 1]!.scaledX}`;
  for (let i = scaledSegments.length - 2; i >= 0; i--) {
    const s = scaledSegments[i]!;
    expr = `if(lt(t,${s.end.toFixed(2)}),${s.scaledX},${expr})`;
  }

  return {
    filter: `crop=${cropW}:${scaledH}:'${expr}':0`,
    primaryX: scaledSegments[0]!.scaledX,
    isDynamic: true,
  };
}

/**
 * Average the box centers, weighted by `score`. Coordinates are normalized
 * in [0, 1] over the source frame (callers run `undoLetterbox` first).
 *
 * Returns null when there are no usable boxes (after weight clamping).
 */
export function aggregateCentroid(
  detections: FaceBox[],
  _srcW: number,
  _srcH: number,
): { cx: number; cy: number } | null {
  if (detections.length === 0) return null;

  let total = 0;
  let cx = 0;
  let cy = 0;
  for (const d of detections) {
    const w = Math.max(0, d.score);
    if (w <= 0) continue;
    const mx = (d.xmin + d.xmax) / 2;
    const my = (d.ymin + d.ymax) / 2;
    cx += mx * w;
    cy += my * w;
    total += w;
  }
  if (total <= 0) return null;

  cx /= total;
  cy /= total;
  return {
    cx: Math.min(1, Math.max(0, cx)),
    cy: Math.min(1, Math.max(0, cy)),
  };
}

/**
 * Compute the letterbox transform used to fit a source frame into the model
 * input (square for BlazeFace front 128×128).
 */
export function buildLetterboxTransform(
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
): LetterboxTransform {
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padLeft = Math.round((targetW - newW) / 2);
  const padTop = Math.round((targetH - newH) / 2);
  return { scale, newW, newH, padLeft, padTop, targetW, targetH };
}

/**
 * Map a normalized box from model-letterbox space back to source-pixel
 * space. Use after `buildLetterboxTransform` for the matching source/target
 * sizes.
 */
export function undoLetterbox(
  box: { xmin: number; ymin: number; xmax: number; ymax: number },
  t: LetterboxTransform,
  srcW: number,
  srcH: number,
): { xmin: number; ymin: number; xmax: number; ymax: number } {
  const px = (n: number, target: number, pad: number, limit: number) =>
    Math.min(limit, Math.max(0, (n * target - pad) / t.scale));
  return {
    xmin: px(box.xmin, t.targetW, t.padLeft, srcW),
    ymin: px(box.ymin, t.targetH, t.padTop, srcH),
    xmax: px(box.xmax, t.targetW, t.padLeft, srcW),
    ymax: px(box.ymax, t.targetH, t.padTop, srcH),
  };
}

/**
 * Validate a face crop config. Returns an error message or null if valid.
 */
export function validateFaceCropConfig(config: FaceCropConfig): string | null {
  if (config.minScore < 0 || config.minScore > 1) {
    return 'minScore must be within [0, 1]';
  }
  if (config.padFraction <= 0 || config.padFraction > 1) {
    return 'padFraction must be in (0, 1]';
  }
  if (config.sampleFps <= 0 || config.sampleFps > 60) {
    return 'sampleFps must be in (0, 60]';
  }
  return null;
}
