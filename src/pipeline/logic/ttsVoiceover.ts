import fs from 'fs/promises';
import path from 'path';
import { runBinaryChecked } from '../binaries/spawn';
import { probeMedia } from '../binaries/ffprobe';
import { logger } from '../../server/logger';

export interface GenerateHookTtsOptions {
  text: string;
  outputPath: string;
  voice?: string;
  rate?: string;
}

export interface GenerateHookTtsResult {
  audioPath: string;
  duration: number;
}

/**
 * Generate Indonesian speech voiceover for video hook using edge-tts.
 * Produces crisp, natural voiceover identical to CapCut narration without external API keys.
 */
export async function generateHookTtsAudio(
  options: GenerateHookTtsOptions,
): Promise<GenerateHookTtsResult> {
  const { text, outputPath, voice = 'id-ID-GadisNeural', rate = '+20%' } = options;

  const sanitizedText = text.trim();
  if (!sanitizedText) {
    throw new Error('TTS text cannot be empty');
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const pythonBin = '/usr/bin/python3';
  const args = [
    '-m',
    'edge_tts',
    '--voice',
    voice,
    '--rate',
    rate,
    '--text',
    sanitizedText,
    '--write-media',
    outputPath,
  ];

  logger.info(
    `Generating TTS voiceover for hook: "${sanitizedText}" [voice=${voice}, rate=${rate}]`,
  );

  await runBinaryChecked(pythonBin, args, { timeoutMs: 30000 });

  const probe = await probeMedia(outputPath);
  const duration = probe.durationSec || 2.2;

  logger.info(`TTS voiceover generated at ${outputPath} (duration=${duration.toFixed(2)}s)`);

  return {
    audioPath: outputPath,
    duration: Number(duration.toFixed(3)),
  };
}
