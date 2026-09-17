export type GoldenSlot = 'LUNCH' | 'AFTERNOON' | 'PRIME_NIGHT';

export type SocialPlatform = 'YouTube Shorts' | 'TikTok' | 'Instagram Reels';

export interface SlotConfig {
  slot: GoldenSlot;
  name: string;
  timeWib: string; // e.g. '11:45 WIB'
  time: string; // e.g. '11:45'
}

export interface ScheduledClip {
  clipId: string;
  jobId: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:mm WIB
  slot: GoldenSlot;
  platform: SocialPlatform;
  title: string;
  hookSummary: string;
  caption: string;
  hashtags: string;
  videoPath: string;
  viralScore: number;
  duration: number;
}

export interface StructuredDaySchedule {
  date: string;
  dayNumber: number;
  slots: {
    slot: GoldenSlot;
    timeWib: string;
    clipId: string;
    entries: ScheduledClip[];
  }[];
}

export interface StructuredSchedule {
  totalClips: number;
  totalDays: number;
  totalEntries: number;
  startDate: string;
  endDate: string;
  platforms: SocialPlatform[];
  days: StructuredDaySchedule[];
  schedule: ScheduledClip[];
}
