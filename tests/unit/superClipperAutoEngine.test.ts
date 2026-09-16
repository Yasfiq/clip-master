import { describe, it, expect } from 'vitest';
import { createDefaultStudioConfig } from '@/pipeline/stages/analyze';
import { evaluateCoreSegmentHook } from '@/pipeline/logic/hookDetect';
import {
  generateKaraokeAssDocument,
  groupWordsIntoPhrases,
} from '@/pipeline/logic/karaokeSubtitles';
import { WordTiming } from '@/pipeline/logic/wordChunker';

describe('Super Clipper Auto-Apply Engine', () => {
  describe('Default Studio Config for Zero-Touch Production', () => {
    it('sets default center hook position, GadisNeural voice, and top-left logo', () => {
      const config = createDefaultStudioConfig('Rahasia Bisnis Sukses', 'Raditya Dika');
      expect(config.hookPosition).toBe('center');
      expect(config.hookTtsEnabled).toBe(true);
      expect(config.hookTtsVoice).toBe('id-ID-GadisNeural');
      expect(config.logoEnabled).toBe(true);
      expect(config.logoPosition).toBe('top-left');
      expect(config.sourceEnabled).toBe(true);
      expect(config.sourceText).toBe('Sumber: Raditya Dika');
      expect(config.sourcePosition).toBe('top-right');
      expect(config.subtitleStyleId).toBe('clipajaib');
    });

    it('gracefully handles missing channel attribution', () => {
      const config = createDefaultStudioConfig('Momen Viral Pilihan', null);
      expect(config.sourceText).toBe('');
      expect(config.sourceEnabled).toBe(false);
      expect(config.hookPosition).toBe('center');
    });
  });

  describe('Core Hook Evaluation & Formatting', () => {
    it('formulates punchline from segment transcript instead of random slicing', () => {
      const transcript =
        'Kalau dipikir-pikir lagi, ternyata gak naik kelas bisa jadi bos sekarang. Menarik banget.';
      const res = evaluateCoreSegmentHook(transcript, 'Podcast Sukses');
      expect(res.score).toBeGreaterThanOrEqual(0.4);
      expect(res.headline).toMatch(/Bisa Jadi Bos/i);
    });
  });

  describe('Karaoke Active-Word Timing & Freeze Frame Synchronization', () => {
    it('synchronizes dialogue subtitles to start after dynamic freeze frame duration', () => {
      const words: WordTiming[] = [
        { text: 'Saya', start: 0.1, end: 0.4 },
        { text: 'suka', start: 0.45, end: 0.75 },
        { text: 'makan', start: 0.8, end: 1.2 },
      ];

      const freezeSec = 2.15; // Exact voiceover duration
      const shiftedWords = words.map((w) => ({
        text: w.text,
        start: Number((w.start + freezeSec).toFixed(3)),
        end: Number((w.end + freezeSec).toFixed(3)),
      }));

      const ass = generateKaraokeAssDocument({
        width: 1080,
        height: 1920,
        hookText: 'Gak Naik Kelas Bisa Jadi Bos',
        hookDuration: freezeSec,
        words: shiftedWords,
        fontName: 'Montserrat',
        activeColorHex: '&H0000EEFF', // Yellow active word
        baseColorHex: '&H00FFFFFF', // White base text
        outlineColorHex: '&H00000000', // Black outline
      });

      // 1. Hook event should span 0:00:00.00 to freezeSec
      expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:02.15,HookStyle,,0,0,0,,');
      expect(ass).toContain('Gak Naik Kelas');

      // 2. Dialogue event starts at or after freezeSec (2.25s)
      expect(ass).toContain('0:00:02.25');

      // 3. Active word is highlighted in yellow while base text is white
      expect(ass).toContain('{\\c&H0000EEFF&}Saya{\\c&H00FFFFFF&}');
      expect(ass).toContain('{\\c&H0000EEFF&}suka{\\c&H00FFFFFF&}');
      expect(ass).toContain('{\\c&H0000EEFF&}makan{\\c&H00FFFFFF&}');
    });
  });
});
