import { describe, it, expect } from 'vitest';
import {
  formatToTitleCase,
  wrapHookHeadlineAss,
  wrapDialogueLinesAss,
  chunkConversationalWords,
  formatAssTime,
  generateUnifiedAssDocument,
} from '../../src/pipeline/logic/conversationalCaptions';
import { WordTiming } from '../../src/pipeline/logic/wordChunker';

describe('conversationalCaptions', () => {
  describe('formatToTitleCase', () => {
    it('converts uppercase titles to clean title case with Indonesian minor words lowercase', () => {
      expect(formatToTitleCase('KEBEBASAN ADALAH SEGALANYA')).toBe('Kebebasan Adalah Segalanya');
      expect(formatToTitleCase('RAHASIA SUKSES DI ERA DIGITAL')).toBe(
        'Rahasia Sukses di Era Digital',
      );
    });
  });

  describe('wrapHookHeadlineAss', () => {
    it('splits longer headlines into two balanced lines using \\N', () => {
      const wrapped = wrapHookHeadlineAss('Kebebasan Adalah Segalanya');
      expect(wrapped).toBe('Kebebasan Adalah\\NSegalanya');
    });

    it('keeps short headlines on a single line', () => {
      const wrapped = wrapHookHeadlineAss('Bebas Finansial');
      expect(wrapped).toBe('Bebas Finansial');
    });
  });

  describe('wrapDialogueLinesAss', () => {
    it('wraps dialogue text at reasonable character bounds', () => {
      const text = '- Kalo ga aneh-aneh gitu maksudnya dikasih 2 pilihan';
      const wrapped = wrapDialogueLinesAss(text, 28);
      expect(wrapped).toContain('\\N');
    });
  });

  describe('chunkConversationalWords', () => {
    it('groups words into conversational clauses with dialogue indicators', () => {
      const words: WordTiming[] = [
        { text: 'Kalo', start: 3.18, end: 3.38 },
        { text: 'ga', start: 3.38, end: 3.55 },
        { text: 'aneh-aneh', start: 3.55, end: 4.1 },
        { text: 'gitu', start: 4.1, end: 4.3 },
        { text: 'maksudnya.', start: 4.3, end: 4.8 },
        { text: 'Dikasih', start: 5.2, end: 5.5 },
        { text: 'dua', start: 5.5, end: 5.7 },
        { text: 'pilihan', start: 5.7, end: 6.1 },
        { text: 'sama', start: 6.1, end: 6.3 },
        { text: 'bokap.', start: 6.3, end: 6.8 },
      ];

      const cues = chunkConversationalWords(words, {
        minWordsPerChunk: 3,
        maxWordsPerChunk: 8,
        addDialogueIndicator: true,
      });

      expect(cues.length).toBe(2);
      expect(cues[0].text).toMatch(/^- Kalo ga aneh-aneh gitu maksudnya\./);
      expect(cues[1].text).toMatch(/^- Dikasih dua pilihan sama bokap\./);
      expect(cues[0].start).toBe(3.18);
      expect(cues[0].end).toBe(4.8);
    });
  });

  describe('formatAssTime', () => {
    it('formats seconds to H:MM:SS.cc correctly', () => {
      expect(formatAssTime(0)).toBe('0:00:00.00');
      expect(formatAssTime(3.18)).toBe('0:00:03.18');
      expect(formatAssTime(65.42)).toBe('0:01:05.42');
      expect(formatAssTime(3661.05)).toBe('1:01:01.05');
    });
  });

  describe('generateUnifiedAssDocument', () => {
    it('creates complete ASS document with HookStyle and DialogueStyle', () => {
      const ass = generateUnifiedAssDocument({
        width: 1080,
        height: 1920,
        hookText: 'KEBEBASAN ADALAH SEGALANYA',
        hookDuration: 3.1,
        dialogueCues: [
          {
            start: 3.18,
            end: 5.2,
            text: '- Kalo ga aneh-aneh gitu maksudnya.',
          },
        ],
      });

      expect(ass).toContain('[Script Info]');
      expect(ass).toContain('PlayResX: 1080');
      expect(ass).toContain('PlayResY: 1920');
      expect(ass).toContain('Style: HookStyle');
      expect(ass).toContain('Style: DialogueStyle');
      expect(ass).toContain('Alignment, MarginL, MarginR, MarginV');
      // HookStyle alignment is 5 (middle center)
      expect(ass).toMatch(/Style: HookStyle,Montserrat,72,&H0000E6FF.*,5,/);
      // DialogueStyle alignment is 2 (bottom center) with MarginV 615
      expect(ass).toMatch(/Style: DialogueStyle,Montserrat,50,&H0000E6FF.*,2,40,40,615/);
      expect(ass).toContain(
        'Dialogue: 0,0:00:00.00,0:00:03.10,HookStyle,,0,0,0,,Kebebasan Adalah\\NSegalanya',
      );
      expect(ass).toContain('Dialogue: 0,0:00:03.18,0:00:05.20,DialogueStyle');
    });
  });
});
