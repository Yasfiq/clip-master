import { useState, useCallback } from 'react';
import { SubtitleCue } from '@/pipeline/logic/srtParser';

export interface UseSubtitleEditorOptions {
  initialCues?: SubtitleCue[];
  onStatusMessage?: (msg: string) => void;
}

export function useSubtitleEditor({
  initialCues = [],
  onStatusMessage,
}: UseSubtitleEditorOptions = {}) {
  const [cues, setCues] = useState<SubtitleCue[]>(initialCues);
  const [selectedCueIndex, setSelectedCueIndex] = useState<number | null>(0);

  const handleCueTextChange = useCallback((index: number, newText: string) => {
    setCues((prev) => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      updated[index] = { ...updated[index], text: newText };
      return updated;
    });
  }, []);

  const handleCueTimingChange = useCallback(
    (index: number, field: 'start' | 'end', val: number) => {
      setCues((prev) => {
        const updated = [...prev];
        if (!updated[index]) return prev;
        updated[index] = { ...updated[index], [field]: Math.max(0, val) };
        return updated;
      });
    },
    [],
  );

  const handleNudgeAllCues = useCallback(
    (delta: number) => {
      setCues((prev) =>
        prev.map((c) => {
          const newStart = Math.max(0, Number((c.start + delta).toFixed(3)));
          const newEnd = Math.max(newStart + 0.1, Number((c.end + delta).toFixed(3)));
          return {
            ...c,
            start: newStart,
            end: newEnd,
          };
        }),
      );
      onStatusMessage?.(`Semua timing subtitle digeser ${delta > 0 ? '+' : ''}${delta}s.`);
    },
    [onStatusMessage],
  );

  const handleNudgeSingleCue = useCallback((index: number, delta: number) => {
    setCues((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      const newStart = Math.max(0, Number((target.start + delta).toFixed(3)));
      const newEnd = Math.max(newStart + 0.1, Number((target.end + delta).toFixed(3)));
      copy[index] = {
        ...target,
        start: newStart,
        end: newEnd,
      };
      return copy;
    });
  }, []);

  const handleAddCue = useCallback((index: number) => {
    setCues((prev) => {
      const current = prev[index];
      const next = prev[index + 1];
      let start = current ? current.end + 0.05 : 0;
      let end = start + 1.5;

      if (next) {
        if (next.start > start + 0.2) {
          end = Math.min(start + 1.5, next.start - 0.02);
        } else {
          start = Number((start + 0.01).toFixed(2));
          end = Number(Math.max(start + 0.1, next.start - 0.01).toFixed(2));
        }
      }

      const newCue: SubtitleCue = {
        id: prev.length + 1,
        start: Number(start.toFixed(2)),
        end: Number(Math.max(start + 0.2, end).toFixed(2)),
        text: 'Teks subtitle baru',
      };

      const updated = [...prev.slice(0, index + 1), newCue, ...prev.slice(index + 1)];
      // Ensure strictly monotonically increasing start times and no overlapping cues
      for (let i = 1; i < updated.length; i++) {
        if (updated[i].start <= updated[i - 1].start) {
          updated[i].start = Number((updated[i - 1].start + 0.05).toFixed(2));
        }
        if (updated[i - 1].end > updated[i].start) {
          updated[i - 1].end = Number(
            Math.max(updated[i - 1].start + 0.2, updated[i].start - 0.02).toFixed(2),
          );
        }
        if (updated[i].end <= updated[i].start) {
          updated[i].end = Number((updated[i].start + 0.5).toFixed(2));
        }
      }
      return updated.map((c, i) => ({ ...c, id: i + 1 }));
    });
  }, []);

  const handleDeleteCue = useCallback((index: number) => {
    setCues((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((c, i) => ({ ...c, id: i + 1 }));
    });
  }, []);

  return {
    cues,
    setCues,
    selectedCueIndex,
    setSelectedCueIndex,
    handleCueTextChange,
    handleCueTimingChange,
    handleNudgeAllCues,
    handleNudgeSingleCue,
    handleAddCue,
    handleDeleteCue,
  };
}
