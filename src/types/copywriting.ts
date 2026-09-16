export interface PlatformCopywriting {
  youtubeShorts: {
    title: string;
    description: string;
  };
  tiktok: {
    caption: string;
  };
  reels: {
    caption: string;
  };
}

export interface ClipCopywriting {
  title: string;
  hookSummary: string;
  hashtags: string[];
  hashtagString: string;
  attribution: string;
  fullCaption: string;
  platforms: PlatformCopywriting;
}

export interface CopywritingResponse {
  clipId: string;
  copywriting: ClipCopywriting;
}
