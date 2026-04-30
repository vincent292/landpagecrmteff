import { supabase } from "../lib/supabaseClient";

export type AvailabilityRuleRow = {
  id: string;
  created_by: string | null;
  city: string;
  location: string | null;
  appointment_type: string;
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

export type AvailabilityBlockRow = {
  id: string;
  created_by: string | null;
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
  date: string;
  start_time: string;
  end_time: string;
  city: string;
  location: string | null;
  appointment_type: string;
  available_capacity: number;
  total_capacity: number;
};

export type SlotFilters = {
  city?: string;
  appointment_type?: string;
  date_from: string;
  date_to: string;
};

export async function getAvailabilityRules() {
  const { data, error } = await supabase
    .from("doctor_availability_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AvailabilityRuleRow[];
}

export async function getAvailabilityRuleById(id: string) {
  const { data, error } = await supabase
    .from("doctor_availability_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as AvailabilityRuleRow | null;
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

export async function getAvailabilityBlocks() {
  const { data, error } = await supabase
    .from("availability_blocks")
    .select("*")
    .order("block_date", { ascending: true });
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
  const { data, error } = await supabase.rpc("get_available_slots", {
    p_city: filters.city ?? null,
    p_appointment_type: filters.appointment_type ?? null,
    p_date_from: filters.date_from,
    p_date_to: filters.date_to,
  });

  if (error) throw error;
  return (data ?? []) as AvailableSlot[];
}
