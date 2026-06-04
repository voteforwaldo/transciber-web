import { NextRequest, NextResponse } from "next/server";
import { submitTranscriptionJob } from "@/lib/speechmatics";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  const speechmaticsKey = process.env.SPEECHMATICS_API_KEY?.trim();
  if (!speechmaticsKey) {
    return NextResponse.json(
      { error: "SPEECHMATICS_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const title = (form.get("title") as string | null)?.trim() || "Uploaded audio";

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No audio file uploaded." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 1024) {
      return NextResponse.json({ error: "File is empty or too small." }, { status: 400 });
    }
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "File too large (max 50 MB on Vercel)." },
        { status: 400 },
      );
    }

    const name = file.name || "audio.m4a";
    const jobId = await submitTranscriptionJob(buffer, name, speechmaticsKey);

    return NextResponse.json({
      status: "processing",
      jobId,
      meta: {
        title,
        channel: "Upload",
        duration: "—",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcribe/upload]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
