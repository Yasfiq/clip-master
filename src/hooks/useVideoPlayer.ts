import { useState, useCallback, useEffect, useRef, RefObject } from 'react';
import { SubtitleCue } from '@/pipeline/logic/srtParser';
import { StudioConfig } from '@/types/clipStudio';

export interface UseVideoPlayerOptions {
  studioConfig: StudioConfig;
  cues: SubtitleCue[];
  selectedCueIndex: number | null;
  setSelectedCueIndex: (idx: number | null) => void;
  videoRef: RefObject<HTMLVideoElement | null>;
  ttsAudioRef: RefObject<HTMLAudioElement | null>;
  onClose: () => void;
  saving: boolean;
  reBurning: boolean;
  isOpen: boolean;
}

export function useVideoPlayer({
  studioConfig,
  cues,
  selectedCueIndex,
  setSelectedCueIndex,
  videoRef,
  ttsAudioRef,
  onClose,
  saving,
  reBurning,
  isOpen,
}: UseVideoPlayerOptions) {
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'draft' | 'rendered'>('draft');
  const [videoTimestampKey, setVideoTimestampKey] = useState<number>(Date.now());
  const [timelineZoom, setTimelineZoom] = useState<number>(1.0);
  const [showInspector, setShowInspector] = useState<boolean>(false);

  // Freeze Frame duration
  const freezeSec =
    viewMode === 'draft' &&
    (studioConfig.hookTtsEnabled !== false ||
      (typeof studioConfig.freezeDuration === 'number' && studioConfig.freezeDuration > 0))
      ? Number((studioConfig.freezeDuration || studioConfig.hookDuration || 2.0).toFixed(2))
      : 0;

  const totalTimelineDuration = (duration || 60) + (viewMode === 'draft' ? freezeSec : 0);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      if (videoRef.current) videoRef.current.pause();
      if (ttsAudioRef.current) ttsAudioRef.current.pause();
    } else {
      setIsPlaying(true);
      if (viewMode === 'draft' && freezeSec > 0 && currentTime < freezeSec) {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.pause();
        }
        if (ttsAudioRef.current) {
          ttsAudioRef.current.currentTime = currentTime;
          ttsAudioRef.current.play().catch(() => {});
        }
      } else {
        if (videoRef.current) {
          if (viewMode === 'draft' && freezeSec > 0) {
            videoRef.current.currentTime = Math.max(0, currentTime - freezeSec);
          }
          videoRef.current.play().catch(() => {});
        }
      }
    }
  }, [isPlaying, viewMode, freezeSec, currentTime, videoRef, ttsAudioRef]);

  // Freeze Frame animation loop
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    if (isPlaying && viewMode === 'draft' && freezeSec > 0 && currentTime < freezeSec) {
      const loop = (now: number) => {
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        setCurrentTime((prev) => {
          const next = prev + dt;
          if (next >= freezeSec) {
            if (ttsAudioRef.current) {
              ttsAudioRef.current.pause();
            }
            if (videoRef.current) {
              videoRef.current.currentTime = 0;
              videoRef.current.play().catch(() => {});
            }
            return freezeSec;
          }
          return next;
        });

        animId = requestAnimationFrame(loop);
      };

      animId = requestAnimationFrame(loop);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, viewMode, freezeSec, currentTime, videoRef, ttsAudioRef]);

  const handleSeek = useCallback(
    (seconds: number) => {
      const targetSec = Math.max(0, Math.min(seconds, totalTimelineDuration));
      setCurrentTime(targetSec);

      if (viewMode === 'draft' && freezeSec > 0) {
        if (targetSec < freezeSec) {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.pause();
          }
          if (ttsAudioRef.current) {
            ttsAudioRef.current.currentTime = targetSec;
            if (isPlaying) ttsAudioRef.current.play().catch(() => {});
          }
        } else {
          if (ttsAudioRef.current) {
            ttsAudioRef.current.pause();
          }
          if (videoRef.current) {
            videoRef.current.currentTime = targetSec - freezeSec;
            if (isPlaying && videoRef.current.paused) {
              videoRef.current.play().catch(() => {});
            }
          }
        }
      } else {
        if (videoRef.current) {
          videoRef.current.currentTime = targetSec;
          if (isPlaying && videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
          }
        }
      }
    },
    [totalTimelineDuration, viewMode, freezeSec, isPlaying, videoRef, ttsAudioRef],
  );

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;

    if (viewMode === 'draft' && freezeSec > 0) {
      if (currentTime >= freezeSec) {
        const cur = freezeSec + videoRef.current.currentTime;
        setCurrentTime(cur);

        const dialogueTime = videoRef.current.currentTime;
        const activeIdx = cues.findIndex((c) => dialogueTime >= c.start && dialogueTime <= c.end);
        if (activeIdx !== -1 && activeIdx !== selectedCueIndex) {
          setSelectedCueIndex(activeIdx);
        }
      }
    } else {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);
      const activeIdx = cues.findIndex((c) => cur >= c.start && cur <= c.end);
      if (activeIdx !== -1 && activeIdx !== selectedCueIndex) {
        setSelectedCueIndex(activeIdx);
      }
    }
  }, [viewMode, freezeSec, currentTime, cues, selectedCueIndex, setSelectedCueIndex, videoRef]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current && videoRef.current.duration) {
      setDuration(videoRef.current.duration);
    }
  }, [videoRef]);

  const handleSwitchViewMode = useCallback(
    (mode: 'draft' | 'rendered') => {
      if (mode === viewMode) return;
      setIsPlaying(false);
      if (videoRef.current) videoRef.current.pause();
      if (ttsAudioRef.current) ttsAudioRef.current.pause();
      setViewMode(mode);
      setCurrentTime(0);
      setVideoTimestampKey(Date.now());
    },
    [viewMode, videoRef, ttsAudioRef],
  );

  const handleClose = useCallback(() => {
    if (saving || reBurning) return;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause();
      ttsAudioRef.current.removeAttribute('src');
    }
    onClose();
  }, [saving, reBurning, videoRef, ttsAudioRef, onClose]);

  // Clean-up on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
        ttsAudioRef.current.removeAttribute('src');
      }
    };
  }, [videoRef, ttsAudioRef]);

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive =
        target.closest('button, input, textarea, select, [role="button"], [role="tab"]') !== null ||
        target.isContentEditable;

      if (e.key === 'Escape' && isOpen && !saving && !reBurning) {
        handleClose();
      } else if (e.code === 'Space' && isOpen && !isInteractive) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' && isOpen && !isInteractive) {
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 1.0));
      } else if (e.key === 'ArrowRight' && isOpen && !isInteractive) {
        e.preventDefault();
        handleSeek(Math.min(totalTimelineDuration, currentTime + 1.0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    saving,
    reBurning,
    totalTimelineDuration,
    currentTime,
    handleClose,
    togglePlay,
    handleSeek,
  ]);

  return {
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    isPlaying,
    setIsPlaying,
    isMuted,
    setIsMuted,
    viewMode,
    setViewMode,
    videoTimestampKey,
    setVideoTimestampKey,
    timelineZoom,
    setTimelineZoom,
    showInspector,
    setShowInspector,
    freezeSec,
    totalTimelineDuration,
    togglePlay,
    handleSeek,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleSwitchViewMode,
    handleClose,
  };
}
