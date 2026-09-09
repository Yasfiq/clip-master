/**
 * Ollama HTTP client (local LLM at 127.0.0.1:11434).
 *
 * Uses global fetch — no external dependency. All requests stay on loopback,
 * satisfying the "data never leaves the machine" constraint.
 *
 * The Ollama server is a long-running daemon started outside this process.
 * This module only talks to it. If the daemon is down, callers get a clear
 * error and the pipeline can fall back to heuristics.
 */

import { logger } from './logger';

export interface OllamaGenerateOptions {
  model?: string;
  /** Force JSON output — sends `format: json` to Ollama. */
  jsonMode?: boolean;
  /** Override context length. */
  numCtx?: number;
  /** Sampling temperature (0 = deterministic). */
  temperature?: number;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Terminate on these stop sequences. */
  stop?: string[];
}

export interface OllamaGenerateResult {
  response: string;
  model: string;
  evalCount: number;
  evalDurationNs: number;
  tokensPerSecond: number;
  done: boolean;
}

const DEFAULT_HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5:7b-instruct-q4_K_M';
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000; // 30 min for CPU inference

export function ollamaHost(): string {
  const configured = process.env.OLLAMA_HOST || DEFAULT_HOST;
  // Hard loopback-only guard: transcript text must never leave the machine.
  // If the operator points OLLAMA_HOST at a remote host, refuse and fall
  // back to the loopback default rather than exfiltrating content.
  let host: string;
  try {
    const u = new URL(configured);
    const isLoopback =
      u.hostname === '127.0.0.1' ||
      u.hostname === 'localhost' ||
      u.hostname === '::1' ||
      u.hostname === '[::1]';
    if (!isLoopback) throw new Error('non-loopback');
    host = configured;
  } catch {
    logger.warn(
      `OLLAMA_HOST must point at loopback (127.0.0.1) — data never leaves the machine. ` +
        `Ignoring non-loopback value "${configured}" and using ${DEFAULT_HOST}`,
    );
    host = DEFAULT_HOST;
  }
  return host;
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

/**
 * Check whether the Ollama daemon is reachable.
 */
export async function ollamaPing(timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${ollamaHost()}/api/version`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Low-level fetch-based Ollama generate. Throws on network/server error.
 */
async function ollamaFetch(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ollamaHost()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate a single completion (no streaming).
 */
export async function ollamaGenerate(
  prompt: string,
  options: OllamaGenerateOptions = {},
): Promise<OllamaGenerateResult> {
  const body: Record<string, unknown> = {
    model: options.model || ollamaModel(),
    prompt,
    stream: false,
    options: {
      temperature: options.temperature ?? 0.0,
      num_ctx: options.numCtx ?? 8192,
      num_predict: options.maxTokens ?? 2048,
    },
  };
  if (options.jsonMode) body.format = 'json';
  if (options.stop && options.stop.length > 0)
    body.options = { ...(body.options as object), stop: options.stop };

  logger.debug(`Ollama generate: model=${body.model}, promptLen=${prompt.length}`);

  const json = (await ollamaFetch('/api/generate', body, REQUEST_TIMEOUT_MS)) as {
    response?: string;
    model?: string;
    eval_count?: number;
    eval_duration?: number;
    done?: boolean;
  };

  const evalCount = json.eval_count ?? 0;
  const evalDuration = json.eval_duration ?? 1; // ns
  const tps = evalDuration > 0 ? (evalCount / evalDuration) * 1e9 : 0;

  return {
    response: json.response ?? '',
    model: json.model ?? (body.model as string),
    evalCount,
    evalDurationNs: evalDuration,
    tokensPerSecond: Number(tps.toFixed(2)),
    done: json.done ?? true,
  };
}

/**
 * Generate with a JSON-format prompt. Parses the response into T.
 * Returns null if Ollama is unreachable or the response is not valid JSON,
 * signalling the caller to fall back.
 */
export async function ollamaGenerateJson<T>(
  prompt: string,
  options: OllamaGenerateOptions = {},
): Promise<T | null> {
  try {
    const result = await ollamaGenerate(prompt, { ...options, jsonMode: true });
    if (!result.response.trim()) return null;
    // Strip markdown fences if the model wrapped output.
    const cleaned = result.response
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned) as T;
    logger.debug(`Ollama JSON parsed OK (${result.tokensPerSecond} tok/s)`);
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Ollama JSON call failed, returning null: ${msg}`);
    return null;
  }
}
