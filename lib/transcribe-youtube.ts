import { submitTranscriptionJob } from "@/lib/speechmatics";
import { segmentsToPlainText } from "@/lib/transcript";
import { transcribeViaRemoteService } from "@/lib/remote-transcribe";
import { downloadYouTubeAudioViaCobalt } from "@/lib/youtube-cobalt";
import { fetchYouTubeCaptions } from "@/lib/youtube-captions";
import { downloadYouTubeAudio, formatDuration } from "@/lib/youtube";

export type TranscribeStartResponse =
  | {
      mode: "processing";
      jobId: string;
      url: string;
      meta: {
        title: string;
        channel: string;
        duration: string;
        uploadDate?: string;
        thumbnail?: string;
      };
      source: "speechmatics";
    }
  | {
      mode: "complete";
      url: string;
      meta: {
        title: string;
        channel: string;
        duration: string;
        uploadDate?: string;
        thumbnail?: string;
        language?: string;
      };
      segments: import("@/lib/speechmatics").TranscriptSegment[];
      plainText: string;
      source: "youtube_captions";
    };

function isVercel(): boolean {
  return process.env.VERCEL === "1";
}

function metaFromDownload(meta: Awaited<ReturnType<typeof downloadYouTubeAudio>>["meta"]) {
  return {
    title: meta.title,
    channel: meta.channel,
    duration: formatDuration(meta.duration),
    uploadDate: meta.uploadDate || undefined,
    thumbnail: meta.thumbnail,
  };
}

async function startSpeechmaticsJob(
  url: string,
  buffer: Buffer,
  filename: string,
  meta: Awaited<ReturnType<typeof downloadYouTubeAudio>>["meta"],
  speechmaticsKey: string,
): Promise<TranscribeStartResponse> {
  const jobId = await submitTranscriptionJob(buffer, filename, speechmaticsKey);
  return {
    mode: "processing",
    jobId,
    url,
    meta: metaFromDownload(meta),
    source: "speechmatics",
  };
}

/** Online-friendly: captions on Vercel, yt-dlp on Docker/Render, optional Cobalt fallback. */
export async function transcribeYouTubeUrl(
  url: string,
  speechmaticsKey: string,
): Promise<TranscribeStartResponse> {
  const cobaltBase = process.env.COBALT_API_URL?.trim();
  const remoteService = process.env.TRANSCRIBE_SERVICE_URL?.trim();

  if (isVercel()) {
    if (remoteService) {
      try {
        return await transcribeViaRemoteService(url);
      } catch (remoteErr) {
        console.warn("[transcribe] remote:", remoteErr);
      }
    }

    // Captions first on Vercel (yt-dlp is usually blocked)
    try {
      const cap = await fetchYouTubeCaptions(url);
      return {
        mode: "complete",
        url,
        meta: {
          title: cap.meta.title,
          channel: cap.meta.channel,
          duration: cap.meta.durationLabel,
          thumbnail: cap.meta.thumbnail,
          language: cap.captionLanguage
            ? `Captions (${cap.captionLanguage})`
            : "YouTube captions",
        },
        segments: cap.segments,
        plainText: cap.plainText,
        source: "youtube_captions",
      };
    } catch (capErr) {
      console.warn("[transcribe] captions:", capErr);
    }

    try {
      const { buffer, filename, meta } = await downloadYouTubeAudio(url);
      return startSpeechmaticsJob(url, buffer, filename, meta, speechmaticsKey);
    } catch (ytdlpErr) {
      console.warn("[transcribe] yt-dlp:", ytdlpErr);
    }

    if (cobaltBase) {
      try {
        const { buffer, filename, meta } = await downloadYouTubeAudioViaCobalt(
          url,
          cobaltBase,
        );
        return startSpeechmaticsJob(url, buffer, filename, meta, speechmaticsKey);
      } catch (cobaltErr) {
        console.warn("[transcribe] cobalt:", cobaltErr);
      }
    }

    throw new Error(
      "Could not get this video online (no captions found and YouTube download blocked on Vercel). " +
        "Try: (1) a video with subtitles/CC enabled, (2) upload mp3/m4a, or (3) run setup-online.bat " +
        "to connect Render for videos without captions — DEPLOY-RENDER.md.",
    );
  }

  let ytdlpError = "yt-dlp download failed.";
  try {
    const { buffer, filename, meta } = await downloadYouTubeAudio(url);
    return startSpeechmaticsJob(url, buffer, filename, meta, speechmaticsKey);
  } catch (err) {
    ytdlpError = err instanceof Error ? err.message : String(err);
    console.warn("[transcribe] yt-dlp:", ytdlpError);
  }

  try {
    const cap = await fetchYouTubeCaptions(url);
    return {
      mode: "complete",
      url,
      meta: {
        title: cap.meta.title,
        channel: cap.meta.channel,
        duration: cap.meta.durationLabel,
        thumbnail: cap.meta.thumbnail,
        language: cap.captionLanguage,
      },
      segments: cap.segments,
      plainText: cap.plainText,
      source: "youtube_captions",
    };
  } catch {
    /* fall through */
  }

  if (cobaltBase) {
    try {
      const { buffer, filename, meta } = await downloadYouTubeAudioViaCobalt(
        url,
        cobaltBase,
      );
      return startSpeechmaticsJob(url, buffer, filename, meta, speechmaticsKey);
    } catch (cobaltErr) {
      console.warn("[transcribe] cobalt:", cobaltErr);
    }
  }

  throw new Error(ytdlpError);
}

export { segmentsToPlainText };
