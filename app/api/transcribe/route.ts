import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/speechmatics";
import { segmentsToPlainText } from "@/lib/transcript";
import {
  downloadYouTubeAudio,
  formatDuration,
  isYouTubeUrl,
} from "@/lib/youtube";

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
    const { buffer, filename, meta } = await downloadYouTubeAudio(url);
    const { segments, language } = await transcribeAudio(
      buffer,
      filename,
      speechmaticsKey,
    );

    const plainText = segmentsToPlainText(segments);

    return NextResponse.json({
      url,
      meta: {
        title: meta.title,
        channel: meta.channel,
        duration: formatDuration(meta.duration),
        uploadDate: meta.uploadDate || undefined,
        language,
        thumbnail: meta.thumbnail,
      },
      segments,
      plainText,
    } satisfies import("@/lib/transcript").TranscribeResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
