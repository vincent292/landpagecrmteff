import { supabase } from "../lib/supabaseClient";

export type CourseRow = {
  id: string;
  title: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  cover_image: string | null;
  city: string | null;
  start_date: string | null;
  start_time: string | null;
  modality: string | null;
  price: number | null;
  available_slots: number | null;
  syllabus: string | null;
  requirements: string | null;
  certification: string | null;
  is_active: boolean | null;
  created_at: string;
};

export async function getCourses() {
  const { data, error } = await supabase.from("courses").select("*").eq("is_active", true).order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as CourseRow[];
}

export async function getCourseBySlug(slug: string) {
  const { data, error } = await supabase.from("courses").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as CourseRow | null;
}

export async function getAdminCourses() {
  const { data, error } = await supabase.from("courses").select("*, course_enrollments(id)").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as (CourseRow & { course_enrollments?: { id: string }[] })[];
}

export async function createCourse(data: Record<string, unknown>) {
  const { error } = await supabase.from("courses").insert(data);
  if (error) throw error;
}

export async function updateCourse(id: string, data: Record<string, unknown>) {
  const { error } = await supabase.from("courses").update(data).eq("id", id);
  if (error) throw error;
}

export async function deleteCourse(id: string) {
  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) throw error;
}
