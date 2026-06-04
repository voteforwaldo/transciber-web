import fs from "fs/promises";
import { resolveCookieFile } from "@/lib/youtube";

/** Build a Cookie header from Netscape-format youtube-cookies.txt */
export async function youtubeCookieHeader(): Promise<string | null> {
  const raw = process.env.YTDLP_COOKIES?.trim();
  let text = raw?.replace(/\\n/g, "\n") ?? "";

  if (!text) {
    const path = await resolveCookieFile();
    if (path) {
      try {
        text = await fs.readFile(path, "utf8");
      } catch {
        return null;
      }
    }
  }

  if (!text.trim()) return null;

  const pairs: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split("\t");
    if (parts.length >= 7 && parts[0].includes("youtube.com")) {
      pairs.push(`${parts[5]}=${parts[6]}`);
    }
  }
  return pairs.length ? pairs.join("; ") : null;
}
