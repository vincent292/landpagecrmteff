import { supabase } from "../lib/supabaseClient";
import { getSignedUrl, uploadPrivateFile } from "./storageService";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";

const receiptsBucket = "payment-receipts-private";

export type EnrollmentRow = DeletionMetadata & {
  id: string;
  course_id: string;
  user_id: string;
  full_name: string | null;
  document_number?: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  profession: string | null;
  status: string;
  payment_receipt_url: string | null;
  payment_receipt_path?: string | null;
  payment_submitted_at?: string | null;
  payment_verified_at?: string | null;
  payment_amount?: number | null;
  payment_method?: string | null;
  cash_movement_id?: string | null;
  cash_recorded_at?: string | null;
  admin_notes?: string | null;
  created_at: string;
  courses?: {
    title: string;
    slug?: string | null;
    cover_image?: string | null;
    start_date?: string | null;
    start_time?: string | null;
    city?: string | null;
    modality?: string | null;
    price?: number | null;
  } | null;
};

export async function saveCourseEnrollment(data: Omit<EnrollmentRow, "id" | "status" | "payment_receipt_url" | "payment_receipt_path" | "payment_submitted_at" | "payment_verified_at" | "admin_notes" | "created_at" | "courses">) {
  const { data: existing, error: existingError } = await supabase
    .from("course_enrollments")
    .select("*")
    .eq("course_id", data.course_id)
    .eq("user_id", data.user_id)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { data: row, error } = await supabase
      .from("course_enrollments")
      .update({
        full_name: data.full_name,
        document_number: data.document_number,
        phone: data.phone,
        email: data.email,
        city: data.city,
        profession: data.profession,
      })
      .eq("id", existing.id)
      .select("*, courses(title, slug, cover_image, start_date, start_time, city, modality, price)")
      .single();
    if (error) throw error;
    return row as EnrollmentRow;
  }

  const { data: row, error } = await supabase
    .from("course_enrollments")
    .insert({
      ...data,
      status: "Pendiente",
    })
    .select("*, courses(title, slug, cover_image, start_date, start_time, city, modality, price)")
    .single();
  if (error) throw error;
  return row as EnrollmentRow;
}

export async function getCourseEnrollments(includeDeleted = false) {
  let query = supabase.from("course_enrollments").select("*, courses(title, slug, cover_image, start_date, start_time, city, modality, price)").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("course_enrollments", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as EnrollmentRow[];
}

export async function getEnrollmentsByCourse(courseId: string) {
  const { data, error } = await supabase.from("course_enrollments").select("*, courses(title, slug, cover_image, start_date, start_time, city, modality, price)").eq("course_id", courseId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EnrollmentRow[];
}

export async function getEnrollmentById(id: string) {
  const { data, error } = await supabase
    .from("course_enrollments")
    .select("*, courses(title, slug, cover_image, start_date, start_time, city, modality, price)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as EnrollmentRow | null;
}

export async function getMyCourseEnrollments(userId: string) {
  const { data, error } = await supabase
    .from("course_enrollments")
    .select("*, courses(title, slug, cover_image, start_date, start_time, city, modality, price)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EnrollmentRow[];
}

export async function getMyCourseEnrollmentForCourse(userId: string, courseId: string) {
  const { data, error } = await supabase
    .from("course_enrollments")
    .select("*, courses(title, slug, cover_image, start_date, start_time, city, modality, price)")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (error) throw error;
  return data as EnrollmentRow | null;
}

export async function uploadCourseEnrollmentPaymentReceipt(file: File, enrollmentId: string) {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `courses/${enrollmentId}/${crypto.randomUUID()}.${ext}`;
  return uploadPrivateFile(receiptsBucket, path, file);
}

export async function attachCourseEnrollmentPaymentReceipt(enrollmentId: string, payment_receipt_path: string) {
  const { error } = await supabase
    .from("course_enrollments")
    .update({
      payment_receipt_path,
      payment_receipt_url: payment_receipt_path,
      payment_submitted_at: new Date().toISOString(),
      status: "En revision",
    })
    .eq("id", enrollmentId);
  if (error) throw error;
}

export async function getCourseEnrollmentReceiptUrl(path?: string | null) {
  if (!path) return null;
  return getSignedUrl(receiptsBucket, path);
}

export async function updateEnrollmentStatus(id: string, status: string) {
  const adminNotesResult = await supabase.from("course_enrollments").select("admin_notes").eq("id", id).maybeSingle();
  if (adminNotesResult.error) throw adminNotesResult.error;
  const { data, error } = await supabase.rpc("set_course_enrollment_status", {
    p_enrollment_id: id,
    p_status: status,
    p_admin_notes: adminNotesResult.data?.admin_notes ?? null,
  });
  if (error) throw error;
  return data as EnrollmentRow;
}

export async function approveEnrollmentPayment(
  id: string,
  input: {
    adminNotes?: string | null;
    paymentAmount: number;
    paymentMethod: string;
  }
) {
  const updateResult = await supabase
    .from("course_enrollments")
    .update({
      payment_amount: input.paymentAmount,
      payment_method: input.paymentMethod,
      admin_notes: input.adminNotes ?? null,
    })
    .eq("id", id);

  if (updateResult.error) throw updateResult.error;

  const { data, error } = await supabase.rpc("set_course_enrollment_status", {
    p_enrollment_id: id,
    p_status: "Confirmado",
    p_admin_notes: input.adminNotes ?? null,
  });
  if (error) throw error;
  return data as EnrollmentRow;
}

export async function updateEnrollmentNotes(id: string, admin_notes: string) {
  const { error } = await supabase.from("course_enrollments").update({ admin_notes }).eq("id", id);
  if (error) throw error;
}
