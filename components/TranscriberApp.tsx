"use client";

import { useCallback, useMemo, useState } from "react";
import SetupPanel from "@/components/SetupPanel";
import type { TranscriptSegment } from "@/lib/speechmatics";
import { formatTimestamp } from "@/lib/transcript";

type Meta = {
  title: string;
  channel: string;
  duration: string;
  uploadDate?: string;
  language?: string;
  thumbnail?: string;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const re = new RegExp(`(${escapeRegex(query)})`, "gi");
  const parts = text.split(re);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="hit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export default function TranscriberApp() {
  const [url, setUrl] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [plainText, setPlainText] = useState("");
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState("");

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }, []);

  const matchCount = useMemo(() => {
    if (!search.trim() || !plainText) return 0;
    const re = new RegExp(escapeRegex(search.trim()), "gi");
    return (plainText.match(re) ?? []).length;
  }, [search, plainText]);

  const filteredSegments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter(
      (s) =>
        s.text.toLowerCase().includes(q) ||
        (s.speaker?.toLowerCase().includes(q) ?? false),
    );
  }, [segments, search]);

  const onTranscribe = useCallback(async () => {
    setError("");
    setStatus("");
    setSummary("");
    setMeta(null);
    setSegments([]);
    setPlainText("");

    const trimmed = url.trim();
    if (!trimmed && !audioFile) {
      setError("Paste a YouTube link or choose an audio file.");
      return;
    }

    setLoading(true);
    setStatus(audioFile ? "Uploading audio…" : "Downloading audio…");

    try {
      let res: Response;
      if (audioFile) {
        const form = new FormData();
        form.append("file", audioFile);
        form.append("title", audioFile.name);
        res = await fetch("/api/transcribe/upload", { method: "POST", body: form });
      } else {
        res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
        });
      }
      const raw = await res.text();
      let data: {
        error?: string;
        status?: string;
        source?: string;
        jobId?: string;
        meta?: Meta;
        segments?: TranscriptSegment[];
        plainText?: string;
        language?: string;
      };
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        if (res.status === 504 || res.status === 502) {
          throw new Error(
            "Server timed out (Vercel limit). Try a shorter video or use run-local.bat on your PC.",
          );
        }
        throw new Error(
          res.ok
            ? "Invalid response from server."
            : `Server error (${res.status}). ${raw.slice(0, 200)}`,
        );
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Transcription failed (${res.status}).`);
      }

      if (data.status === "done" || (!data.jobId && data.segments)) {
        setMeta(data.meta ?? null);
        setSegments(data.segments ?? []);
        setPlainText(data.plainText ?? "");
        setStatus(
          data.source === "youtube_captions"
            ? "Done (YouTube captions — enable subtitles on the video for best results)."
            : "Done.",
        );
        return;
      }

      const jobId = data.jobId;
      if (!jobId) {
        throw new Error("Server did not return a transcription job id.");
      }

      setMeta(data.meta ?? null);
      setStatus("Transcribing with Speechmatics…");

      let polls = 0;
      while (true) {
        await new Promise((r) => setTimeout(r, 5000));
        polls += 1;
        let pollRes: Response;
        try {
          pollRes = await fetch(
            `/api/transcribe/job?jobId=${encodeURIComponent(jobId)}`,
          );
        } catch {
          throw new Error(
            "Lost connection while waiting for transcription. The server may have timed out — try a shorter video or run locally.",
          );
        }
        const pollRaw = await pollRes.text();
        let pollData: {
          error?: string;
          status?: string;
          speechmaticsStatus?: string;
          segments?: TranscriptSegment[];
          plainText?: string;
          language?: string;
        };
        try {
          pollData = pollRaw ? JSON.parse(pollRaw) : {};
        } catch {
          throw new Error(`Poll failed (${pollRes.status}). Try again.`);
        }
        if (!pollRes.ok) {
          throw new Error(pollData.error ?? `Poll failed (${pollRes.status}).`);
        }
        if (pollData.status === "running") {
          setStatus(
            `Transcribing… (${pollData.speechmaticsStatus ?? "processing"}, check ${polls})`,
          );
          continue;
        }
        if (pollData.status === "done") {
          setSegments(pollData.segments ?? []);
          setPlainText(pollData.plainText ?? "");
          if (pollData.language && data.meta) {
            setMeta({ ...data.meta, language: pollData.language });
          }
          setStatus("Done.");
          break;
        }
        throw new Error("Unexpected response from transcription service.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/failed to fetch|networkerror|load failed/i.test(msg)) {
        setError(
          "Could not reach the server. If the video is long, Vercel may have timed out — try run-local.bat on your PC, or a shorter clip.",
        );
      } else {
        setError(msg);
      }
      setStatus("");
    } finally {
      setLoading(false);
    }
  }, [url, audioFile]);

  const onSummarize = useCallback(async () => {
    if (!plainText) return;
    setError("");
    setSummarizing(true);
    setStatus("Generating summary with Gemini…");

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: plainText,
          language: meta?.language,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Summary failed.");
      }
      setSummary(data.summary);
      setStatus("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus("");
    } finally {
      setSummarizing(false);
    }
  }, [plainText, meta?.language]);

  return (
    <main>
      <h1>Transciber</h1>
      <p className="subtitle">YouTube transcripts and AI summaries</p>

      <SetupPanel />

      <section className="card">
        <label htmlFor="yt-url">YouTube link</label>
        <input
          id="yt-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) onTranscribe();
          }}
          disabled={loading}
        />
        <p className="hint" style={{ marginTop: "0.75rem" }}>
          Or upload audio (mp3/m4a) if the video has no captions:
        </p>
        <input
          type="file"
          accept="audio/*,video/*,.m4a,.mp3,.mp4,.webm,.wav"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setAudioFile(f);
            if (f) setUrl("");
          }}
        />
        {audioFile ? (
          <p className="hint">
            Selected: <strong>{audioFile.name}</strong> (
            {(audioFile.size / (1024 * 1024)).toFixed(1)} MB)
          </p>
        ) : null}
        <div className="row">
          <button type="button" onClick={onTranscribe} disabled={loading}>
            {loading ? "Working…" : "Transcribe"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onSummarize}
            disabled={loading || summarizing || !plainText}
            title={plainText ? "Generate AI summary" : "Transcribe first"}
          >
            {summarizing ? "Summarizing…" : "AI summary"}
          </button>
          {plainText ? (
            <button
              type="button"
              className="secondary"
              onClick={() => copyText(plainText, "transcript")}
              disabled={loading}
            >
              {copied === "transcript" ? "Copied" : "Copy transcript"}
            </button>
          ) : null}
        </div>
        {error ? (
          <div className="error-banner" role="alert">
            {error}
          </div>
        ) : null}
        {status ? <p className="status">{status}</p> : null}
        {!plainText && !loading && !error ? (
          <p className="hint">
            After transcription you will get search in the transcript, timestamps, and AI
            summary. Long videos can take several minutes.
          </p>
        ) : null}
      </section>

      {meta ? (
        <section className="card video-meta">
          {meta.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meta.thumbnail}
              alt=""
              width={320}
              height={180}
              style={{ width: "100%", maxWidth: 320, borderRadius: 8, marginBottom: "0.75rem" }}
            />
          ) : null}
          <h2>{meta.title}</h2>
          <p>{meta.channel}</p>
          <p>
            {meta.duration}
            {meta.uploadDate ? ` · ${meta.uploadDate}` : ""}
            {meta.language ? ` · ${meta.language}` : ""}
          </p>
        </section>
      ) : null}

      {summary ? (
        <section className="card">
          <div className="row" style={{ marginTop: 0, marginBottom: "0.5rem" }}>
            <h2 style={{ fontSize: "1.05rem", margin: 0, flex: 1 }}>Summary</h2>
            <button
              type="button"
              className="secondary"
              onClick={() => copyText(summary, "summary")}
            >
              {copied === "summary" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="summary summary-body">{summary}</div>
        </section>
      ) : null}

      {segments.length > 0 ? (
        <section className="card">
          <h2 className="section-title">Transcript</h2>
          <div className="search-bar">
            <label htmlFor="search">Search in transcript</label>
            <input
              id="search"
              type="search"
              placeholder="Keyword…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
            />
            {search.trim() ? (
              <p className="search-meta">
                {matchCount} match{matchCount === 1 ? "" : "es"} · showing{" "}
                {filteredSegments.length} of {segments.length} lines
              </p>
            ) : null}
          </div>
          <div className="transcript">
            {filteredSegments.map((seg, i) => (
              <div className="segment" key={`${seg.startTime}-${i}`}>
                <time>{formatTimestamp(seg.startTime)}</time>
                {seg.speaker ? (
                  <span className="speaker">{seg.speaker}:</span>
                ) : null}
                <span>{highlightText(seg.text, search)}</span>
              </div>
            ))}
            {search.trim() && filteredSegments.length === 0 ? (
              <p className="status">No lines match your search.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
