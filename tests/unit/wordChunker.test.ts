import { describe, it, expect } from 'vitest';
import {
  chunkWords,
  renderSrt,
  splitTextIntoWordTimings,
  DEFAULT_SPEECH_PAUSE_S,
  type WordTiming,
} from '@/pipeline/logic/wordChunker';

describe('wordChunker', () => {
  describe('Strict max-words assertion', () => {
    it('creates 1 chunk for 1 to 3 words without pauses or punctuation', () => {
      const words1: WordTiming[] = [{ text: 'Halo', start: 0, end: 0.5 }];
      const cues1 = chunkWords(words1);
      expect(cues1.length).toBe(1);
      expect(cues1[0]!.text.split(/\s+/).length).toBe(1);

      const words2: WordTiming[] = [
        { text: 'Halo', start: 0, end: 0.5 },
        { text: 'dunia', start: 0.5, end: 1.0 },
      ];
      const cues2 = chunkWords(words2);
      expect(cues2.length).toBe(1);
      expect(cues2[0]!.text.split(/\s+/).length).toBe(2);

      const words3: WordTiming[] = [
        { text: 'Halo', start: 0, end: 0.5 },
        { text: 'dunia', start: 0.5, end: 1.0 },
        { text: 'semua', start: 1.0, end: 1.5 },
      ];
      const cues3 = chunkWords(words3);
      expect(cues3.length).toBe(1);
      expect(cues3[0]!.text.split(/\s+/).length).toBe(3);
    });

    it('never creates any chunk with more than 3 words', () => {
      const words10: WordTiming[] = [
        { text: 'satu', start: 0.0, end: 0.3 },
        { text: 'dua', start: 0.3, end: 0.6 },
        { text: 'tiga', start: 0.6, end: 0.9 },
        { text: 'empat', start: 0.9, end: 1.2 },
        { text: 'lima', start: 1.2, end: 1.5 },
        { text: 'enam', start: 1.5, end: 1.8 },
        { text: 'tujuh', start: 1.8, end: 2.1 },
        { text: 'delapan', start: 2.1, end: 2.4 },
        { text: 'sembilan', start: 2.4, end: 2.7 },
        { text: 'sepuluh', start: 2.7, end: 3.0 },
      ];

      const cues = chunkWords(words10, 3);
      expect(cues.length).toBe(4); // 3, 3, 3, 1

      for (const cue of cues) {
        const wordCount = cue.text.trim().split(/\s+/).length;
        expect(wordCount).toBeGreaterThanOrEqual(1);
        expect(wordCount).toBeLessThanOrEqual(3);
      }
    });

    it('enforces <= 3 words across a long 50-word stream', () => {
      const words50: WordTiming[] = Array.from({ length: 50 }, (_, i) => ({
        text: `kata${i + 1}`,
        start: i * 0.4,
        end: i * 0.4 + 0.35,
      }));

      const cues = chunkWords(words50, 3);
      expect(cues.length).toBe(Math.ceil(50 / 3));

      for (const cue of cues) {
        const count = cue.text.trim().split(/\s+/).length;
        expect(count).toBeLessThanOrEqual(3);
      }
    });

    it('respects custom maxWordsPerChunk bounds (e.g. 2 or 1)', () => {
      const words: WordTiming[] = [
        { text: 'satu', start: 0, end: 0.3 },
        { text: 'dua', start: 0.3, end: 0.6 },
        { text: 'tiga', start: 0.6, end: 0.9 },
        { text: 'empat', start: 0.9, end: 1.2 },
      ];

      const cuesMax2 = chunkWords(words, 2);
      expect(cuesMax2.length).toBe(2);
      for (const c of cuesMax2) {
        expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(2);
      }

      const cuesMax1 = chunkWords(words, 1);
      expect(cuesMax1.length).toBe(4);
      for (const c of cuesMax1) {
        expect(c.text.split(/\s+/).length).toBe(1);
      }
    });
  });

  describe('Word timestamp preservation', () => {
    it('sets start of first word and end of last word for each chunk', () => {
      const words: WordTiming[] = [
        { text: 'satu', start: 1.25, end: 1.5 },
        { text: 'dua', start: 1.5, end: 1.85 },
        { text: 'tiga', start: 1.85, end: 2.1 },
        { text: 'empat', start: 2.15, end: 2.6 },
        { text: 'lima', start: 2.6, end: 3.12 },
      ];

      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(2);

      // Chunk 1: 'satu dua tiga' -> start 1.25, end 2.10
      expect(cues[0]!.start).toBe(1.25);
      expect(cues[0]!.end).toBe(2.1);
      expect(cues[0]!.text).toBe('Satu dua tiga');

      // Chunk 2: 'empat lima' -> start 2.15, end 3.12
      expect(cues[1]!.start).toBe(2.15);
      expect(cues[1]!.end).toBe(3.12);
      expect(cues[1]!.text).toBe('empat lima');
    });

    it('preserves exact single word timestamps', () => {
      const words: WordTiming[] = [{ text: 'sendirian', start: 10.456, end: 11.234 }];
      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(1);
      expect(cues[0]!.start).toBe(10.456);
      expect(cues[0]!.end).toBe(11.234);
      expect(cues[0]!.text).toBe('Sendirian');
    });
  });

  describe('Pause splitting behavior', () => {
    it('breaks chunk early on speech pause > 0.35s', () => {
      const words: WordTiming[] = [
        { text: 'halo', start: 1.0, end: 1.5 },
        // gap between 1.5 and 2.0 is 0.5s > 0.35s
        { text: 'teman', start: 2.0, end: 2.4 },
      ];

      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Halo');
      expect(cues[0]!.start).toBe(1.0);
      expect(cues[0]!.end).toBe(1.5);

      expect(cues[1]!.text).toBe('teman');
      expect(cues[1]!.start).toBe(2.0);
      expect(cues[1]!.end).toBe(2.4);
    });

    it('keeps words in same chunk when speech pause <= 0.35s', () => {
      const words: WordTiming[] = [
        { text: 'halo', start: 1.0, end: 1.5 },
        // gap between 1.5 and 1.8 is 0.30s <= 0.35s
        { text: 'teman', start: 1.8, end: 2.2 },
      ];

      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(1);
      expect(cues[0]!.text).toBe('Halo teman');
      expect(cues[0]!.start).toBe(1.0);
      expect(cues[0]!.end).toBe(2.2);
    });

    it('respects exact 0.35s boundary (0.35 keeps, 0.36 splits)', () => {
      const wordsBoundaryKeep: WordTiming[] = [
        { text: 'kata1', start: 0, end: 1.0 },
        { text: 'kata2', start: 1.35, end: 2.0 }, // gap exactly 0.35
      ];
      expect(chunkWords(wordsBoundaryKeep, 3).length).toBe(1);

      const wordsBoundarySplit: WordTiming[] = [
        { text: 'kata1', start: 0, end: 1.0 },
        { text: 'kata2', start: 1.36, end: 2.0 }, // gap 0.36 > 0.35
      ];
      expect(chunkWords(wordsBoundarySplit, 3).length).toBe(2);
    });
  });

  describe('Punctuation splitting behavior', () => {
    it('breaks chunk early on period (.)', () => {
      const words: WordTiming[] = [
        { text: 'selesai.', start: 0.0, end: 0.5 },
        { text: 'lanjut', start: 0.55, end: 1.0 },
      ];
      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Selesai.');
      expect(cues[1]!.text).toBe('Lanjut'); // sentence casing applied after period
    });

    it('breaks chunk early on comma (,)', () => {
      const words: WordTiming[] = [
        { text: 'pertama,', start: 0.0, end: 0.5 },
        { text: 'kedua', start: 0.55, end: 1.0 },
      ];
      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Pertama,');
      expect(cues[1]!.text).toBe('kedua'); // no uppercase after comma
    });

    it('breaks chunk early on question mark (?)', () => {
      const words: WordTiming[] = [
        { text: 'kenapa?', start: 0.0, end: 0.5 },
        { text: 'karena', start: 0.55, end: 1.0 },
      ];
      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Kenapa?');
      expect(cues[1]!.text).toBe('Karena'); // sentence casing after question mark
    });

    it('breaks chunk early on exclamation mark (!)', () => {
      const words: WordTiming[] = [
        { text: 'keren!', start: 0.0, end: 0.5 },
        { text: 'banget', start: 0.55, end: 1.0 },
      ];
      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Keren!');
      expect(cues[1]!.text).toBe('Banget'); // sentence casing after exclamation mark
    });

    it('handles punctuation with trailing quotation marks', () => {
      const words: WordTiming[] = [
        { text: 'katanya,"', start: 0.0, end: 0.5 },
        { text: 'lalu', start: 0.55, end: 1.0 },
      ];
      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Katanya,"');
    });

    it('handles standalone punctuation token', () => {
      const words: WordTiming[] = [
        { text: 'halo', start: 0.0, end: 0.4 },
        { text: ',', start: 0.4, end: 0.5 },
        { text: 'dunia', start: 0.55, end: 1.0 },
      ];
      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Halo ,');
      expect(cues[1]!.text).toBe('dunia');
    });
  });

  describe('Empty and edge cases', () => {
    it('returns empty array when given empty words and no fallback', () => {
      expect(chunkWords([])).toEqual([]);
    });

    it('handles fallback string when words is empty', () => {
      const fallback = 'satu dua tiga empat lima';
      const cues = chunkWords([], 3, fallback, 0, 5);
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Satu dua tiga');
      expect(cues[0]!.start).toBe(0);
      expect(cues[0]!.end).toBe(3);

      expect(cues[1]!.text).toBe('empat lima');
      expect(cues[1]!.start).toBe(3);
      expect(cues[1]!.end).toBe(5);
    });

    it('handles fallback options object when words is empty', () => {
      const cues = chunkWords([], 3, { text: 'halo dunia kabar baik', start: 2, end: 6 });
      expect(cues.length).toBe(2);
      expect(cues[0]!.text).toBe('Halo dunia kabar');
      expect(cues[0]!.start).toBe(2);
      expect(cues[0]!.end).toBe(5);
      expect(cues[1]!.text).toBe('baik');
      expect(cues[1]!.start).toBe(5);
      expect(cues[1]!.end).toBe(6);
    });

    it('filters out whitespace-only or empty word tokens', () => {
      const words: WordTiming[] = [
        { text: '   ', start: 0, end: 0.2 },
        { text: 'halo', start: 0.2, end: 0.6 },
        { text: '', start: 0.6, end: 0.8 },
      ];
      const cues = chunkWords(words, 3);
      expect(cues.length).toBe(1);
      expect(cues[0]!.text).toBe('Halo');
      expect(cues[0]!.start).toBe(0.2);
      expect(cues[0]!.end).toBe(0.6);
    });

    it('splitTextIntoWordTimings creates evenly distributed word timings', () => {
      const timings = splitTextIntoWordTimings('satu dua tiga empat', 0, 4);
      expect(timings.length).toBe(4);
      expect(timings[0]).toEqual({ text: 'satu', start: 0, end: 1 });
      expect(timings[1]).toEqual({ text: 'dua', start: 1, end: 2 });
      expect(timings[2]).toEqual({ text: 'tiga', start: 2, end: 3 });
      expect(timings[3]).toEqual({ text: 'empat', start: 3, end: 4 });
    });

    it('splitTextIntoWordTimings handles empty string', () => {
      expect(splitTextIntoWordTimings('')).toEqual([]);
      expect(splitTextIntoWordTimings('   ')).toEqual([]);
    });

    it('renderSrt formats standard SRT structure correctly', () => {
      const cues = [
        { start: 0.0, end: 1.5, text: 'Halo dunia' },
        { start: 1.5, end: 3.25, text: 'Apa kabar semua' },
      ];
      const srt = renderSrt(cues);
      expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\nHalo dunia');
      expect(srt).toContain('2\n00:00:01,500 --> 00:00:03,250\nApa kabar semua');
    });
  });
});
