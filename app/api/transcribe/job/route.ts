import { NextRequest, NextResponse } from "next/server";
import { pollTranscriptionJob } from "@/lib/speechmatics";
import { segmentsToPlainText } from "@/lib/transcript";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const speechmaticsKey = process.env.SPEECHMATICS_API_KEY?.trim();
  if (!speechmaticsKey) {
    return NextResponse.json(
      { error: "SPEECHMATICS_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  const jobId = req.nextUrl.searchParams.get("jobId")?.trim();
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  try {
    const result = await pollTranscriptionJob(jobId, speechmaticsKey);
    if (result.status === "running") {
      return NextResponse.json({
        status: "running",
        speechmaticsStatus: result.speechmaticsStatus,
      });
    }
    if (result.status === "rejected") {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const plainText = segmentsToPlainText(result.segments);
    return NextResponse.json({
      status: "done",
      segments: result.segments,
      plainText,
      language: result.language,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcribe/job]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
