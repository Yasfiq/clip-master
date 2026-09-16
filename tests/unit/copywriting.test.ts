import { describe, it, expect } from 'vitest';
import {
  sanitizeHashtag,
  cleanSlop,
  extractContextualSummary,
  extractRelevantHashtags,
  generateClipCopywriting,
} from '@/pipeline/logic/copywriting';

describe('Copywriting Generator Logic', () => {
  describe('sanitizeHashtag', () => {
    it('cleans hashtag prefixes and spaces', () => {
      expect(sanitizeHashtag('##Raditya Dika')).toBe('#radityadika');
      expect(sanitizeHashtag('Ivan Tanjaya!')).toBe('#ivantanjaya');
      expect(sanitizeHashtag('podcast-indonesia')).toBe('#podcastindonesia');
    });

    it('handles empty or whitespace inputs gracefully', () => {
      expect(sanitizeHashtag('')).toBe('');
      expect(sanitizeHashtag('   ')).toBe('');
    });
  });

  describe('cleanSlop', () => {
    it('strips empty AI buzzwords without damaging surrounding text', () => {
      const slop = 'Unlock your potential to elevate your business with cutting-edge strategies';
      const cleaned = cleanSlop(slop);
      expect(cleaned.toLowerCase()).not.toContain('unlock');
      expect(cleaned.toLowerCase()).not.toContain('elevate');
      expect(cleaned.toLowerCase()).not.toContain('cutting-edge');
      expect(cleaned).toContain('business');
      expect(cleaned).toContain('strategies');
    });
  });

  describe('extractContextualSummary', () => {
    it('extracts natural sentences from spoken dialogue', () => {
      const transcript =
        'Gak naik kelas itu waktu dulu bikin sedih banget. Tapi dari situ gue belajar cara membangun mental kerja keras.';
      const summary = extractContextualSummary(transcript);
      expect(summary).toContain('Gak naik kelas');
      expect(summary).toContain('mental kerja keras');
    });

    it('falls back to headline-based sentence when transcript is empty', () => {
      const summary = extractContextualSummary('', 'Rahasia Sukses');
      expect(summary).toContain('Rahasia Sukses');
    });
  });

  describe('extractRelevantHashtags', () => {
    it('detects business and financial topic keywords', () => {
      const tags = extractRelevantHashtags(
        'Cara membangun bisnis dengan modal kecil dan omzet besar',
        'Raditya Dika',
      );
      expect(tags).toContain('#shorts');
      expect(tags).toContain('#podcast');
      expect(tags).toContain('#radityadika');
      expect(tags).toContain('#bisnis');
    });

    it('detects comedy keywords', () => {
      const tags = extractRelevantHashtags(
        'Cerita lucu dan kocak bikin ngakak bareng teman',
        'Sule Channel',
      );
      expect(tags).toContain('#komedi');
    });
  });

  describe('generateClipCopywriting', () => {
    it('generates a complete copywriting package formatted for YouTube Shorts and TikTok', () => {
      const res = generateClipCopywriting({
        hookHeadline: 'Gak Naik Kelas Bisa Jadi Bos',
        sourceChannel: 'Raditya Dika',
        sourceTitle: 'Podcast Bersama Ivan Tanjaya',
        transcriptText:
          'Gak naik kelas bukan akhir dari segalanya. Ivan Tanjaya membuktikan konsistensi kerja keras bisa mengubah nasib.',
      });

      expect(res.title).toBe('Gak Naik Kelas Bisa Jadi Bos');
      expect(res.attribution).toBe('Credit: Raditya Dika');
      expect(res.hashtags).toContain('#shorts');
      expect(res.hashtags).toContain('#radityadika');
      expect(res.fullCaption).toContain('Gak Naik Kelas Bisa Jadi Bos 🔥');
      expect(res.fullCaption).toContain('Credit: Raditya Dika');
      expect(res.fullCaption).toContain('#shorts');

      // Platform specific outputs
      expect(res.platforms.youtubeShorts.title).toBe('Gak Naik Kelas Bisa Jadi Bos #shorts');
      expect(res.platforms.youtubeShorts.description).toContain('Credit: Raditya Dika');
      expect(res.platforms.tiktok.caption).toContain('#radityadika');
      expect(res.platforms.reels.caption).toBe(res.fullCaption);
    });

    it('handles missing sourceChannel without generating empty credit', () => {
      const res = generateClipCopywriting({
        hookHeadline: 'Momen Viral Pilihan',
        transcriptText: 'Simak obrolan menarik ini sampai tuntas.',
      });

      expect(res.attribution).toBe('');
      expect(res.fullCaption).not.toContain('Credit:');
    });
  });
});
