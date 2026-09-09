export type GeminiPayload = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> };
  }>;
};

export function isUnsafeAiReply(reply: string) {
  return /\b(without inventing|direct response|system instruction|prompt injection|contexto del negocio|estado real de reserva|redacta [úu]nicamente|ignore previous|style constraints|whatsapp style|no markdown|drafting (?:the )?response|thought process|thinking process|chain.of.thought|internal (?:instructions|reasoning)|analysis of (?:the )?(?:user|request)|instrucciones internas|razonamiento interno)\b|<\/?(?:think|analysis|reasoning)>|(?:^|\n)\s*(?:analysis|reasoning|system|assistant)\s*:/i.test(reply);
}

export function cleanWhatsAppAiText(value: string) {
  return value
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, url: string) => label === url ? url : `${label}: ${url}`)
    .replace(/<(https?:\/\/[^\s>]+)>/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function urlsInText(value: string) {
  return (value.match(/https?:\/\/[^\s<>"\][)]+/gi) ?? []).map((url) => url.replace(/[.,;:!?]+$/, ""));
}

function canonicalUrl(value: string) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function resolveBookingUrl(bookingUrl: string | null | undefined, siteUrl: string) {
  const fallback = new URL("/reservar-cita", siteUrl).href;
  try {
    return canonicalUrl(new URL(bookingUrl?.trim() || "/reservar-cita", siteUrl).href) ?? fallback;
  } catch {
    return fallback;
  }
}

export function validateWhatsAppAiReply(text: string, allowedUrls: string[]) {
  if (!text || !/[a-záéíóúñ]/i.test(text)) throw new Error("Gemini devolvió una respuesta vacía.");
  if (isUnsafeAiReply(text)) throw new Error("Gemini devolvió instrucciones internas.");
  // Retry a long answer instead of slicing through a sentence, URL or care instruction.
  if (text.length > 1800) throw new Error("Gemini devolvió una respuesta demasiado extensa.");
  const allowed = new Set(allowedUrls.map(canonicalUrl).filter(Boolean));
  for (const url of urlsInText(text)) {
    const canonical = canonicalUrl(url);
    if (!canonical || !allowed.has(canonical)) throw new Error("Gemini devolvió un enlace no verificado o incompleto.");
  }
  if (/https?:\/(?:\s|$)|\[[^\]]*$|\]\([^)]*$/.test(text)) throw new Error("Gemini devolvió un enlace incompleto.");
  return text;
}

export function readGeminiReply(payload: GeminiPayload, allowedUrls: string[]) {
  const candidate = payload.candidates?.[0];
  if (candidate?.finishReason !== "STOP") {
    throw new Error(`Gemini no terminó la respuesta: ${candidate?.finishReason ?? "sin candidato"}.`);
  }
  const text = candidate.content?.parts
    ?.filter((part) => part.thought !== true && typeof part.text === "string")
    .map((part) => part.text).join("") ?? "";
  const groundedUrls = candidate.groundingMetadata?.groundingChunks?.flatMap((chunk) => chunk.web?.uri ? [chunk.web.uri] : []) ?? [];
  return validateWhatsAppAiReply(cleanWhatsAppAiText(text), [...allowedUrls, ...groundedUrls]);
}

export function geminiGenerationConfig(model: string, retry = false) {
  const thinkingConfig = /^gemini-3[.-]/.test(model)
    ? { includeThoughts: false, thinkingLevel: "low" }
    : /^gemini-2\.5-/.test(model)
    ? { includeThoughts: false, thinkingBudget: model.includes("flash") ? 0 : 128 }
    : undefined;
  return {
    maxOutputTokens: retry ? 4096 : 2048,
    temperature: 0.25,
    ...(thinkingConfig ? { thinkingConfig } : {}),
  };
}
