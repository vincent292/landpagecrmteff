import { supabase } from "../lib/supabaseClient";
import type { AvailabilityCareMode, ReservationCareMode } from "../lib/careMode";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";

export type AvailabilityRuleRow = DeletionMetadata & {
  id: string;
  created_by: string | null;
  doctor_id?: string | null;
  doctor_profiles?: {
    id: string;
    full_name: string;
    whatsapp: string | null;
    email: string | null;
  } | null;
  agenda_tag?: string | null;
  city: string;
  location: string | null;
  appointment_type: string;
  care_mode: AvailabilityCareMode;
  availability_type: "recurring" | "specific";
  start_date: string | null;
  end_date: string | null;
  specific_date: string | null;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  break_minutes: number;
  capacity_per_slot: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AvailabilityBlockRow = DeletionMetadata & {
  id: string;
  created_by: string | null;
  doctor_id?: string | null;
  doctor_profiles?: {
    id: string;
    full_name: string;
    whatsapp: string | null;
    email: string | null;
  } | null;
  city: string | null;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  is_active: boolean;
  created_at: string;
};

export type AvailableSlot = {
  rule_id: string;
  doctor_id?: string | null;
  agenda_tag?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  city: string;
  location: string | null;
  appointment_type: string;
  care_mode: AvailabilityCareMode;
  available_capacity: number;
  total_capacity: number;
};

export type SlotFilters = {
  city?: string;
  appointment_type?: string;
  care_mode?: ReservationCareMode | null;
  doctor_id?: string | null;
  agenda_tag?: string | null;
  date_from: string;
  date_to: string;
};

export async function getAvailabilityRules(includeDeleted = false, doctorId?: string | null) {
  let query = supabase
    .from("doctor_availability_rules")
    .select("*, doctor_profiles(id, full_name, whatsapp, email)")
    .order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("doctor_availability_rules", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  if (doctorId) query = query.eq("doctor_id", doctorId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AvailabilityRuleRow[];
}

export async function getAvailabilityRuleById(id: string) {
  const { data, error } = await supabase
    .from("doctor_availability_rules")
    .select("*, doctor_profiles(id, full_name, whatsapp, email)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as AvailabilityRuleRow | null;
}

export async function getAvailabilityRulesByIds(ids: string[]) {
  if (ids.length === 0) return [] as AvailabilityRuleRow[];

  const uniqueIds = [...new Set(ids)];
  const { data, error } = await supabase
    .from("doctor_availability_rules")
    .select("*, doctor_profiles(id, full_name, whatsapp, email)")
    .in("id", uniqueIds);
  if (error) throw error;
  return (data ?? []) as AvailabilityRuleRow[];
}

export async function createAvailabilityRule(data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("doctor_availability_rules")
    .insert(data)
    .select("*")
    .single();
  if (error) throw error;
  return row as AvailabilityRuleRow;
}

export async function updateAvailabilityRule(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("doctor_availability_rules")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return row as AvailabilityRuleRow;
}

export async function deleteAvailabilityRule(id: string) {
  const { error } = await supabase.from("doctor_availability_rules").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

export async function getAvailabilityBlocks(includeDeleted = false, doctorId?: string | null) {
  let query = supabase
    .from("availability_blocks")
    .select("*, doctor_profiles(id, full_name, whatsapp, email)")
    .order("block_date", { ascending: true });
  const filter = getVisibleDeletionFilter("availability_blocks", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  if (doctorId) query = query.eq("doctor_id", doctorId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AvailabilityBlockRow[];
}

export async function createAvailabilityBlock(data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("availability_blocks")
    .insert(data)
    .select("*")
    .single();
  if (error) throw error;
  return row as AvailabilityBlockRow;
}

export async function updateAvailabilityBlock(id: string, data: Record<string, unknown>) {
  const { data: row, error } = await supabase
    .from("availability_blocks")
    .update(data)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return row as AvailabilityBlockRow;
}

export async function deleteAvailabilityBlock(id: string) {
  const { error } = await supabase.from("availability_blocks").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

export async function getAvailableSlots(filters: SlotFilters) {
  const baseArgs = {
    p_city: filters.city ?? null,
    p_appointment_type: filters.appointment_type ?? null,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
    p_doctor_id: filters.doctor_id ?? null,
    p_agenda_tag: filters.agenda_tag ?? null,
  };

  const { data, error } = await supabase.rpc("get_available_slots", {
    ...baseArgs,
    p_care_mode: filters.care_mode ?? null,
  });

  if (error) {
    if (!canRetryLegacyGetAvailableSlots(error)) throw error;

    const legacyResponse = await supabase.rpc("get_available_slots", baseArgs);
    if (legacyResponse.error) throw legacyResponse.error;

    return normalizeAvailableSlots(legacyResponse.data, filters.care_mode ?? null);
  }

  return normalizeAvailableSlots(data, filters.care_mode ?? null);
}

function canRetryLegacyGetAvailableSlots(error: { code?: string; message?: string | null }) {
  if (error.code === "PGRST202") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("get_available_slots") && message.includes("could not find");
}

function normalizeAvailableSlots(data: unknown, fallbackCareMode?: ReservationCareMode | null) {
  return ((data ?? []) as Partial<AvailableSlot>[]).map((slot) => ({
    rule_id: String(slot.rule_id ?? ""),
    doctor_id: slot.doctor_id ?? null,
    agenda_tag: slot.agenda_tag ?? null,
    date: String(slot.date ?? ""),
    start_time: String(slot.start_time ?? ""),
    end_time: String(slot.end_time ?? ""),
    city: String(slot.city ?? ""),
    location: slot.location ?? null,
    appointment_type: String(slot.appointment_type ?? ""),
    care_mode: slot.care_mode ?? fallbackCareMode ?? "presencial",
    available_capacity: Number(slot.available_capacity ?? 0),
    total_capacity: Number(slot.total_capacity ?? 0),
  }));
}
