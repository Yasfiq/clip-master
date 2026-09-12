import { describe, it, expect } from 'vitest';
import {
  buildStudioFilterGraph,
  escapeDrawText,
  escapeSubtitlesPath,
  getLogoOverlayCoordinates,
} from '@/pipeline/logic/studioFilterGraph';
import { StudioConfig, DEFAULT_STUDIO_CONFIG } from '@/types/clipStudio';

describe('studioFilterGraph', () => {
  describe('character escaping', () => {
    it('escapes single quotes, colons, and backslashes in drawtext', () => {
      const input = "IT'S A TEST: 100% VALUE \\ SPECIAL";
      const escaped = escapeDrawText(input);
      expect(escaped).toBe("IT\\'S A TEST\\: 100% VALUE \\\\ SPECIAL");
    });

    it('normalizes newlines to spaces in drawtext', () => {
      const input = 'FIRST LINE\nSECOND LINE\r\nTHIRD LINE';
      const escaped = escapeDrawText(input);
      expect(escaped).toBe('FIRST LINE SECOND LINE THIRD LINE');
    });

    it('escapes windows backslashes and colons in subtitle path', () => {
      const p = 'C:\\media\\work\\job1\\sub.srt';
      const escaped = escapeSubtitlesPath(p);
      expect(escaped).toBe('C\\:/media/work/job1/sub.srt');
    });
  });

  describe('logo coordinates', () => {
    it('returns correct safe zone coordinates for each position', () => {
      expect(getLogoOverlayCoordinates('top-right')).toBe('W-w-40:50');
      expect(getLogoOverlayCoordinates('top-left')).toBe('40:50');
      expect(getLogoOverlayCoordinates('bottom-right')).toBe('W-w-40:H-h-140');
      expect(getLogoOverlayCoordinates('bottom-left')).toBe('40:H-h-140');
      expect(getLogoOverlayCoordinates('unknown')).toBe('W-w-40:50');
    });
  });

  describe('duration math', () => {
    it('adds freezeDuration to effectiveDuration and calculates fade-out start', () => {
      const config: StudioConfig = {
        ...DEFAULT_STUDIO_CONFIG,
        freezeDuration: 1.5,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.8,
      };

      const result = buildStudioFilterGraph({
        inputVideoDuration: 20.0,
        config,
      });

      // 20.0 + 1.5 = 21.5
      expect(result.effectiveDuration).toBe(21.5);
      // fade out start = 21.5 - 0.8 = 20.7
      expect(result.filterComplex).toContain('fade=t=out:st=20.7:d=0.8');
      expect(result.filterComplex).toContain('afade=t=out:st=20.7:d=0.8');
    });

    it('handles zero freezeDuration without extending total duration', () => {
      const config: StudioConfig = {
        ...DEFAULT_STUDIO_CONFIG,
        freezeDuration: 0,
        fadeInDuration: 0.4,
        fadeOutDuration: 0.6,
      };

      const result = buildStudioFilterGraph({
        inputVideoDuration: 30.0,
        config,
      });

      expect(result.effectiveDuration).toBe(30.0);
      expect(result.filterComplex).not.toContain('tpad=');
      expect(result.filterComplex).toContain('fade=t=out:st=29.4:d=0.6');
      expect(result.filterComplex).toContain('afade=t=out:st=29.4:d=0.6');
    });
  });

  describe('all layers enabled', () => {
    it('generates a complete multi-layer filter graph with logo, hook, source, subtitles, and fades', () => {
      const config: StudioConfig = {
        hookText: 'GAK NAIK KELAS: BISA JADI BOS',
        freezeDuration: 1.2,
        logoEnabled: true,
        logoPath: 'media/assets/logo.png',
        logoPosition: 'top-right',
        logoOpacity: 0.85,
        sourceText: "Sumber: Raditya Dika's Channel",
        sourceEnabled: true,
        subtitleStyleId: 'tiktok',
        fadeInDuration: 0.4,
        fadeOutDuration: 0.6,
      };

      const result = buildStudioFilterGraph({
        inputVideoDuration: 30.0,
        config,
        subtitlePath: '/app/media/work/job1/subtitles/clip_001.srt',
        logoResolvedPath: '/app/media/assets/logo.png',
        subtitleForceStyle: 'FontName=Montserrat,FontSize=18',
      });

      expect(result.hasLogoInput).toBe(true);
      expect(result.effectiveDuration).toBe(31.2);

      // Video freeze & fades
      expect(result.filterComplex).toContain('tpad=start_mode=clone:start_duration=1.2');
      expect(result.filterComplex).toContain('fade=t=in:st=0:d=0.4');
      expect(result.filterComplex).toContain('fade=t=out:st=30.6:d=0.6');

      // Logo preparation and overlay
      expect(result.filterComplex).toContain('[1:v]format=rgba,colorchannelmixer=aa=0.85[logo]');
      expect(result.filterComplex).toContain(
        '[v_faded][logo]overlay=W-w-40:50:format=auto[v_logo]',
      );

      // Headline hook with safe escaping
      expect(result.filterComplex).toContain("drawtext=text='GAK NAIK KELAS\\: BISA JADI BOS'");
      expect(result.filterComplex).toContain('x=(w-text_w)/2:y=140');
      expect(result.filterComplex).toContain('box=1:boxcolor=black@0.7:boxborderw=16');

      // Source credit with safe escaping
      expect(result.filterComplex).toContain("drawtext=text='Sumber\\: Raditya Dika\\'s Channel'");
      expect(result.filterComplex).toContain('x=(w-text_w)/2:y=h-140');

      // Subtitles filter
      expect(result.filterComplex).toContain(
        "subtitles='/app/media/work/job1/subtitles/clip_001.srt':force_style='FontName=Montserrat,FontSize=18'",
      );

      // Audio fades
      expect(result.filterComplex).toContain(
        '[0:a]afade=t=in:st=0:d=0.4,afade=t=out:st=30.6:d=0.6[a_out]',
      );

      // Final output mapping targets
      expect(result.filterComplex).toContain('[v_out]');
      expect(result.filterComplex).toContain('[a_out]');
    });
  });

  describe('partially enabled and disabled layers', () => {
    it('omits logo input when logoEnabled is false or logoResolvedPath is missing', () => {
      const config: StudioConfig = {
        ...DEFAULT_STUDIO_CONFIG,
        logoEnabled: true,
        // logoResolvedPath not passed
      };

      const result = buildStudioFilterGraph({
        inputVideoDuration: 25.0,
        config,
      });

      expect(result.hasLogoInput).toBe(false);
      expect(result.filterComplex).not.toContain('[1:v]');
      expect(result.filterComplex).not.toContain('overlay=');
    });

    it('omits hook text when empty or whitespace', () => {
      const config: StudioConfig = {
        ...DEFAULT_STUDIO_CONFIG,
        hookText: '   ',
      };

      const result = buildStudioFilterGraph({
        inputVideoDuration: 25.0,
        config,
      });

      expect(result.filterComplex).not.toContain('y=140');
    });

    it('omits source text when sourceEnabled is false', () => {
      const config: StudioConfig = {
        ...DEFAULT_STUDIO_CONFIG,
        sourceText: 'Sumber: Test',
        sourceEnabled: false,
      };

      const result = buildStudioFilterGraph({
        inputVideoDuration: 25.0,
        config,
      });

      expect(result.filterComplex).not.toContain('y=h-140');
    });

    it('falls back to null/anull pass-through when all layers are disabled', () => {
      const config: StudioConfig = {
        hookText: '',
        freezeDuration: 0,
        logoEnabled: false,
        logoPosition: 'top-right',
        logoOpacity: 0.8,
        sourceText: '',
        sourceEnabled: false,
        subtitleStyleId: 'tiktok',
        fadeInDuration: 0,
        fadeOutDuration: 0,
      };

      const result = buildStudioFilterGraph({
        inputVideoDuration: 15.0,
        config,
      });

      expect(result.hasLogoInput).toBe(false);
      expect(result.effectiveDuration).toBe(15.0);
      expect(result.filterComplex).toBe('[0:v]null[v_out];[0:a]anull[a_out]');
    });

    it('prepends baseVideoFilter if provided', () => {
      const config: StudioConfig = {
        ...DEFAULT_STUDIO_CONFIG,
        freezeDuration: 0,
        fadeInDuration: 0,
        fadeOutDuration: 0,
        hookText: '',
        sourceEnabled: false,
      };

      const result = buildStudioFilterGraph({
        inputVideoDuration: 15.0,
        config,
        baseVideoFilter: 'scale=-1:1920,crop=1080:1920:(iw-1080)/2:0',
      });

      expect(result.filterComplex).toContain(
        '[0:v]scale=-1:1920,crop=1080:1920:(iw-1080)/2:0[v_out]',
      );
    });
  });
});
