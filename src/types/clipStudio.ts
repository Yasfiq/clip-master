export interface StudioConfig {
  hookText: string;
  hookPosition?: 'center' | 'top';
  hookDuration?: number; // seconds to display center hook & play TTS (default 2.2s)
  hookTtsEnabled?: boolean; // whether to generate Indonesian female voiceover
  hookTtsVoice?: string; // e.g. 'id-ID-GadisNeural'
  freezeDuration: number; // in seconds, e.g. 0, 1.0, 1.5, 2.0
  logoEnabled: boolean;
  logoPath?: string;
  logoPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  logoOpacity: number; // 0.1 - 1.0
  sourceText: string;
  sourceEnabled: boolean;
  sourcePosition?: 'top-right' | 'top-left' | 'bottom';
  subtitleStyleId: string;
  subtitleDelay?: number; // delay in seconds before dialog subtitles appear (default 0s for perfect sync)
  fadeInDuration: number; // seconds, e.g. 0.3
  fadeOutDuration: number; // seconds, e.g. 0.5
  filmBurnIntro?: boolean; // CapCut-style warm light leak intro
}

export const DEFAULT_STUDIO_CONFIG: StudioConfig = {
  hookText: '',
  hookPosition: 'center',
  hookDuration: 0,
  hookTtsEnabled: true,
  hookTtsVoice: 'id-ID-GadisNeural',
  freezeDuration: 0,
  logoEnabled: true,
  logoPath: 'media/assets/logo.png',
  logoPosition: 'top-left',
  logoOpacity: 1.0,
  sourceText: '',
  sourceEnabled: true,
  sourcePosition: 'top-right',
  subtitleStyleId: 'clipajaib',
  subtitleDelay: 0,
  fadeInDuration: 0.3,
  fadeOutDuration: 0.5,
};

export type StudioTab = 'subtitle' | 'hook' | 'branding' | 'transition' | 'audio';

export interface StudioClipMetadata {
  id: string;
  sourceJobId: string;
  videoPath?: string;
  exportPath?: string;
  isExported?: boolean;
  cleanVideoPath?: string;
}

export function formatTimecode(sec: number): string {
  if (isNaN(sec) || sec < 0) return '00:00.00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const f = Math.floor((sec % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${f.toString().padStart(2, '0')}`;
}
