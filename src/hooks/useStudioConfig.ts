import { useState, useCallback, useEffect, RefObject } from 'react';
import { StudioConfig, DEFAULT_STUDIO_CONFIG, StudioClipMetadata } from '@/types/clipStudio';
import { SubtitleCue } from '@/pipeline/logic/srtParser';

export interface UseStudioConfigOptions {
  clipId: string;
  isOpen: boolean;
  cues: SubtitleCue[];
  setCues: React.Dispatch<React.SetStateAction<SubtitleCue[]>>;
  setDuration: React.Dispatch<React.SetStateAction<number>>;
  setVideoTimestampKey: React.Dispatch<React.SetStateAction<number>>;
  setViewMode: React.Dispatch<React.SetStateAction<'draft' | 'rendered'>>;
  videoRef: RefObject<HTMLVideoElement | null>;
  ttsAudioRef: RefObject<HTMLAudioElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onSuccess?: () => void;
}

export function useStudioConfig({
  clipId,
  isOpen,
  cues,
  setCues,
  setDuration,
  setVideoTimestampKey,
  setViewMode,
  videoRef,
  ttsAudioRef,
  fileInputRef,
  onSuccess,
}: UseStudioConfigOptions) {
  const [studioConfig, setStudioConfig] = useState<StudioConfig>({
    ...DEFAULT_STUDIO_CONFIG,
    sourcePosition: DEFAULT_STUDIO_CONFIG.sourcePosition || 'top-right',
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [reBurning, setReBurning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [clipData, setClipData] = useState<StudioClipMetadata | null>(null);
  const [isCleanVideo, setIsCleanVideo] = useState<boolean>(true);

  // Logo state
  const [logoExists, setLogoExists] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [logoUploadMsg, setLogoUploadMsg] = useState<string | null>(null);

  const fetchStudioData = useCallback(
    async (signal?: AbortSignal) => {
      if (!clipId) return;
      setLoading(true);
      setError(null);
      setStatusMessage(null);
      try {
        const [studioRes, logoRes] = await Promise.all([
          fetch(`/api/clips/${clipId}/studio`, { signal }),
          fetch('/api/settings/logo', { signal }),
        ]);

        if (signal?.aborted) return;

        const studioPayload = await studioRes.json();
        if (!studioRes.ok || !studioPayload.success) {
          throw new Error(studioPayload?.error?.message || 'Gagal memuat konfigurasi studio klip');
        }

        if (signal?.aborted) return;

        const data = studioPayload.data;
        if (data.clip) {
          setClipData(data.clip);
        }
        if (typeof data.isCleanVideo === 'boolean') {
          setIsCleanVideo(data.isCleanVideo);
        }
        if (typeof data.clip?.duration === 'number' && data.clip.duration > 0) {
          setDuration(data.clip.duration);
        }
        if (data.studioConfig) {
          setStudioConfig({
            ...DEFAULT_STUDIO_CONFIG,
            ...data.studioConfig,
            sourcePosition: data.studioConfig.sourcePosition || 'top-right',
          });
        }
        if (Array.isArray(data.cues)) {
          setCues(data.cues);
        }

        if (logoRes.ok) {
          const logoPayload = await logoRes.json();
          if (logoPayload.success && !signal?.aborted) {
            setLogoExists(!!logoPayload.data?.exists);
          }
        }

        if (ttsAudioRef.current) {
          ttsAudioRef.current.src = `/api/clips/${clipId}/tts`;
          ttsAudioRef.current.load();
        }
      } catch (err: any) {
        if (err.name === 'AbortError' || signal?.aborted) return;
        setError(err.message || 'Terjadi kesalahan saat memuat data studio');
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [clipId, setCues, setDuration, ttsAudioRef],
  );

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetchStudioData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [isOpen, fetchStudioData]);

  const handleSaveDraft = useCallback(
    async (notify = true): Promise<boolean> => {
      setSaving(true);
      setError(null);
      if (notify) setStatusMessage(null);
      try {
        const res = await fetch(`/api/clips/${clipId}/studio`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studioConfig, cues }),
        });
        const payload = await res.json();
        if (!res.ok || !payload.success) {
          throw new Error(payload?.error?.message || 'Gagal menyimpan draf studio');
        }
        if (notify) {
          setStatusMessage('Subtitle berhasil disimpan ke disk.');
        }
        return true;
      } catch (err: any) {
        setError(err.message || 'Gagal menyimpan draf');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [clipId, studioConfig, cues],
  );

  const handleRenderStudio = useCallback(async () => {
    const saved = await handleSaveDraft(false);
    if (!saved) return;

    setReBurning(true);
    setError(null);
    setStatusMessage('Sedang merender video dengan filter studio multi-layer. Harap tunggu...');
    try {
      const res = await fetch(`/api/clips/${clipId}/re-burn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studioConfig,
          styleId: studioConfig.subtitleStyleId,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload?.error?.message || 'Gagal merender video studio');
      }

      setStatusMessage('Video studio berhasil dirender ulang!');
      const newKey = Date.now();
      setVideoTimestampKey(newKey);
      setViewMode('rendered');
      setClipData((prev) => (prev ? { ...prev, isExported: true, exportPath: 'true' } : null));
      if (videoRef.current) {
        videoRef.current.load();
      }
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || 'Gagal merender ulang video');
      setStatusMessage(null);
    } finally {
      setReBurning(false);
    }
  }, [
    handleSaveDraft,
    clipId,
    studioConfig,
    setVideoTimestampKey,
    setViewMode,
    videoRef,
    onSuccess,
  ]);

  const handleLogoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploadingLogo(true);
      setLogoUploadMsg(null);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/settings/logo', {
          method: 'POST',
          body: formData,
        });
        const payload = await res.json();
        if (!res.ok || !payload.success) {
          throw new Error(payload?.error?.message || 'Gagal mengunggah berkas logo');
        }

        setLogoExists(true);
        setStudioConfig((prev) => ({ ...prev, logoEnabled: true }));
        setLogoUploadMsg('Logo berhasil diperbarui.');
        setVideoTimestampKey(Date.now());
      } catch (err: any) {
        setLogoUploadMsg(err.message || 'Gagal mengunggah logo');
      } finally {
        setUploadingLogo(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [fileInputRef, setVideoTimestampKey],
  );

  return {
    studioConfig,
    setStudioConfig,
    loading,
    saving,
    reBurning,
    error,
    setError,
    statusMessage,
    setStatusMessage,
    clipData,
    isCleanVideo,
    logoExists,
    uploadingLogo,
    logoUploadMsg,
    fetchStudioData,
    handleSaveDraft,
    handleRenderStudio,
    handleLogoUpload,
  };
}
