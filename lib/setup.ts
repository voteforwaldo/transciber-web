import fs from "fs/promises";
import os from "os";
import path from "path";
import { checkYtDlpAvailable } from "@/lib/ytdlp-binary";
import {
  resolveCookieFile,
  resetCookieCache,
  setSessionCookiePath,
} from "@/lib/youtube";

export type SetupStatus = {
  ready: boolean;
  cookies: boolean;
  ytdlp: boolean;
  speechmatics: boolean;
  gemini: boolean;
  hints: string[];
  isVercel: boolean;
  /** Render (or other) backend for full YouTube paste-link on Vercel */
  youtubeBackend: boolean;
};

export { resetCookieCache };

export async function getSetupStatus(): Promise<SetupStatus> {
  const cookiePath = await resolveCookieFile();
  const cookies = Boolean(cookiePath);
  const ytdlp = await checkYtDlpAvailable();
  const speechmatics = Boolean(process.env.SPEECHMATICS_API_KEY?.trim());
  const gemini = Boolean(process.env.GEMINI_API_KEY?.trim());

  const hints: string[] = [];
  if (!speechmatics) hints.push("Set SPEECHMATICS_API_KEY in .env.local");
  if (!gemini) hints.push("Set GEMINI_API_KEY in .env.local");
  if (!ytdlp) {
    hints.push(
      process.env.VERCEL
        ? "yt-dlp should install on deploy; redeploy if this stays false."
        : "Install yt-dlp and add it to PATH (or run on Linux / Vercel build)",
    );
  }
  if (!cookies) {
    hints.push(
      process.env.VERCEL
        ? "Set YTDLP_COOKIES in Vercel → Settings → Environment Variables (paste Netscape cookies file)."
        : "Upload youtube-cookies.txt below (Chrome extension “Get cookies.txt LOCALLY” on youtube.com)",
    );
  }

  const isVercel = process.env.VERCEL === "1";
  const youtubeBackend =
    !isVercel || Boolean(process.env.TRANSCRIBE_SERVICE_URL?.trim());

  if (isVercel && !youtubeBackend) {
    hints.push(
      "YouTube paste-link on Vercel needs Render: run setup-online.bat or set TRANSCRIBE_SERVICE_URL (see DEPLOY-RENDER.md). Upload audio still works.",
    );
  }

  const ready = cookies && ytdlp && speechmatics && gemini;
  return {
    ready,
    cookies,
    ytdlp,
    speechmatics,
    gemini,
    hints,
    isVercel,
    youtubeBackend,
  };
}

export function isValidCookieExport(content: string): boolean {
  const t = content.trim();
  if (t.length < 80) return false;
  return (
    t.includes("# Netscape HTTP Cookie File") ||
    t.includes(".youtube.com") ||
    t.includes("\t.youtube.com\t")
  );
}

export async function saveCookieFile(content: string): Promise<string> {
  if (!isValidCookieExport(content)) {
    throw new Error(
      "File does not look like a Netscape cookies export. Use the “Get cookies.txt LOCALLY” extension on youtube.com.",
    );
  }

  if (process.env.VERCEL) {
    const dest = path.join(os.tmpdir(), "transciber-youtube-cookies.txt");
    await fs.writeFile(dest, content, "utf8");
    setSessionCookiePath(dest);
    return dest;
  }

  const dir = path.join(process.cwd(), "config");
  const dest = path.join(dir, "youtube-cookies.txt");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(dest, content, "utf8");
  resetCookieCache();
  return dest;
}
