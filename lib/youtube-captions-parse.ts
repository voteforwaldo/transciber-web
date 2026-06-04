import type { TranscriptSegment } from "@/lib/speechmatics";

export function parseVttCaptions(vtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = vtt.split(/\n\n+/);
  const timeRe =
    /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/;

  for (const block of blocks) {
    const m = block.match(timeRe);
    if (!m) continue;
    const startTime =
      Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const text = block
      .split("\n")
      .slice(1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) segments.push({ speaker: null, startTime, text });
  }
  return segments;
}
