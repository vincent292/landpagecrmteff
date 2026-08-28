import { supabase } from "../lib/supabaseClient";

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

async function authorizedPost(path: string, body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");

  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "La operación no pudo completarse.");
  return payload;
}

export async function sendCrmMessage(input: {
  conversationId: string;
  body?: string;
  imageUrl?: string;
  templateName?: string;
}) {
  return authorizedPost("/api/whatsapp/send", input);
}

export async function syncCrmKnowledge() {
  return authorizedPost("/api/crm/knowledge-sync", {});
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

export function subscribeToCrm(conversationId: string | null, onChange: () => void) {
  const channel = supabase
    .channel(`crm-inbox-${conversationId || "all"}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_conversations" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "crm_messages", ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}) },
      onChange
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "appointment_reservations" }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
