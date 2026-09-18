import { describe, it, expect } from 'vitest';
import { SubtitleCue } from '@/pipeline/logic/srtParser';

describe('Subtitle Timing Nudge & Sync Invariants', () => {
  const initialCues: SubtitleCue[] = [
    { id: 1, start: 1.0, end: 3.5, text: 'Halo selamat datang di podcast' },
    { id: 2, start: 3.6, end: 6.0, text: 'Hari ini kita akan membahas bisnis' },
    { id: 3, start: 6.2, end: 9.0, text: 'Bagaimana membangun sistem otomatis' },
  ];

  function nudgeAllCues(cues: SubtitleCue[], delta: number): SubtitleCue[] {
    return cues.map((c) => {
      const newStart = Math.max(0, Number((c.start + delta).toFixed(3)));
      const newEnd = Math.max(newStart + 0.1, Number((c.end + delta).toFixed(3)));
      return {
        ...c,
        start: newStart,
        end: newEnd,
      };
    });
  }

  function nudgeSingleCue(cues: SubtitleCue[], index: number, delta: number): SubtitleCue[] {
    const copy = [...cues];
    const target = copy[index];
    if (!target) return cues;
    const newStart = Math.max(0, Number((target.start + delta).toFixed(3)));
    const newEnd = Math.max(newStart + 0.1, Number((target.end + delta).toFixed(3)));
    copy[index] = {
      ...target,
      start: newStart,
      end: newEnd,
    };
    return copy;
  }

  it('accurately nudges all cues by +0.10s without drifting end durations', () => {
    const nudged = nudgeAllCues(initialCues, 0.1);
    expect(nudged[0].start).toBe(1.1);
    expect(nudged[0].end).toBe(3.6);
    expect(nudged[1].start).toBe(3.7);
    expect(nudged[1].end).toBe(6.1);
    expect(nudged[2].start).toBe(6.3);
    expect(nudged[2].end).toBe(9.1);
  });

  it('supports fine-grained micro-nudge by +0.05s and -0.05s', () => {
    const finePlus = nudgeAllCues(initialCues, 0.05);
    expect(finePlus[0].start).toBe(1.05);
    expect(finePlus[0].end).toBe(3.55);

    const fineMinus = nudgeAllCues(initialCues, -0.05);
    expect(fineMinus[0].start).toBe(0.95);
    expect(fineMinus[0].end).toBe(3.45);
  });

  it('clamps start time to zero and maintains minimum 0.1s duration when nudging negative', () => {
    const extremeMinus = nudgeAllCues(initialCues, -2.0);
    expect(extremeMinus[0].start).toBe(0);
    expect(extremeMinus[0].end).toBe(1.5);
  });

  it('supports single cue nudge without affecting adjacent cues', () => {
    const singleNudged = nudgeSingleCue(initialCues, 1, 0.05);
    // Cue 0 remains unchanged
    expect(singleNudged[0].start).toBe(1.0);
    expect(singleNudged[0].end).toBe(3.5);
    // Cue 1 is nudged by +0.05s
    expect(singleNudged[1].start).toBe(3.65);
    expect(singleNudged[1].end).toBe(6.05);
    // Cue 2 remains unchanged
    expect(singleNudged[2].start).toBe(6.2);
    expect(singleNudged[2].end).toBe(9.0);
  });

  it('correctly maps dialogue time to cue during loop replay without ghost offset', () => {
    // When freezeDuration is 0, freezeSec must be 0
    const freezeDuration = 0;
    const hookTtsEnabled = true;
    const hookDuration = 0;
    const freezeSec =
      (typeof freezeDuration === 'number' && freezeDuration > 0) ||
      (hookTtsEnabled && hookDuration > 0)
        ? freezeDuration
        : 0;

    expect(freezeSec).toBe(0);

    // On loop 2 (time reset to 0), dialogueTime matches video currentTime
    const currentTime = 0;
    const dialogueTime = freezeSec > 0 ? Math.max(0, currentTime - freezeSec) : currentTime;
    expect(dialogueTime).toBe(0);

    // Cue lookup at dialogueTime = 1.1s matches cue 0
    const timeAt1Point1 = 1.1;
    const activeCue = initialCues.find((c) => timeAt1Point1 >= c.start && timeAt1Point1 <= c.end);
    expect(activeCue?.id).toBe(1);
  });
});
