export function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function displayPrice(treatment: Record<string, unknown>) {
  const price = Number(treatment.requires_assessment
    ? treatment.assessment_price_presencial ?? treatment.assessment_price
    : treatment.treatment_price ?? treatment.direct_booking_price ?? treatment.assessment_price ?? 0);
  return price > 0 ? `${price.toFixed(2)} Bs` : null;
}

export function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function compactText(value: unknown, maxLength: number) {
  const text = textValue(value)?.replace(/\s+/g, " ");
  if (!text) return null;
  if (text.length <= maxLength) return text;
  const excerpt = text.slice(0, maxLength - 1);
  const boundary = Math.max(excerpt.lastIndexOf(". "), excerpt.lastIndexOf("; "));
  if (boundary >= maxLength / 3) return excerpt.slice(0, boundary + 1);
  // Keep whole words and never expose a partially copied URL.
  const words = excerpt.slice(0, excerpt.lastIndexOf(" ")).replace(/https?:\/\/\S*$/, "").trim();
  return words ? `${words}…` : null;
}

export function treatmentDoctorName(treatment: Record<string, unknown>) {
  const doctor = treatment.doctor_profiles as { full_name?: string | null; specialty?: string | null } | null | undefined;
  if (!doctor?.full_name) return null;
  return doctor.specialty ? `${doctor.full_name} (${doctor.specialty})` : doctor.full_name;
}

export function remainingTreatmentSlots(treatment: Record<string, unknown>) {
  const total = Number(treatment.available_slots ?? 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const approved = Number(treatment.approved_slots ?? 0);
  return Math.max(total - (Number.isFinite(approved) ? approved : 0), 0);
}

export function formatTreatmentPriceLine(treatment: Record<string, unknown>) {
  if (treatment.requires_assessment) {
    const mode = String(treatment.assessment_mode ?? "presencial");
    const presencial = Number(treatment.assessment_price_presencial ?? treatment.assessment_price ?? 0);
    const virtual = Number(treatment.assessment_price_virtual ?? treatment.assessment_price ?? 0);
    const parts = [
      mode !== "virtual" && presencial > 0 ? `presencial ${presencial.toFixed(2)} Bs` : null,
      mode !== "presencial" && virtual > 0 ? `virtual ${virtual.toFixed(2)} Bs` : null,
    ].filter(Boolean);
    return parts.length
      ? `Valoración previa: ${parts.join(" / ")}. El precio del tratamiento se confirma en la valoración.`
      : "Requiere valoración previa. El costo se confirma con administración.";
  }
  const price = displayPrice(treatment);
  return price ? `Precio: ${price}.` : "El precio aún no está publicado; administración puede confirmarlo.";
}

export function formatTreatmentSlotsLine(treatment: Record<string, unknown>) {
  const remaining = remainingTreatmentSlots(treatment);
  if (remaining == null) return treatment.allows_direct_booking ? "Cupos: segun agenda disponible." : null;
  return remaining > 0 ? `Cupos disponibles: ${remaining}.` : "Cupos disponibles: agotados por ahora.";
}

export function editDistance(a: string, b: string) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

export function looksLikeTokenMatch(inputToken: string, nameToken: string) {
  if (inputToken === nameToken || inputToken.includes(nameToken) || nameToken.includes(inputToken)) return true;
  if (inputToken.length < 5 || nameToken.length < 5) return false;
  return editDistance(inputToken, nameToken) <= 2;
}

export function looksLikeTreatmentTokenMatch(inputToken: string, nameToken: string) {
  if (Math.min(inputToken.length, nameToken.length) < 3) return false;
  if (looksLikeTokenMatch(inputToken, nameToken)) return true;
  // Long procedure names can contain several mistyped or inserted letters.
  return Math.min(inputToken.length, nameToken.length) >= 12 && editDistance(inputToken, nameToken) <= 3;
}

export function meaningfulTokens(text: string) {
  const stopWords = new Set([
    "quiero", "quisiera", "saber", "informacion", "info", "sobre", "acerca", "del", "de", "la", "el", "los", "las",
    "tratamiento", "tratamientos", "servicio", "servicios", "precio", "costo", "cuanto", "dime", "me", "puedes",
    "dar", "ver", "mostrar", "muestrame", "hay", "tienen", "tiene",
    "hola", "buenas", "buenos", "dias", "tardes", "noches",
    "mas", "una", "uno", "por", "para", "favor", "que", "como", "cita", "citas", "reservar", "reserva", "agendar",
    "puedo", "podria", "gustaria", "conocer", "necesito", "cuesta", "vale", "cuidados", "beneficios", "duracion", "dura",
    "resultados", "cupos", "disponibilidad", "cochabamba", "paz", "santa", "cruz", "sucre", "oruro", "potosi", "tarija", "beni", "pando",
  ]);
  return normalize(text).split(" ").filter((token) => token.length >= 3 && !stopWords.has(token));
}

export function treatmentTextScore(treatment: Record<string, unknown>, text: string) {
  const inputTokens = meaningfulTokens(text);
  if (!inputTokens.length) return 0;
  const title = normalize(String(treatment.title ?? ""));
  const haystack = normalize([
    treatment.title,
    treatment.short_description,
    treatment.public_info,
    treatment.description,
  ].filter(Boolean).join(" "));
  const titleTokens = title.split(" ").filter((token) => token.length >= 3);
  let score = title && normalize(text).includes(title) ? 10 : 0;
  for (const inputToken of inputTokens) {
    if (titleTokens.some((titleToken) => looksLikeTreatmentTokenMatch(inputToken, titleToken))) score += 4;
    else if (haystack.split(" ").some((token) => looksLikeTokenMatch(inputToken, token))) score += 1;
  }
  return score;
}

export function formatTreatmentOverview(treatment: Record<string, unknown>) {
  const title = compactText(treatment.title, 140) ?? "Tratamiento";
  const city = textValue(treatment.city);
  const lines = [`${title}${city ? ` en ${city}` : ""}.`];
  const facts = [
    formatTreatmentPriceLine(treatment),
    textValue(treatment.duration) ? `Duración: ${compactText(treatment.duration, 100)}.` : null,
    treatmentDoctorName(treatment) ? `Te atiende ${compactText(treatmentDoctorName(treatment), 180)}.` : null,
  ].filter(Boolean);
  if (facts.length) lines.push(facts.join("\n"));

  // A short introduction uses one descriptive field. Detailed care and results
  // are answered on request, so contradictory duration text is not repeated here.
  const info = compactText(textValue(treatment.short_description) ?? textValue(treatment.public_info) ?? treatment.description, 220);
  if (info && !/\b(duraci[oó]n|minutos?|horas?)\b/i.test(info)) lines.push(info);
  lines.push("¿Qué te gustaría saber sobre este tratamiento?");
  return lines.join("\n\n");
}

export function isTreatmentFollowUpQuestion(text?: string | null) {
  const normalized = normalize(text ?? "");
  return /\b(beneficios?|cuidados?|duracion|dura|tiempo|resultados?|precio|costo|cuanto|cuesta|vale|cupos?|disponibilidad|doctora|doctor|quien|ciudad|sede|para que|sirve|consiste|como es|que es|informacion|info|detalles|cuentame)\b/i.test(normalized);
}

export function formatTreatmentFollowUpAnswer(treatment: Record<string, unknown>, text?: string | null) {
  const normalized = normalize(text ?? "");
  const title = compactText(treatment.title, 140) ?? "Tratamiento";
  const answers: string[] = [];
  const durationQuestion = /\b(duracion|dura|tiempo)\b/.test(normalized);
  if (/\b(precio|costo|cuesta|vale)\b/.test(normalized) || (!durationQuestion && /\b(cuanto)\b/.test(normalized))) answers.push(formatTreatmentPriceLine(treatment));
  if (durationQuestion) answers.push(`Duración: ${textValue(treatment.duration) ?? "se confirma durante la valoración o con administración."}`);
  if (/\b(cupos?|disponibilidad)\b/.test(normalized)) answers.push(formatTreatmentSlotsLine(treatment) ?? "Los cupos dependen de la agenda disponible.");
  if (/\b(cuidados?)\b/.test(normalized)) answers.push(`Cuidados: ${textValue(treatment.care_instructions) ?? "los cuidados específicos se indican según la valoración profesional."}`);
  if (/\b(beneficios?)\b/.test(normalized)) answers.push(`Beneficios: ${textValue(treatment.benefits) ?? "la información se confirma en la valoración profesional."}`);
  if (/\b(resultados?)\b/.test(normalized)) answers.push(`Resultados esperados: ${textValue(treatment.expected_results) ?? "se explican en la valoración."} Los resultados pueden variar según cada persona.`);
  if (/\b(doctora|doctor|quien)\b/.test(normalized)) answers.push(`Te atiende ${treatmentDoctorName(treatment) ?? "una profesional según disponibilidad de agenda"}.`);
  if (/\b(ciudad|sede)\b/.test(normalized)) answers.push(`Ciudad: ${textValue(treatment.city) ?? "se confirma según disponibilidad."}`);
  if (!answers.length && /\b(para que|sirve|consiste|como es|que es|informacion|info|detalles|cuentame)\b/.test(normalized)) {
    answers.push(textValue(treatment.public_info) ?? textValue(treatment.description) ?? textValue(treatment.short_description) ?? "Aún no tenemos una descripción publicada. El equipo puede explicarte en qué consiste.");
  }
  return answers.length ? `${title}\n\n${answers.join("\n\n")}` : formatTreatmentOverview(treatment);
}

export function isBookingRequest(text: string) {
  const value = normalize(text);
  if (/\b(no quiero|no deseo|no necesito|no voy a|sin|cancelar)\b.{0,25}\b(reservar|agendar|cita|reserva)\b/.test(value)) return false;
  return /\b(reserv(?:ar|a|o)|agend(?:ar|a|o)|(?:sacar|quiero|quisiera|necesito|tomar)\s+(?:una\s+)?cita)\b/.test(value);
}

export function matchInformationalTreatments(treatments: Array<Record<string, unknown>>, text: string) {
  const normalized = normalize(text);
  const terms = meaningfulTokens(text);
  if (!terms.length) return [];
  const exact = treatments.filter((item) => {
    const title = normalize(String(item.title ?? ""));
    return title && (` ${normalized} `.includes(` ${title} `) || title === terms.join(" "));
  });
  if (exact.length) return exact;
  // A specific name such as rinomodelación needs only one title match.
  // Prefixes such as rino may return several choices; never silently pick one.
  const ranked = treatments.map((item) => {
    const titleTokens = normalize(String(item.title ?? "")).split(" ");
    const matchesTitle = terms.some((term) => term.length >= 4 && titleTokens.some((token) => looksLikeTreatmentTokenMatch(term, token)));
    return { item, score: matchesTitle ? treatmentTextScore(item, text) : 0 };
  }).filter(({ score }) => score >= 4).sort((a, b) => b.score - a.score);
  if (!ranked.length) return [];
  return ranked.filter(({ score }) => score === ranked[0].score).map(({ item }) => item);
}

export function splitWhatsAppText(text: string, limit = 4096) {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const excerpt = remaining.slice(0, limit + 1);
    let boundary = excerpt.lastIndexOf("\n\n");
    if (boundary < limit / 2) boundary = excerpt.lastIndexOf("\n");
    if (boundary < limit / 2) boundary = excerpt.lastIndexOf(" ");
    if (boundary <= 0) throw new Error("El mensaje contiene un bloque demasiado largo para WhatsApp.");
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
