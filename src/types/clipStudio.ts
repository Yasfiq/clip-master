export interface StudioConfig {
  hookText: string;
  freezeDuration: number; // in seconds, e.g. 0, 1.0, 1.5, 2.0
  logoEnabled: boolean;
  logoPath?: string;
  logoPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  logoOpacity: number; // 0.1 - 1.0
  sourceText: string;
  sourceEnabled: boolean;
  subtitleStyleId: string;
  fadeInDuration: number; // seconds, e.g. 0.4
  fadeOutDuration: number; // seconds, e.g. 0.6
}

export const DEFAULT_STUDIO_CONFIG: StudioConfig = {
  hookText: '',
  freezeDuration: 1.2,
  logoEnabled: false,
  logoPath: 'media/assets/logo.png',
  logoPosition: 'top-right',
  logoOpacity: 0.8,
  sourceText: '',
  sourceEnabled: true,
  subtitleStyleId: 'tiktok',
  fadeInDuration: 0.4,
  fadeOutDuration: 0.6,
};
