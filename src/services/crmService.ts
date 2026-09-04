import { supabase } from "../lib/supabaseClient";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type CrmLeadStage = "nuevo" | "calificado" | "cita" | "pago" | "paciente" | "cerrado";
export type CrmConversationStatus = "abierta" | "pendiente" | "cerrada";

export type CrmContact = {
  id: string;
  wa_id: string;
  full_name: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  lead_stage: CrmLeadStage;
  labels: string[];
  notes: string | null;
  patient_id: string | null;
};

export type CrmReservation = {
  id: string;
  appointment_date: string;
  start_time: string;
  appointment_type: string;
  status: string;
  payment_amount: number | null;
  payment_receipt_path: string | null;
  public_payment_token: string | null;
  patients?: { full_name: string | null } | null;
};

export type CrmConversation = {
  id: string;
  status: CrmConversationStatus;
  priority: "baja" | "normal" | "alta" | "urgente";
  intent: string | null;
  ai_enabled: boolean;
  needs_human: boolean;
  unread_count: number;
  customer_service_window_expires_at: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  appointment_reservation_id: string | null;
  crm_contacts: CrmContact;
  appointment_reservations?: CrmReservation | null;
};

export type CrmMessage = {
  id: string;
  direction: "inbound" | "outbound";
  sender_type: "contact" | "agent" | "ai" | "system";
  message_type: string;
  body: string | null;
  media_id: string | null;
  media_filename: string | null;
  status: string;
  error_detail: string | null;
  occurred_at: string;
};

export type CrmBookingSession = {
  id: string;
  status: "collecting_identity" | "choosing_date" | "choosing_time" | "awaiting_payment" | "payment_review" | "approved" | "rejected" | "expired" | "cancelled" | "needs_human";
  full_name: string | null;
  document_number: string | null;
  email: string | null;
  city: string | null;
  appointment_date: string | null;
  start_time: string | null;
  end_time: string | null;
  amount_due: number | null;
  hold_expires_at: string | null;
  payment_receipt_path: string | null;
  payment_submitted_at: string | null;
  treatment_order_id: string | null;
  appointment_reservation_id: string | null;
  treatments?: { title: string | null } | null;
  treatment_orders?: { status: string | null } | null;
};

export type CrmSettings = {
  ai_enabled: boolean;
  ai_system_prompt: string | null;
  welcome_message: string | null;
  booking_url: string;
  patient_confirmation_template: string | null;
  doctor_booking_template: string | null;
  doctor_booking_template_document_header: boolean;
  payment_rejected_template: string | null;
  template_language: string;
  booking_hold_minutes: number;
  allow_external_grounding: boolean;
  site_url: string;
  admin_notification_whatsapps: string[];
  admin_receipt_review_template: string | null;
  patient_reschedule_template: string | null;
  admin_doctor_unavailable_template: string | null;
};

export type MetaCtwaAd = {
  id: string;
  source_id: string;
  source_type: string | null;
  source_url: string | null;
  headline: string | null;
  body: string | null;
  media_type: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  ctwa_clid: string | null;
  treatment_id: string | null;
  promotion_id: string | null;
  welcome_message: string | null;
  status: "pending" | "configured";
  first_seen_at: string;
  last_seen_at: string;
  conversation_count: number;
  treatments?: { id: string; title: string } | null;
  promotions?: { id: string; title: string } | null;
};

export type MetaCtwaTarget = { id: string; title: string; kind: "treatment" | "promotion" };

export type CrmBotLearningEvent = {
  id: string;
  event_type: string;
  detected_intent: string | null;
  user_text: string | null;
  bot_response: string | null;
  status: "pending" | "reviewed" | "ignored" | "applied";
  created_at: string;
  crm_contacts?: { full_name: string | null; phone: string | null } | null;
};

export async function getCrmConversations() {
  const { data, error } = await supabase
    .from("crm_conversations")
    .select("*, crm_contacts(*), appointment_reservations(id,appointment_date,start_time,appointment_type,status,payment_amount,payment_receipt_path,public_payment_token,patients(full_name))")
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as CrmConversation[];
}

export async function getCrmMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("crm_messages")
    .select("id,direction,sender_type,message_type,body,media_id,media_filename,status,error_detail,occurred_at")
    .eq("conversation_id", conversationId)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CrmMessage[];
}

export async function getCrmBookingSession(conversationId: string) {
  const { data, error } = await supabase
    .from("crm_booking_sessions")
    .select("id,status,full_name,document_number,email,city,appointment_date,start_time,end_time,amount_due,hold_expires_at,payment_receipt_path,payment_submitted_at,treatment_order_id,appointment_reservation_id,treatments(title),treatment_orders(status)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CrmBookingSession | null;
}

export async function getCrmSettings() {
  const { data, error } = await supabase
    .from("crm_settings")
    .select("ai_enabled,ai_system_prompt,welcome_message,booking_url,patient_confirmation_template,doctor_booking_template,doctor_booking_template_document_header,payment_rejected_template,template_language,booking_hold_minutes,allow_external_grounding,site_url,admin_notification_whatsapps,admin_receipt_review_template,patient_reschedule_template,admin_doctor_unavailable_template")
    .eq("id", true)
    .single();
  if (error) throw error;
  return data as CrmSettings;
}

export async function getMetaCtwaAds() {
  const { data, error } = await supabase
    .from("meta_ctwa_ads")
    .select("id,source_id,source_type,source_url,headline,body,media_type,image_url,video_url,thumbnail_url,ctwa_clid,treatment_id,promotion_id,welcome_message,status,first_seen_at,last_seen_at,conversation_count,treatments(id,title),promotions(id,title)")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MetaCtwaAd[];
}

export async function getMetaCtwaTargets() {
  const [treatmentsResult, promotionsResult] = await Promise.all([
    supabase.from("treatments").select("id,title").eq("is_active", true).is("deleted_at", null).order("title"),
    supabase.from("promotions").select("id,title").eq("is_active", true).is("deleted_at", null).order("title"),
  ]);
  if (treatmentsResult.error) throw treatmentsResult.error;
  if (promotionsResult.error) throw promotionsResult.error;
  const visible = (row: { title: string | null }) => !/\b(prueba|test|interna)\b/i.test(row.title ?? "");
  return [
    ...(treatmentsResult.data ?? []).filter(visible).map((row) => ({ id: row.id, title: row.title, kind: "treatment" as const })),
    ...(promotionsResult.data ?? []).filter(visible).map((row) => ({ id: row.id, title: row.title, kind: "promotion" as const })),
  ] as MetaCtwaTarget[];
}

export async function getCrmBotLearningEvents() {
  const { data, error } = await supabase
    .from("crm_bot_learning_events")
    .select("id,event_type,detected_intent,user_text,bot_response,status,created_at,crm_contacts(full_name,phone)")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    if (error.code === "42P01" || error.message.includes("crm_bot_learning_events")) return [];
    throw error;
  }
  return (data ?? []) as unknown as CrmBotLearningEvent[];
}

export async function updateMetaCtwaAd(id: string, values: Partial<Pick<MetaCtwaAd, "treatment_id" | "promotion_id" | "welcome_message">>) {
  const { data, error } = await supabase.from("meta_ctwa_ads").update(values).eq("id", id).select().single();
  if (error) throw error;
  return data as MetaCtwaAd;
}

export async function updateCrmSettings(values: Partial<CrmSettings>) {
  const { data, error } = await supabase.from("crm_settings").update(values).eq("id", true).select("ai_enabled,ai_system_prompt,welcome_message,booking_url,patient_confirmation_template,doctor_booking_template,doctor_booking_template_document_header,payment_rejected_template,template_language,booking_hold_minutes,allow_external_grounding,site_url,admin_notification_whatsapps,admin_receipt_review_template,patient_reschedule_template,admin_doctor_unavailable_template").single();
  if (error) throw error;
  return data as CrmSettings;
}

export async function markCrmConversationRead(conversationId: string) {
  const { error } = await supabase.from("crm_conversations").update({ unread_count: 0 }).eq("id", conversationId);
  if (error) throw error;
}

export async function updateCrmConversation(conversationId: string, values: Partial<Pick<CrmConversation, "status" | "priority" | "ai_enabled" | "needs_human" | "appointment_reservation_id">>) {
  const { error } = await supabase.from("crm_conversations").update(values).eq("id", conversationId);
  if (error) throw error;
}

export async function updateCrmContact(contactId: string, values: Partial<Pick<CrmContact, "full_name" | "email" | "city" | "lead_stage" | "notes" | "labels">>) {
  const { error } = await supabase.from("crm_contacts").update(values).eq("id", contactId);
  if (error) throw error;
}

async function invokeCrmFunction(name: string, body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");

  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const payload = await readFunctionErrorPayload(error);
    throw new Error(payload?.error || error.message || "La operación no pudo completarse.");
  }
  return data as Record<string, unknown>;
}

async function readFunctionErrorPayload(error: unknown) {
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  if (!context) return null;
  if (context instanceof Response) {
    return await context.clone().json().catch(() => null) as { error?: string } | null;
  }
  if (typeof context === "object" && "json" in context && typeof context.json === "function") {
    return await (context.json as () => Promise<unknown>)().catch(() => null) as { error?: string } | null;
  }
  if (typeof context === "object" && "error" in context && typeof (context as { error?: unknown }).error === "string") {
    return { error: (context as { error: string }).error };
  }
  return null;
}

export async function sendCrmMessage(input: {
  conversationId: string;
  body?: string;
  imageUrl?: string;
  templateName?: string;
  languageCode?: string;
}) {
  return invokeCrmFunction("whatsapp-send", input);
}

export async function syncCrmKnowledge() {
  return invokeCrmFunction("crm-knowledge-sync", {});
}

export async function dispatchCrmNotifications() {
  return invokeCrmFunction("crm-notification-dispatch", {});
}

export async function getCrmReservationOptions() {
  const { data, error } = await supabase
    .from("appointment_reservations")
    .select("id,appointment_date,start_time,appointment_type,status,payment_amount,payment_receipt_path,public_payment_token,patients(full_name)")
    .eq("is_deleted", false)
    .order("appointment_date", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data ?? []) as unknown as CrmReservation[];
}

type CrmRealtimeHandlers = {
  onConversationChange?: (payload: RealtimePostgresChangesPayload<CrmConversation>) => void;
  onMessageChange?: (payload: RealtimePostgresChangesPayload<CrmMessage>) => void;
  onBookingChange?: () => void;
  onLearningChange?: () => void;
};

export function subscribeToCrm(conversationId: string | null, handlers: CrmRealtimeHandlers | (() => void)) {
  const normalizedHandlers = typeof handlers === "function"
    ? {
      onConversationChange: handlers,
      onMessageChange: handlers,
      onBookingChange: handlers,
      onLearningChange: handlers,
    }
    : handlers;
  const channel = supabase
    .channel(`crm-inbox-${conversationId || "all"}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "crm_conversations" },
      (payload) => normalizedHandlers.onConversationChange?.(payload as RealtimePostgresChangesPayload<CrmConversation>)
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "crm_messages", ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}) },
      (payload) => normalizedHandlers.onMessageChange?.(payload as RealtimePostgresChangesPayload<CrmMessage>)
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointment_reservations" }, () => normalizedHandlers.onBookingChange?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_booking_sessions" }, () => normalizedHandlers.onBookingChange?.())
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_bot_learning_events" }, () => normalizedHandlers.onLearningChange?.())
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
