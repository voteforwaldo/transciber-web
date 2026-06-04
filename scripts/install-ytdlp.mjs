/**
 * Downloads the Linux yt-dlp binary into vendor/ during Vercel (Linux) builds.
 * On Windows/macOS local dev, skip and use yt-dlp on PATH instead.
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(__dirname, "..", "vendor");
const dest = path.join(vendorDir, "yt-dlp");

const isLinux = process.platform === "linux";
const force = process.env.INSTALL_YTDLP_VENDOR === "1";

if (!isLinux && !force) {
  console.log(`[install-ytdlp] Skipping vendor binary on ${process.platform}`);
  process.exit(0);
}

if (existsSync(dest)) {
  console.log("[install-ytdlp] vendor/yt-dlp already present");
  process.exit(0);
}

const url =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

console.log("[install-ytdlp] Downloading", url);

mkdirSync(vendorDir, { recursive: true });

const res = await fetch(url, { redirect: "follow" });
if (!res.ok) {
  console.error(`[install-ytdlp] Download failed: HTTP ${res.status}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(dest, buf);
chmodSync(dest, 0o755);
console.log("[install-ytdlp] Installed", dest);
