/**
 * Pure decision logic for Drip Scheduler & Multi-Platform Export Packages.
 *
 * Indonesian Golden Hours (WIB - Western Indonesia Time / UTC+7):
 * - Slot 1 (Siang): 11:45 WIB (Lunch break traffic)
 * - Slot 2 (Sore):  17:30 WIB (Evening commute / winding down)
 * - Slot 3 (Malam): 20:15 WIB (Prime Time Night peak engagement)
 *
 * Smart Allocation Rules:
 * - Maximum 3 clips per day to prevent spam-flagging on TikTok/Shorts/Reels.
 * - Prioritizes clips with highest `viralScore` for Slot 3 (Prime Time Night).
 * - Remaining clips distributed across subsequent days (Day 2, Day 3, etc.).
 * - Generates CSV & structured JSON formats.
 *
 * 100% pure logic — zero filesystem or network side effects.
 */

import { generateClipCopywriting, ClipCopywriting } from './copywriting';
import type {
  GoldenSlot,
  SocialPlatform,
  SlotConfig,
  ScheduledClip,
  StructuredDaySchedule,
  StructuredSchedule,
} from '@/types/dripSchedule';

export type {
  GoldenSlot,
  SocialPlatform,
  SlotConfig,
  ScheduledClip,
  StructuredDaySchedule,
  StructuredSchedule,
};

export const GOLDEN_HOURS: Record<GoldenSlot, SlotConfig> = {
  LUNCH: {
    slot: 'LUNCH',
    name: 'Siang',
    timeWib: '11:45 WIB',
    time: '11:45',
  },
  AFTERNOON: {
    slot: 'AFTERNOON',
    name: 'Sore',
    timeWib: '17:30 WIB',
    time: '17:30',
  },
  PRIME_NIGHT: {
    slot: 'PRIME_NIGHT',
    name: 'Malam',
    timeWib: '20:15 WIB',
    time: '20:15',
  },
};

export const DEFAULT_PLATFORMS: SocialPlatform[] = ['YouTube Shorts', 'TikTok', 'Instagram Reels'];

export const CSV_HEADER =
  'Date,Time_WIB,Slot,Platform,Title,Caption,Hashtags,Video_File,Viral_Score,Duration_Sec';

export interface ScheduleClipInput {
  id: string;
  jobId: string;
  duration: number;
  viralScore?: number | null;
  exportPath?: string | null;
  editedPath?: string | null;
  cutPath?: string | null;
  videoPath?: string | null;
  hookHeadline?: string | null;
  sourceTitle?: string | null;
  sourceChannel?: string | null;
  transcriptText?: string;
  title?: string;
  hookSummary?: string;
  caption?: string;
  hashtags?: string[] | string;
  copywriting?: ClipCopywriting;
}

export interface ScheduleOptions {
  /** Starting date as YYYY-MM-DD or Date. Defaults to current date in WIB (UTC+7). */
  startDate?: string | Date;
  /** Maximum clips per calendar day (default: 3). */
  maxClipsPerDay?: number;
  /** Platforms to generate entries for (defaults to YouTube Shorts, TikTok, Instagram Reels). */
  platforms?: SocialPlatform[];
  /** Strategy for allocating 2 clips in a single day ('lunch_night' or 'afternoon_night', default: 'lunch_night'). */
  twoClipStrategy?: 'lunch_night' | 'afternoon_night';
}

/**
 * Get current date string (YYYY-MM-DD) in Western Indonesia Time (WIB / UTC+7).
 */
export function getWibDateString(date: Date = new Date()): string {
  const wibTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const year = wibTime.getUTCFullYear();
  const month = String(wibTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wibTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Add N days to a YYYY-MM-DD string, properly rolling over months and years.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * RFC 4180 compliant CSV cell escaper.
 * Encloses in quotes if the string contains commas, quotes, or newlines,
 * and escapes double quotes by doubling them.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Allocate 1 to 3 clips to the Golden Hour slots for a single day.
 *
 * Requirement:
 * - Highest viral score clip of the day MUST be assigned to Slot 3 (PRIME_NIGHT: 20:15 WIB).
 * - If 3 clips:
 *     - Slot 1 (LUNCH: 11:45 WIB): 3rd highest
 *     - Slot 2 (AFTERNOON: 17:30 WIB): 2nd highest
 *     - Slot 3 (PRIME_NIGHT: 20:15 WIB): 1st highest (Best viral score)
 * - If 2 clips:
 *     - Slot 1 (LUNCH: 11:45 WIB): 2nd highest (or Slot 2 if strategy is afternoon_night)
 *     - Slot 3 (PRIME_NIGHT: 20:15 WIB): 1st highest (Best viral score)
 * - If 1 clip:
 *     - Slot 3 (PRIME_NIGHT: 20:15 WIB): The single clip
 *
 * Returns an array in chronological order: LUNCH -> AFTERNOON -> PRIME_NIGHT.
 */
export function allocateClipsToDailySlots(
  dayClips: ScheduleClipInput[],
  twoClipStrategy: 'lunch_night' | 'afternoon_night' = 'lunch_night',
): { slot: GoldenSlot; clip: ScheduleClipInput }[] {
  if (dayClips.length === 0) {
    return [];
  }

  // Ensure clips are sorted descending by viralScore
  const sorted = [...dayClips].sort(
    (a, b) => (b.viralScore ?? 0) - (a.viralScore ?? 0) || a.id.localeCompare(b.id),
  );

  const bestClip = sorted[0];

  if (sorted.length === 1) {
    return [{ slot: 'PRIME_NIGHT', clip: bestClip }];
  }

  if (sorted.length === 2) {
    const secondClip = sorted[1];
    const secondarySlot: GoldenSlot = twoClipStrategy === 'afternoon_night' ? 'AFTERNOON' : 'LUNCH';

    return [
      { slot: secondarySlot, clip: secondClip },
      { slot: 'PRIME_NIGHT', clip: bestClip },
    ];
  }

  // 3 or more clips (capped at 3 daily slots)
  const secondClip = sorted[1];
  const thirdClip = sorted[2];

  return [
    { slot: 'LUNCH', clip: thirdClip },
    { slot: 'AFTERNOON', clip: secondClip },
    { slot: 'PRIME_NIGHT', clip: bestClip },
  ];
}

/**
 * Resolve copywriting details for a clip across specific platform.
 */
function resolvePlatformDetails(
  clip: ScheduleClipInput,
  platform: SocialPlatform,
): { title: string; hookSummary: string; caption: string; hashtags: string } {
  const hashtags = clip.hashtags
    ? Array.isArray(clip.hashtags)
      ? clip.hashtags.join(' ')
      : clip.hashtags
    : undefined;

  // If explicit title and caption are provided, respect them directly
  if (clip.caption) {
    let title = clip.title || clip.hookHeadline || clip.sourceTitle || 'Momen Pilihan';
    if (platform === 'YouTube Shorts' && !title.toLowerCase().includes('#shorts')) {
      title = `${title} #shorts`.slice(0, 100);
    }
    return {
      title,
      hookSummary: clip.hookSummary || '',
      caption: clip.caption,
      hashtags: hashtags || '',
    };
  }

  const copy =
    clip.copywriting ||
    generateClipCopywriting({
      hookHeadline: clip.hookHeadline || undefined,
      sourceTitle: clip.sourceTitle || undefined,
      sourceChannel: clip.sourceChannel || undefined,
      transcriptText: clip.transcriptText || undefined,
      duration: clip.duration,
    });

  const finalHashtags = hashtags !== undefined ? hashtags : copy.hashtagString;
  const hookSummary = clip.hookSummary || copy.hookSummary;

  if (platform === 'YouTube Shorts') {
    return {
      title: clip.title || copy.platforms.youtubeShorts.title || `${copy.title} #shorts`,
      hookSummary,
      caption: clip.caption || copy.platforms.youtubeShorts.description || copy.fullCaption,
      hashtags: finalHashtags,
    };
  }

  if (platform === 'TikTok') {
    return {
      title: clip.title || copy.title,
      hookSummary,
      caption: clip.caption || copy.platforms.tiktok.caption || copy.fullCaption,
      hashtags: finalHashtags,
    };
  }

  // Instagram Reels
  return {
    title: clip.title || copy.title,
    hookSummary,
    caption: clip.caption || copy.platforms.reels.caption || copy.fullCaption,
    hashtags: finalHashtags,
  };
}

/**
 * Core Drip Scheduler Engine.
 *
 * Takes a list of raw or exported clips, sorts them by viral score,
 * caps daily publishing at maxClipsPerDay (default 3), prioritizes
 * best clips at Prime Night (20:15 WIB), and distributes remaining
 * clips into future calendar days.
 */
export function scheduleClips(
  clips: ScheduleClipInput[],
  options?: ScheduleOptions,
): ScheduledClip[] {
  if (!clips || clips.length === 0) {
    return [];
  }

  const maxPerDay = Math.max(1, options?.maxClipsPerDay ?? 3);
  const platforms =
    options?.platforms && options.platforms.length > 0 ? options.platforms : DEFAULT_PLATFORMS;
  const twoClipStrategy = options?.twoClipStrategy ?? 'lunch_night';

  let startDateStr = '';
  if (options?.startDate) {
    if (typeof options.startDate === 'string') {
      // Validate or sanitize YYYY-MM-DD
      const trimmed = options.startDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        startDateStr = trimmed;
      } else {
        startDateStr = getWibDateString(new Date(trimmed));
      }
    } else {
      startDateStr = getWibDateString(options.startDate);
    }
  } else {
    startDateStr = getWibDateString();
  }

  // Step 1: Sort all clips by viralScore descending, then by id for determinism
  const sortedClips = [...clips].sort(
    (a, b) => (b.viralScore ?? 0) - (a.viralScore ?? 0) || a.id.localeCompare(b.id),
  );

  // Step 2: Chunk clips into batches of maxPerDay
  const dailyBatches: ScheduleClipInput[][] = [];
  for (let i = 0; i < sortedClips.length; i += maxPerDay) {
    dailyBatches.push(sortedClips.slice(i, i + maxPerDay));
  }

  const result: ScheduledClip[] = [];

  // Step 3: For each day, assign slots and produce entries for all target platforms
  dailyBatches.forEach((batch, dayIndex) => {
    const scheduledDate = addDays(startDateStr, dayIndex);
    const daySlotAssignments = allocateClipsToDailySlots(batch, twoClipStrategy);

    for (const { slot, clip } of daySlotAssignments) {
      const slotConfig = GOLDEN_HOURS[slot];
      const videoPath =
        clip.videoPath ||
        clip.exportPath ||
        clip.editedPath ||
        clip.cutPath ||
        `clip_${clip.id}.mp4`;
      const duration = Math.round((clip.duration || 0) * 10) / 10;
      const viralScore =
        typeof clip.viralScore === 'number' ? Number(clip.viralScore.toFixed(3)) : 0;

      for (const platform of platforms) {
        const details = resolvePlatformDetails(clip, platform);

        result.push({
          clipId: clip.id,
          jobId: clip.jobId,
          scheduledDate,
          scheduledTime: slotConfig.timeWib,
          slot,
          platform,
          title: details.title,
          hookSummary: details.hookSummary,
          caption: details.caption,
          hashtags: details.hashtags,
          videoPath,
          viralScore,
          duration,
        });
      }
    }
  });

  return result;
}

/**
 * Generate CSV string with RFC 4180 standard escaping.
 * Header: Date,Time_WIB,Slot,Platform,Title,Caption,Hashtags,Video_File,Viral_Score,Duration_Sec
 */
export function generateScheduleCsv(schedule: ScheduledClip[]): string {
  const lines: string[] = [CSV_HEADER];

  for (const item of schedule) {
    const row = [
      escapeCsvCell(item.scheduledDate),
      escapeCsvCell(item.scheduledTime),
      escapeCsvCell(item.slot),
      escapeCsvCell(item.platform),
      escapeCsvCell(item.title),
      escapeCsvCell(item.caption),
      escapeCsvCell(item.hashtags),
      escapeCsvCell(item.videoPath),
      escapeCsvCell(item.viralScore),
      escapeCsvCell(item.duration),
    ].join(',');
    lines.push(row);
  }

  return lines.join('\n');
}

/**
 * Build a structured schedule object grouping clips by calendar day and golden slot.
 */
export function buildStructuredSchedule(schedule: ScheduledClip[]): StructuredSchedule {
  if (schedule.length === 0) {
    const today = getWibDateString();
    return {
      totalClips: 0,
      totalDays: 0,
      totalEntries: 0,
      startDate: today,
      endDate: today,
      platforms: [],
      days: [],
      schedule: [],
    };
  }

  const uniqueClipIds = new Set<string>();
  const uniquePlatforms = new Set<SocialPlatform>();
  const dateMap = new Map<string, Map<GoldenSlot, ScheduledClip[]>>();

  for (const entry of schedule) {
    uniqueClipIds.add(entry.clipId);
    uniquePlatforms.add(entry.platform);

    if (!dateMap.has(entry.scheduledDate)) {
      dateMap.set(entry.scheduledDate, new Map());
    }
    const slotMap = dateMap.get(entry.scheduledDate)!;
    if (!slotMap.has(entry.slot)) {
      slotMap.set(entry.slot, []);
    }
    slotMap.get(entry.slot)!.push(entry);
  }

  const sortedDates = Array.from(dateMap.keys()).sort();
  const days: StructuredDaySchedule[] = sortedDates.map((date, idx) => {
    const slotMap = dateMap.get(date)!;
    const slots: StructuredDaySchedule['slots'] = [];

    const slotOrder: GoldenSlot[] = ['LUNCH', 'AFTERNOON', 'PRIME_NIGHT'];
    for (const slot of slotOrder) {
      const entries = slotMap.get(slot);
      if (entries && entries.length > 0) {
        slots.push({
          slot,
          timeWib: GOLDEN_HOURS[slot].timeWib,
          clipId: entries[0].clipId,
          entries,
        });
      }
    }

    return {
      date,
      dayNumber: idx + 1,
      slots,
    };
  });

  return {
    totalClips: uniqueClipIds.size,
    totalDays: sortedDates.length,
    totalEntries: schedule.length,
    startDate: sortedDates[0],
    endDate: sortedDates[sortedDates.length - 1],
    platforms: Array.from(uniquePlatforms),
    days,
    schedule,
  };
}

/**
 * Generate formatted JSON string for export or API response.
 */
export function generateScheduleJson(
  schedule: ScheduledClip[],
  options?: { pretty?: boolean },
): string {
  const structured = buildStructuredSchedule(schedule);
  return (options?.pretty ?? true)
    ? JSON.stringify(structured, null, 2)
    : JSON.stringify(structured);
}
