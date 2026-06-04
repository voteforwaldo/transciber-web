const API_BASE = "https://asr.api.speechmatics.com/v2";

export type TranscriptSegment = {
  speaker: string | null;
  startTime: number;
  text: string;
};

type SmWord = {
  type: string;
  start_time?: number;
  alternatives?: Array<{
    content?: string;
    speaker?: string;
  }>;
};

function buildSegments(results: SmWord[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let currentSpeaker: string | null = null;
  let currentWords: string[] = [];
  let currentStart = 0;

  for (const item of results) {
    const itemType = item.type;
    if (itemType !== "word" && itemType !== "punctuation") continue;

    const alt = item.alternatives?.[0];
    const content = alt?.content ?? "";
    const speaker = alt?.speaker ?? null;

    if (speaker && speaker !== currentSpeaker && currentWords.length) {
      segments.push({
        speaker: currentSpeaker,
        startTime: currentStart,
        text: currentWords.join(" "),
      });
      currentWords = [];
      currentStart = item.start_time ?? currentStart;
    }

    if (speaker) currentSpeaker = speaker;

    if (itemType === "word") {
      if (!currentWords.length) currentStart = item.start_time ?? 0;
      currentWords.push(content);
    } else if (itemType === "punctuation" && currentWords.length) {
      currentWords[currentWords.length - 1] += content;
    }
  }

  if (currentWords.length) {
    segments.push({
      speaker: currentSpeaker,
      startTime: currentStart,
      text: currentWords.join(" "),
    });
  }

  return segments;
}

async function smFetch(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export async function transcribeAudio(
  audio: Buffer,
  filename: string,
  apiKey: string,
  onStatus?: (msg: string) => void,
): Promise<{ segments: TranscriptSegment[]; language?: string }> {
  const config = {
    type: "transcription",
    transcription_config: {
      language: "auto",
      diarization: "speaker",
    },
    language_identification_config: {
      expected_languages: ["en", "bg", "ru"],
    },
  };

  const form = new FormData();
  form.append("config", JSON.stringify(config));
  form.append("data_file", new Blob([new Uint8Array(audio)]), filename);

  onStatus?.("Uploading audio to Speechmatics…");
  const submitRes = await smFetch("/jobs", apiKey, { method: "POST", body: form });
  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Speechmatics submit failed (${submitRes.status}): ${err}`);
  }

  const submitJson = (await submitRes.json()) as { id?: string };
  const jobId = submitJson.id;
  if (!jobId) throw new Error("Speechmatics did not return a job id.");

  onStatus?.("Transcribing…");
  const pollInterval = 5000;
  let polls = 0;

  while (true) {
    await new Promise((r) => setTimeout(r, pollInterval));
    polls += 1;
    const infoRes = await smFetch(`/jobs/${jobId}`, apiKey);
    if (!infoRes.ok) {
      throw new Error(`Speechmatics job poll failed (${infoRes.status})`);
    }
    const info = (await infoRes.json()) as {
      job?: { status?: string };
      status?: string;
      errors?: unknown;
    };
    const status = info.job?.status ?? info.status ?? "unknown";
    onStatus?.(`Processing… (${status}, poll ${polls})`);

    if (status === "done") break;
    if (status === "rejected") {
      throw new Error(
        `Speechmatics rejected the job: ${JSON.stringify(info.errors ?? info)}`,
      );
    }
  }

  onStatus?.("Downloading transcript…");
  const txRes = await smFetch(
    `/jobs/${jobId}/transcript?format=json-v2`,
    apiKey,
  );
  if (!txRes.ok) {
    const err = await txRes.text();
    throw new Error(`Speechmatics transcript failed (${txRes.status}): ${err}`);
  }

  const tx = (await txRes.json()) as {
    results?: SmWord[];
    metadata?: {
      language_pack_info?: { language_description?: string };
      transcription_config?: { language?: string };
    };
  };

  const language =
    tx.metadata?.language_pack_info?.language_description ??
    tx.metadata?.transcription_config?.language;

  const segments = buildSegments(tx.results ?? []);
  return { segments, language: language || undefined };
}
