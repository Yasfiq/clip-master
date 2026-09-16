import { describe, it, expect } from 'vitest';
import {
  generateClipCopywriting,
  extractContextualSummary,
  extractRelevantHashtags,
  sanitizeHashtag,
  cleanSlop,
} from '@/pipeline/logic/copywriting';

describe('Copywriting Generator - Edge Cases & Stress Tests', () => {
  describe('sanitizeHashtag Edge Cases', () => {
    it('handles multiple hash prefixes and weird punctuation', () => {
      expect(sanitizeHashtag('###viral!!!')).toBe('#viral');
      expect(sanitizeHashtag('###')).toBe('');
      expect(sanitizeHashtag('  #bisnis_online  ')).toBe('#bisnis_online');
    });

    it('handles non-latin characters and unicode emojis', () => {
      expect(sanitizeHashtag('podcast🎙️')).toBe('#podcast');
      expect(sanitizeHashtag('🚀fyp')).toBe('#fyp');
      expect(sanitizeHashtag(' café ')).toBe('#café');
    });

    it('handles extremely long inputs without hanging', () => {
      const longInput = 'a'.repeat(10000);
      const res = sanitizeHashtag(longInput);
      expect(res.startsWith('#')).toBe(true);
      expect(res.length).toBe(10001);
    });
  });

  describe('cleanSlop Edge Cases', () => {
    it('handles consecutive slop buzzwords without collapsing non-slop words', () => {
      const input = 'We empower to unlock seamless revolutionary solutions.';
      const cleaned = cleanSlop(input);
      expect(cleaned.toLowerCase()).not.toContain('empower');
      expect(cleaned.toLowerCase()).not.toContain('unlock');
      expect(cleaned.toLowerCase()).not.toContain('seamless');
      expect(cleaned.toLowerCase()).not.toContain('revolutionary');
      expect(cleaned).toContain('solutions.');
    });

    it('handles text containing only slop words', () => {
      const input = 'unlock elevate empower delve game-changer seamless';
      const cleaned = cleanSlop(input);
      expect(cleaned).toBe('');
    });

    it('preserves Indonesian words that contain sub-words similar to slop', () => {
      // e.g. "unlocking" vs "unlock", "delving" vs "delve"
      const input = 'Jangan pernah menyerah karena usaha tidak mengkhianati hasil.';
      expect(cleanSlop(input)).toBe(input);
    });
  });

  describe('extractContextualSummary Edge Cases', () => {
    it('handles transcript that is only punctuation or whitespace', () => {
      const summary1 = extractContextualSummary('... ??? !!! ---');
      expect(summary1.length).toBeGreaterThan(0);
      expect(summary1).toContain('Simak obrolan lengkap');

      const summary2 = extractContextualSummary('     \n\t   ');
      expect(summary2.length).toBeGreaterThan(0);
    });

    it('handles massive transcript (> 30.000 characters) quickly', () => {
      const start = Date.now();
      const largeText =
        'Ini adalah percakapan panjang sekali tentang bisnis dan strategi pemasaran. '.repeat(1000);
      const summary = extractContextualSummary(largeText, 'Bisnis Hebat');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Harus instan < 100ms
      expect(summary.length).toBeLessThan(400); // Ringkasan dibatasi 1-2 kalimat
      expect(summary).toContain('bisnis');
    });

    it('handles single sentence without punctuation cleanly', () => {
      const transcript = 'Saya memulai bisnis ini dari garasi rumah saya tanpa modal sama sekali';
      const summary = extractContextualSummary(transcript);
      expect(summary).toContain('garasi rumah');
      expect(summary.endsWith('.')).toBe(true);
    });
  });

  describe('extractRelevantHashtags Edge Cases', () => {
    it('handles mixed Indonesian slang and business terms', () => {
      const transcript = 'Cari cuan lewat omzet penjualan dan modal tipis untung gede.';
      const tags = extractRelevantHashtags(transcript, 'Raditya Dika');
      expect(tags).toContain('#bisnis');
      expect(tags).toContain('#radityadika');
      expect(tags).toContain('#shorts');
    });

    it('handles empty transcript and empty channel gracefully', () => {
      const tags = extractRelevantHashtags('', '');
      expect(tags).toContain('#shorts');
      expect(tags).toContain('#fyp');
      expect(tags).toContain('#indonesia');
      expect(tags.length).toBeGreaterThanOrEqual(3);
    });

    it('deduplicates tags and maintains max tag limit', () => {
      const transcript = 'bisnis uang modal untung lucu komedi jokes investasi saham';
      const tags = extractRelevantHashtags(transcript, 'bisnis');
      const uniqueTags = new Set(tags);
      expect(uniqueTags.size).toBe(tags.length);
      expect(tags.length).toBeLessThanOrEqual(8);
    });
  });

  describe('generateClipCopywriting Complete Integration Edge Cases', () => {
    it('generates fully formed output even when all inputs are undefined or null', () => {
      const result = generateClipCopywriting({
        hookHeadline: undefined,
        sourceChannel: null,
        sourceTitle: null,
        transcriptText: undefined,
        duration: undefined,
      });

      expect(result.title).toBeTruthy();
      expect(result.hookSummary).toBeTruthy();
      expect(result.hashtags.length).toBeGreaterThan(0);
      expect(result.hashtagString.startsWith('#')).toBe(true);
      expect(result.attribution).toBe('');
      expect(result.fullCaption).toBeTruthy();

      // Platform specific validation
      expect(result.platforms.youtubeShorts.title).toContain('#shorts');
      expect(result.platforms.youtubeShorts.description).toBeTruthy();
      expect(result.platforms.tiktok.caption).toBeTruthy();
      expect(result.platforms.reels.caption).toBeTruthy();
    });

    it('handles extreme duration (0s, negative, or huge)', () => {
      const resultZero = generateClipCopywriting({ duration: 0 });
      expect(resultZero.title).toBeTruthy();

      const resultHuge = generateClipCopywriting({ duration: 999999 });
      expect(resultHuge.title).toBeTruthy();
    });

    it('formats channel attribution properly when channel contains special characters', () => {
      const result = generateClipCopywriting({
        sourceChannel: 'Podcast & Chill (Official) 🎙️',
      });
      expect(result.attribution).toContain('Credit: Podcast & Chill (Official) 🎙️');
      expect(result.hashtags.some((t) => t.includes('podcast'))).toBe(true);
    });
  });
});
