import type { TranscriptSegment } from "./speechmatics";

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function segmentsToPlainText(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => {
      const ts = formatTimestamp(seg.startTime);
      const text = seg.text.trim();
      if (seg.speaker) return `[${ts}] ${seg.speaker}: ${text}`;
      return `[${ts}] ${text}`;
    })
    .join("\n");
}

export type TranscribeResult = {
  url: string;
  meta: {
    title: string;
    channel: string;
    duration: string;
    uploadDate?: string;
    language?: string;
    thumbnail?: string;
  };
  segments: TranscriptSegment[];
  plainText: string;
};
