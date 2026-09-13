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
  subtitleStyleId: string;
  subtitleDelay?: number; // delay in seconds before dialog subtitles appear (default 2.2s)
  fadeInDuration: number; // seconds, e.g. 0.4
  fadeOutDuration: number; // seconds, e.g. 1.0
  filmBurnIntro?: boolean; // CapCut-style warm light leak intro
}

export const DEFAULT_STUDIO_CONFIG: StudioConfig = {
  hookText: '',
  hookPosition: 'center',
  hookDuration: 2.2,
  hookTtsEnabled: true,
  hookTtsVoice: 'id-ID-GadisNeural',
  freezeDuration: 1.2,
  logoEnabled: true,
  logoPath: 'media/assets/logo.png',
  logoPosition: 'top-left',
  logoOpacity: 1.0,
  sourceText: '',
  sourceEnabled: true,
  subtitleStyleId: 'clipajaib',
  subtitleDelay: 2.2,
  fadeInDuration: 0.4,
  fadeOutDuration: 0.6,
};
