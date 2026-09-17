export interface MonitoredChannel {
  id: string;
  name: string;
  handleOrUrl: string;
  lastCheckedAt?: string;
  status: 'idle' | 'checking' | 'active' | 'error';
  errorMessage?: string;
  createdAt: string;
}

export interface DetectedVideo {
  id: string;
  title: string;
  channelName: string;
  channelHandle?: string;
  videoUrl: string;
  videoId?: string;
  detectedAt: string;
  jobId?: string;
  jobStatus?:
    | 'PENDING'
    | 'RUNNING_PHASE1'
    | 'PHASE1_DONE'
    | 'RUNNING_PHASE2'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'REJECTED_AD'
    | string;
}

export interface YouTubeWatcherStatus {
  active: boolean;
  isPolling: boolean;
  channels: MonitoredChannel[];
  detectedVideos: DetectedVideo[];
  lastPollAt: string | null;
  pollIntervalMinutes: number;
}
