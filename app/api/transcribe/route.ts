import { NextRequest, NextResponse } from "next/server";
import { transcribeYouTubeUrl } from "@/lib/transcribe-youtube";
import { isYouTubeUrl } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const speechmaticsKey = process.env.SPEECHMATICS_API_KEY?.trim();
  if (!speechmaticsKey) {
    return NextResponse.json(
      { error: "SPEECHMATICS_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const url = (body.url ?? "").trim();
  if (!url) {
    return NextResponse.json({ error: "YouTube URL is required." }, { status: 400 });
  }
  if (!isYouTubeUrl(url)) {
    return NextResponse.json(
      { error: "Only YouTube links are supported (youtube.com or youtu.be)." },
      { status: 400 },
    );
  }

  try {
    const result = await transcribeYouTubeUrl(url, speechmaticsKey);

    if (result.mode === "complete") {
      return NextResponse.json({
        status: "done",
        source: result.source,
        url: result.url,
        meta: result.meta,
        segments: result.segments,
        plainText: result.plainText,
      });
    }

    return NextResponse.json({
      status: "processing",
      source: result.source,
      jobId: result.jobId,
      url: result.url,
      meta: result.meta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
