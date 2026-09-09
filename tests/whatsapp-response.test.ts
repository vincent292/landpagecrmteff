import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedKnowledgeSource, isOfficialSiteUrl, readScopedGeminiReply, unavailableTreatmentReply, unpublishedInformationReply } from "../supabase/functions/_shared/whatsapp-knowledge-policy.ts";
import {
  cleanWhatsAppAiText, geminiGenerationConfig, readGeminiReply, resolveBookingUrl,
} from "../supabase/functions/_shared/whatsapp-ai-response.ts";
import {
  formatTreatmentOverview, formatTreatmentFollowUpAnswer, isBookingRequest,
  matchInformationalTreatments, splitWhatsAppText,
} from "../supabase/functions/_shared/whatsapp-treatment-response.ts";

const bookingUrl = "https://www.draballesteros.com/reservar-cita";
const finalReply = (text: string, finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });
const cleaning = {
  id: "cleaning", title: "LIMPIEZA FACIAL PROFUNDA PREMIUM", city: "Cochabamba", duration: "90 minutos",
  treatment_price: 1, allows_direct_booking: true, available_slots: 2, approved_slots: 0,
  public_info: "Duración: 60 a 90 minutos. Frecuencia: cada 4 a 6 semanas.",
  benefits: "Piel más suave.", care_instructions: "Protector solar e hidratación.", expected_results: "Piel limpia.",
  doctor_profiles: { full_name: "Neisa Aguilar Cárdenas", specialty: "Fisioterapeuta y cosmetóloga" },
};
const rhino = { id: "rhino", title: "RINOMODELACIÓN", city: "Cochabamba", treatment_price: 800 };
const surgery = { id: "surgery", title: "RINOPLASTIA", city: "Cochabamba", requires_assessment: true, assessment_price: 200 };
const treatments = [cleaning, rhino, surgery];

test("Gemini only sends the final answer, excluding thought parts", () => {
  const payload = { candidates: [{ finishReason: "STOP", content: { parts: [
    { thought: true, text: "style constraints: WhatsApp style. Drafting the Response: Acknowledge" },
    { text: "Te ayudo con tu cita. ¿En qué ciudad deseas atenderte?" },
  ] } }] };
  assert.equal(readGeminiReply(payload, []), "Te ayudo con tu cita. ¿En qué ciudad deseas atenderte?");
});

for (const reason of ["MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", ""]) {
  test(`Gemini rejects unfinished or blocked output (${reason})`, () => {
    assert.throws(() => readGeminiReply(finalReply("Puedes agendar en https://www.dr", reason), [bookingUrl]));
  });
}

for (const text of [
  "style constraints:\n• WhatsApp style: short, natural messages.\n• No Markdown (",
  '").\n\n3. Drafting the Response:\n   • Acknowledge',
  "<think>Debo responder sobre la rino</think>",
  "System instruction: contesta brevemente.",
]) {
  test(`Gemini rejects leaked instructions: ${text.slice(0, 30)}`, () => {
    assert.throws(() => readGeminiReply(finalReply(text), []), /instrucciones internas/);
  });
}

test("complete booking links are plain text with their entire path intact", () => {
  assert.equal(readGeminiReply(finalReply(`Reserva aquí: [${bookingUrl}](${bookingUrl}).`), [bookingUrl]), `Reserva aquí: ${bookingUrl}.`);
  assert.equal(cleanWhatsAppAiText(`[Agendar cita](${bookingUrl})`), `Agendar cita: ${bookingUrl}`);
  assert.equal(resolveBookingUrl("reservar-cita", "https://www.draballesteros.com"), bookingUrl);
});

for (const url of ["https://www.dr", "https://www", "https://www.draballesteros.com/reservar", "https://inventado.com/cita"]) {
  test(`unverified or truncated URL is rejected: ${url}`, () => {
    assert.throws(() => readGeminiReply(finalReply(`Agenda en [${url}](${url}).`), [bookingUrl]), /enlace/);
  });
}

test("grounded source links are allowed when returned by the provider", () => {
  const source = "https://example.org/research";
  const payload = { candidates: [{ ...finalReply(`Fuente: ${source}`).candidates[0], groundingMetadata: { groundingChunks: [{ web: { uri: source } }] } }] };
  assert.equal(readGeminiReply(payload, []), `Fuente: ${source}`);
});

test("long AI replies are rejected for regeneration instead of cutting the end", () => {
  assert.throws(() => readGeminiReply(finalReply("Información completa. ".repeat(100) + bookingUrl), [bookingUrl]), /extensa/);
  assert.throws(() => readGeminiReply({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "Plan" }] } }] }, []), /vacía/);
});

test("thinking budgets leave room for the final patient message", () => {
  assert.equal(geminiGenerationConfig("gemini-3.7-flash").thinkingConfig?.includeThoughts, false);
  assert.ok(geminiGenerationConfig("gemini-3.7-flash").maxOutputTokens > 550);
  assert.ok(geminiGenerationConfig("gemini-3.7-flash", true).maxOutputTokens > geminiGenerationConfig("gemini-3.7-flash").maxOutputTokens);
});

for (const text of ["Como puedo agendar cita", "Quiero reservar una. Cita", "Quisiera una cita", "Necesito una cita"]) {
  test(`booking intent survives conversational phrasing: ${text}`, () => assert.ok(isBookingRequest(text)));
}

test("information and negated bookings do not start a reservation", () => {
  for (const text of ["Y precio de rinomodelación", "No quiero reservar", "Quiero información sin agendar", "Quiero cancelar mi cita"]) assert.equal(isBookingRequest(text), false);
});

test("one specific treatment word resolves a price question", () => {
  assert.deepEqual(matchInformationalTreatments(treatments, "Y precio de rinomodelación").map((row) => row.id), ["rhino"]);
  assert.deepEqual(matchInformationalTreatments(treatments, "precio de rinomodelacion").map((row) => row.id), ["rhino"]);
});

test("rino requires clarification when several treatments match", () => {
  assert.deepEqual(matchInformationalTreatments(treatments, "Y quisiera saber más información de la rino").map((row) => row.id), ["rhino", "surgery"]);
});

test("generic follow ups preserve context instead of selecting an unrelated treatment", () => {
  for (const text of ["Y precio?", "Cuánto dura?", "Quiero reservar una. Cita", "Cochabamba"]) assert.deepEqual(matchInformationalTreatments(treatments, text), []);
});

test("treatment introduction is short and does not dump every database field", () => {
  const body = formatTreatmentOverview(cleaning);
  assert.ok(body.length < 700);
  assert.match(body, /90 minutos/);
  assert.doesNotMatch(body, /60 a 90|Beneficios:|Cuidados:|Resultados esperados:|\*/);
  // A published price is data; the bot must not silently replace it.
  assert.match(body, /1\.00 Bs/);
});

test("a price question gets the price and a duration question gets the duration", () => {
  assert.equal(formatTreatmentFollowUpAnswer(rhino, "Y precio de rinomodelación"), "RINOMODELACIÓN\n\nPrecio: 800.00 Bs.");
  const duration = formatTreatmentFollowUpAnswer(cleaning, "Cuánto dura?");
  assert.match(duration, /90 minutos/);
  assert.doesNotMatch(duration, /Precio/);
  const both = formatTreatmentFollowUpAnswer(cleaning, "Cuál es el precio y cuánto dura?");
  assert.match(both, /1\.00 Bs/);
  assert.match(both, /90 minutos/);
});

test("assessment cost cannot be mistaken for treatment cost", () => {
  const reply = formatTreatmentFollowUpAnswer(surgery, "precio");
  assert.match(reply, /Valoración previa: presencial 200\.00 Bs/);
  assert.match(reply, /precio del tratamiento se confirma/);
  assert.doesNotMatch(formatTreatmentFollowUpAnswer({ title: "Sin precio" }, "precio"), /0\.00 Bs/);
});

test("more information uses the selected treatment description without repeating the menu", () => {
  const answer = formatTreatmentFollowUpAnswer({ ...rhino, public_info: "Información publicada del tratamiento." }, "Quiero más información");
  assert.equal(answer, "RINOMODELACIÓN\n\nInformación publicada del tratamiento.");
});

test("long care instructions and full URLs survive message splitting", () => {
  const care = "Una indicación completa de cuidados. ".repeat(200) + `Consulta al equipo: ${bookingUrl}`;
  const body = formatTreatmentFollowUpAnswer({ ...cleaning, care_instructions: care }, "cuidados");
  assert.ok(body.includes(care));
  const chunks = splitWhatsAppText(body);
  assert.ok(chunks.every((chunk) => chunk.length <= 4096));
  assert.equal(chunks.join(" ").replace(/\s+/g, " "), body.replace(/\s+/g, " "));
  assert.ok(chunks.at(-1)?.endsWith(bookingUrl));
});

test("knowledge allows the official site and approved platform data only", () => {
  const site = "https://www.draballesteros.com";
  assert.ok(isAllowedKnowledgeSource({ title: "Contacto", source_type: "website", source_url: `${site}/contacto` }, site));
  assert.ok(isAllowedKnowledgeSource({ title: "Cursos", source_type: "platform" }, site));
  for (const source of [
    { title: "Externo", source_type: "website", source_url: "https://otra-clinica.com" },
    { title: "Redes", source_type: "instagram", source_url: "https://instagram.com/clinica" },
    { title: "FAQ interna", source_type: "manual" },
    { title: "Tratamientos", source_type: "platform" },
  ]) assert.equal(isAllowedKnowledgeSource(source, site), false);
  assert.equal(isOfficialSiteUrl("https://www.draballesteros.com.ejemplo.com", site), false);
});

test("freeform answers need exact evidence from an authorized source", () => {
  const sources = [{ id: "source-1", content: "El precio publicado es 800 Bs." }];
  const result = { kind: "answer", answer: "El precio es 800 Bs.", treatment: "", evidence: [{ sourceId: "source-1", quote: "precio publicado es 800 Bs." }] };
  assert.equal(readScopedGeminiReply(finalReply(JSON.stringify(result)), sources, [], []), result.answer);
  assert.throws(() => readScopedGeminiReply(finalReply(JSON.stringify({ ...result, evidence: [] })), sources, [], []), /sin evidencia/);
  assert.throws(() => readScopedGeminiReply(finalReply(JSON.stringify({ ...result, evidence: [{ sourceId: "source-1", quote: "precio publicado es 100 Bs." }] })), sources, [], []), /evidencia/);
  assert.throws(() => readScopedGeminiReply(finalReply(JSON.stringify({ ...result, evidence: [{ sourceId: "internet", quote: "precio publicado es 800 Bs." }] })), sources, [], []), /evidencia/);
});

test("unavailability requires a complete catalog and cannot deny a known treatment", () => {
  const result = { kind: "unavailable_treatment", answer: "Te derivo a una asesora", treatment: "Liposucción", evidence: [] };
  assert.equal(readScopedGeminiReply(finalReply(JSON.stringify(result)), [], [rhino], []), unavailableTreatmentReply);
  assert.equal(readScopedGeminiReply(finalReply(JSON.stringify({ ...result, treatment: "teletransportación facial" })), [], [cleaning], []), unavailableTreatmentReply);
  assert.equal(readScopedGeminiReply(finalReply(JSON.stringify(result)), [], undefined, []), unpublishedInformationReply);
  assert.doesNotMatch(readScopedGeminiReply(finalReply(JSON.stringify({ ...result, treatment: "rinomodelación" })), [], [rhino], []), /no tenemos/);
});
