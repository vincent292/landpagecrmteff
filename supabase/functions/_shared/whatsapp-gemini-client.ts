import type { GeminiPayload } from "./whatsapp-ai-response.ts";

class GeminiHttpError extends Error {
  constructor(public status: number, public retryAfterMs: number) {
    super(`Gemini API ${status}`);
  }
}

function isTransient(error: unknown) {
  return error instanceof GeminiHttpError
    ? [408, 429, 500, 502, 503, 504].includes(error.status)
    : error instanceof TypeError || (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name));
}

export async function requestGeminiReply(input: {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  buildBody: (model: string, repair: boolean) => string;
  readReply: (payload: GeminiPayload) => string;
}) {
  const startedAt = Date.now();
  let model = input.model;
  let invalidReplies = 0;
  // Bound the entire operation, including response repairs, to three requests.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let payload: GeminiPayload;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": input.apiKey },
        body: input.buildBody(model, invalidReplies > 0),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        const retryAfter = response.headers.get("Retry-After");
        const retryAfterMs = retryAfter
          ? (/^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()))
          : 0;
        await response.body?.cancel();
        throw new GeminiHttpError(response.status, Number.isFinite(retryAfterMs) ? retryAfterMs : 0);
      }
      payload = await response.json() as GeminiPayload;
    } catch (error) {
      const retryAfterMs = error instanceof GeminiHttpError ? error.retryAfterMs : 0;
      if (!isTransient(error) || attempt === 2 || retryAfterMs > 5_000) throw error;
      const nextModel = input.fallbackModel || model;
      console.warn("[whatsapp] Gemini temporary failure; retrying", {
        model, nextModel, attempt: attempt + 1,
        reason: error instanceof Error ? error.message : "transport error",
      });
      model = nextModel;
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfterMs, 1000 * 2 ** attempt + Math.random() * 250)));
      continue;
    }
    try {
      const reply = input.readReply(payload);
      console.info("[whatsapp] Gemini reply validated", { model, attempts: attempt + 1, elapsedMs: Date.now() - startedAt });
      return reply;
    } catch (error) {
      invalidReplies += 1;
      if (invalidReplies >= 2 || attempt === 2) throw error;
      console.warn("[whatsapp] Invalid Gemini answer; repairing once", {
        model, reason: error instanceof Error ? error.message : "invalid output",
      });
    }
  }
  throw new Error("Gemini exhausted the reply attempts.");
}
