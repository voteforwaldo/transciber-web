import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { resolveYtDlpCommand } from "@/lib/ytdlp-binary";

export type VideoMeta = {
  title: string;
  channel: string;
  duration: number;
  uploadDate: string;
  thumbnail?: string;
};

type YtDlpJson = {
  title?: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  upload_date?: string;
  thumbnail?: string;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

let cachedCookiePath: string | null | undefined;
let sessionCookiePath: string | null = null;

export function resetCookieCache(): void {
  cachedCookiePath = undefined;
}

/** Ephemeral cookie file (e.g. uploaded in a warm serverless instance). */
export function setSessionCookiePath(filePath: string | null): void {
  sessionCookiePath = filePath;
  resetCookieCache();
}

async function materializeCookiesFromEnv(): Promise<string | null> {
  const raw = process.env.YTDLP_COOKIES?.trim();
  if (!raw) return null;

  const tmp = path.join(os.tmpdir(), "transciber-youtube-cookies.txt");
  await fs.writeFile(tmp, raw.replace(/\\n/g, "\n"), "utf8");
  return tmp;
}

export async function resolveCookieFile(): Promise<string | null> {
  if (cachedCookiePath !== undefined) return cachedCookiePath;

  const fromEnv = process.env.YTDLP_COOKIES?.trim()
    ? await materializeCookiesFromEnv()
    : null;

  const fromEnvPath = process.env.YTDLP_COOKIES_FILE?.trim();
  const pathCandidates = [
    sessionCookiePath,
    fromEnv,
    fromEnvPath
      ? path.isAbsolute(fromEnvPath)
        ? fromEnvPath
        : path.resolve(process.cwd(), fromEnvPath)
      : null,
    path.join(process.cwd(), "config", "youtube-cookies.txt"),
  ].filter((p): p is string => Boolean(p));

  for (const p of pathCandidates) {
    if (await fileExists(p)) {
      cachedCookiePath = p;
      return p;
    }
  }
  cachedCookiePath = null;
  return null;
}

const COOKIES_SETUP_MSG =
  "YouTube cookies missing. Run install-cookies.bat: export with Chrome extension " +
  "\"Get cookies.txt LOCALLY\" on youtube.com, then pick the file from Downloads. " +
  "Or save as config/youtube-cookies.txt and run check-cookies.bat.";

function ytdlpBaseArgs(): string[] {
  return [
    "--no-playlist",
    "--no-warnings",
    "--extractor-args",
    "youtube:player_client=android,web;player_skip=webpage",
    "--user-agent",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ];
}

async function cookieArgs(): Promise<string[]> {
  const cookieFile = await resolveCookieFile();
  if (cookieFile) return ["--cookies", cookieFile];

  const browser = process.env.YTDLP_COOKIES_BROWSER?.trim();
  // Live browser cookies fail on Windows while Chrome is open (and often even when closed).
  if (process.platform === "win32") {
    throw new Error(COOKIES_SETUP_MSG);
  }
  if (browser) return ["--cookies-from-browser", browser];
  throw new Error(COOKIES_SETUP_MSG);
}

function runYtDlp(args: string[], cwd?: string): Promise<string> {
  const binary = resolveYtDlpCommand();
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {
      cwd,
      windowsHide: true,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => {
      reject(
        new Error(
          `yt-dlp could not be started (${err.message}). Install yt-dlp and ensure it is on PATH.`,
        ),
      );
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const detail = (stderr || stdout).trim();
      reject(new Error(formatYtDlpError(detail, code ?? 1)));
    });
  });
}

function formatYtDlpError(detail: string, code: number): string {
  const lower = detail.toLowerCase();
  if (
    lower.includes("sign in to confirm") ||
    lower.includes("not a bot") ||
    lower.includes("confirm you're not a bot")
  ) {
    return (
      "YouTube blocked the download (bot check). Export cookies once: " +
      "powershell -File scripts/export-youtube-cookies.ps1 (browser closed). " +
      "Or set YTDLP_COOKIES_FILE in .env.local. Details: " +
      (detail.split("\n").find((l) => l.includes("ERROR")) ?? detail.slice(0, 400))
    );
  }
  if (
    lower.includes("no video formats found") ||
    lower.includes("video unavailable") ||
    lower.includes("private video")
  ) {
    const onVercel = process.env.VERCEL === "1";
    return onVercel
      ? "YouTube blocked or rejected this download on Vercel. Re-export cookies while logged into youtube.com, update YTDLP_COOKIES in Vercel settings, and redeploy. For reliable use, run run-local.bat on your PC."
      : "YouTube blocked this download. Re-export cookies (install-cookies.bat) or try another video.";
  }
  if (
    (lower.includes("could not copy") && lower.includes("cookie")) ||
    lower.includes("failed to decrypt with dpapi")
  ) {
    return (
      "Could not read live browser cookies (Chrome locks its database on Windows). " +
      "Run once: powershell -File scripts/export-youtube-cookies.ps1 " +
      "(with Chrome/Edge fully closed in Task Manager). " +
      "That creates config/youtube-cookies.txt — then restart run-local.bat."
    );
  }
  return `yt-dlp failed (exit ${code}): ${detail.slice(0, 800)}`;
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\.|^m\./, "");
    return (
      host === "youtube.com" ||
      host === "youtu.be" ||
      host.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}

function parseMeta(json: YtDlpJson): VideoMeta {
  const uploadRaw = json.upload_date ?? "";
  let uploadDate = "";
  if (/^\d{8}$/.test(uploadRaw)) {
    uploadDate = `${uploadRaw.slice(0, 4)}-${uploadRaw.slice(4, 6)}-${uploadRaw.slice(6, 8)}`;
  }

  return {
    title: json.title ?? "Untitled",
    channel: json.channel ?? json.uploader ?? "Unknown",
    duration: Number(json.duration ?? 0),
    uploadDate,
    thumbnail: json.thumbnail,
  };
}

export async function fetchVideoMeta(url: string): Promise<VideoMeta> {
  const cookies = await cookieArgs();
  const out = await runYtDlp([
    ...ytdlpBaseArgs(),
    "--no-download",
    "--print-json",
    ...cookies,
    url,
  ]);
  const line = out.trim().split("\n").pop() ?? "";
  const json = JSON.parse(line) as YtDlpJson;
  return parseMeta(json);
}

/** Download audio via yt-dlp (same approach as the desktop transcriber). */
export async function downloadYouTubeAudio(
  url: string,
): Promise<{ buffer: Buffer; filename: string; meta: VideoMeta }> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "transciber-"));
  const outTemplate = path.join(tmpDir, "audio.%(ext)s");

  try {
    const cookies = await cookieArgs();
    const metaOut = await runYtDlp([
      ...ytdlpBaseArgs(),
      "--no-download",
      "--print-json",
      ...cookies,
      url,
    ]);
    const metaLine = metaOut.trim().split("\n").pop() ?? "";
    const meta = parseMeta(JSON.parse(metaLine) as YtDlpJson);

    await runYtDlp(
      [
        ...ytdlpBaseArgs(),
        "-f",
        "bestaudio/best",
        "-o",
        outTemplate,
        ...cookies,
        url,
      ],
      tmpDir,
    );

    const files = await fs.readdir(tmpDir);
    const audioName = files.find((f) => f.startsWith("audio."));
    if (!audioName) {
      throw new Error("yt-dlp did not produce an audio file.");
    }

    const audioPath = path.join(tmpDir, audioName);
    const buffer = await fs.readFile(audioPath);
    if (buffer.length < 1024) {
      throw new Error("Downloaded audio is empty or too small.");
    }

    const ext = path.extname(audioName).slice(1) || "m4a";
    return { buffer, filename: `audio.${ext}`, meta };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
