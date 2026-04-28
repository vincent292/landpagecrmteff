import { supabase } from "../lib/supabaseClient";

export type CalendarEventRow = {
  id: string;
  title: string;
  slug: string;
  city: string | null;
  event_type: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  cover_image: string | null;
  available_slots: number | null;
  is_active: boolean | null;
  created_at: string;
};

export async function getCalendarEvents() {
  const { data, error } = await supabase.from("calendar_events").select("*").eq("is_active", true).order("event_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CalendarEventRow[];
}

export async function getCalendarEventBySlug(slug: string) {
  const { data, error } = await supabase.from("calendar_events").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as CalendarEventRow | null;
}

export async function getAdminCalendarEvents() {
  const { data, error } = await supabase.from("calendar_events").select("*").order("event_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CalendarEventRow[];
}

export async function createCalendarEvent(data: Record<string, unknown>) {
  const { error } = await supabase.from("calendar_events").insert(data);
  if (error) throw error;
}

export async function updateCalendarEvent(id: string, data: Record<string, unknown>) {
  const { error } = await supabase.from("calendar_events").update(data).eq("id", id);
  if (error) throw error;
}

export async function deleteCalendarEvent(id: string) {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw error;
}
