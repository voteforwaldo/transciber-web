import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const VENDOR_BIN = path.join("vendor", "yt-dlp");

/** Path or command name passed to spawn for yt-dlp. */
export function resolveYtDlpCommand(): string {
  const fromEnv = process.env.YTDLP_PATH?.trim();
  if (fromEnv) return fromEnv;

  const vendorPath = path.join(process.cwd(), VENDOR_BIN);
  if (fs.existsSync(vendorPath)) return vendorPath;

  return "yt-dlp";
}

export function checkYtDlpAvailable(): Promise<boolean> {
  const cmd = resolveYtDlpCommand();
  return new Promise((resolve) => {
    const proc = spawn(cmd, ["--version"], { windowsHide: true });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}
