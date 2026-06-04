import fs from "fs";

const vid = process.argv[2] || "aircAruvnKk";
const raw = JSON.parse(fs.readFileSync("inst.json", "utf8"));
const bases = raw
  .filter(([, meta]) => meta?.type === "https" && meta?.uri)
  .map(([, meta]) => meta.uri)
  .slice(0, 40);

for (const base of bases) {
  try {
    const listRes = await fetch(`${base}/api/v1/captions/${vid}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!listRes.ok) continue;
    const list = await listRes.json();
    if (!list.captions?.length) continue;

    const en =
      list.captions.find((c) => c.languageCode === "en") ?? list.captions[0];
    const vttUrl = en.url.startsWith("http")
      ? `${en.url}${en.url.includes("?") ? "&" : "?"}lang=en`
      : `${base}${en.url.includes("lang=") ? en.url : en.url.replace("label=", "lang=en&label=")}`;

    const tryUrls = [
      `${base}/api/v1/captions/${vid}?lang=en`,
      `${base}/api/v1/captions/${vid}?label=${encodeURIComponent(en.label)}`,
    ];

    for (const u of tryUrls) {
      const vttRes = await fetch(u, { signal: AbortSignal.timeout(12000) });
      const text = await vttRes.text();
      if (text.length > 200 && text.includes("WEBVTT")) {
        console.log("OK", base, u, text.length);
        process.exit(0);
      }
    }
  } catch {
    /* next */
  }
}
console.log("No working instance found");
process.exit(1);
