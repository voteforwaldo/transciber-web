import {
  friendlyGeminiError,
  resolveGeminiModel,
} from "@/lib/gemini";
import type { TranscriptSegment } from "@/lib/speechmatics";
import { formatDuration } from "@/lib/youtube";
import { extractYouTubeVideoId } from "@/lib/youtube-captions";

const TRANSCRIPT_PROMPT = `Transcribe all spoken words in this YouTube video.

Rules:
- Same language as the video (do not translate).
- Full verbatim transcript, not a summary.
- Split into short segments (a few sentences each) with accurate startTime in seconds from the start of the video.
- Omit non-speech content like [Music] unless it is spoken.`;

type GeminiJsonTranscript = {
  title?: string;
  channel?: string;
  durationSeconds?: number;
  segments?: Array<{ startTime?: number; text?: string }>;
};

function resolveYoutubeModel(): string {
  const dedicated = process.env.GEMINI_YOUTUBE_MODEL?.trim();
  if (dedicated) return resolveGeminiModel(dedicated);
  return resolveGeminiModel(process.env.GEMINI_MODEL);
}

function normalizeWatchUrl(url: string): string {
  const id = extractYouTubeVideoId(url);
  if (!id) throw new Error("Could not parse YouTube video ID.");
  return `https://www.youtube.com/watch?v=${id}`;
}

function parseTimestampLine(line: string): { startTime: number; text: string } | null {
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

function segmentsFromPlainText(body: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const line of body.split("\n")) {
    const parsed = parseTimestampLine(line.trim());
    if (parsed) {
      segments.push({ speaker: null, startTime: parsed.startTime, text: parsed.text });
    }
  }
  if (!segments.length && body.trim()) {
    const chunks = body.trim().split(/\n\n+/);
    let t = 0;
    for (const chunk of chunks) {
      const text = chunk.replace(/^\[[^\]]+\]\s*/, "").trim();
      if (!text) continue;
      segments.push({ speaker: null, startTime: t, text });
      t += 30;
    }
  }
  return segments;
}

function segmentsFromJson(raw: string): {
  title?: string;
  channel?: string;
  durationSeconds?: number;
  segments: TranscriptSegment[];
} | null {
  try {
    const data = JSON.parse(raw) as GeminiJsonTranscript;
    const segments = (data.segments ?? []).flatMap((s) => {
      const text = s.text?.trim() ?? "";
      if (!text) return [];
      const startTime = Number(s.startTime ?? 0);
      return [{ speaker: null, startTime, text } satisfies TranscriptSegment];
    });
    if (!segments.length) return null;
    return {
      title: data.title,
      channel: data.channel,
      durationSeconds: data.durationSeconds,
      segments,
    };
  } catch {
    return null;
  }
}

async function geminiGenerate(
  apiKey: string,
  watchUrl: string,
  useJson: boolean,
): Promise<string> {
  const modelId = resolveYoutubeModel();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig: Record<string, unknown> = {
    temperature: 0.1,
    maxOutputTokens: 65536,
  };

  if (useJson) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        channel: { type: "STRING" },
        durationSeconds: { type: "NUMBER" },
        segments: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              startTime: { type: "NUMBER" },
              text: { type: "STRING" },
            },
            required: ["startTime", "text"],
          },
        },
      },
      required: ["segments"],
    };
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { file_data: { file_uri: watchUrl } },
            { text: useJson ? TRANSCRIPT_PROMPT : `${TRANSCRIPT_PROMPT}\n\nFormat each line as [M:SS] or [H:MM:SS] then the spoken text.` },
          ],
        },
      ],
      generationConfig,
    }),
    signal: AbortSignal.timeout(280000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(friendlyGeminiError(`Gemini YouTube HTTP ${res.status}: ${body.slice(0, 500)}`));
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked this video (${data.promptFeedback.blockReason}).`);
  }

  const parts: string[] = [];
  for (const cand of data.candidates ?? []) {
    if (cand.finishReason === "MAX_TOKENS") {
      console.warn("[gemini-youtube] output truncated (MAX_TOKENS)");
    }
    for (const part of cand.content?.parts ?? []) {
      if (part.text?.trim()) parts.push(part.text.trim());
    }
  }

  const out = parts.join("\n").trim();
  if (!out) throw new Error("Gemini returned an empty transcript.");
  return out;
}

export type GeminiYouTubeResult = {
  meta: {
    title: string;
    channel: string;
    duration: string;
    thumbnail?: string;
    language?: string;
  };
  segments: TranscriptSegment[];
  plainText: string;
};

/** Transcribe a public YouTube URL via Gemini (no yt-dlp). Works on Vercel. */
export async function transcribeYouTubeViaGemini(
  url: string,
  apiKey: string,
): Promise<GeminiYouTubeResult> {
  const watchUrl = normalizeWatchUrl(url);
  const videoId = extractYouTubeVideoId(url)!;

  let parsed = segmentsFromJson(await geminiGenerate(apiKey, watchUrl, true));
  if (!parsed) {
    const plain = await geminiGenerate(apiKey, watchUrl, false);
    const segments = segmentsFromPlainText(plain);
    if (!segments.length) {
      throw new Error("Gemini transcript could not be parsed.");
    }
    parsed = { segments };
  }

  const plainText = parsed.segments.map((s) => s.text).join(" ");
  const last = parsed.segments[parsed.segments.length - 1];
  const durationSec =
    Number(parsed.durationSeconds) > 0
      ? Number(parsed.durationSeconds)
      : last.startTime + 45;

  return {
    meta: {
      title: parsed.title ?? "YouTube video",
      channel: parsed.channel ?? "YouTube",
      duration: formatDuration(durationSec),
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      language: "Gemini (YouTube audio/video)",
    },
    segments: parsed.segments,
    plainText,
  };
}
