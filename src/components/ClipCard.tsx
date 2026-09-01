'use client';

import React from 'react';

interface Clip {
  id: string;
  startTime: number;
  endTime: number;
  duration: number;
  viralScore?: number;
  confidence?: string;
  exportPath?: string;
  thumbnailPath?: string;
  isExported: boolean;
}

interface ClipCardProps {
  clip: Clip;
  index: number;
  onPlay?: (clipId: string) => void;
  onDownload?: (clipId: string) => void;
}

const ClipCard: React.FC<ClipCardProps> = ({ clip, index, onPlay, onDownload }) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getConfidenceColor = (confidence?: string) => {
    switch (confidence) {
      case 'HIGH':
        return 'bg-green-100 text-green-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      case 'LOW':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getViralScoreColor = (score?: number) => {
    if (!score) return 'text-gray-400';
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail placeholder */}
      <div className="relative aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-2">🎬</div>
          <div className="text-xs text-gray-500">Clip {index + 1}</div>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
          {formatTime(clip.duration)}
        </div>

        {/* Play button overlay */}
        <button
          onClick={() => onPlay?.(clip.id)}
          className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group"
        >
          <div className="w-12 h-12 rounded-full bg-white/90 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xl">▶</span>
          </div>
        </button>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h4 className="font-semibold text-gray-900">Clip {index + 1}</h4>
            <p className="text-sm text-gray-500">
              {formatTime(clip.startTime)} → {formatTime(clip.endTime)}
            </p>
          </div>

          {clip.confidence && (
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${getConfidenceColor(
                clip.confidence,
              )}`}
            >
              {clip.confidence}
            </span>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Viral Score</div>
            <div className={`text-lg font-bold ${getViralScoreColor(clip.viralScore)}`}>
              {clip.viralScore ? clip.viralScore.toFixed(2) : '—'}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">Duration</div>
            <div className="text-lg font-bold text-gray-900">{formatTime(clip.duration)}</div>
          </div>
        </div>

        {/* Progress bar */}
        {clip.viralScore !== undefined && (
          <div className="mb-3">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  clip.viralScore >= 0.8
                    ? 'bg-green-500'
                    : clip.viralScore >= 0.5
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${(clip.viralScore || 0) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onPlay?.(clip.id)}
            className="flex-1 py-2 px-3 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            ▶ Play
          </button>
          <button
            onClick={() => onDownload?.(clip.id)}
            disabled={!clip.isExported}
            className="flex-1 py-2 px-3 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ⬇ Download
          </button>
        </div>

        {/* File path */}
        {clip.exportPath && (
          <div className="mt-2 text-[10px] text-gray-400 truncate font-mono">{clip.exportPath}</div>
        )}
      </div>
    </div>
  );
};

export default ClipCard;
