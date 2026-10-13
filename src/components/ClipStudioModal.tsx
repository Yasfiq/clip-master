'use client';

import React, { useState, useRef } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { StudioTab } from '@/types/clipStudio';
import { useSubtitleEditor } from '@/hooks/useSubtitleEditor';
import { useTtsPreview } from '@/hooks/useTtsPreview';
import { useStudioConfig } from '@/hooks/useStudioConfig';
import { useVideoPlayer } from '@/hooks/useVideoPlayer';

import { StudioHeader } from './studio/StudioHeader';
import { StudioSidebarNav } from './studio/StudioSidebarNav';
import { StudioCanvas } from './studio/StudioCanvas';
import { StudioInspector } from './studio/StudioInspector';
import { StudioTimeline } from './studio/StudioTimeline';

import { SubtitlePanel } from './studio/panels/SubtitlePanel';
import { HookPanel } from './studio/panels/HookPanel';
import { BrandingPanel } from './studio/panels/BrandingPanel';
import { TransitionPanel } from './studio/panels/TransitionPanel';
import { AudioPanel } from './studio/panels/AudioPanel';

export interface ClipStudioModalProps {
  clipId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialTab?: StudioTab;
}

export default function ClipStudioModal({
  clipId,
  isOpen,
  onClose,
  onSuccess,
  initialTab = 'subtitle',
}: ClipStudioModalProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>(initialTab);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // 1. Subtitle Editor Hook
  const {
    cues,
    setCues,
    selectedCueIndex,
    setSelectedCueIndex,
    handleCueTextChange,
    handleNudgeAllCues,
    handleNudgeSingleCue,
    handleAddCue,
    handleDeleteCue,
  } = useSubtitleEditor();

  // Temporary container refs for player state synced to config
  const [duration, setDuration] = useState<number>(0);
  const [videoTimestampKey, setVideoTimestampKey] = useState<number>(Date.now());
  const [viewMode, setViewMode] = useState<'draft' | 'rendered'>('draft');

  // 2. Studio Configuration & Persistence Hook
  const {
    studioConfig,
    setStudioConfig,
    clipData,
    isCleanVideo,
    loading,
    saving,
    reBurning,
    error,
    setError,
    statusMessage,
    setStatusMessage,
    logoExists,
    uploadingLogo,
    handleLogoUpload,
    handleSaveDraft,
    handleRenderStudio,
  } = useStudioConfig({
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
  });

  // 3. Video Player Lifecycle & Timing Hook
  const {
    currentTime,
    isPlaying,
    setIsPlaying,
    isMuted,
    setIsMuted,
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
  } = useVideoPlayer({
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
  });

  // 4. TTS Preview Hook
  const { ttsPreviewLoading, ttsPreviewPlaying, handleTestTts, handleStopTts } = useTtsPreview({
    clipId,
    studioConfig,
    setStudioConfig,
    ttsAudioRef,
    setError,
    setStatusMessage,
  });

  if (!isOpen) return null;

  // Active dialogue time calculation
  const dialogueTime = viewMode === 'draft' ? Math.max(0, currentTime - freezeSec) : currentTime;

  // Video source logic
  const videoSrc =
    viewMode === 'rendered' && (clipData?.isExported || clipData?.exportPath)
      ? `/api/clips/${clipId}/video?t=${videoTimestampKey}`
      : `/api/clips/${clipId}/video?clean=true&t=${videoTimestampKey}`;

  const activeCue =
    dialogueTime >= 0
      ? (cues.find((c) => dialogueTime >= c.start && dialogueTime <= c.end) ?? null)
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-editor-title"
      className="fixed inset-0 z-50 bg-[#0e0e12] text-zinc-100 flex flex-col h-screen w-screen overflow-hidden select-none font-sans"
    >
      {/* 1. TOP HEADER BAR */}
      <StudioHeader
        currentTime={currentTime}
        duration={duration}
        statusMessage={statusMessage}
        showInspector={showInspector}
        setShowInspector={setShowInspector}
        saving={saving}
        reBurning={reBurning}
        loading={loading}
        handleSaveDraft={handleSaveDraft}
        handleRenderStudio={handleRenderStudio}
        handleClose={handleClose}
      />

      {/* Error Banner */}
      {error && (
        <div className="bg-red-950/80 border-b border-red-800 text-red-200 px-4 py-2 text-xs flex items-center justify-between z-30">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200 ml-2 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. MAIN UPPER WORKSPACE: Tool Sidebar | Asset Drawer | Canvas | Inspector */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-[#0e0e12]">
        {/* A. CapCut Tool Icon Column (Far Left) */}
        <StudioSidebarNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          cuesLength={cues.length}
          handleAddCue={() => handleAddCue(cues.length - 1)}
        />

        {/* B. Asset / Tool Drawer */}
        <div className="w-72 xl:w-80 2xl:w-96 bg-[#16161c] border-r border-zinc-800/80 flex flex-col overflow-hidden shrink-0">
          {/* Drawer Sub-Header */}
          <div className="h-10 px-4 border-b border-zinc-800 flex items-center justify-between bg-[#131317]">
            <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              {activeTab === 'subtitle' && <>💬 Subtitle ({cues.length} Cues)</>}
              {activeTab === 'hook' && <>🪝 Hook & Headline</>}
              {activeTab === 'branding' && <>🏷️ Branding & Sumber</>}
              {activeTab === 'transition' && <>✨ Efek Transisi</>}
              {activeTab === 'audio' && <>🎵 Audio & Narator AI</>}
            </span>

            {activeTab === 'subtitle' && (
              <button
                type="button"
                onClick={() => handleAddCue(cues.length - 1)}
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris</span>
              </button>
            )}
          </div>

          {/* Drawer Body Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-48 text-zinc-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span className="text-xs">Memuat konfigurasi studio...</span>
              </div>
            ) : (
              <>
                {activeTab === 'subtitle' && (
                  <SubtitlePanel
                    cues={cues}
                    studioConfig={studioConfig}
                    setStudioConfig={setStudioConfig}
                    currentTime={currentTime}
                    handleSeek={handleSeek}
                    setSelectedCueIndex={setSelectedCueIndex}
                    handleCueTextChange={handleCueTextChange}
                    handleNudgeAllCues={handleNudgeAllCues}
                    handleNudgeSingleCue={handleNudgeSingleCue}
                    handleAddCue={handleAddCue}
                    handleDeleteCue={handleDeleteCue}
                  />
                )}

                {activeTab === 'hook' && (
                  <HookPanel
                    studioConfig={studioConfig}
                    setStudioConfig={setStudioConfig}
                    ttsPreviewLoading={ttsPreviewLoading}
                    ttsPreviewPlaying={ttsPreviewPlaying}
                    handleTestTts={handleTestTts}
                    handleStopTts={handleStopTts}
                  />
                )}

                {activeTab === 'branding' && (
                  <BrandingPanel
                    studioConfig={studioConfig}
                    setStudioConfig={setStudioConfig}
                    logoExists={logoExists}
                    videoTimestampKey={videoTimestampKey}
                    fileInputRef={fileInputRef}
                    handleLogoUpload={handleLogoUpload}
                    uploadingLogo={uploadingLogo}
                  />
                )}

                {activeTab === 'transition' && (
                  <TransitionPanel studioConfig={studioConfig} setStudioConfig={setStudioConfig} />
                )}

                {activeTab === 'audio' && (
                  <AudioPanel studioConfig={studioConfig} setStudioConfig={setStudioConfig} />
                )}
              </>
            )}
          </div>
        </div>

        {/* C. Center Canvas Monitor (9:16 Vertical Video Preview) */}
        <StudioCanvas
          viewMode={viewMode}
          handleSwitchViewMode={handleSwitchViewMode}
          clipData={clipData}
          freezeSec={freezeSec}
          videoRef={videoRef}
          ttsAudioRef={ttsAudioRef}
          videoSrc={videoSrc}
          handleTimeUpdate={handleTimeUpdate}
          handleLoadedMetadata={handleLoadedMetadata}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          setError={setError}
          togglePlay={togglePlay}
          studioConfig={studioConfig}
          logoExists={logoExists}
          isCleanVideo={isCleanVideo}
          videoTimestampKey={videoTimestampKey}
          currentTime={currentTime}
          activeCue={activeCue}
          cues={cues}
          handleSeek={handleSeek}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
        />

        {/* D. Right Inspector Panel (Properties) */}
        <StudioInspector showInspector={showInspector} activeCue={activeCue} duration={duration} />
      </div>

      {/* 3. MULTI-TRACK TIMELINE (CapCut NLE Style) */}
      <StudioTimeline
        currentTime={currentTime}
        timelineZoom={timelineZoom}
        setTimelineZoom={setTimelineZoom}
        timelineRef={timelineRef}
        totalTimelineDuration={totalTimelineDuration}
        freezeSec={freezeSec}
        viewMode={viewMode}
        studioConfig={studioConfig}
        cues={cues}
        dialogueTime={dialogueTime}
        handleSeek={handleSeek}
        setActiveTab={setActiveTab}
        setSelectedCueIndex={setSelectedCueIndex}
      />
    </div>
  );
}
