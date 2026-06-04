import type { TranscriptSegment } from "@/lib/speechmatics";
import { parseVttCaptions } from "@/lib/youtube-captions-parse";

type InvidiousCaption = {
  label: string;
  languageCode: string;
  url: string;
};

const FALLBACK_INSTANCES = [
  "https://inv.nadeko.net",
  "https://inv.tux.pizza",
  "https://invidious.nerdvpn.de",
  "https://inv.zzls.xyz",
  "https://invidious.private.coffee",
];

let cachedInstances: string[] | null = null;

async function loadInstances(): Promise<string[]> {
  const fromEnv = process.env.INVIDIOUS_INSTANCES?.trim();
  if (fromEnv) {
    return fromEnv.split(",").map((s) => s.trim().replace(/\/$/, ""));
  }
  if (cachedInstances) return cachedInstances;

  try {
    const res = await fetch("https://api.invidious.io/instances.json", {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = (await res.json()) as Array<[string, { uri?: string; type?: string }]>;
      cachedInstances = data
        .filter(([, m]) => m?.type === "https" && m.uri)
        .map(([, m]) => m.uri!.replace(/\/$/, ""))
        .slice(0, 25);
      if (cachedInstances.length) return cachedInstances;
    }
  } catch {
    /* use fallbacks */
  }

  cachedInstances = FALLBACK_INSTANCES;
  return cachedInstances;
}

function pickCaption(tracks: InvidiousCaption[]): InvidiousCaption | null {
  if (!tracks.length) return null;
  const enManual = tracks.find(
    (t) =>
      t.languageCode.startsWith("en") &&
      !/auto|generated/i.test(t.label),
  );
  const enAny = tracks.find((t) => t.languageCode.startsWith("en"));
  return enManual ?? enAny ?? tracks[0];
}

async function fetchVtt(
  base: string,
  videoId: string,
  track: InvidiousCaption,
): Promise<string> {
  const attempts = [
    `${base}/api/v1/captions/${videoId}?lang=${encodeURIComponent(track.languageCode)}`,
    `${base}/api/v1/captions/${videoId}?label=${encodeURIComponent(track.label)}`,
    track.url.startsWith("http")
      ? track.url
      : `${base}${track.url}`,
  ];

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "TransciberWeb/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length > 100 && (text.includes("WEBVTT") || text.includes("-->"))) {
        return text;
      }
    } catch {
      continue;
    }
  }
  throw new Error("Invidious returned no caption text.");
}

export async function fetchCaptionsViaInvidious(
  videoId: string,
): Promise<{ segments: TranscriptSegment[]; languageCode?: string; instance: string }> {
  const instances = await loadInstances();
  let lastErr = "No Invidious instance responded.";

  for (const base of instances) {
    try {
      const listRes = await fetch(`${base}/api/v1/captions/${videoId}`, {
        headers: { "User-Agent": "TransciberWeb/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (!listRes.ok) {
        lastErr = `${base}: list HTTP ${listRes.status}`;
        continue;
      }
      const list = (await listRes.json()) as { captions?: InvidiousCaption[] };
      const track = pickCaption(list.captions ?? []);
      if (!track) {
        lastErr = `${base}: no caption tracks`;
        continue;
      }

      const vtt = await fetchVtt(base, videoId, track);
      const segments = parseVttCaptions(vtt);
      if (!segments.length) {
        lastErr = `${base}: empty captions`;
        continue;
      }

      return {
        segments,
        languageCode: track.languageCode,
        instance: base,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(lastErr);
}
