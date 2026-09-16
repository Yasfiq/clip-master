/**
 * Pure decision logic for AI Copywriting Generator.
 *
 * Implements anti-slop short-form copywriting for YouTube Shorts, TikTok, and Instagram Reels:
 * - Algorithmic high-CTR Title (Title Case, punchy, 3-6 words, no clickbait buzzwords).
 * - Contextual 1-2 sentence Hook Summary reflecting actual dialog.
 * - Dynamic, topic-driven hashtags (channel, guest, business, podcast, comedy, etc.).
 * - Clean creator attribution.
 *
 * No external API dependencies or network calls — 100% unit-testable.
 */

import { formatHookTitleCase } from './hookDetect';

export interface CopywritingInput {
  hookHeadline?: string;
  sourceChannel?: string | null;
  sourceTitle?: string | null;
  transcriptText?: string;
  duration?: number;
}

export interface PlatformCopywriting {
  youtubeShorts: {
    title: string;
    description: string;
  };
  tiktok: {
    caption: string;
  };
  reels: {
    caption: string;
  };
}

export interface ClipCopywriting {
  title: string;
  hookSummary: string;
  hashtags: string[];
  hashtagString: string;
  attribution: string;
  fullCaption: string;
  platforms: PlatformCopywriting;
}

const BANNED_SLOP_WORDS = [
  'unlock',
  'elevate',
  'empower',
  'delve',
  'game-changer',
  'next-level',
  'seamless',
  'cutting-edge',
  'revolutionary',
  'ushering in',
  'a new era',
  'testament to',
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  bisnis: [
    'bisnis',
    'omzet',
    'jual',
    'marketing',
    'sales',
    'usaha',
    'modal',
    'untung',
    'bos',
    'karyawan',
    'kerja',
    'uang',
  ],
  motivasi: [
    'gagal',
    'bangkit',
    'sukses',
    'belajar',
    'semangat',
    'mindset',
    'perjuangan',
    'hidup',
    'konsisten',
  ],
  finansial: ['investasi', 'saham', 'gaji', 'kaya', 'tabungan', 'keuangan', 'finansial', 'dana'],
  komedi: ['lucu', 'ngakak', 'kocak', 'ketawa', 'jokes', 'komedi', 'lawak', 'bercanda'],
  edukasi: ['tips', 'trik', 'rahasia', 'cara', 'kenapa', 'alasan', 'fakta', 'faktanya', 'ternyata'],
  hubungan: ['cinta', 'pacar', 'pasangan', 'keluarga', 'teman', 'sahabat', 'menikah'],
};

/**
 * Sanitize a string into a valid hashtag without illegal characters or spaces.
 */
export function sanitizeHashtag(tag: string): string {
  if (!tag) return '';
  const clean = tag.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
  if (!clean) return '';
  return `#${clean.toLowerCase()}`;
}

/**
 * Filter out AI buzzwords and generic filler phrases.
 */
export function cleanSlop(text: string): string {
  let result = text;
  for (const slop of BANNED_SLOP_WORDS) {
    const rx = new RegExp(`\\b${slop}\\b`, 'gi');
    result = result.replace(rx, '');
  }
  return result.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Extract 1-2 sentence natural summary from transcript without hallucination.
 */
export function extractContextualSummary(transcript?: string, fallbackHeadline?: string): string {
  const defaultFallback = () => {
    const defaultTopic = fallbackHeadline?.trim() || 'Pembahasan menarik';
    return `${defaultTopic}. Simak obrolan lengkap dan poin pentingnya di video ini.`;
  };

  if (!transcript || !transcript.trim()) {
    return defaultFallback();
  }

  const clean = cleanSlop(transcript)
    .replace(/[«»""''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Check if there are meaningful alphanumeric characters (at least 5 letters)
  const lettersOnly = clean.replace(/[^\p{L}\p{N}]/gu, '');
  if (lettersOnly.length < 5) {
    return defaultFallback();
  }

  // Break into natural sentences
  const sentences = clean
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15 && s.length <= 160);

  let result = '';
  if (sentences.length >= 2) {
    result = `${sentences[0]} ${sentences[1]}`;
  } else if (sentences.length === 1) {
    result = sentences[0];
  } else {
    // Fallback if no clean sentence boundary found
    const words = clean.split(/\s+/).slice(0, 18).join(' ');
    result = words;
  }

  // Ensure sentence ends with appropriate punctuation
  if (!/[.?!…]$/.test(result)) {
    result = `${result}.`;
  }

  return result;
}

/**
 * Detect topic-specific hashtags from text context.
 */
export function extractRelevantHashtags(
  text: string,
  sourceChannel?: string | null,
  maxTags = 7,
): string[] {
  const combined = (text || '').toLowerCase();
  const tags = new Set<string>();

  // Always include standard viral short-form tags
  tags.add('#shorts');
  tags.add('#podcast');

  // Channel tag
  if (sourceChannel && sourceChannel.trim()) {
    const channelTag = sanitizeHashtag(sourceChannel);
    if (channelTag && channelTag !== '#shorts' && channelTag !== '#podcast') {
      tags.add(channelTag);
    }
  }

  // Match topic keywords
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (tags.size >= maxTags) break;
    const match = keywords.some((kw) => combined.includes(kw));
    if (match) {
      tags.add(`#${topic}`);
    }
  }

  // Common high-traffic filler tags if under target count
  const fallbacks = ['#fyp', '#indonesia', '#inspirasi', '#viral', '#clipajaib'];
  for (const fb of fallbacks) {
    if (tags.size >= maxTags) break;
    tags.add(fb);
  }

  return Array.from(tags).slice(0, maxTags);
}

/**
 * Generate full copywriting package for a clip.
 */
export function generateClipCopywriting(input: CopywritingInput): ClipCopywriting {
  const rawHeadline = input.hookHeadline?.trim() || input.sourceTitle?.trim() || 'Momen Pilihan';
  const title = formatHookTitleCase(rawHeadline);

  const fullTextContext = `${input.hookHeadline || ''} ${input.sourceTitle || ''} ${input.transcriptText || ''}`;
  const hookSummary = extractContextualSummary(input.transcriptText, title);
  const hashtags = extractRelevantHashtags(fullTextContext, input.sourceChannel);
  const hashtagString = hashtags.join(' ');

  const channelName = input.sourceChannel?.trim();
  const attribution = channelName ? `Credit: ${channelName}` : '';

  // 1. Full Caption (All-in-One Format)
  const fullCaptionParts: string[] = [`${title} 🔥`, '', hookSummary];

  if (attribution) {
    fullCaptionParts.push('', attribution);
  }

  fullCaptionParts.push('', hashtagString);
  const fullCaption = fullCaptionParts.join('\n');

  // 2. YouTube Shorts Format
  const ytTitle = `${title} #shorts`.slice(0, 100);
  const ytDescriptionParts: string[] = [hookSummary, ''];
  if (attribution) {
    ytDescriptionParts.push(`📌 ${attribution}`, '');
  }
  ytDescriptionParts.push(hashtagString);
  const ytDescription = ytDescriptionParts.join('\n');

  // 3. TikTok Format
  const tiktokCaptionParts: string[] = [`${title} ⚡`, hookSummary];
  if (attribution) {
    tiktokCaptionParts.push(attribution);
  }
  tiktokCaptionParts.push(hashtagString);
  const tiktokCaption = tiktokCaptionParts.join('\n\n');

  // 4. Instagram Reels Format
  const reelsCaption = fullCaption;

  return {
    title,
    hookSummary,
    hashtags,
    hashtagString,
    attribution,
    fullCaption,
    platforms: {
      youtubeShorts: {
        title: ytTitle,
        description: ytDescription,
      },
      tiktok: {
        caption: tiktokCaption,
      },
      reels: {
        caption: reelsCaption,
      },
    },
  };
}
