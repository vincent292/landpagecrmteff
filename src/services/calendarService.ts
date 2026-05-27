import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { resolvePublicMediaFields } from "./publicMediaResolver";

export type CalendarEventRow = DeletionMetadata & {
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
  doctor_id: string | null;
  doctor_profiles?: {
    full_name: string;
    specialty: string | null;
    photo_url: string | null;
  } | null;
  created_at: string;
};

function resolveCalendarEvent(row: CalendarEventRow) {
  return {
    ...resolvePublicMediaFields(row, ["cover_image"]),
    doctor_profiles: row.doctor_profiles
      ? resolvePublicMediaFields(row.doctor_profiles, ["photo_url"])
      : null,
  } satisfies CalendarEventRow;
}

export async function getCalendarEvents() {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*, doctor_profiles(full_name, specialty, photo_url)")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("event_date", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as CalendarEventRow[]).map(resolveCalendarEvent);
}

export async function getCalendarEventBySlug(slug: string) {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*, doctor_profiles(full_name, specialty, photo_url)")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? resolveCalendarEvent(data as CalendarEventRow) : null;
}

export async function getAdminCalendarEvents(includeDeleted = false, doctorId?: string | null) {
  let query = supabase
    .from("calendar_events")
    .select("*, doctor_profiles(full_name, specialty, photo_url)")
    .order("event_date", { ascending: false });
  const filter = getVisibleDeletionFilter("calendar_events", includeDeleted);
  if (filter.column) query = query.is(filter.column, filter.value);
  if (doctorId) query = query.eq("doctor_id", doctorId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as CalendarEventRow[]).map(resolveCalendarEvent);
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
  const { error } = await supabase.from("calendar_events").update({ is_active: false, active: false }).eq("id", id);
  if (error) throw error;
}
