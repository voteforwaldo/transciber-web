import type { TranscriptSegment } from "@/lib/speechmatics";
import type { VideoMeta } from "@/lib/youtube";
import { formatDuration } from "@/lib/youtube";
import { extractYouTubeVideoId } from "@/lib/youtube-captions";

type TranscriptItem = { text: string; duration: number; offset: number };

export async function fetchViaYoutubeTranscriptLib(
  url: string,
): Promise<{
  meta: VideoMeta & { durationLabel: string };
  segments: TranscriptSegment[];
  plainText: string;
} | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    const items = (await YoutubeTranscript.fetchTranscript(videoId)) as TranscriptItem[];
    if (!items?.length) return null;

    const segments: TranscriptSegment[] = items.map((item) => {
      const off = item.offset ?? 0;
      const startTime = off > 500 ? off / 1000 : off;
      return {
        speaker: null,
        startTime,
        text: item.text?.trim() ?? "",
      };
    }).filter((s) => s.text);

    if (!segments.length) return null;

    const last = segments[segments.length - 1];
    const durationSec = last.startTime + 5;
    const meta: VideoMeta = {
      title: "YouTube video",
      channel: "YouTube",
      duration: durationSec,
      uploadDate: "",
    };

    return {
      meta: { ...meta, durationLabel: formatDuration(durationSec) },
      segments,
      plainText: segments.map((s) => s.text).join(" "),
    };
  } catch {
    return null;
  }
}
