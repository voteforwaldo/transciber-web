import type { VideoMeta } from "@/lib/youtube";
import { extractYouTubeVideoId } from "@/lib/youtube-captions";

type CobaltResponse = {
  status?: string;
  url?: string;
  error?: { code?: string; context?: string };
};

/** Download audio via a Cobalt-compatible API (self-hosted or public instance). */
export async function downloadYouTubeAudioViaCobalt(
  youtubeUrl: string,
  apiBase: string,
): Promise<{ buffer: Buffer; filename: string; meta: VideoMeta }> {
  const base = apiBase.replace(/\/$/, "");
  const endpoint = base.endsWith("/api/json") ? base : `${base}/api/json`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      url: youtubeUrl,
      downloadMode: "audio",
      audioFormat: "mp3",
    }),
  });

  const data = (await res.json()) as CobaltResponse;
  if (!res.ok || data.status === "error") {
    const msg = data.error?.context ?? data.error?.code ?? `Cobalt HTTP ${res.status}`;
    throw new Error(`Cobalt download failed: ${msg}`);
  }
  if (!data.url) throw new Error("Cobalt did not return a download URL.");

  const audioRes = await fetch(data.url);
  if (!audioRes.ok) {
    throw new Error(`Cobalt audio fetch failed (${audioRes.status}).`);
  }

  const buffer = Buffer.from(await audioRes.arrayBuffer());
  if (buffer.length < 1024) throw new Error("Downloaded audio is too small.");

  const videoId = extractYouTubeVideoId(youtubeUrl) ?? "video";
  return {
    buffer,
    filename: `${videoId}.mp3`,
    meta: {
      title: `YouTube ${videoId}`,
      channel: "YouTube",
      duration: 0,
      uploadDate: "",
    },
  };
}
