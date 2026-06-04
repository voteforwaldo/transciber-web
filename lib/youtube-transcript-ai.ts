import type { TranscriptSegment } from "@/lib/speechmatics";
import type { VideoMeta } from "@/lib/youtube";
import { formatDuration } from "@/lib/youtube";
import { extractYouTubeVideoId } from "@/lib/youtube-captions";

const BASE = "https://youtube-transcript.ai/transcript";

function parseDurationLabel(label: string): number {
  const m = label.trim().match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (!m) return 0;
  if (m[3] !== undefined) {
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return Number(m[1]) * 60 + Number(m[2]);
}

function parseTimestamp(line: string): { startTime: number; text: string } | null {
  const m = line.match(/^\[(\d+):(\d{2})(?::(\d{2}))?\]\s*(.+)$/);
  if (!m) return null;
  const text = m[4].trim();
  if (!text) return null;
  const startTime =
    m[3] !== undefined
      ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
      : Number(m[1]) * 60 + Number(m[2]);
  return { startTime, text };
}

function parseMarkdownTranscript(body: string): {
  title: string;
  durationSec: number;
  segments: TranscriptSegment[];
} | null {
  const titleMatch = body.match(/^#\s*Transcript:\s*(.+)$/m);
  const title = titleMatch?.[1]?.trim() || "YouTube video";

  const durationMatch = body.match(/Duration:\s*([0-9:]+)/i);
  const durationSec = durationMatch ? parseDurationLabel(durationMatch[1]) : 0;

  const segments: TranscriptSegment[] = [];
  const section = body.split("## Transcript")[1] ?? body;
  for (const line of section.split("\n")) {
    const parsed = parseTimestamp(line.trim());
    if (parsed) {
      segments.push({ speaker: null, startTime: parsed.startTime, text: parsed.text });
    }
  }

  if (!segments.length) return null;

  const last = segments[segments.length - 1];
  const inferredDuration = durationSec || last.startTime + 30;

  return { title, durationSec: inferredDuration, segments };
}

/** Public transcript relay (edge-cached); works from Vercel datacenter IPs. */
export async function fetchViaYoutubeTranscriptAi(
  url: string,
): Promise<{
  meta: VideoMeta & { durationLabel: string };
  segments: TranscriptSegment[];
  plainText: string;
  captionLanguage?: string;
} | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  const langs = ["en", "a.en", ""];
  const attempts = 3;

  for (let tryNum = 0; tryNum < attempts; tryNum++) {
    if (tryNum > 0) {
      await new Promise((r) => setTimeout(r, 400 * tryNum));
    }

    for (const lang of langs) {
      const apiUrl = lang
        ? `${BASE}/${videoId}.txt?lang=${encodeURIComponent(lang)}`
        : `${BASE}/${videoId}.txt`;

      try {
        const res = await fetch(apiUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; TransciberWeb/1.0; +https://transciber-web.vercel.app)",
            Accept: "text/plain,text/markdown,*/*",
          },
          signal: AbortSignal.timeout(22000),
        });
        if (!res.ok) continue;

        const body = await res.text();
        if (!body.includes("## Transcript")) continue;

        const parsed = parseMarkdownTranscript(body);
        if (!parsed) continue;

        const meta: VideoMeta = {
          title: parsed.title,
          channel: "YouTube",
          duration: parsed.durationSec,
          uploadDate: "",
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        };

        return {
          meta: { ...meta, durationLabel: formatDuration(parsed.durationSec) },
          segments: parsed.segments,
          plainText: parsed.segments.map((s) => s.text).join(" "),
          captionLanguage: lang || "en",
        };
      } catch (e) {
        console.warn("[captions] youtube-transcript.ai:", e);
      }
    }
  }

  return null;
}
