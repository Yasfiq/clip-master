import { useState, useCallback, RefObject } from 'react';
import { StudioConfig } from '@/types/clipStudio';

export interface UseTtsPreviewOptions {
  clipId: string;
  studioConfig: StudioConfig;
  setStudioConfig: React.Dispatch<React.SetStateAction<StudioConfig>>;
  ttsAudioRef: RefObject<HTMLAudioElement | null>;
  setError: (err: string | null) => void;
  setStatusMessage: (msg: string | null) => void;
}

export function useTtsPreview({
  clipId,
  studioConfig,
  setStudioConfig,
  ttsAudioRef,
  setError,
  setStatusMessage,
}: UseTtsPreviewOptions) {
  const [ttsPreviewLoading, setTtsPreviewLoading] = useState<boolean>(false);
  const [ttsPreviewPlaying, setTtsPreviewPlaying] = useState<boolean>(false);

  const handleTestTts = useCallback(async () => {
    if (!studioConfig.hookText?.trim()) {
      setError('Masukkan teks headline hook terlebih dahulu sebelum menguji voiceover');
      return;
    }
    setTtsPreviewLoading(true);
    setError(null);
    setStatusMessage('Sedang menghasilkan audio voiceover AI (GadisNeural)...');
    try {
      const res = await fetch(`/api/clips/${clipId}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: studioConfig.hookText.trim(),
          voice: studioConfig.hookTtsVoice || 'id-ID-GadisNeural',
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || 'Gagal menghasilkan voiceover TTS');
      }

      const dur = payload.data.duration;
      const audioUrl = payload.data.audioUrl;

      setStudioConfig((prev) => ({
        ...prev,
        freezeDuration: dur,
        hookDuration: dur,
      }));

      setStatusMessage(
        `Voiceover berhasil dibuat (${dur}s). Durasi freeze frame otomatis disinkronkan!`,
      );

      if (ttsAudioRef.current) {
        ttsAudioRef.current.src = audioUrl;
        ttsAudioRef.current.load();
        setTtsPreviewPlaying(true);
        ttsAudioRef.current.play().catch(() => {});
        ttsAudioRef.current.onended = () => setTtsPreviewPlaying(false);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal membuat voiceover');
      setStatusMessage(null);
    } finally {
      setTtsPreviewLoading(false);
    }
  }, [
    clipId,
    studioConfig.hookText,
    studioConfig.hookTtsVoice,
    setStudioConfig,
    ttsAudioRef,
    setError,
    setStatusMessage,
  ]);

  const handleStopTts = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.currentTime = 0;
    }
    setTtsPreviewPlaying(false);
  }, [ttsAudioRef]);

  return {
    ttsPreviewLoading,
    ttsPreviewPlaying,
    handleTestTts,
    handleStopTts,
  };
}
