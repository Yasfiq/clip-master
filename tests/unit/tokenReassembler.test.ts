import { describe, it, expect } from 'vitest';
import {
  reassembleWhisperTokens,
  parseWhisperTranscriptJson,
  type RawWhisperToken,
} from '@/pipeline/logic/tokenReassembler';
import { chunkWords } from '@/pipeline/logic/wordChunker';

describe('tokenReassembler', () => {
  it('reassembles multi-syllable BPE tokens into a single word (e.g. "beneran")', () => {
    // " Ben" + "er" + "an" + ","
    const tokens: RawWhisperToken[] = [
      { text: ' Ben', offsets: { from: 421410, to: 421540 } },
      { text: 'er', offsets: { from: 421540, to: 421630 } },
      { text: 'an', offsets: { from: 421630, to: 421710 } },
      { text: ',', offsets: { from: 421720, to: 421810 } },
    ];

    const words = reassembleWhisperTokens(tokens);
    expect(words).toHaveLength(1);
    expect(words[0]!.text).toBe('Beneran,');
    expect(words[0]!.start).toBeCloseTo(421.41);
    expect(words[0]!.end).toBeCloseTo(421.81);
  });

  it('reassembles conversational sentence with Indonesian words ("ngobrol bersama Ivan Tanjaya")', () => {
    const tokens: RawWhisperToken[] = [
      { text: ' Hari', offsets: { from: 80, to: 300 } },
      { text: ' ini', offsets: { from: 300, to: 520 } },
      { text: ' kita', offsets: { from: 520, to: 810 } },
      { text: ' ng', offsets: { from: 820, to: 960 } },
      { text: 'ob', offsets: { from: 970, to: 1120 } },
      { text: 'rol', offsets: { from: 1120, to: 1340 } },
      { text: ' bers', offsets: { from: 1340, to: 1590 } },
      { text: 'ama', offsets: { from: 1670, to: 1860 } },
      { text: ' Ivan', offsets: { from: 1860, to: 2160 } },
      { text: ' Tan', offsets: { from: 2160, to: 2380 } },
      { text: 'j', offsets: { from: 2380, to: 2450 } },
      { text: 'aya', offsets: { from: 2450, to: 2670 } },
      { text: ',', offsets: { from: 2670, to: 2870 } },
    ];

    const words = reassembleWhisperTokens(tokens);
    expect(words).toHaveLength(7);
    expect(words.map((w) => w.text)).toEqual([
      'Hari',
      'ini',
      'kita',
      'ngobrol',
      'bersama',
      'Ivan',
      'Tanjaya,',
    ]);
    expect(words[3]!.text).toBe('ngobrol');
    expect(words[3]!.start).toBeCloseTo(0.82);
    expect(words[3]!.end).toBeCloseTo(1.34);

    expect(words[4]!.text).toBe('bersama');
    expect(words[4]!.start).toBeCloseTo(1.34);
    expect(words[4]!.end).toBeCloseTo(1.86);

    expect(words[6]!.text).toBe('Tanjaya,');
    expect(words[6]!.start).toBeCloseTo(2.16);
    expect(words[6]!.end).toBeCloseTo(2.87);
  });

  it('filters dialogue turn dashes (" -") and skips control tokens', () => {
    const tokens: RawWhisperToken[] = [
      { text: '[_BEG_]', offsets: { from: 0, to: 0 } },
      { text: ' -', offsets: { from: 420520, to: 420520 } },
      { text: ' Si', offsets: { from: 420560, to: 420610 } },
      { text: 'ap', offsets: { from: 420610, to: 420700 } },
      { text: ',', offsets: { from: 420700, to: 420790 } },
      { text: ' si', offsets: { from: 420790, to: 420880 } },
      { text: 'ap', offsets: { from: 420880, to: 420970 } },
      { text: ',', offsets: { from: 420970, to: 421060 } },
      { text: ' si', offsets: { from: 421060, to: 421150 } },
      { text: 'ap', offsets: { from: 421150, to: 421240 } },
      { text: '.', offsets: { from: 421240, to: 421370 } },
      { text: ' -', offsets: { from: 421370, to: 421410 } },
      { text: ' Ben', offsets: { from: 421410, to: 421540 } },
      { text: 'er', offsets: { from: 421540, to: 421630 } },
      { text: 'an', offsets: { from: 421630, to: 421710 } },
      { text: '.', offsets: { from: 421710, to: 421800 } },
    ];

    const words = reassembleWhisperTokens(tokens);
    expect(words).toHaveLength(4);
    expect(words.map((w) => w.text)).toEqual(['Siap,', 'siap,', 'siap.', 'Beneran.']);

    // When piped to wordChunker, commas break clauses cleanly
    const cues = chunkWords(words, 3);
    expect(cues).toHaveLength(4);
    expect(cues[0]!.text).toBe('Siap,');
    expect(cues[1]!.text).toBe('siap,');
    expect(cues[2]!.text).toBe('siap.');
    expect(cues[3]!.text).toBe('Beneran.');
  });

  it('preserves hyphens in Indonesian reduplication words (e.g. "jalan-jalan", "anak-anak")', () => {
    const tokens: RawWhisperToken[] = [
      { text: ' Kita', offsets: { from: 100, to: 300 } },
      { text: ' jalan', offsets: { from: 300, to: 600 } },
      { text: '-', offsets: { from: 600, to: 650 } },
      { text: 'jalan', offsets: { from: 650, to: 950 } },
      { text: ' bersama', offsets: { from: 950, to: 1200 } },
      { text: ' anak', offsets: { from: 1200, to: 1400 } },
      { text: '-', offsets: { from: 1400, to: 1450 } },
      { text: ' anak', offsets: { from: 1450, to: 1700 } },
    ];

    const words = reassembleWhisperTokens(tokens);
    expect(words).toHaveLength(4);
    expect(words.map((w) => w.text)).toEqual(['Kita', 'jalan-jalan', 'bersama', 'anak-anak']);
    expect(words[1]!.start).toBeCloseTo(0.3);
    expect(words[1]!.end).toBeCloseTo(0.95);
    expect(words[3]!.start).toBeCloseTo(1.2);
    expect(words[3]!.end).toBeCloseTo(1.7);
  });

  it('handles first token without leading space properly', () => {
    const tokens: RawWhisperToken[] = [
      { text: 'Halo', offsets: { from: 0, to: 500 } },
      { text: ' dunia', offsets: { from: 500, to: 1000 } },
    ];

    const words = reassembleWhisperTokens(tokens);
    expect(words).toHaveLength(2);
    expect(words[0]!.text).toBe('Halo');
    expect(words[1]!.text).toBe('dunia');
  });

  it('handles empty or undefined token lists safely', () => {
    expect(reassembleWhisperTokens([])).toEqual([]);
    expect(reassembleWhisperTokens(undefined as any)).toEqual([]);
  });

  describe('parseWhisperTranscriptJson', () => {
    it('parses raw whisper-cli json with transcription segments and tokens', () => {
      const raw = {
        result: { language: 'id' },
        transcription: [
          {
            offsets: { from: 1000, to: 3000 },
            text: ' Halo dunia',
            tokens: [
              { text: ' Halo', offsets: { from: 1000, to: 1800 } },
              { text: ' dunia', offsets: { from: 1900, to: 2800 } },
            ],
          },
        ],
      };

      const parsed = parseWhisperTranscriptJson(raw);
      expect(parsed.language).toBe('id');
      expect(parsed.segments).toHaveLength(1);
      expect(parsed.segments[0]!.start).toBe(1.0);
      expect(parsed.segments[0]!.end).toBe(3.0);
      expect(parsed.segments[0]!.text).toBe('Halo dunia');
      expect(parsed.segments[0]!.words).toHaveLength(2);
      expect(parsed.segments[0]!.words![0]!.text).toBe('Halo');
      expect(parsed.segments[0]!.words![0]!.start).toBe(1.0);
      expect(parsed.segments[0]!.words![1]!.text).toBe('dunia');
      expect(parsed.text).toBe('Halo dunia');
    });

    it('returns pre-normalized transcript as-is', () => {
      const normalized = {
        segments: [{ start: 0, end: 5, text: 'Sudah normal', words: [] }],
        language: 'id',
        text: 'Sudah normal',
      };
      const parsed = parseWhisperTranscriptJson(normalized);
      expect(parsed.segments).toHaveLength(1);
      expect(parsed.text).toBe('Sudah normal');
      expect(parsed.language).toBe('id');
    });

    it('handles empty or invalid inputs safely', () => {
      expect(parseWhisperTranscriptJson(null)).toEqual({ segments: [], language: null, text: '' });
      expect(parseWhisperTranscriptJson({})).toEqual({ segments: [], language: null, text: '' });
    });
  });
});
