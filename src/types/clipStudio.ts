export type FramingMode = 'auto-face' | 'split-podcast' | 'center' | 'blur-fill';

export interface SplitPodcastConfig {
  topCropXPercent?: number; // 0..100, default 25 (left speaker/host)
  bottomCropXPercent?: number; // 0..100, default 75 (right speaker/guest)
  dividerColor?: 'gold' | 'cyan' | 'zinc' | 'white' | 'none';
  dividerThickness?: number; // px: 2, 4, 6
  subtitlePlacement?: 'center-divider' | 'bottom';
}

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
  framingMode?: FramingMode; // 9:16 layout framing strategy
  splitConfig?: SplitPodcastConfig; // settings when framingMode is 'split-podcast'
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
  framingMode: 'auto-face',
  splitConfig: {
    topCropXPercent: 25,
    bottomCropXPercent: 75,
    dividerColor: 'gold',
    dividerThickness: 4,
    subtitlePlacement: 'bottom',
  },
};
