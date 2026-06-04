import type { TranscriptSegment } from "@/lib/speechmatics";
import type { VideoMeta } from "@/lib/youtube";
import { formatDuration } from "@/lib/youtube";
import { fetchCaptionsViaInvidious } from "@/lib/youtube-invidious";
import { parseVttCaptions } from "@/lib/youtube-captions-parse";
import { fetchPlayerWithCookies } from "@/lib/youtube-player-cookies";
import { fetchViaYoutubeTranscriptLib } from "@/lib/youtube-transcript-lib";
import { fetchViaYoutubeTranscriptAi } from "@/lib/youtube-transcript-ai";

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id?.length === 11 ? id : null;
    }
    const v = u.searchParams.get("v");
    if (v && v.length === 11) return v;
    const m = u.pathname.match(/\/(?:shorts|live|embed)\/([\w-]{11})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

type CaptionTrack = { baseUrl?: string; languageCode?: string; name?: { simpleText?: string } };

type InnertubePlayer = {
  videoDetails?: {
    title?: string;
    author?: string;
    lengthSeconds?: string;
    thumbnail?: { thumbnails?: Array<{ url?: string }> };
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

const INNERTUBE_KEYS = [
  "b4dabdbc05a61bd7b1804474fce0fc4e65affdc96b72acdd",
  "AIzaSyAO_FJ2SlbzU9sBk-NjJ4xUfdRWmHmT9pI",
];

async function playerFromWatchPage(videoId: string): Promise<InnertubePlayer> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`YouTube page HTTP ${res.status}`);
  const html = await res.text();
  const marker = "ytInitialPlayerResponse";
  const start = html.indexOf(marker);
  if (start < 0) throw new Error("Could not read YouTube player data.");

  const jsonStart = html.indexOf("{", start + marker.length);
  if (jsonStart < 0) throw new Error("Could not parse YouTube player JSON.");

  let depth = 0;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(html.slice(jsonStart, i + 1)) as InnertubePlayer;
      }
    }
  }
  throw new Error("YouTube player JSON was truncated.");
}

async function innertubePlayer(videoId: string): Promise<InnertubePlayer> {
  const clients = [
    {
      clientName: "ANDROID",
      clientVersion: "19.09.37",
      androidSdkVersion: 30,
    },
    {
      clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
      clientVersion: "2.0",
    },
  ];

  let lastErr = "Innertube request failed";
  for (const key of INNERTUBE_KEYS) {
    for (const client of clients) {
      const res = await fetch(
        `https://www.youtube.com/youtubei/v1/player?key=${key}&prettyPrint=false`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip",
          },
          body: JSON.stringify({
            context: { client: { ...client, hl: "en", gl: "US" } },
            videoId,
          }),
        },
      );
      if (!res.ok) {
        lastErr = `Innertube ${client.clientName} HTTP ${res.status}`;
        continue;
      }
      const json = (await res.json()) as InnertubePlayer & {
        playabilityStatus?: { status?: string; reason?: string };
      };
      if (json.playabilityStatus?.status === "ERROR") {
        lastErr = json.playabilityStatus.reason ?? "Video not playable";
        continue;
      }
      if (json.videoDetails?.title) return json;
    }
  }

  try {
    return await playerFromWatchPage(videoId);
  } catch (pageErr) {
    throw new Error(
      `${lastErr}. Page scrape: ${pageErr instanceof Error ? pageErr.message : pageErr}`,
    );
  }
}

function pickCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  const manual = tracks.find((t) => !/auto|asr|generated/i.test(t.name?.simpleText ?? ""));
  return manual ?? tracks[0];
}

type Json3Event = {
  tStartMs?: number;
  segs?: Array<{ utf8?: string }>;
};

function parseJson3Captions(body: string): TranscriptSegment[] {
  const data = JSON.parse(body) as { events?: Json3Event[] };
  const segments: TranscriptSegment[] = [];

  for (const ev of data.events ?? []) {
    const text = (ev.segs ?? [])
      .map((s) => s.utf8 ?? "")
      .join("")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    segments.push({
      speaker: null,
      startTime: (ev.tStartMs ?? 0) / 1000,
      text,
    });
  }

  return segments;
}

async function fetchCaptionSegments(track: CaptionTrack): Promise<TranscriptSegment[]> {
  const base = track.baseUrl;
  if (!base) throw new Error("No caption track URL.");

  const { youtubeCookieHeader } = await import("@/lib/youtube-cookie-header");
  const cookie = await youtubeCookieHeader();
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };
  if (cookie) headers.Cookie = cookie;

  const jsonUrl = `${base}${base.includes("?") ? "&" : "?"}fmt=json3`;
  const jsonRes = await fetch(jsonUrl, { headers });
  if (jsonRes.ok) {
    return parseJson3Captions(await jsonRes.text());
  }

  const vttRes = await fetch(base, { headers });
  if (!vttRes.ok) {
    throw new Error(`Caption download failed (${vttRes.status}).`);
  }
  return parseVttCaptions(await vttRes.text());
}

export type YouTubeCaptionsResult = {
  meta: VideoMeta & { durationLabel: string };
  segments: TranscriptSegment[];
  plainText: string;
  captionLanguage?: string;
};

async function fetchViaInvidious(videoId: string): Promise<YouTubeCaptionsResult> {
  const { segments, languageCode } = await fetchCaptionsViaInvidious(videoId);
  const meta: VideoMeta = {
    title: "YouTube video",
    channel: "YouTube",
    duration: segments.at(-1)?.startTime ?? 0,
    uploadDate: "",
  };
  return {
    meta: { ...meta, durationLabel: formatDuration(meta.duration) },
    segments,
    plainText: segments.map((s) => s.text).join(" "),
    captionLanguage: languageCode,
  };
}

async function captionsFromPlayer(
  player: Awaited<ReturnType<typeof fetchPlayerWithCookies>>,
): Promise<YouTubeCaptionsResult | null> {
  if (!player) return null;
  const tracks =
    player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickCaptionTrack(tracks);
  if (!track?.baseUrl) return null;

  const segments = await fetchCaptionSegments(track);
  if (!segments.length) return null;

  const vd = player.videoDetails;
  const durationSec = Number(vd?.lengthSeconds ?? 0);
  const meta: VideoMeta = {
    title: vd?.title ?? "YouTube video",
    channel: vd?.author ?? "Unknown",
    duration: durationSec,
    uploadDate: "",
    thumbnail: vd?.thumbnail?.thumbnails?.at(-1)?.url,
  };

  return {
    meta: { ...meta, durationLabel: formatDuration(durationSec) },
    segments,
    plainText: segments.map((s) => s.text).join(" "),
    captionLanguage: track.languageCode,
  };
}

export async function fetchYouTubeCaptions(url: string): Promise<YouTubeCaptionsResult> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error("Could not parse YouTube video ID.");

  try {
    const relay = await fetchViaYoutubeTranscriptAi(url);
    if (relay) return relay;
  } catch (e) {
    console.warn("[captions] youtube-transcript.ai:", e);
  }

  try {
    const lib = await fetchViaYoutubeTranscriptLib(url);
    if (lib) {
      const player = await fetchPlayerWithCookies(videoId).catch(() => null);
      if (player?.videoDetails?.title) {
        lib.meta.title = player.videoDetails.title;
        lib.meta.channel = player.videoDetails.author ?? lib.meta.channel;
      }
      return lib;
    }
  } catch (e) {
    console.warn("[captions] youtube-transcript:", e);
  }

  try {
    const withCookies = await captionsFromPlayer(
      await fetchPlayerWithCookies(videoId),
    );
    if (withCookies) return withCookies;
  } catch (e) {
    console.warn("[captions] cookie player:", e);
  }

  try {
    const inv = await fetchViaInvidious(videoId);    const player = await innertubePlayer(videoId).catch(() => null);
    if (player?.videoDetails?.title) {
      inv.meta.title = player.videoDetails.title;
      inv.meta.channel = player.videoDetails.author ?? inv.meta.channel;
      const d = Number(player.videoDetails.lengthSeconds ?? 0);
      if (d > 0) {
        inv.meta.duration = d;
        inv.meta.durationLabel = formatDuration(d);
      }
      inv.meta.thumbnail = player.videoDetails.thumbnail?.thumbnails?.at(-1)?.url;
    }
    return inv;
  } catch (invErr) {
    console.warn("[captions] invidious:", invErr);
  }

  const player = await innertubePlayer(videoId);
  const tracks =
    player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  const track = pickCaptionTrack(tracks);
  if (!track) {
    throw new Error(
      "This video has no captions on YouTube. Use full transcription (Docker host) or upload audio.",
    );
  }

  const segments = await fetchCaptionSegments(track);
  if (!segments.length) {
    throw new Error("Caption file was empty.");
  }

  const vd = player.videoDetails;
  const durationSec = Number(vd?.lengthSeconds ?? 0);
  const meta: VideoMeta = {
    title: vd?.title ?? "YouTube video",
    channel: vd?.author ?? "Unknown",
    duration: durationSec,
    uploadDate: "",
    thumbnail: vd?.thumbnail?.thumbnails?.at(-1)?.url,
  };

  const plainText = segments.map((s) => s.text).join(" ");

  return {
    meta: { ...meta, durationLabel: formatDuration(durationSec) },
    segments,
    plainText,
    captionLanguage: track.languageCode,
  };
}
