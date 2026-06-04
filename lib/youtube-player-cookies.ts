import { youtubeCookieHeader } from "@/lib/youtube-cookie-header";

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  name?: { simpleText?: string };
};

export type PlayerWithCaptions = {
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

function extractPlayerJson(html: string): PlayerWithCaptions | null {
  const marker = "ytInitialPlayerResponse";
  const start = html.indexOf(marker);
  if (start < 0) return null;

  const jsonStart = html.indexOf("{", start + marker.length);
  if (jsonStart < 0) return null;

  let depth = 0;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(html.slice(jsonStart, i + 1)) as PlayerWithCaptions;
      }
    }
  }
  return null;
}

/** Fetch watch page with logged-in cookies — often returns captionTracks on Vercel. */
export async function fetchPlayerWithCookies(
  videoId: string,
): Promise<PlayerWithCaptions | null> {
  const cookie = await youtubeCookieHeader();
  if (!cookie) return null;

  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) return null;
  const html = await res.text();
  if (!html.includes("captionTracks") && !html.includes("playerCaptionsTracklistRenderer")) {
    return null;
  }
  return extractPlayerJson(html);
}
