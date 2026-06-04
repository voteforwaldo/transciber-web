"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SetupStatus = {
  ready: boolean;
  cookies: boolean;
  ytdlp: boolean;
  speechmatics: boolean;
  gemini: boolean;
  hints: string[];
  isVercel?: boolean;
  youtubeBackend?: boolean;
};

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={ok ? "check-ok" : "check-bad"}>
      <span aria-hidden>{ok ? "✓" : "○"}</span> {label}
    </li>
  );
}

export default function SetupPanel({ onReady }: { onReady?: () => void }) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadOk, setUploadOk] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      const data = (await res.json()) as SetupStatus;
      setStatus(data);
      if (data.ready) onReady?.();
      return data;
    } catch {
      return null;
    }
  }, [onReady]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onUpload = useCallback(
    async (file: File) => {
      setUploadError("");
      setUploadOk("");
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/setup/cookies", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed.");
        setUploadOk("Cookies installed. You can transcribe now.");
        await refresh();
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [refresh],
  );

  if (!status) return null;

  const showYoutubeBackend =
    status.isVercel && status.ready && status.youtubeBackend === false;

  if (!status.ready && !showYoutubeBackend) {
    return (
      <section className="card setup-panel">
        <h2 className="section-title">Setup required</h2>
      <p className="hint">Complete these before transcribing:</p>
      <ul className="setup-checks">
        <Check ok={status.speechmatics} label="Speechmatics API key" />
        <Check ok={status.gemini} label="Gemini API key" />
        <Check
          ok={status.ytdlp}
          label={status.isVercel ? "yt-dlp (bundled on deploy)" : "yt-dlp on PATH"}
        />
        <Check ok={status.cookies} label="YouTube cookies" />
      </ul>

      {!status.cookies ? (
        <div className="setup-cookies">
          <p className="hint">
            {status.isVercel ? (
              <>
                <strong>Vercel:</strong> add environment variable{" "}
                <code>YTDLP_COOKIES</code> in the project settings (paste the full Netscape
                cookies file from the Chrome extension below). Upload here only helps until the
                server restarts.
              </>
            ) : (
              <>
                <strong>YouTube cookies</strong> — install Chrome extension{" "}
                <em>Get cookies.txt LOCALLY</em>, open youtube.com (logged in), export cookies,
                then upload the file here:
              </>
            )}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".txt,text/plain"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
          {uploading ? <p className="status">Installing cookies…</p> : null}
          {uploadOk ? <p className="status ok">{uploadOk}</p> : null}
          {uploadError ? <div className="error-banner">{uploadError}</div> : null}
          <p className="hint">
            Or run <code>install-cookies.bat</code> in the project folder.
          </p>
        </div>
      ) : null}

      {status.hints.length > 0 && status.cookies ? (
        <ul className="setup-hints">
          {status.hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      ) : null}
      </section>
    );
  }

  if (showYoutubeBackend) {
    return (
      <section className="card setup-panel">
        <h2 className="section-title">Optional: any YouTube video (no CC required)</h2>
        <p className="hint">
          <strong>Paste-link works online:</strong> videos with CC (free captions) or without CC
          (Gemini YouTube — uses your <code>GEMINI_API_KEY</code>). Test:{" "}
          <a
            href="https://www.youtube.com/watch?v=aircAruvnKk"
            target="_blank"
            rel="noreferrer"
          >
            sample video
          </a>
          .
        </p>
        <p className="hint">
          Optional: Render/home tunnel for Speechmatics on every video, or upload mp3/m4a:
        </p>
        <p className="hint">
          <a
            href="https://render.com/deploy?repo=https://github.com/voteforwaldo/transciber-web"
            target="_blank"
            rel="noreferrer"
          >
            Deploy on Render
          </a>
          {" · "}
          then run <code>setup-online.bat</code> and paste your Render URL.
        </p>
      </section>
    );
  }

  return null;
}
