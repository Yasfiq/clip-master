import { describe, it, expect } from 'vitest';
import {
  scheduleClips,
  allocateClipsToDailySlots,
  generateScheduleCsv,
  buildStructuredSchedule,
  generateScheduleJson,
  escapeCsvCell,
  addDays,
  getWibDateString,
  GOLDEN_HOURS,
  CSV_HEADER,
  ScheduleClipInput,
} from '@/pipeline/logic/dripScheduler';

describe('Drip Scheduler Pure Logic', () => {
  describe('Indonesian Golden Hours WIB Slots', () => {
    it('defines exact Golden Hour times for Lunch, Afternoon, and Prime Night in WIB', () => {
      expect(GOLDEN_HOURS.LUNCH.timeWib).toBe('11:45 WIB');
      expect(GOLDEN_HOURS.LUNCH.time).toBe('11:45');
      expect(GOLDEN_HOURS.LUNCH.name).toBe('Siang');

      expect(GOLDEN_HOURS.AFTERNOON.timeWib).toBe('17:30 WIB');
      expect(GOLDEN_HOURS.AFTERNOON.time).toBe('17:30');
      expect(GOLDEN_HOURS.AFTERNOON.name).toBe('Sore');

      expect(GOLDEN_HOURS.PRIME_NIGHT.timeWib).toBe('20:15 WIB');
      expect(GOLDEN_HOURS.PRIME_NIGHT.time).toBe('20:15');
      expect(GOLDEN_HOURS.PRIME_NIGHT.name).toBe('Malam');
    });

    it('assigns 3 clips to LUNCH, AFTERNOON, and PRIME_NIGHT chronologically', () => {
      const clips: ScheduleClipInput[] = [
        { id: 'c1', jobId: 'j1', duration: 30, viralScore: 0.95 },
        { id: 'c2', jobId: 'j1', duration: 40, viralScore: 0.8 },
        { id: 'c3', jobId: 'j1', duration: 50, viralScore: 0.6 },
      ];

      const slots = allocateClipsToDailySlots(clips);
      expect(slots).toHaveLength(3);

      // Chronological order: LUNCH -> AFTERNOON -> PRIME_NIGHT
      expect(slots[0].slot).toBe('LUNCH');
      expect(slots[0].clip.id).toBe('c3'); // 3rd best

      expect(slots[1].slot).toBe('AFTERNOON');
      expect(slots[1].clip.id).toBe('c2'); // 2nd best

      expect(slots[2].slot).toBe('PRIME_NIGHT');
      expect(slots[2].clip.id).toBe('c1'); // Best clip (viralScore 0.95)
    });

    it('places the single clip at PRIME_NIGHT (20:15 WIB)', () => {
      const clips: ScheduleClipInput[] = [
        { id: 'c1', jobId: 'j1', duration: 45, viralScore: 0.77 },
      ];

      const slots = allocateClipsToDailySlots(clips);
      expect(slots).toHaveLength(1);
      expect(slots[0].slot).toBe('PRIME_NIGHT');
      expect(slots[0].clip.id).toBe('c1');
    });

    it('allocates 2 clips with best clip at PRIME_NIGHT and secondary at LUNCH by default', () => {
      const clips: ScheduleClipInput[] = [
        { id: 'c_mid', jobId: 'j1', duration: 40, viralScore: 0.5 },
        { id: 'c_top', jobId: 'j1', duration: 45, viralScore: 0.9 },
      ];

      const slots = allocateClipsToDailySlots(clips, 'lunch_night');
      expect(slots).toHaveLength(2);
      expect(slots[0].slot).toBe('LUNCH');
      expect(slots[0].clip.id).toBe('c_mid');
      expect(slots[1].slot).toBe('PRIME_NIGHT');
      expect(slots[1].clip.id).toBe('c_top');
    });

    it('supports afternoon_night strategy for 2 clips', () => {
      const clips: ScheduleClipInput[] = [
        { id: 'c_mid', jobId: 'j1', duration: 40, viralScore: 0.5 },
        { id: 'c_top', jobId: 'j1', duration: 45, viralScore: 0.9 },
      ];

      const slots = allocateClipsToDailySlots(clips, 'afternoon_night');
      expect(slots).toHaveLength(2);
      expect(slots[0].slot).toBe('AFTERNOON');
      expect(slots[0].clip.id).toBe('c_mid');
      expect(slots[1].slot).toBe('PRIME_NIGHT');
      expect(slots[1].clip.id).toBe('c_top');
    });
  });

  describe('Viral Score Priority and Daily Spreading (Anti-Spam Quota)', () => {
    it('prioritizes highest viralScore clips into PRIME_NIGHT (Slot 3)', () => {
      const input: ScheduleClipInput[] = [
        { id: 'clip-low', jobId: 'j1', duration: 30, viralScore: 0.45 },
        { id: 'clip-mid', jobId: 'j1', duration: 35, viralScore: 0.7 },
        { id: 'clip-star', jobId: 'j1', duration: 40, viralScore: 0.99 },
      ];

      const schedule = scheduleClips(input, {
        startDate: '2026-09-17',
        platforms: ['TikTok'],
      });

      expect(schedule).toHaveLength(3);

      const nightEntry = schedule.find((s) => s.slot === 'PRIME_NIGHT');
      expect(nightEntry).toBeDefined();
      expect(nightEntry?.clipId).toBe('clip-star');
      expect(nightEntry?.scheduledTime).toBe('20:15 WIB');
      expect(nightEntry?.viralScore).toBe(0.99);

      const afternoonEntry = schedule.find((s) => s.slot === 'AFTERNOON');
      expect(afternoonEntry?.clipId).toBe('clip-mid');
      expect(afternoonEntry?.scheduledTime).toBe('17:30 WIB');

      const lunchEntry = schedule.find((s) => s.slot === 'LUNCH');
      expect(lunchEntry?.clipId).toBe('clip-low');
      expect(lunchEntry?.scheduledTime).toBe('11:45 WIB');
    });

    it('enforces maximum 3 clips per day and distributes remaining clips into Day 2 and Day 3', () => {
      const input: ScheduleClipInput[] = [
        { id: 'c1', jobId: 'j1', duration: 30, viralScore: 0.95 },
        { id: 'c2', jobId: 'j1', duration: 30, viralScore: 0.9 },
        { id: 'c3', jobId: 'j1', duration: 30, viralScore: 0.85 },
        { id: 'c4', jobId: 'j1', duration: 30, viralScore: 0.8 },
        { id: 'c5', jobId: 'j1', duration: 30, viralScore: 0.75 },
        { id: 'c6', jobId: 'j1', duration: 30, viralScore: 0.7 },
        { id: 'c7', jobId: 'j1', duration: 30, viralScore: 0.65 },
      ];

      const schedule = scheduleClips(input, {
        startDate: '2026-09-17',
        platforms: ['YouTube Shorts'],
      });

      // 7 clips * 1 platform = 7 scheduled entries across 3 days
      expect(schedule).toHaveLength(7);

      // Day 1 (2026-09-17): top 3 clips (c1, c2, c3)
      const day1 = schedule.filter((s) => s.scheduledDate === '2026-09-17');
      expect(day1).toHaveLength(3);
      const day1Clips = day1.map((s) => s.clipId);
      expect(day1Clips).toEqual(expect.arrayContaining(['c1', 'c2', 'c3']));
      // Best of Day 1 is c1 at PRIME_NIGHT
      expect(day1.find((s) => s.slot === 'PRIME_NIGHT')?.clipId).toBe('c1');

      // Day 2 (2026-09-18): next 3 clips (c4, c5, c6)
      const day2 = schedule.filter((s) => s.scheduledDate === '2026-09-18');
      expect(day2).toHaveLength(3);
      const day2Clips = day2.map((s) => s.clipId);
      expect(day2Clips).toEqual(expect.arrayContaining(['c4', 'c5', 'c6']));
      // Best of Day 2 is c4 at PRIME_NIGHT
      expect(day2.find((s) => s.slot === 'PRIME_NIGHT')?.clipId).toBe('c4');

      // Day 3 (2026-09-19): remaining 1 clip (c7)
      const day3 = schedule.filter((s) => s.scheduledDate === '2026-09-19');
      expect(day3).toHaveLength(1);
      expect(day3[0].clipId).toBe('c7');
      expect(day3[0].slot).toBe('PRIME_NIGHT');
      expect(day3[0].scheduledTime).toBe('20:15 WIB');
    });

    it('correctly handles month roll-overs for multi-day schedules', () => {
      const date1 = '2026-09-30';
      expect(addDays(date1, 1)).toBe('2026-10-01');
      expect(addDays(date1, 2)).toBe('2026-10-02');

      const dateYearEnd = '2026-12-31';
      expect(addDays(dateYearEnd, 1)).toBe('2027-01-01');
    });

    it('handles null, undefined, or missing viralScores gracefully', () => {
      const input: ScheduleClipInput[] = [
        { id: 'c_null', jobId: 'j1', duration: 30, viralScore: null },
        { id: 'c_score', jobId: 'j1', duration: 30, viralScore: 0.88 },
        { id: 'c_undef', jobId: 'j1', duration: 30 },
      ];

      const schedule = scheduleClips(input, {
        startDate: '2026-09-17',
        platforms: ['TikTok'],
      });

      expect(schedule).toHaveLength(3);
      const primeNight = schedule.find((s) => s.slot === 'PRIME_NIGHT');
      expect(primeNight?.clipId).toBe('c_score');
    });

    it('returns empty array when given empty clips', () => {
      expect(scheduleClips([])).toEqual([]);
    });
  });

  describe('Multi-Platform Integration', () => {
    it('generates entries for YouTube Shorts, TikTok, and Instagram Reels by default', () => {
      const input: ScheduleClipInput[] = [
        {
          id: 'clip_demo',
          jobId: 'job_123',
          duration: 45.2,
          viralScore: 0.92,
          hookHeadline: 'CARA SUKSES MEMBANGUN BISNIS',
          sourceChannel: 'Raditya Dika',
          transcriptText:
            'Kalau mau mulai bisnis, jangan mikirin modal dulu. Mulai dari masalah yang mau diselesaikan.',
        },
      ];

      const schedule = scheduleClips(input, { startDate: '2026-09-17' });

      // 1 clip * 3 default platforms = 3 entries
      expect(schedule).toHaveLength(3);

      const platforms = schedule.map((s) => s.platform);
      expect(platforms).toEqual(['YouTube Shorts', 'TikTok', 'Instagram Reels']);

      for (const entry of schedule) {
        expect(entry.clipId).toBe('clip_demo');
        expect(entry.jobId).toBe('job_123');
        expect(entry.scheduledDate).toBe('2026-09-17');
        expect(entry.scheduledTime).toBe('20:15 WIB');
        expect(entry.slot).toBe('PRIME_NIGHT');
        expect(entry.title).toBeTruthy();
        expect(entry.caption).toBeTruthy();
        expect(entry.hashtags).toContain('#');
        expect(entry.duration).toBe(45.2);
        expect(entry.viralScore).toBe(0.92);
      }

      // YouTube Shorts title should include #shorts tag
      const yt = schedule.find((s) => s.platform === 'YouTube Shorts');
      expect(yt?.title).toContain('#shorts');

      // TikTok caption should be formatted
      const tiktok = schedule.find((s) => s.platform === 'TikTok');
      expect(tiktok?.caption).toBeTruthy();
    });
  });

  describe('CSV Generation & RFC 4180 Escaping', () => {
    it('escapes cells containing commas, double quotes, and newlines properly', () => {
      expect(escapeCsvCell('Simple text')).toBe('Simple text');
      expect(escapeCsvCell('Hello, World')).toBe('"Hello, World"');
      expect(escapeCsvCell('He said "Awesome"')).toBe('"He said ""Awesome"""');
      expect(escapeCsvCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
      expect(escapeCsvCell(null)).toBe('');
      expect(escapeCsvCell(undefined)).toBe('');
    });

    it('generates a valid RFC 4180 CSV string with the exact requested headers', () => {
      const input: ScheduleClipInput[] = [
        {
          id: 'clip_01',
          jobId: 'job_test',
          duration: 60,
          viralScore: 0.95,
          title: 'Strategi Bisnis, Modal Kecil',
          caption: 'Simak tips berikut!\n"Konsisten adalah kunci utama."\nCredit: Test Channel',
          hashtags: '#shorts #bisnis #fyp',
          videoPath: 'clip_job_test_001.mp4',
        },
      ];

      const schedule = scheduleClips(input, {
        startDate: '2026-09-17',
        platforms: ['TikTok'],
      });

      const csv = generateScheduleCsv(schedule);
      expect(csv).toContain(CSV_HEADER);

      const lines = csv.split('\n');
      expect(lines[0]).toBe(CSV_HEADER);
      expect(lines[0]).toBe(
        'Date,Time_WIB,Slot,Platform,Title,Caption,Hashtags,Video_File,Viral_Score,Duration_Sec',
      );

      // Check row contents
      expect(csv).toContain('2026-09-17');
      expect(csv).toContain('20:15 WIB');
      expect(csv).toContain('PRIME_NIGHT');
      expect(csv).toContain('TikTok');
      expect(csv).toContain('"Strategi Bisnis, Modal Kecil"');
      expect(csv).toContain('""Konsisten adalah kunci utama.""');
      expect(csv).toContain('clip_job_test_001.mp4');
      expect(csv).toContain('0.95');
      expect(csv).toContain('60');
    });

    it('generates valid CSV header when schedule is empty', () => {
      const csv = generateScheduleCsv([]);
      expect(csv).toBe(CSV_HEADER);
    });
  });

  describe('Structured JSON Generation', () => {
    it('builds a hierarchical structured schedule object', () => {
      const input: ScheduleClipInput[] = [
        { id: 'c1', jobId: 'j1', duration: 40, viralScore: 0.9 },
        { id: 'c2', jobId: 'j1', duration: 50, viralScore: 0.7 },
      ];

      const schedule = scheduleClips(input, {
        startDate: '2026-09-17',
        platforms: ['YouTube Shorts', 'TikTok'],
      });

      const structured = buildStructuredSchedule(schedule);

      expect(structured.totalClips).toBe(2);
      expect(structured.totalDays).toBe(1);
      expect(structured.totalEntries).toBe(4); // 2 clips * 2 platforms
      expect(structured.startDate).toBe('2026-09-17');
      expect(structured.endDate).toBe('2026-09-17');
      expect(structured.days).toHaveLength(1);

      const day1 = structured.days[0];
      expect(day1.date).toBe('2026-09-17');
      expect(day1.dayNumber).toBe(1);
      expect(day1.slots).toHaveLength(2); // LUNCH and PRIME_NIGHT

      const jsonString = generateScheduleJson(schedule);
      const parsed = JSON.parse(jsonString);
      expect(parsed.totalClips).toBe(2);
      expect(parsed.schedule).toHaveLength(4);
    });

    it('handles empty schedule in JSON generator gracefully', () => {
      const structured = buildStructuredSchedule([]);
      expect(structured.totalClips).toBe(0);
      expect(structured.totalDays).toBe(0);
      expect(structured.schedule).toEqual([]);

      const json = generateScheduleJson([]);
      const parsed = JSON.parse(json);
      expect(parsed.totalClips).toBe(0);
    });
  });
});
