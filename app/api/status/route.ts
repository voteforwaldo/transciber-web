import { NextResponse } from "next/server";
import { getSetupStatus } from "@/lib/setup";

export const runtime = "nodejs";

export async function GET() {
  const status = await getSetupStatus();
  return NextResponse.json(status);
}
