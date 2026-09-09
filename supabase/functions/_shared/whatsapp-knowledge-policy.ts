import { cleanWhatsAppAiText, validateWhatsAppAiReply, type GeminiPayload } from "./whatsapp-ai-response.ts";
import { looksLikeTokenMatch, normalize } from "./whatsapp-treatment-response.ts";

export const unavailableTreatmentReply = "En este momento no tenemos ese tratamiento. ¿Te gustaría ver los tratamientos disponibles en nuestra página?";
export const unpublishedInformationReply = "Esa información no está publicada en nuestra página por el momento.";
export const outsideScopeReply = "Puedo ayudarte con la información de nuestra página: tratamientos, precios, sedes, profesionales y citas.";

export function isOfficialSiteUrl(value: string | null | undefined, siteUrl: string) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      && url.origin === new URL(siteUrl).origin;
  } catch {
    return false;
  }
}

export function isAllowedKnowledgeSource(source: { source_type?: string; source_url?: string | null; title: string }, siteUrl: string) {
  // Treatments and doctors are read live, never from an old synchronized snapshot.
  if (source.source_type === "platform") return ["Configuración pública", "Promociones", "Cursos"].includes(source.title);
  return source.source_type === "website" && isOfficialSiteUrl(source.source_url, siteUrl);
}

export function extractTreatmentSubject(text: string) {
  const value = normalize(text);
  const match = value.match(/\b(?:informacion|info|precio|costo|costos)\s+(?:del?|sobre|acerca de)\s+(.+)$/)
    ?? value.match(/\b(?:tienen|realizan|ofrecen|hacen)\s+(.+)$/)
    ?? value.match(/\b(?:reservar|agendar)\s+(?:una cita (?:de|para)\s+)?(.+)$/);
  if (!match) return null;
  const subject = match[1].replace(/^(?:el|la|un|una|tratamiento de|tratamiento)\s+/, "")
    .replace(/\s+(?:en|con|por favor|porfa)\s+.*$/, "").trim();
  if (!subject || subject.split(" ").length > 6 || /\b(para|contra|sin|cita|citas|consulta|pago|pagos|cuotas|horarios?|ciudad|sede|direccion|ubicacion|telefono|correo|contacto|parqueo|estacionamiento|doctoras?|doctores|servicios?|tratamientos?|promociones?|cursos?|eso|este|ese|esta|esa|lo mismo|cuidados|beneficios|resultados|duracion|tiempo|disponibilidad|cupos|qr)\b/.test(subject)) return null;
  return subject;
}

export function matchNamedTreatments<T extends { title: string }>(catalog: T[], subject: string) {
  const words = normalize(subject).split(" ").filter((word) => word.length >= 3 && !["tratamiento", "procedimiento", "del", "con", "sin", "para"].includes(word));
  if (!words.length) return [];
  return catalog.filter((item) => {
    const titleWords = normalize(item.title).split(" ");
    // "Facial" alone must not make an unknown procedure match limpieza facial.
    return words.every((word) => titleWords.some((titleWord) => looksLikeTokenMatch(word, titleWord)));
  });
}

export type ScopedSource = { id: string; content: string };

export const scopedReplySchema = {
  type: "OBJECT",
  properties: {
    kind: { type: "STRING", enum: ["answer", "unavailable_treatment", "missing_information", "out_of_scope", "clarify"] },
    answer: { type: "STRING" },
    treatment: { type: "STRING" },
    evidence: { type: "ARRAY", items: { type: "OBJECT", properties: { sourceId: { type: "STRING" }, quote: { type: "STRING" } }, required: ["sourceId", "quote"] } },
  },
  required: ["kind", "answer", "treatment", "evidence"],
};

export function readScopedGeminiReply(payload: GeminiPayload, sources: ScopedSource[], catalog: Array<{ title: string }> | undefined, allowedUrls: string[]) {
  const candidate = payload.candidates?.[0];
  if (candidate?.finishReason !== "STOP") throw new Error(`Gemini no terminó la respuesta: ${candidate?.finishReason ?? "sin candidato"}.`);
  const raw = candidate.content?.parts?.filter((part) => !part.thought).map((part) => part.text ?? "").join("") ?? "";
  const result = JSON.parse(raw) as { kind?: string; answer?: string; treatment?: string; evidence?: Array<{ sourceId?: string; quote?: string }> };
  if (result.kind === "out_of_scope") return outsideScopeReply;
  if (result.kind === "missing_information") return unpublishedInformationReply;
  if (result.kind === "unavailable_treatment") {
    if (!catalog || !result.treatment?.trim()) return unpublishedInformationReply;
    if (matchNamedTreatments(catalog, result.treatment).length) return "¿A cuál de los tratamientos de nuestra página te refieres?";
    return unavailableTreatmentReply;
  }
  if (result.kind === "clarify") return "¿Sobre qué tratamiento o servicio de nuestra página te gustaría consultar?";
  if (result.kind !== "answer" || typeof result.answer !== "string" || !result.evidence?.length) throw new Error("Respuesta sin evidencia de la página.");
  for (const evidence of result.evidence) {
    const source = sources.find((item) => item.id === evidence.sourceId);
    const quote = evidence.quote?.trim();
    if (!source || !quote || quote.length < 8 || !source.content.includes(quote)) throw new Error("La evidencia no pertenece a las fuentes publicadas.");
  }
  if (/\b(asesor[ae]?|asesora|administracion|administradora)\b/.test(normalize(result.answer))) {
    throw new Error("La respuesta informativa intenta derivar a una asesora.");
  }
  return validateWhatsAppAiReply(cleanWhatsAppAiText(result.answer), allowedUrls);
}
