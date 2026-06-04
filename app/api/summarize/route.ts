import { NextRequest, NextResponse } from "next/server";
import { buildSummaryPrompt, geminiSummarize } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: { transcript?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const transcript = (body.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "Transcript text is required." },
      { status: 400 },
    );
  }

  try {
    const prompt = buildSummaryPrompt(transcript, body.language);
    const summary = await geminiSummarize(prompt, geminiKey);
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[summarize]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
