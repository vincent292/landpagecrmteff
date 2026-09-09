import assert from "node:assert/strict";
import { createAdminClient, generateGeminiReply, isHumanRequest, type IncomingWhatsAppMessage } from "../supabase/functions/_shared/whatsapp-crm.ts";
import { handleBookingConversation, handleTreatmentCatalogConversation } from "../supabase/functions/_shared/whatsapp-booking.ts";

type Row = Record<string, unknown>;
const cleaningId = "11111111-1111-4111-8111-111111111111";
const rhinoId = "22222222-2222-4222-8222-222222222222";
const cleaning = { id: cleaningId, title: "LIMPIEZA FACIAL PROFUNDA PREMIUM", city: "Cochabamba", duration: "90 minutos", treatment_price: 1, is_active: true, deleted_at: null, allows_direct_booking: true, requires_assessment: false };
const rhino = { ...cleaning, id: rhinoId, title: "RINOMODELACIÓN", treatment_price: 800 };

async function withTransport(run: (fixture: {
  db: Record<string, Row[]>;
  sent: Row[];
  requests: Row[];
  gemini: Row[];
  admin: ReturnType<typeof createAdminClient>;
  incoming: (text: string, interactiveId?: string) => IncomingWhatsAppMessage;
  persisted: () => Parameters<typeof handleTreatmentCatalogConversation>[1];
}) => Promise<void>) {
  const env = { SUPABASE_URL: "https://database.example.test", SUPABASE_SERVICE_ROLE_KEY: "fixture-key", WHATSAPP_ACCESS_TOKEN: "fixture-token", WHATSAPP_PHONE_NUMBER_ID: "fixture-phone", GEMINI_API_KEY: "fixture-key", GEMINI_MODEL: "gemini-3.7-flash", PUBLIC_SITE_URL: "https://www.draballesteros.com" };
  const saved = Object.keys(env).map((key) => [key, Deno.env.get(key)] as const);
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const originalFetch = globalThis.fetch;
  const sent: Row[] = [];
  const requests: Row[] = [];
  const gemini: Row[] = [];
  const db: Record<string, Row[]> = {
    treatments: [structuredClone(cleaning), structuredClone(rhino)],
    crm_conversations: [{ id: "conversation", intent: null, ai_enabled: true, needs_human: false }],
    crm_contacts: [{ id: "contact", city: null, full_name: null, wa_id: "59100000000", phone: "59100000000" }],
    crm_booking_sessions: [], crm_messages: [], crm_contact_city_interests: [], doctor_profiles: [],
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (url.hostname === "graph.facebook.com") {
      sent.push(body);
      return Response.json({ messages: [{ id: `sent-${sent.length}` }] });
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      requests.push(body);
      const response = gemini.shift();
      assert.ok(response, "unexpected Gemini request");
      return Response.json(response);
    }
    assert.equal(url.hostname, "database.example.test", "no real external services may be contacted");
    if (url.pathname.includes("/rpc/")) return Response.json(null);
    const table = url.pathname.split("/").at(-1)!;
    const rows = db[table] ??= [];
    const matched = rows.filter((row) => [...url.searchParams].every(([key, value]) => {
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (value === "is.null") return row[key] == null;
      if (value.startsWith("in.(")) return value.slice(4, -1).split(",").includes(String(row[key]));
      return true;
    }));
    if (init?.method === "POST") rows.push({ id: `row-${rows.length}`, ...body });
    if (init?.method === "PATCH") matched.forEach((row) => Object.assign(row, body));
    const single = new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object+json");
    return Response.json(single ? matched[0] ?? null : matched);
  };
  try {
    await run({ db, sent, requests, gemini, admin: createAdminClient(),
      incoming: (text, interactiveId) => ({ id: "incoming", from: "59100000000", type: "text", text, interactiveId }) as IncomingWhatsAppMessage,
      persisted: () => ({ contact: db.crm_contacts[0], conversation: db.crm_conversations[0] }) as Parameters<typeof handleTreatmentCatalogConversation>[1],
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of saved) { if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); }
  }
}

const textSent = (sent: Row[]) => sent.map((row) => String((row.text as Row | undefined)?.body ?? ((row.interactive as Row | undefined)?.body as Row | undefined)?.text ?? ""));

Deno.test("a booking question enters the WhatsApp city flow, including after human handoff", async () => {
  await withTransport(async ({ admin, db, sent, incoming, persisted }) => {
    db.crm_conversations[0].needs_human = true;
    const message = incoming("Como puedo agendar cita");
    assert.equal(await handleTreatmentCatalogConversation(admin, persisted(), message), false);
    assert.equal(await handleBookingConversation(admin, persisted(), message), true);
    assert.match(textSent(sent)[0], /reservar por aquí.*ciudad/);
    assert.equal(db.crm_conversations[0].intent, "select_treatment_city");
    assert.equal(db.crm_conversations[0].needs_human, false);
  });
});

Deno.test("catalog uses remembered city and a price question can change the previous treatment", async () => {
  await withTransport(async ({ admin, db, sent, incoming, persisted }) => {
    db.crm_contacts[0].city = "Cochabamba";
    await handleTreatmentCatalogConversation(admin, persisted(), incoming("Que tratamientos hay?"));
    assert.match(textSent(sent)[0], /Elige un tratamiento/);
    await handleTreatmentCatalogConversation(admin, persisted(), incoming("LIMPIEZA FACIAL PROFUNDA", `treatment-info:${cleaningId}`));
    assert.equal(db.crm_conversations[0].intent, `treatment_info:${cleaningId}`);
    await handleTreatmentCatalogConversation(admin, persisted(), incoming("Y precio de rinomodelación"));
    assert.equal(textSent(sent).at(-1), "RINOMODELACIÓN\n\nPrecio: 800.00 Bs.");
    assert.equal(db.crm_conversations[0].intent, `treatment_info:${rhinoId}`);
    assert.equal(db.crm_booking_sessions.length, 0);
    await handleTreatmentCatalogConversation(admin, persisted(), incoming("Quiero reservar una. Cita"));
    assert.equal(db.crm_booking_sessions[0].treatment_id, rhinoId);
    assert.match(textSent(sent).at(-1)!, /nombre y apellido/);
  });
});

Deno.test("care instructions longer than an interactive body are delivered intact and stored identically", async () => {
  await withTransport(async ({ admin, db, sent, incoming, persisted }) => {
    const care = "Cuidados completos publicados en el sistema. ".repeat(120) + "Consulta al equipo si tienes dudas.";
    db.treatments[0].care_instructions = care;
    db.crm_conversations[0].intent = `treatment_info:${cleaningId}`;
    await handleTreatmentCatalogConversation(admin, persisted(), incoming("Qué cuidados necesito?"));
    const bodies = textSent(sent);
    assert.deepEqual(db.crm_messages.map((row) => row.body), bodies);
    assert.ok(bodies.slice(0, -1).join(" ").replace(/\s+/g, " ").includes(care.replace(/\s+/g, " ")));
    assert.ok(bodies.every((body) => body.length <= 4096));
    assert.equal(bodies.at(-1), "¿Cómo deseas continuar?");
  });
});

Deno.test("a request for an adviser escapes pending catalog and booking menus", async () => {
  await withTransport(async ({ admin, db, sent, incoming, persisted }) => {
    db.crm_conversations[0].intent = "catalog_city";
    assert.equal(await handleTreatmentCatalogConversation(admin, persisted(), incoming("Quiero hablar con una asesora")), false);
    assert.equal(await handleBookingConversation(admin, persisted(), incoming("Quiero hablar con una asesora")), false);
    assert.equal(sent.length, 0);
  });
});

Deno.test("booking for another person does not request a human adviser", () => {
  assert.equal(isHumanRequest("La cita es para otra persona"), false);
  assert.equal(isHumanRequest("Para esta persona"), false);
  assert.equal(isHumanRequest("Quiero hablar con una persona"), true);
  assert.equal(isHumanRequest("Quiero una persona"), true);
});

Deno.test("a named treatment in a catalog question still gets its own information", async () => {
  await withTransport(async ({ admin, db, sent, incoming, persisted }) => {
    db.crm_contacts[0].city = "Cochabamba";
    await handleTreatmentCatalogConversation(admin, persisted(), incoming("Quiero saber del tratamiento rinomodelación"));
    assert.match(textSent(sent)[0], /RINOMODELACIÓN/);
    assert.equal(db.crm_conversations[0].intent, `treatment_info:${rhinoId}`);
  });
});

Deno.test("Gemini retries incomplete output and excludes old leaked instructions from history", async () => {
  await withTransport(async ({ requests, gemini }) => {
    gemini.push(
      { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "Agenda en https://www.dr" }] } }] },
      { candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "Drafting the response" }, { text: "¿Te refieres a rinomodelación o rinoplastia?" }] } }] },
    );
    const reply = await generateGeminiReply({ messages: [
      { direction: "outbound", sender_type: "ai", body: "style constraints: WhatsApp style" },
      { direction: "inbound", sender_type: "contact", body: "información de la rino" },
    ], knowledgeSources: [], bookingUrl: "/reservar-cita" });
    assert.equal(reply, "¿Te refieres a rinomodelación o rinoplastia?");
    assert.equal(requests.length, 2);
    assert.doesNotMatch(JSON.stringify(requests[0].contents), /style constraints/);
  });
});

Deno.test("Gemini never returns an invalid second attempt for delivery", async () => {
  await withTransport(async ({ requests, gemini }) => {
    gemini.push(...[1, 2].map(() => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "style constraints: No Markdown" }] } }] })));
    await assert.rejects(() => generateGeminiReply({ messages: [], knowledgeSources: [], bookingUrl: "/reservar-cita" }), /instrucciones internas/);
    assert.equal(requests.length, 2);
  });
});
