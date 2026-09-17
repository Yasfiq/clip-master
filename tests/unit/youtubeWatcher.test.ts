import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  decodeXmlEntities,
  buildRssFeedUrl,
  resolveChannelIdFromHtml,
  resolveChannelTitleFromHtml,
  parseYouTubeChannelInput,
  parseYouTubeRssXml,
  resolveYouTubeChannel,
  addYouTubeChannel,
  removeYouTubeChannel,
  pollYouTubeFeeds,
  startYouTubeWatcher,
  stopYouTubeWatcher,
  isYouTubeWatcherActive,
  getYouTubeWatcherStatus,
  initYouTubeWatcher,
  _resetYouTubeWatcherStateForTesting,
} from '../../src/server/youtubeWatcher';
import { db } from '../../src/server/db';
import { JobStatus } from '@prisma/client';

const SAMPLE_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UC-lHJZR3Gqxm24_Vd_AJ5Yw"/>
  <id>yt:channel:UC-lHJZR3Gqxm24_Vd_AJ5Yw</id>
  <yt:channelId>UC-lHJZR3Gqxm24_Vd_AJ5Yw</yt:channelId>
  <title>Raditya Dika</title>
  <link rel="alternate" href="https://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw"/>
  <author>
    <name>Raditya Dika</name>
    <uri>https://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw</uri>
  </author>
  <published>2007-06-29T10:18:24+00:00</published>
  <entry>
    <id>yt:video:vid_001_abc</id>
    <yt:videoId>vid_001_abc</yt:videoId>
    <yt:channelId>UC-lHJZR3Gqxm24_Vd_AJ5Yw</yt:channelId>
    <title>Podcast Bersama Cania &amp; Pandji: Bahas AI &lt;Viral&gt;</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid_001_abc"/>
    <author>
      <name>Raditya Dika</name>
      <uri>https://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw</uri>
    </author>
    <published>2026-09-16T10:00:00+00:00</published>
    <updated>2026-09-16T10:00:00+00:00</updated>
  </entry>
  <entry>
    <id>yt:video:vid_002_def</id>
    <yt:videoId>vid_002_def</yt:videoId>
    <yt:channelId>UC-lHJZR3Gqxm24_Vd_AJ5Yw</yt:channelId>
    <title><![CDATA[Review Gadget Canggih "Masa Depan" & Unboxing]]></title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=vid_002_def"/>
    <author>
      <name>Raditya Dika</name>
      <uri>https://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw</uri>
    </author>
    <published>2026-09-17T08:00:00+00:00</published>
    <updated>2026-09-17T08:00:00+00:00</updated>
  </entry>
</feed>`;

describe('YouTube Watcher: Pure XML RSS Parser', () => {
  it('parses standard YouTube RSS feed XML into structured video entries', () => {
    const entries = parseYouTubeRssXml(SAMPLE_FEED_XML);

    expect(entries).toHaveLength(2);

    expect(entries[0].videoId).toBe('vid_001_abc');
    expect(entries[0].title).toBe('Podcast Bersama Cania & Pandji: Bahas AI <Viral>');
    expect(entries[0].channelName).toBe('Raditya Dika');
    expect(entries[0].channelId).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');
    expect(entries[0].publishedAt).toBe('2026-09-16T10:00:00+00:00');
    expect(entries[0].videoUrl).toBe('https://www.youtube.com/watch?v=vid_001_abc');

    expect(entries[1].videoId).toBe('vid_002_def');
    expect(entries[1].title).toBe('Review Gadget Canggih "Masa Depan" & Unboxing');
    expect(entries[1].publishedAt).toBe('2026-09-17T08:00:00+00:00');
  });

  it('correctly decodes XML entities and CDATA wrappers', () => {
    const input = 'Judul &amp; Kisah &quot;Hebat&quot; &#39;Keren&#39; &lt;Part 1&gt;';
    expect(decodeXmlEntities(input)).toBe('Judul & Kisah "Hebat" \'Keren\' <Part 1>');

    const cdataInput = '<![CDATA[Eksklusif: Rahasia Sukses & Kaya]]>';
    expect(decodeXmlEntities(cdataInput)).toBe('Eksklusif: Rahasia Sukses & Kaya');
  });

  it('falls back to feed-level channel name and channelId if entry lacks them', () => {
    const minimalXml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
      <yt:channelId>UC1234567890123456789012</yt:channelId>
      <title>Curhat Bang Denny Sumargo</title>
      <entry>
        <yt:videoId>test_vid_999</yt:videoId>
        <title>Kisah Nyata</title>
        <published>2026-09-17T01:00:00+00:00</published>
      </entry>
    </feed>`;

    const entries = parseYouTubeRssXml(minimalXml);
    expect(entries).toHaveLength(1);
    expect(entries[0].videoId).toBe('test_vid_999');
    expect(entries[0].channelName).toBe('Curhat Bang Denny Sumargo');
    expect(entries[0].channelId).toBe('UC1234567890123456789012');
    expect(entries[0].videoUrl).toBe('https://www.youtube.com/watch?v=test_vid_999');
  });

  it('gracefully handles empty or malformed XML without throwing', () => {
    expect(parseYouTubeRssXml('')).toEqual([]);
    expect(parseYouTubeRssXml('<feed></feed>')).toEqual([]);
    expect(parseYouTubeRssXml('invalid xml content')).toEqual([]);
  });
});

describe('YouTube Watcher: Channel Resolver & HTML Parsing', () => {
  it('correctly classifies various channel input shapes', () => {
    expect(parseYouTubeChannelInput('UC-lHJZR3Gqxm24_Vd_AJ5Yw')).toEqual({
      type: 'channelId',
      value: 'UC-lHJZR3Gqxm24_Vd_AJ5Yw',
    });

    expect(
      parseYouTubeChannelInput('https://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw'),
    ).toEqual({
      type: 'channelId',
      value: 'UC-lHJZR3Gqxm24_Vd_AJ5Yw',
    });

    expect(
      parseYouTubeChannelInput(
        'https://www.youtube.com/feeds/videos.xml?channel_id=UC-lHJZR3Gqxm24_Vd_AJ5Yw',
      ),
    ).toEqual({
      type: 'channelId',
      value: 'UC-lHJZR3Gqxm24_Vd_AJ5Yw',
    });

    expect(parseYouTubeChannelInput('@RadityaDika')).toEqual({
      type: 'handle',
      value: '@RadityaDika',
    });

    expect(parseYouTubeChannelInput('https://www.youtube.com/@CurhatBang')).toEqual({
      type: 'handle',
      value: '@CurhatBang',
    });

    expect(parseYouTubeChannelInput('DeddyCorbuzier')).toEqual({
      type: 'handle',
      value: '@DeddyCorbuzier',
    });
  });

  it('builds canonical YouTube RSS feed URL', () => {
    expect(buildRssFeedUrl('UC-lHJZR3Gqxm24_Vd_AJ5Yw')).toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC-lHJZR3Gqxm24_Vd_AJ5Yw',
    );
  });

  it('resolves channelId from YouTube page HTML patterns', () => {
    const htmlMetaItemprop =
      '<html><head><meta itemprop="channelId" content="UC-lHJZR3Gqxm24_Vd_AJ5Yw"></head></html>';
    expect(resolveChannelIdFromHtml(htmlMetaItemprop)).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');

    const htmlJsonExternalId =
      '<html><script>var ytInitialData = {"externalId":"UC-lHJZR3Gqxm24_Vd_AJ5Yw"};</script></html>';
    expect(resolveChannelIdFromHtml(htmlJsonExternalId)).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');

    const htmlJsonBrowseId =
      '<html><script>var data = {"browseId":"UC-lHJZR3Gqxm24_Vd_AJ5Yw"};</script></html>';
    expect(resolveChannelIdFromHtml(htmlJsonBrowseId)).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');

    const htmlCanonical =
      '<html><link rel="canonical" href="https://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw"></html>';
    expect(resolveChannelIdFromHtml(htmlCanonical)).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');

    expect(resolveChannelIdFromHtml('<html><body>No channel id here</body></html>')).toBeNull();
  });

  it('resolves channel title from HTML', () => {
    const htmlOgTitle =
      '<html><head><meta property="og:title" content="Raditya Dika"></head></html>';
    expect(resolveChannelTitleFromHtml(htmlOgTitle)).toBe('Raditya Dika');

    const htmlTitleTag =
      '<html><head><title>Curhat Bang Denny Sumargo - YouTube</title></head></html>';
    expect(resolveChannelTitleFromHtml(htmlTitleTag)).toBe('Curhat Bang Denny Sumargo');
  });

  it('resolves handle to channelId and name using mocked fetch', async () => {
    const mockFetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('@RadityaDika')) {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <html>
              <head>
                <meta itemprop="channelId" content="UC-lHJZR3Gqxm24_Vd_AJ5Yw">
                <meta property="og:title" content="Raditya Dika">
              </head>
            </html>
          `,
        } as any;
      }
      return { ok: false, status: 404, statusText: 'Not Found' } as any;
    };

    const resolved = await resolveYouTubeChannel('@RadityaDika', mockFetch as any);
    expect(resolved.channelId).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');
    expect(resolved.name).toBe('Raditya Dika');
    expect(resolved.handle).toBe('@RadityaDika');
    expect(resolved.feedUrl).toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC-lHJZR3Gqxm24_Vd_AJ5Yw',
    );
  });

  it('throws descriptive error on non-existent handle or failed fetch', async () => {
    const mockFetch = async () =>
      ({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }) as any;

    await expect(
      resolveYouTubeChannel('@non_existent_channel_xyz_999', mockFetch as any),
    ).rejects.toThrow('Failed to fetch YouTube page');
  });
});

describe('YouTube Watcher: Channel Persistence & Management', () => {
  let tempDir: string;
  let channelsPath: string;
  let historyPath: string;

  const mockFetch = async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes('@RadityaDika') || urlStr.includes('UC-lHJZR3Gqxm24_Vd_AJ5Yw')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <head>
              <meta itemprop="channelId" content="UC-lHJZR3Gqxm24_Vd_AJ5Yw">
              <meta property="og:title" content="Raditya Dika">
            </head>
          </html>
        `,
      } as any;
    }
    if (urlStr.includes('@CurhatBang') || urlStr.includes('UCcurhat1234567890123456')) {
      return {
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <head>
              <meta itemprop="channelId" content="UCcurhat1234567890123456">
              <meta property="og:title" content="Curhat Bang Denny Sumargo">
            </head>
          </html>
        `,
      } as any;
    }
    return { ok: false, status: 404, statusText: 'Not Found' } as any;
  };

  beforeEach(async () => {
    await _resetYouTubeWatcherStateForTesting();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-watcher-test-'));
    channelsPath = path.join(tempDir, 'youtube_channels.json');
    historyPath = path.join(tempDir, 'youtube_watcher_history.json');
  });

  afterEach(async () => {
    await _resetYouTubeWatcherStateForTesting();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('adds and saves channels to JSON storage', async () => {
    const channel = await addYouTubeChannel('@RadityaDika', {
      channelsPath,
      historyPath,
      fetchFn: mockFetch as any,
    });

    expect(channel.id).toBeDefined();
    expect(channel.channelId).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');
    expect(channel.name).toBe('Raditya Dika');
    expect(channel.handle).toBe('@RadityaDika');
    expect(channel.addedAt).toBeDefined();

    // Verify file content on disk
    const saved = JSON.parse(await fs.readFile(channelsPath, 'utf-8'));
    expect(saved).toHaveLength(1);
    expect(saved[0].channelId).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');
  });

  it('deduplicates channel addition when adding the same channel twice', async () => {
    await addYouTubeChannel('@RadityaDika', {
      channelsPath,
      historyPath,
      fetchFn: mockFetch as any,
    });

    const secondAdd = await addYouTubeChannel(
      'https://www.youtube.com/channel/UC-lHJZR3Gqxm24_Vd_AJ5Yw',
      {
        channelsPath,
        historyPath,
        fetchFn: mockFetch as any,
      },
    );

    const saved = JSON.parse(await fs.readFile(channelsPath, 'utf-8'));
    expect(saved).toHaveLength(1);
    expect(secondAdd.channelId).toBe('UC-lHJZR3Gqxm24_Vd_AJ5Yw');
  });

  it('removes channels by ID, channelId, or handle', async () => {
    const c1 = await addYouTubeChannel('@RadityaDika', {
      channelsPath,
      historyPath,
      fetchFn: mockFetch as any,
    });
    const c2 = await addYouTubeChannel('@CurhatBang', {
      channelsPath,
      historyPath,
      fetchFn: mockFetch as any,
    });

    let saved = JSON.parse(await fs.readFile(channelsPath, 'utf-8'));
    expect(saved).toHaveLength(2);

    // Remove first by channelId
    const removed1 = await removeYouTubeChannel(c1.channelId, { channelsPath, historyPath });
    expect(removed1).toBe(true);

    saved = JSON.parse(await fs.readFile(channelsPath, 'utf-8'));
    expect(saved).toHaveLength(1);
    expect(saved[0].channelId).toBe(c2.channelId);

    // Remove second by handle
    const removed2 = await removeYouTubeChannel('@CurhatBang', { channelsPath, historyPath });
    expect(removed2).toBe(true);

    saved = JSON.parse(await fs.readFile(channelsPath, 'utf-8'));
    expect(saved).toHaveLength(0);

    // Removing non-existent returns false
    expect(await removeYouTubeChannel('non_existent', { channelsPath, historyPath })).toBe(false);
  });
});

describe('YouTube Watcher: Video Deduplication & Automated Job Creation', () => {
  let tempDir: string;
  let channelsPath: string;
  let historyPath: string;
  const createdJobIds: string[] = [];

  beforeEach(async () => {
    await _resetYouTubeWatcherStateForTesting();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-dedup-test-'));
    channelsPath = path.join(tempDir, 'youtube_channels.json');
    historyPath = path.join(tempDir, 'youtube_watcher_history.json');
  });

  afterEach(async () => {
    await _resetYouTubeWatcherStateForTesting();
    for (const jobId of createdJobIds) {
      await db.job.deleteMany({ where: { id: jobId } }).catch(() => {});
    }
    createdJobIds.length = 0;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('detects new videos, creates PENDING jobs in SQLite DB, and deduplicates on subsequent polls', async () => {
    const mockChannel = {
      id: 'channel_raditya',
      name: 'Raditya Dika',
      handle: '@RadityaDika',
      channelId: 'UC-lHJZR3Gqxm24_Vd_AJ5Yw',
      addedAt: new Date().toISOString(),
    };
    await fs.writeFile(channelsPath, JSON.stringify([mockChannel]));

    const mockFetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('feeds/videos.xml')) {
        return {
          ok: true,
          status: 200,
          text: async () => SAMPLE_FEED_XML,
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    // First Poll: Should detect 2 new videos and create 2 PENDING jobs
    const pollResult1 = await pollYouTubeFeeds({
      channelsPath,
      historyPath,
      fetchFn: mockFetch as any,
      autoStartJob: false, // Don't run background media runner in unit test
    });

    expect(pollResult1.newlyDetectedCount).toBe(2);
    expect(pollResult1.jobsCreated).toHaveLength(2);
    createdJobIds.push(...pollResult1.jobsCreated);

    // Verify DB Job records
    const job1 = await db.job.findUnique({ where: { id: pollResult1.jobsCreated[0] } });
    expect(job1).not.toBeNull();
    expect(job1!.status).toBe(JobStatus.PENDING);
    expect(job1!.sourceUrl).toBe('https://www.youtube.com/watch?v=vid_001_abc');
    expect(job1!.sourceTitle).toBe('Podcast Bersama Cania & Pandji: Bahas AI <Viral>');
    expect(job1!.sourceChannel).toBe('Raditya Dika');

    const job2 = await db.job.findUnique({ where: { id: pollResult1.jobsCreated[1] } });
    expect(job2).not.toBeNull();
    expect(job2!.sourceUrl).toBe('https://www.youtube.com/watch?v=vid_002_def');

    // Verify history file
    const historyFile = JSON.parse(await fs.readFile(historyPath, 'utf-8'));
    expect(historyFile).toHaveLength(2);

    // Second Poll: Identical feed should detect 0 new videos (100% deduplication)
    const pollResult2 = await pollYouTubeFeeds({
      channelsPath,
      historyPath,
      fetchFn: mockFetch as any,
      autoStartJob: false,
    });

    expect(pollResult2.newlyDetectedCount).toBe(0);
    expect(pollResult2.jobsCreated).toHaveLength(0);
  });
});

describe('YouTube Watcher: Daemon Lifecycle', () => {
  afterEach(async () => {
    await _resetYouTubeWatcherStateForTesting();
  });

  it('starts and stops daemon, updating active state and status getters', async () => {
    expect(isYouTubeWatcherActive()).toBe(false);

    await startYouTubeWatcher({ pollIntervalMs: 60000 });
    expect(isYouTubeWatcherActive()).toBe(true);

    const status = getYouTubeWatcherStatus();
    expect(status.active).toBe(true);
    expect(status.pollIntervalMs).toBe(60000);
    expect(Array.isArray(status.channels)).toBe(true);
    expect(Array.isArray(status.history)).toBe(true);

    await stopYouTubeWatcher();
    expect(isYouTubeWatcherActive()).toBe(false);
  });

  it('bypasses startup when DISABLE_YOUTUBE_WATCHER is set to true', async () => {
    const prevEnv = process.env.DISABLE_YOUTUBE_WATCHER;
    try {
      process.env.DISABLE_YOUTUBE_WATCHER = 'true';
      await initYouTubeWatcher();
      expect(isYouTubeWatcherActive()).toBe(false);
    } finally {
      process.env.DISABLE_YOUTUBE_WATCHER = prevEnv;
    }
  });
});

describe('YouTube Watcher: REST API Endpoint (/api/system/youtube-watcher)', () => {
  afterEach(async () => {
    await _resetYouTubeWatcherStateForTesting();
  });

  it('GET returns valid watcher status payload', async () => {
    const { GET } = await import('../../src/app/api/system/youtube-watcher/route');
    const { NextRequest } = await import('next/server');
    const req = new NextRequest('http://127.0.0.1:3000/api/system/youtube-watcher');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.active).toBe(false);
    expect(Array.isArray(body.data.channels)).toBe(true);
    expect(Array.isArray(body.data.history)).toBe(true);
  });

  it('POST controls lifecycle and toggles active state', async () => {
    const { POST } = await import('../../src/app/api/system/youtube-watcher/route');
    const { NextRequest } = await import('next/server');

    // 1. Explicit start
    const startReq = new NextRequest('http://127.0.0.1:3000/api/system/youtube-watcher', {
      method: 'POST',
      body: JSON.stringify({ active: true }),
    });
    const startRes = await POST(startReq);
    expect(startRes.status).toBe(200);
    const startBody = await startRes.json();
    expect(startBody.success).toBe(true);
    expect(startBody.data.active).toBe(true);
    expect(isYouTubeWatcherActive()).toBe(true);

    // 2. Explicit stop
    const stopReq = new NextRequest('http://127.0.0.1:3000/api/system/youtube-watcher', {
      method: 'POST',
      body: JSON.stringify({ action: 'stop' }),
    });
    const stopRes = await POST(stopReq);
    expect(stopRes.status).toBe(200);
    const stopBody = await stopRes.json();
    expect(stopBody.success).toBe(true);
    expect(stopBody.data.active).toBe(false);
    expect(isYouTubeWatcherActive()).toBe(false);

    // 3. Toggle
    const toggleReq = new NextRequest('http://127.0.0.1:3000/api/system/youtube-watcher', {
      method: 'POST',
      body: JSON.stringify({ action: 'toggle' }),
    });
    const toggleRes = await POST(toggleReq);
    expect(toggleRes.status).toBe(200);
    const toggleBody = await toggleRes.json();
    expect(toggleBody.success).toBe(true);
    expect(toggleBody.data.active).toBe(true);
    expect(isYouTubeWatcherActive()).toBe(true);

    await stopYouTubeWatcher();
  });
});
