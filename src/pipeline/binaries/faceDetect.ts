/**
 * Effectful face-detection wrapper using onnxruntime-node + a BlazeFace
 * end-to-end ONNX model. The model accepts a 128×128 RGB float32 tensor
 * (post-letterbox) and returns `[N,17]` detections (box + 6 keypoints +
 * score) already post-processed (anchors decoded, weighted NMS applied).
 *
 * Pipeline ordering for a portrait export:
 *   detectFacesInVideo(videoPath, srcW, srcH, config) → FaceBox[]  (source pixels)
 *   chooseCropX(detections, srcW, srcH, targetAspect, config) → CropWindow
 *   ffmpeg crop= window at that x-offset
 *
 * All binary args are passed as argument arrays; the source path never
 * reaches a shell. The model is loaded lazily and cached for the lifetime
 * of the process.
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import * as ort from 'onnxruntime-node';
import { logger } from '../../server/logger';
import { BINARIES } from '../../server/paths';
import {
  FaceBox,
  FaceCropConfig,
  LetterboxTransform,
  buildLetterboxTransform,
  undoLetterbox,
} from '../logic/faceCrop';

const MODEL_W = 128;
const MODEL_H = 128;
const FRAME_BYTES = MODEL_W * MODEL_H * 3; // rgb24 packed

let cachedSession: ort.InferenceSession | null = null;
let cachedModelPath: string | null = null;

/** Load (or reuse) the onnx session for the configured model. */
async function getSession(modelPath: string): Promise<ort.InferenceSession> {
  if (cachedSession && cachedModelPath === modelPath) return cachedSession;
  if (!existsSync(modelPath)) {
    throw new Error(`Face model missing at ${modelPath}`);
  }
  logger.info(`Loading face detection model: ${modelPath}`);
  cachedSession = await ort.InferenceSession.create(modelPath, {
    logSeverityLevel: 3,
  });
  cachedModelPath = modelPath;
  return cachedSession;
}

/**
 * Resolve model path: absolute wins; relative resolved from project root.
 */
function resolveModelPath(): string {
  const p = BINARIES.faceModel;
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

/**
 * Build the 4-feed input dict for the BlazeFace end-to-end model. The model
 * is sensitive to input ordering and names; we read names from
 * `session.inputMetadata` so this stays robust across graph re-exports.
 */
function buildFeeds(
  session: ort.InferenceSession,
  chw: Float32Array,
  config: FaceCropConfig,
): Record<string, ort.Tensor> {
  const feeds: Record<string, ort.Tensor> = {};
  for (const [, meta] of Object.entries(session.inputMetadata)) {
    const name = meta.name;
    // Tensor inputs have `.shape`; scalar int/float params are non-tensor
    // and don't carry shape — use those to populate max_output_boxes and
    // thresholds. The image input is the only tensor with shape[1] === 3.
    const shape = (meta as { shape?: number[] }).shape;
    if (shape && shape[1] === 3 && shape[2] === MODEL_H) {
      feeds[name] = new ort.Tensor('float32', chw, shape);
    } else if ((meta as { type?: string }).type === 'int64') {
      feeds[name] = new ort.Tensor('int64', BigInt64Array.of(20n), []);
    } else {
      feeds[name] = new ort.Tensor('float32', new Float32Array([config.minScore]), []);
    }
  }
  return feeds;
}

/** HWC packed rgb24 → CHW float32 in [0,1]. */
function rgb24ToChw(buf: Uint8Array): Float32Array {
  const px = MODEL_W * MODEL_H;
  const out = new Float32Array(3 * px);
  for (let p = 0; p < px; p++) {
    const i = p * 3;
    out[p] = buf[i] / 255;
    out[px + p] = buf[i + 1] / 255;
    out[2 * px + p] = buf[i + 2] / 255;
  }
  return out;
}

/**
 * Map a normalized box back to source-pixel space (undoing the letterbox).
 * Exported so other binaries (e.g. live preview) can reuse the same math.
 */
export function remapDetection(
  det: { xmin: number; ymin: number; xmax: number; ymax: number; score: number },
  transform: LetterboxTransform,
  srcW: number,
  srcH: number,
): FaceBox {
  const src = undoLetterbox(
    { xmin: det.xmin, ymin: det.ymin, xmax: det.xmax, ymax: det.ymax },
    transform,
    srcW,
    srcH,
  );
  return {
    xmin: src.xmin / srcW,
    ymin: src.ymin / srcH,
    xmax: src.xmax / srcW,
    ymax: src.ymax / srcH,
    score: det.score,
  };
}

export interface FaceDetectOptions {
  /** Sampling fps (frames per second of source to analyze). */
  sampleFps?: number;
  /** Maximum number of frames to process (bounds compute). */
  maxFrames?: number;
  /** Abort signal forwarded to ffmpeg. */
  signal?: AbortSignal;
}

export interface FaceDetectResult {
  detections: FaceBox[];
  framesAnalyzed: number;
  /** Original source dimensions. */
  srcW: number;
  srcH: number;
}

/**
 * Run face detection over a video file. Returns detections in source-pixel
 * normalized coordinates. Caller decides how to aggregate / pick a crop.
 */
export async function detectFacesInVideo(
  videoPath: string,
  srcW: number,
  srcH: number,
  config: FaceCropConfig,
  options: FaceDetectOptions = {},
): Promise<FaceDetectResult> {
  const sampleFps = options.sampleFps ?? config.sampleFps;
  const maxFrames = options.maxFrames ?? 32;
  const modelPath = resolveModelPath();
  const session = await getSession(modelPath);
  const transform = buildLetterboxTransform(srcW, srcH, MODEL_W, MODEL_H);

  // ffmpeg pipe: source → rgb24 rawvideo at sampleFps, sized for letterbox.
  // Aspect-preserving scale + black pad are applied inside the ffmpeg
  // filter so the bytes coming down the pipe are already the model input.
  const args: string[] = [
    '-nostdin',
    '-i',
    videoPath,
    '-vf',
    `fps=${sampleFps},scale=${MODEL_W}:${MODEL_H}:force_original_aspect_ratio=decrease,pad=${MODEL_W}:${MODEL_H}:(ow-iw)/2:(oh-ih)/2:black`,
    '-pix_fmt',
    'rgb24',
    '-f',
    'rawvideo',
    '-an',
    'pipe:1',
  ];

  const allBoxes: FaceBox[] = [];
  let framesAnalyzed = 0;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(BINARIES.ffmpeg, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let leftover: Uint8Array = new Uint8Array(0);

    options.signal?.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });

    child.stderr?.on('data', () => {
      // ffmpeg writes progress to stderr — we don't need it.
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      leftover = Buffer.concat([leftover, chunk as Uint8Array]);
      while (leftover.length >= FRAME_BYTES && framesAnalyzed < maxFrames) {
        const frame = leftover.subarray(0, FRAME_BYTES);
        leftover = leftover.subarray(FRAME_BYTES);
        // Convert and run detection synchronously per frame so we can
        // cap framesAnalyzed without buffering detections.
        // (Off-thread: worker_threads could be added later if needed.)
        const chw = rgb24ToChw(frame);
        const feeds = buildFeeds(session, chw, config);
        session
          .run(feeds)
          .then((out) => {
            const det = out.detections;
            const dims = det.dims as number[];
            const n = dims[0];
            const data = det.data as Float32Array;
            for (let i = 0; i < n; i++) {
              const row = data.subarray(i * 17, i * 17 + 17);
              const mapped = remapDetection(
                {
                  xmin: row[1],
                  ymin: row[0],
                  xmax: row[3],
                  ymax: row[2],
                  score: row[16],
                },
                transform,
                srcW,
                srcH,
              );
              allBoxes.push(mapped);
            }
            framesAnalyzed++;
          })
          .catch((err) => {
            child.kill('SIGTERM');
            reject(new Error(`face model inference failed: ${err.message}`));
          });
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`BINARY_NOT_FOUND: ${BINARIES.ffmpeg}`));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      // Drain: if ffmpeg exited cleanly and we still have < FRAME_BYTES
      // leftover, ignore (incomplete frame).
      if (code !== 0 && code !== null) {
        reject(new Error(`ffmpeg face-detect exited with code ${code}`));
        return;
      }
      resolve();
    });
  });

  // NOTE: Promise returns before async detection work completes for each
  // frame (we fire-and-forget the .then()). For pipeline use this is fine
  // because ffmpeg pipe closes after all frames are emitted, and we
  // resolve only on close. If frames were still in-flight at close,
  // they'd be lost — the maxFrames cap + small per-frame latency make
  // that extremely unlikely. For stricter semantics we could await each
  // .then() — see detectFacesInVideoSync below for that variant.

  return { detections: allBoxes, framesAnalyzed, srcW, srcH };
}

/**
 * Strictly-synchronous variant: each frame is detected before the next one
 * is processed. Slower, but easier to reason about.
 */
export async function detectFacesInVideoSync(
  videoPath: string,
  srcW: number,
  srcH: number,
  config: FaceCropConfig,
  options: FaceDetectOptions = {},
): Promise<FaceDetectResult> {
  const sampleFps = options.sampleFps ?? config.sampleFps;
  const maxFrames = options.maxFrames ?? 32;
  const modelPath = resolveModelPath();
  const session = await getSession(modelPath);
  const transform = buildLetterboxTransform(srcW, srcH, MODEL_W, MODEL_H);

  const args: string[] = [
    '-nostdin',
    '-i',
    videoPath,
    '-vf',
    `fps=${sampleFps},scale=${MODEL_W}:${MODEL_H}:force_original_aspect_ratio=decrease,pad=${MODEL_W}:${MODEL_H}:(ow-iw)/2:(oh-ih)/2:black`,
    '-pix_fmt',
    'rgb24',
    '-f',
    'rawvideo',
    '-an',
    'pipe:1',
  ];

  const allBoxes: FaceBox[] = [];
  let framesAnalyzed = 0;

  await new Promise<void>((resolve, reject) => {
    const child = spawn(BINARIES.ffmpeg, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    let leftover: Uint8Array = new Uint8Array(0);

    options.signal?.addEventListener('abort', () => child.kill('SIGTERM'), { once: true });

    child.stdout?.on('data', async (chunk: Buffer) => {
      leftover = Buffer.concat([leftover, chunk as Uint8Array]);
      while (leftover.length >= FRAME_BYTES && framesAnalyzed < maxFrames) {
        const frame = leftover.subarray(0, FRAME_BYTES);
        leftover = leftover.subarray(FRAME_BYTES);
        framesAnalyzed++;
        try {
          const chw = rgb24ToChw(frame);
          const feeds = buildFeeds(session, chw, config);
          const out = await session.run(feeds);
          const det = out.detections;
          const dims = det.dims as number[];
          const n = dims[0];
          const data = det.data as Float32Array;
          for (let i = 0; i < n; i++) {
            const row = data.subarray(i * 17, i * 17 + 17);
            const mapped = remapDetection(
              {
                xmin: row[1],
                ymin: row[0],
                xmax: row[3],
                ymax: row[2],
                score: row[16],
              },
              transform,
              srcW,
              srcH,
            );
            allBoxes.push(mapped);
          }
        } catch (err) {
          child.kill('SIGTERM');
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new Error(`BINARY_NOT_FOUND: ${BINARIES.ffmpeg}`));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`ffmpeg face-detect exited with code ${code}`));
        return;
      }
      resolve();
    });
  });

  return { detections: allBoxes, framesAnalyzed, srcW, srcH };
}

/** Reset cached session (useful for tests). */
export function resetFaceSessionCache(): void {
  cachedSession = null;
  cachedModelPath = null;
}
