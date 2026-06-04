import { NextRequest, NextResponse } from "next/server";
import { getSetupStatus, saveCookieFile } from "@/lib/setup";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const text = await file.text();
    const dest = await saveCookieFile(text);
    const status = await getSetupStatus();
    return NextResponse.json({
      ok: true,
      path: dest,
      status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
