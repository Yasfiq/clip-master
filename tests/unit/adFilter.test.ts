import { describe, it, expect } from 'vitest';
import {
  evaluateAd,
  DEFAULT_AD_THRESHOLD,
  AD_WEIGHTS,
  type AdSignals,
} from '../../src/pipeline/logic/adFilter';

/** Minimal clean signal set: long video, neutral title, no visual/audio hints. */
function baseSignals(overrides: Partial<AdSignals> = {}): AdSignals {
  return {
    title: 'Podcast Episode 12 - Membangun Kebiasaan Belajar',
    description: 'Obrolan panjang soal disiplin dan rutinitas harian.',
    durationSec: 3600,
    ...overrides,
  };
}

describe('adFilter weights', () => {
  it('signal weights sum to 1.0', () => {
    const total = Object.values(AD_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });
});

describe('evaluateAd - pure advertisement rejection', () => {
  it('rejects a short, uniform, CTA-heavy sponsored clip', () => {
    const verdict = evaluateAd(
      baseSignals({
        title: 'SPONSORED - Promo Sepatu Baru #ad',
        description: 'Paid partnership dengan brand lokal',
        durationSec: 20,
        sceneUniformity: 0.95,
        staticOverlayRatio: 0.9,
        transcript: 'beli sekarang klik link di bio kode promo hemat',
      }),
    );

    expect(verdict.isAd).toBe(true);
    expect(verdict.score).toBeGreaterThanOrEqual(DEFAULT_AD_THRESHOLD);
  });
});

describe('evaluateAd - iklan sisipan (embedded ads) must be accepted', () => {
  it('accepts a long video whose transcript contains a mid-roll ad read', () => {
    const verdict = evaluateAd(
      baseSignals({
        durationSec: 2700,
        transcript:
          'kita lanjut ke topik berikutnya sebentar ini disponsori oleh brand X ' +
          'kode promo hemat sepuluh persen oke kembali ke pembahasan tadi soal ' +
          'kebiasaan belajar dan bagaimana cara menjaga konsistensi setiap hari ' +
          'supaya tidak berhenti di tengah jalan ketika motivasi mulai turun',
        sceneUniformity: 0.3,
      }),
    );

    expect(verdict.isAd).toBe(false);
  });

  it('accepts a long video with a sponsorship tag in the title', () => {
    const verdict = evaluateAd(
      baseSignals({
        title: 'Episode 12 (sponsored segment) - Kebiasaan Belajar',
        durationSec: 3600,
      }),
    );

    expect(verdict.isAd).toBe(false);
  });
});

describe('evaluateAd - ambiguity fails toward acceptance', () => {
  it('accepts when visual and audio signals are entirely unknown', () => {
    const verdict = evaluateAd(
      baseSignals({
        title: 'promo',
        durationSec: 45,
      }),
    );

    expect(verdict.isAd).toBe(false);
  });

  it('treats unknown duration as a clean temporal signal', () => {
    const unknown = evaluateAd(baseSignals({ durationSec: 0 }));
    expect(unknown.breakdown.temporal).toBe(0);
    expect(unknown.isAd).toBe(false);
  });

  it('accepts a completely neutral long video with zero score', () => {
    const verdict = evaluateAd(baseSignals());
    expect(verdict.score).toBe(0);
    expect(verdict.isAd).toBe(false);
  });
});

describe('evaluateAd - determinism and threshold shape', () => {
  it('produces identical verdicts for identical inputs', () => {
    const signals = baseSignals({
      durationSec: 15,
      sceneUniformity: 0.8,
      transcript: 'order now limited offer',
    });
    expect(evaluateAd(signals)).toEqual(evaluateAd(signals));
  });

  it('is monotonic: raising the threshold never turns acceptance into rejection', () => {
    const signals = baseSignals({
      durationSec: 25,
      sceneUniformity: 0.7,
      staticOverlayRatio: 0.6,
      transcript: 'buy now klik link di bio',
    });

    const strict = evaluateAd(signals, 0.95);
    const lenient = evaluateAd(signals, 0.4);

    expect(strict.score).toBe(lenient.score);
    expect(lenient.isAd).toBe(true);
    expect(strict.isAd).toBe(false);
  });

  it('reports a per-signal breakdown that sums to the total score', () => {
    const verdict = evaluateAd(
      baseSignals({
        durationSec: 20,
        sceneUniformity: 0.9,
        transcript: 'order now',
      }),
    );
    const sum = Object.values(verdict.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(verdict.score, 4);
  });

  it('never emits a score outside 0..1', () => {
    const extreme = evaluateAd(
      baseSignals({
        title: 'sponsored #ad promo iklan advertisement paid partnership brand deal',
        durationSec: 1,
        sceneUniformity: 5,
        staticOverlayRatio: 5,
        transcript: 'buy now order now klik link di bio',
      }),
    );
    expect(extreme.score).toBeGreaterThanOrEqual(0);
    expect(extreme.score).toBeLessThanOrEqual(1);
  });
});
