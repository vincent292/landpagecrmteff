import { supabase } from "../lib/supabaseClient";

export type EnrollmentRow = {
  id: string;
  course_id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  profession: string | null;
  status: string;
  payment_receipt_url: string | null;
  created_at: string;
  courses?: { title: string } | null;
};

export async function enrollToCourse(data: Omit<EnrollmentRow, "id" | "status" | "payment_receipt_url" | "created_at" | "courses">) {
  const { error } = await supabase.from("course_enrollments").insert({
    ...data,
    status: "Pendiente",
  });
  if (error) throw error;
}

export async function getCourseEnrollments() {
  const { data, error } = await supabase.from("course_enrollments").select("*, courses(title)").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EnrollmentRow[];
}

export async function getEnrollmentsByCourse(courseId: string) {
  const { data, error } = await supabase.from("course_enrollments").select("*, courses(title)").eq("course_id", courseId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EnrollmentRow[];
}

export async function updateEnrollmentStatus(id: string, status: string) {
  const { error } = await supabase.from("course_enrollments").update({ status }).eq("id", id);
  if (error) throw error;
}
