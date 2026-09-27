/**
 * Vector Rounded Pill Branding Badge Generator.
 *
 * Produces crisp, anti-aliased SVG rounded pill capsules for source attribution:
 * - Rounded pill rectangle (<rect rx="24" ry="24" fill="white" fill-opacity="0.88"/>)
 * - Typography in Montserrat / DejaVu Sans Bold, charcoal dark fill (#1a1a1a)
 * - Safe XML character escaping
 * - Dynamic width computation based on text length to prevent overflow or clipped text
 */

import fs from 'fs/promises';
import path from 'path';

export interface SourcePillOptions {
  sourceText: string;
  fontSize?: number;
  height?: number;
  fillColor?: string;
  fillOpacity?: number;
  textColor?: string;
  fontFamily?: string;
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateSourcePillSvg(options: SourcePillOptions): string {
  const text = (options.sourceText || '').trim();
  const fontSize = options.fontSize ?? 20;
  const height = options.height ?? 50;
  const pillPaddingX = 24;

  const estimatedTextWidth = Math.ceil(text.length * (fontSize * 0.62));
  const pillWidth = Math.max(160, estimatedTextWidth + pillPaddingX * 2);
  const rx = Math.round(height / 2);
  const ry = rx;
  const svgWidth = pillWidth + 20;
  const svgHeight = height + 10;
  const textX = Math.round(pillWidth / 2);
  const textY = Math.round(height / 2 + fontSize * 0.35 + 5);

  const fill = options.fillColor ?? 'white';
  const fillOpacity = options.fillOpacity ?? 0.88;
  const textColor = options.textColor ?? '#1a1a1a';
  const fontFamily = options.fontFamily ?? 'Montserrat, DejaVu Sans, sans-serif';

  return `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="5" width="${pillWidth}" height="${height}" rx="${rx}" ry="${ry}" fill="${fill}" fill-opacity="${fillOpacity}"/>
  <text x="${textX}" y="${textY}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="bold" fill="${textColor}" text-anchor="middle">${escapeXml(text)}</text>
</svg>`;
}

export async function writeSourcePillSvg(
  outputPath: string,
  options: SourcePillOptions,
): Promise<string> {
  const svg = generateSourcePillSvg(options);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, svg, 'utf8');
  return outputPath;
}
