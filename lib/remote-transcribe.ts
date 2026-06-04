import type { TranscriptSegment } from "@/lib/speechmatics";
import type { TranscribeStartResponse } from "@/lib/transcribe-youtube";

type RemoteJson = {
  error?: string;
  status?: string;
  jobId?: string;
  source?: string;
  url?: string;
  meta?: {
    title: string;
    channel: string;
    duration: string;
    uploadDate?: string;
    thumbnail?: string;
    language?: string;
  };
  segments?: TranscriptSegment[];
  plainText?: string;
};

/** Forward YouTube transcribe to a Docker host (Render/Fly) when Vercel cannot download. */
export async function transcribeViaRemoteService(
  url: string,
): Promise<TranscribeStartResponse> {
  const base = process.env.TRANSCRIBE_SERVICE_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("TRANSCRIBE_SERVICE_URL is not configured.");
  }

  const res = await fetch(`${base}/api/transcribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(120000),
  });

  const raw = await res.text();
  let data: RemoteJson;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Remote transcribe returned invalid JSON (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Remote transcribe failed (${res.status}).`);
  }

  if (data.status === "done" && data.segments && data.meta) {
    return {
      mode: "complete",
      url,
      meta: data.meta,
      segments: data.segments,
      plainText: data.plainText ?? "",
      source: "youtube_captions",
    };
  }

  if (data.jobId && data.meta) {
    return {
      mode: "processing",
      jobId: data.jobId,
      url,
      meta: data.meta,
      source: "speechmatics",
    };
  }

  throw new Error("Remote transcribe returned an unexpected response.");
}
