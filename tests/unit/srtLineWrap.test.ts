import { describe, it, expect } from 'vitest';
import {
  wrapCueText,
  wrapSrtCues,
  renderSrt,
  formatSrtTimestamp,
  applyLeadOffset,
  MAX_CHARS,
  MIN_CUE_DURATION,
} from '@/pipeline/logic/srtLineWrap';

describe('srtLineWrap', () => {
  describe('wrapCueText', () => {
    it('returns single line for text <= 32 chars', () => {
      const lines = wrapCueText('Halo semua');
      expect(lines).toEqual(['Halo semua']);
    });

    it('wraps on word boundary at 32 chars', () => {
      const text = 'Jadi kan pertama waktu kecina gue sama sekali';
      const lines = wrapCueText(text);
      expect(lines.length).toBeGreaterThan(1);
      for (const l of lines) {
        expect(l.length).toBeLessThanOrEqual(MAX_CHARS);
      }
    });

    it('hard-cuts a single very long word with ellipsis', () => {
      const long = 'a'.repeat(50);
      const lines = wrapCueText(long);
      expect(lines[0]!.length).toBeLessThanOrEqual(MAX_CHARS);
      expect(lines[0]!.endsWith('…')).toBe(true);
    });

    it('collapses multiple spaces in input', () => {
      const lines = wrapCueText('Halo    semua   guys');
      expect(lines[0]).toBe('Halo semua guys');
    });

    it('returns max 3 lines', () => {
      const long = 'satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas';
      const lines = wrapCueText(long);
      expect(lines.length).toBeLessThanOrEqual(3);
    });

    it('marks last line with ellipsis when text still too long for 3 lines', () => {
      // 68 chars over 3 lines: full text must be kept — no ellipsis needed.
      // For a real ellipsis case we need > 96 chars (3×32).
      const text =
        'satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas dua belas tiga belas empat belas lima belas enam belas tujuh belas delapan belas sembilan belas dua puluh dua puluh satu dua puluh dua';
      const lines = wrapCueText(text);
      expect(lines.length).toBe(3);
      expect(lines[2]!.endsWith('…')).toBe(true);
    });

    it('handles empty string', () => {
      const lines = wrapCueText('   ');
      expect(lines).toEqual(['']);
    });

    it('respects custom maxChars', () => {
      const lines = wrapCueText('Halo semua guys apa kabar', 10);
      for (const l of lines) {
        expect(l.length).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('wrapCueText - clause-aware segmentation', () => {
    it('breaks on comma when both halves fit', () => {
      // "Jadi kan pertama, waktu kecina gue" (39 chars)
      // comma at pos 16 → "Jadi kan pertama," (17) + "waktu kecina gue" (16) — both <= 32
      const lines = wrapCueText('Jadi kan pertama, waktu kecina gue');
      expect(lines).toEqual(['Jadi kan pertama,', 'waktu kecina gue']);
    });

    it('breaks on period for sentence boundary', () => {
      const lines = wrapCueText('Ini kalimat pertama. Ini kalimat kedua juga');
      expect(lines[0]).toBe('Ini kalimat pertama.');
      expect(lines[1]).toBe('Ini kalimat kedua juga');
    });

    it('breaks before Indonesian conjunction "yang"', () => {
      const lines = wrapCueText('Jadi kayak masuk ke sekolah yang kayak TK');
      expect(lines[0]).toBe('Jadi kayak masuk ke sekolah');
      expect(lines[1]).toBe('yang kayak TK');
    });

    it('breaks on "karena" / "ketika" / "sehingga"', () => {
      const lines = wrapCueText('Saya marah karena dia tidak datang padahal sudah janji');
      expect(lines.some((l) => l.toLowerCase().includes('karena'))).toBe(true);
    });

    it('uses 3 lines when text requires and clauses allow', () => {
      // ~86 chars total, two natural commas → 3 balanced lines
      const text =
        'Jadi kan pertama, waktu kecina gue sama sekali gak bisa, ngomong mandarin sama orang tua gue';
      const lines = wrapCueText(text);
      expect(lines.length).toBe(3);
      for (const l of lines) {
        expect(l.length).toBeLessThanOrEqual(MAX_CHARS);
      }
    });

    it('avoids orphan word (1-word last line)', () => {
      // last word "ya" — should pull up to line 2
      const text = 'Jadi kan pertama waktu kecina, gue';
      const lines = wrapCueText(text);
      expect(lines[lines.length - 1]!.split(' ').length).toBeGreaterThan(1);
    });

    it('real bug fix: long cue with "gue sama sekali gak bisa ngomong"', () => {
      // Previously truncated to "...ngomon…". Now should produce readable 3 lines.
      const text = 'gue sama sekali gak bisa ngomong mandarin gitu ya';
      const lines = wrapCueText(text);
      // expect NO ellipsis on last line — full text visible
      const joined = lines.join(' ');
      expect(joined).not.toContain('…');
      expect(joined).toContain('ngomong mandarin gitu ya');
    });

    it('real bug fix: clause "karena kepepet kan" not split from "karena"', () => {
      const text = 'Karena kepepet kan, gue belajar sendiri dari internet';
      const lines = wrapCueText(text);
      // "karena" should not be orphaned as single-word line
      for (const l of lines) {
        expect(l.split(' ').length).toBeGreaterThan(1);
      }
    });
  });

  describe('wrapSrtCues - duration extension', () => {
    it('extends sub-MIN_DURATION cues to MIN_CUE_DURATION', () => {
      const cues = [
        { start: 0, end: 0.5, text: 'Halo' },
        { start: 5, end: 6, text: 'Next' },
      ];
      const out = wrapSrtCues(cues);
      // start=0, MIN_DURATION=1.5 → end should be 1.5
      expect(out[0]!.end).toBe(0 + MIN_CUE_DURATION);
    });

    it('does not extend past next cue start', () => {
      const cues = [
        { start: 0, end: 0.5, text: 'Halo' },
        { start: 1.0, end: 2.0, text: 'Next' }, // starts at 1.0
      ];
      const out = wrapSrtCues(cues);
      // Should stop at next cue's start (1.0) not push to 1.5
      expect(out[0]!.end).toBeLessThanOrEqual(1.0);
    });

    it('does not extend beyond MAX_LINE_DURATION cap', () => {
      const cues = [
        { start: 0, end: 0.1, text: 'Flash' },
        { start: 100, end: 101, text: 'Far away' },
      ];
      const out = wrapSrtCues(cues);
      // 0.1 + 6.0 = 6.1 cap
      expect(out[0]!.end).toBeLessThanOrEqual(6.1);
    });

    it('leaves long cues untouched', () => {
      const cues = [{ start: 0, end: 5, text: 'Long enough' }];
      const out = wrapSrtCues(cues);
      expect(out[0]!.end).toBe(5);
    });
  });

  describe('renderSrt', () => {
    it('produces valid SRT block format', () => {
      const cues = [
        { start: 0, end: 2, text: 'Halo semua', lines: ['Halo semua'] },
        { start: 2.5, end: 5, text: 'Apa kabar', lines: ['Apa kabar'] },
      ];
      const srt = renderSrt(cues);
      expect(srt).toContain('1\n00:00:00,000 --> 00:00:02,000\nHalo semua');
      expect(srt).toContain('2\n00:00:02,500 --> 00:00:05,000\nApa kabar');
    });

    it('renders multi-line cues with newline between lines', () => {
      const cues = [
        {
          start: 0,
          end: 3,
          text: 'long',
          lines: ['Jadi kan pertama', 'waktu kecina'],
        },
      ];
      const srt = renderSrt(cues);
      expect(srt).toContain('Jadi kan pertama\nwaktu kecina');
    });

    it('skips empty cues', () => {
      const cues = [
        { start: 0, end: 1, text: 'x', lines: [''] },
        { start: 1, end: 2, text: 'y', lines: ['y'] },
      ];
      const srt = renderSrt(cues);
      // Empty cue skipped; "y" becomes sequential index 1
      expect(srt).toMatch(/^1\n/);
      expect(srt).toContain('y');
    });
  });

  describe('formatSrtTimestamp', () => {
    it('formats zero', () => {
      expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    });

    it('formats minutes and seconds', () => {
      expect(formatSrtTimestamp(75.5)).toBe('00:01:15,500');
    });

    it('formats hours', () => {
      expect(formatSrtTimestamp(3661.25)).toBe('01:01:01,250');
    });

    it('clamps negative to zero', () => {
      expect(formatSrtTimestamp(-5)).toBe('00:00:00,000');
    });

    it('carries rounded ms into seconds (never emits ,1000)', () => {
      // 1.9996s rounds to 2000ms -> 00:00:02,000, not 00:00:01,1000.
      expect(formatSrtTimestamp(1.9996)).toBe('00:00:02,000');
      expect(formatSrtTimestamp(59.9996)).toBe('00:01:00,000');
      expect(formatSrtTimestamp(0.9994)).toBe('00:00:00,999');
    });
  });

  describe('constants', () => {
    it('MAX_CHARS is 32 (per user spec)', () => {
      expect(MAX_CHARS).toBe(32);
    });
    it('MIN_CUE_DURATION is 1.5s', () => {
      expect(MIN_CUE_DURATION).toBe(1.5);
    });
  });

  describe('applyLeadOffset', () => {
    it('returns input unchanged for lead <= 0', () => {
      const cues = [{ start: 0, end: 5, text: 'hi', lines: ['hi'] }];
      expect(applyLeadOffset(cues, 0)).toBe(cues);
      expect(applyLeadOffset(cues, -1)).toBe(cues);
    });

    it('returns empty for empty input', () => {
      expect(applyLeadOffset([], 2.0)).toEqual([]);
    });

    it('drops cues entirely inside the lead window', () => {
      const cues = [
        { start: 0, end: 1, text: 'a', lines: ['a'] },
        { start: 1, end: 2, text: 'b', lines: ['b'] },
        { start: 5, end: 6, text: 'c', lines: ['c'] },
      ];
      const out = applyLeadOffset(cues, 2.0);
      expect(out.map((c) => c.text)).toEqual(['c']);
    });

    it('shifts a partially-overlapping cue forward and preserves duration', () => {
      const cues = [
        { start: 0, end: 6, text: 'a', lines: ['a'] },
        { start: 7, end: 9, text: 'b', lines: ['b'] },
      ];
      const out = applyLeadOffset(cues, 2.0);
      expect(out).toEqual([
        { start: 2, end: 8, text: 'a', lines: ['a'] },
        { start: 7, end: 9, text: 'b', lines: ['b'] },
      ]);
    });

    it('keeps cues that start after the lead window unchanged', () => {
      const cues = [
        { start: 5, end: 6, text: 'a', lines: ['a'] },
        { start: 7, end: 9, text: 'b', lines: ['b'] },
      ];
      const out = applyLeadOffset(cues, 2.0);
      expect(out).toEqual(cues);
    });

    it('matches a real bug: whisper puts first cue at 0-6s before speaker starts', () => {
      // Cue 1: 0-6, Cue 2: 6-9. Lead 2s → Cue 1 → 2-8, Cue 2 stays 6-9.
      const cues = [
        { start: 0, end: 6, text: 'Jadi kan pertama', lines: ['Jadi kan pertama'] },
        { start: 6, end: 9, text: 'Jadi kita kayak', lines: ['Jadi kita kayak'] },
      ];
      const out = applyLeadOffset(cues, 2.0);
      expect(out[0]).toEqual({
        start: 2,
        end: 8,
        text: 'Jadi kan pertama',
        lines: ['Jadi kan pertama'],
      });
      expect(out[1]).toEqual({
        start: 6,
        end: 9,
        text: 'Jadi kita kayak',
        lines: ['Jadi kita kayak'],
      });
    });

    it('handles cue exactly at lead boundary', () => {
      // start=lead, end=lead+1 → no shift, but not dropped (end > lead).
      const cues = [{ start: 2, end: 3, text: 'a', lines: ['a'] }];
      const out = applyLeadOffset(cues, 2.0);
      expect(out).toEqual(cues);
    });
  });
});
