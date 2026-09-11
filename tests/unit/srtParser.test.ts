import { describe, it, expect } from 'vitest';
import {
  parseSrt,
  serializeSrt,
  validateCues,
  formatSrtTimestamp,
  SubtitleCue,
} from '../../src/pipeline/logic/srtParser';

describe('srtParser', () => {
  it('formats seconds to standard SRT timestamps correctly', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    expect(formatSrtTimestamp(1.25)).toBe('00:00:01,250');
    expect(formatSrtTimestamp(65.5)).toBe('00:01:05,500');
    expect(formatSrtTimestamp(3661.042)).toBe('01:01:01,042');
  });

  it('parses standard SRT text into SubtitleCue items', () => {
    const srt = `1
00:00:01,200 --> 00:00:03,450
Halo semuanya, apa kabar?

2
00:00:04,100 --> 00:00:06,800
Hari ini kita bahas
bisnis kopi kekinian.
`;

    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);

    expect(cues[0].id).toBe(1);
    expect(cues[0].start).toBeCloseTo(1.2, 2);
    expect(cues[0].end).toBeCloseTo(3.45, 2);
    expect(cues[0].text).toBe('Halo semuanya, apa kabar?');

    expect(cues[1].id).toBe(2);
    expect(cues[1].start).toBeCloseTo(4.1, 2);
    expect(cues[1].end).toBeCloseTo(6.8, 2);
    expect(cues[1].text).toBe('Hari ini kita bahas\nbisnis kopi kekinian.');
  });

  it('handles CRLF line breaks and dot millisecond separators', () => {
    const srt =
      '1\r\n00:00:00.500 --> 00:00:02.000\r\nBaris satu\r\n\r\n2\r\n00:00:02.500 --> 00:00:04.000\r\nBaris dua\r\n';
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(0.5);
    expect(cues[0].end).toBe(2.0);
    expect(cues[0].text).toBe('Baris satu');
  });

  it('serializes cues to valid SRT and preserves round-trip fidelity', () => {
    const inputCues: SubtitleCue[] = [
      { id: 1, start: 1.5, end: 3.25, text: 'Halo dunia' },
      { id: 2, start: 3.5, end: 5.0, text: 'Ini pengujian kedua' },
    ];

    const srtOutput = serializeSrt(inputCues);
    const reparsed = parseSrt(srtOutput);

    expect(reparsed).toHaveLength(2);
    expect(reparsed[0].start).toBeCloseTo(1.5, 3);
    expect(reparsed[0].end).toBeCloseTo(3.25, 3);
    expect(reparsed[0].text).toBe('Halo dunia');
    expect(reparsed[1].start).toBeCloseTo(3.5, 3);
    expect(reparsed[1].end).toBeCloseTo(5.0, 3);
    expect(reparsed[1].text).toBe('Ini pengujian kedua');
  });

  it('validates cue list correctly', () => {
    const validCues: SubtitleCue[] = [
      { id: 1, start: 0.5, end: 2.0, text: 'Valid satu' },
      { id: 2, start: 2.5, end: 4.0, text: 'Valid dua' },
    ];
    expect(validateCues(validCues)).toBeNull();

    expect(validateCues(null as unknown as SubtitleCue[])).toBe('Cues must be an array');
    expect(validateCues([{ id: 1, start: -1, end: 2, text: 'Error' }])).toContain(
      'start time must be a non-negative number',
    );
    expect(validateCues([{ id: 1, start: 3, end: 2, text: 'Error' }])).toContain(
      'end time must be greater than start time',
    );
    expect(validateCues([{ id: 1, start: 1, end: 2, text: '   ' }])).toContain(
      'cue text cannot be empty',
    );

    const nonChronological: SubtitleCue[] = [
      { id: 1, start: 5, end: 6, text: 'Dua' },
      { id: 2, start: 2, end: 3, text: 'Satu' },
    ];
    expect(validateCues(nonChronological)).toContain('chronological order');
  });
});
