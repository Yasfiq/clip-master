import { describe, it, expect } from 'vitest';
import {
  pickStyle,
  buildForceStyle,
  CLIP_STYLE_POOL,
  ALL_STYLES,
  CLIPAJAIB_STYLE,
  SULE_STYLE,
  TIKTOK_STYLE,
  KAMAL_STYLE,
} from '@/pipeline/logic/subtitleStyle';

describe('subtitleStyle', () => {
  describe('CLIP_STYLE_POOL', () => {
    it('has exactly 3 distinct styles', () => {
      expect(CLIP_STYLE_POOL.length).toBe(3);
      const ids = CLIP_STYLE_POOL.map((s) => s.id);
      expect(ids).toEqual(['sule', 'tiktok', 'kamal']);
    });
  });

  describe('pickStyle', () => {
    it('returns SULE for clip 0', () => {
      expect(pickStyle(0)).toBe(SULE_STYLE);
    });
    it('returns TIKTOK for clip 1', () => {
      expect(pickStyle(1)).toBe(TIKTOK_STYLE);
    });
    it('returns KAMAL for clip 2', () => {
      expect(pickStyle(2)).toBe(KAMAL_STYLE);
    });
    it('cycles: clip 3 returns SULE', () => {
      expect(pickStyle(3)).toBe(SULE_STYLE);
    });
    it('cycles: clip 4 returns TIKTOK', () => {
      expect(pickStyle(4)).toBe(TIKTOK_STYLE);
    });
    it('throws on negative index', () => {
      expect(() => pickStyle(-1)).toThrow(/non-negative/);
    });
    it('throws on non-finite index', () => {
      expect(() => pickStyle(NaN)).toThrow(/non-negative/);
    });
  });

  describe('style constants', () => {
    it('CLIPAJAIB: bright yellow + thick outline + chest height', () => {
      expect(CLIPAJAIB_STYLE.primaryColour).toBe('&H0000EEFF');
      expect(CLIPAJAIB_STYLE.shadow).toBe(0);
      expect(CLIPAJAIB_STYLE.outline).toBe(4.5);
      expect(CLIPAJAIB_STYLE.marginV).toBe(420);
      expect(CLIPAJAIB_STYLE.fontSize).toBe(62);
    });
    it('SULE: yellow + no shadow + thick outline + chest height', () => {
      expect(SULE_STYLE.primaryColour).toBe('&H0000FFFF');
      expect(SULE_STYLE.shadow).toBe(0);
      expect(SULE_STYLE.outline).toBe(4.5);
      expect(SULE_STYLE.marginV).toBe(420);
      expect(SULE_STYLE.fontSize).toBe(62);
    });
    it('TIKTOK: white + no shadow + high contrast outline', () => {
      expect(TIKTOK_STYLE.primaryColour).toBe('&H00FFFFFF');
      expect(TIKTOK_STYLE.shadow).toBe(0);
      expect(TIKTOK_STYLE.outline).toBe(4.5);
      expect(TIKTOK_STYLE.backColour).toBe('&H00000000');
      expect(TIKTOK_STYLE.marginV).toBe(420);
      expect(TIKTOK_STYLE.fontSize).toBe(62);
    });
    it('KAMAL: yellow + red shadow + lower third', () => {
      expect(KAMAL_STYLE.primaryColour).toBe('&H0000FFFF');
      expect(KAMAL_STYLE.backColour).toBe('&H000000FF');
      expect(KAMAL_STYLE.shadow).toBe(2);
      expect(KAMAL_STYLE.outline).toBe(4.5);
      expect(KAMAL_STYLE.marginV).toBe(420);
      expect(KAMAL_STYLE.fontSize).toBe(62);
    });
  });

  describe('buildForceStyle', () => {
    it('produces a valid ASS force_style string for SULE', () => {
      const str = buildForceStyle(SULE_STYLE);
      expect(str).toContain('PrimaryColour=&H0000FFFF');
      expect(str).toContain('Outline=4.5');
      expect(str).toContain('Shadow=0');
      expect(str).toContain('FontSize=62');
      expect(str).toContain('PlayResX=1080');
      expect(str).toContain('PlayResY=1920');
    });

    it('produces a valid ASS force_style string for KAMAL', () => {
      const str = buildForceStyle(KAMAL_STYLE);
      expect(str).toContain('BackColour=&H000000FF');
      expect(str).toContain('Shadow=2');
    });

    it('includes FontName and MarginV', () => {
      const str = buildForceStyle(TIKTOK_STYLE);
      expect(str).toContain('FontName=DejaVu Sans');
      expect(str).toContain('MarginV=420');
    });
  });
});
