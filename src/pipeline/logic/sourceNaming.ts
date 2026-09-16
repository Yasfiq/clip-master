import path from 'path';

export interface ParsedSourceMeta {
  sourceChannel?: string;
  sourceTitle: string;
  attributionText: string;
  isCustomPattern: boolean;
}

/**
 * Parses a local video filename or path to detect channel and context title.
 *
 * Expected pattern:
 * Video_From_[Sumber Channel]_[Materi/Konteks Video].[ext]
 *
 * Examples:
 * - "Video_From_Raditya Dika_Podcast Bersama Cania.mp4"
 *   -> sourceChannel: "Raditya Dika"
 *   -> sourceTitle: "Podcast Bersama Cania"
 *   -> attributionText: "Sumber: Raditya Dika"
 *   -> isCustomPattern: true
 *
 * - "video_from_Curhat Bang_Ivan Tanjaya Bongkar Rahasia.mkv"
 *   -> sourceChannel: "Curhat Bang"
 *   -> sourceTitle: "Ivan Tanjaya Bongkar Rahasia"
 *   -> attributionText: "Sumber: Curhat Bang"
 *   -> isCustomPattern: true
 *
 * - "interview_sample.mp4"
 *   -> sourceChannel: undefined
 *   -> sourceTitle: "Interview Sample"
 *   -> attributionText: "Sumber: Interview Sample"
 *   -> isCustomPattern: false
 */
export function parseLocalSourceFilename(inputPathOrName: string): ParsedSourceMeta {
  if (!inputPathOrName || !inputPathOrName.trim()) {
    return {
      sourceChannel: undefined,
      sourceTitle: 'Untitled Video',
      attributionText: 'Sumber: Video',
      isCustomPattern: false,
    };
  }

  const filename = path.basename(inputPathOrName.trim());
  const ext = path.extname(filename);
  const nameWithoutExt = ext ? filename.slice(0, -ext.length) : filename;

  // Match pattern: Video_From_<Channel>_<Title>
  const customPatternRegex = /^Video_From_([^_]+)_(.+)$/i;
  const match = nameWithoutExt.match(customPatternRegex);

  if (match) {
    const rawChannel = match[1]!.trim();
    const rawTitle = match[2]!.trim();

    const sourceChannel = rawChannel || undefined;
    const sourceTitle = rawTitle || nameWithoutExt;
    const attributionText = sourceChannel ? `Sumber: ${sourceChannel}` : `Sumber: ${sourceTitle}`;

    return {
      sourceChannel,
      sourceTitle,
      attributionText,
      isCustomPattern: true,
    };
  }

  // Fallback for regular filenames
  const cleanedTitle = nameWithoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');

  const sourceTitle = cleanedTitle || 'Untitled Video';
  return {
    sourceChannel: undefined,
    sourceTitle,
    attributionText: `Sumber: ${sourceTitle}`,
    isCustomPattern: false,
  };
}
