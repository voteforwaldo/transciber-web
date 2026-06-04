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
    if (!trimmed) {
      setError("Paste a YouTube link first.");
      return;
    }

    setLoading(true);
    setStatus("Downloading audio and transcribing… This may take several minutes.");

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const raw = await res.text();
      let data: { error?: string; meta?: Meta; segments?: TranscriptSegment[]; plainText?: string };
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Invalid response from server."
            : `Server error (${res.status}). Check you opened the URL shown in the terminal (port 3010).`,
        );
      }
      if (!res.ok) {
        throw new Error(data.error ?? `Transcription failed (${res.status}).`);
      }
      setMeta(data.meta ?? null);
      setSegments(data.segments ?? []);
      setPlainText(data.plainText ?? "");
      setStatus("Done.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus("");
    } finally {
      setLoading(false);
    }
  }, [url]);

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
