import { supabase } from "../lib/supabaseClient";

export type InformationRequestRow = {
  id: string;
  full_name: string;
  phone: string;
  city: string | null;
  interest_type: string | null;
  interest_id: string | null;
  interest_title: string | null;
  contact_preference: string | null;
  message: string | null;
  status: string;
  internal_notes: string | null;
  created_at: string;
};

export async function createInformationRequest(data: Omit<InformationRequestRow, "id" | "status" | "internal_notes" | "created_at"> & { privacy_accepted?: boolean }) {
  const { privacy_accepted: _privacyAccepted, ...payload } = data;
  const { error } = await supabase.from("information_requests").insert({
    ...payload,
    whatsapp: payload.phone,
    interest: payload.interest_title ?? payload.interest_type ?? "General",
    privacy_accepted: _privacyAccepted ?? true,
    status: "Nuevo",
  });
  if (error) throw error;
}

export async function getInformationRequests() {
  const { data, error } = await supabase.from("information_requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InformationRequestRow[];
}

export async function updateInformationRequestStatus(id: string, status: string) {
  const { error } = await supabase.from("information_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function updateInformationRequestNotes(id: string, internal_notes: string) {
  const { error } = await supabase.from("information_requests").update({ internal_notes }).eq("id", id);
  if (error) throw error;
}
