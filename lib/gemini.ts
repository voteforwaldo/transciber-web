const GEMINI_SUMMARY_INSTRUCTIONS = `Please provide a clear, concise summary of the attached transcript.

LANGUAGE (required): Write the entire summary in the same language as the transcript. Detect the language from the transcript text itself. Do not translate into English unless the transcript is in English. Use section headings in that same language.

Structure the summary as:
1. Main topics discussed
2. Key takeaways
3. Next steps or action items mentioned (omit this section if none)`;

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

const DEPRECATED_GEMINI_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
]);

export function resolveGeminiModel(model?: string): string {
  const name = (model ?? "").trim() || DEFAULT_GEMINI_MODEL;
  if (DEPRECATED_GEMINI_MODELS.has(name)) return DEFAULT_GEMINI_MODEL;
  return name;
}

export function friendlyGeminiError(errText: string): string {
  const low = errText.toLowerCase();
  if (low.includes("http 429") || low.includes("resource_exhausted") || low.includes("quota")) {
    const retry = errText.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
    const retryMsg = retry ? ` Try again in about ${Math.ceil(parseFloat(retry[1]))} seconds.` : "";
    return `Gemini quota limit reached.${retryMsg}`;
  }
  if (low.includes("http 401") || low.includes("permission_denied") || low.includes("api key")) {
    return "Gemini authentication failed. Check your API key.";
  }
  return errText;
}

export function buildSummaryPrompt(transcriptText: string, languageHint?: string): string {
  const parts = [GEMINI_SUMMARY_INSTRUCTIONS];
  if (languageHint) {
    parts.push(
      `\nMetadata: the transcript is labeled as ${languageHint}. Write the summary in ${languageHint}.`,
    );
  }
  if (transcriptText.trim()) {
    parts.push(`\n\n--- TRANSCRIPT ---\n\n${transcriptText.trim()}`);
  }
  return parts.join("");
}

export async function geminiSummarize(
  prompt: string,
  apiKey: string,
  model?: string,
): Promise<string> {
  const modelId = resolveGeminiModel(model ?? process.env.GEMINI_MODEL);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(friendlyGeminiError(`Gemini API HTTP ${res.status}: ${body}`));
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const parts: string[] = [];
  for (const cand of data.candidates ?? []) {
    for (const part of cand.content?.parts ?? []) {
      if (part.text?.trim()) parts.push(part.text.trim());
    }
  }

  const out = parts.join("\n").trim();
  if (!out) throw new Error("Gemini returned empty text.");
  return out;
}
