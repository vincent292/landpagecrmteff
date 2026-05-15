import { getSignedUrl, uploadPrivateFile } from "./storageService";
import { supabase } from "../lib/supabaseClient";
import { type DeletionMetadata } from "./adminDeletionService";
import { optimizeImageFile } from "../utils/imageOptimizer";

const bucket = "patient-photos-private";

export type PatientPhotoRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  clinical_history_id: string | null;
  uploaded_by: string | null;
  doctor_id: string | null;
  profiles?: { full_name: string | null; email: string | null; role: string | null } | null;
  doctor_profiles?: {
    id: string;
    full_name: string | null;
    specialty: string | null;
    whatsapp: string | null;
    email: string | null;
  } | null;
  photo_type: string;
  treatment_name: string | null;
  image_path: string;
  image_url: string | null;
  notes: string | null;
  is_visible_to_patient: boolean;
  created_at: string;
  signed_url?: string | null;
};

const patientPhotoSelect =
  "*, profiles:uploaded_by(full_name, email, role), doctor_profiles(id, full_name, specialty, whatsapp, email)";

export type PhotoComparisonRow = DeletionMetadata & {
  id: string;
  patient_id: string;
  before_photo_id: string;
  after_photo_id: string;
  treatment_name: string;
  notes: string | null;
  is_visible_to_patient: boolean;
  created_at: string;
  before_photo?: PatientPhotoRow | null;
  after_photo?: PatientPhotoRow | null;
};

export async function uploadPatientPhoto(file: File, patientId: string, metadata: Record<string, unknown>) {
  const optimized = await optimizeImageFile(file, {
    maxWidth: 1800,
    maxHeight: 1800,
    quality: 0.88,
  });
  const uploadFile = optimized.file;
  const fileExt = uploadFile.name.split(".").pop() ?? "webp";
  const path = `${patientId}/${crypto.randomUUID()}.${fileExt}`;
  const imagePath = await uploadPrivateFile(bucket, path, uploadFile);

  const payload = {
    patient_id: patientId,
    image_path: imagePath,
    ...metadata,
  };

  const { data, error } = await supabase.from("patient_photos").insert(payload).select(patientPhotoSelect).single();
  if (error) throw error;
  return data as PatientPhotoRow;
}

export async function getPatientPhotos(patientId: string) {
  const { data, error } = await supabase
    .from("patient_photos")
    .select(patientPhotoSelect)
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as PatientPhotoRow[];
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      signed_url: row.image_path ? await getSignedUrl(bucket, row.image_path) : null,
    }))
  );
}

export async function createPhotoComparison(data: Record<string, unknown>) {
  const { data: row, error } = await supabase.from("photo_comparisons").insert(data).select("*").single();
  if (error) throw error;
  return row as PhotoComparisonRow;
}

export async function getPhotoComparisons(patientId: string) {
  const { data, error } = await supabase
    .from("photo_comparisons")
    .select("*, before_photo:before_photo_id(*), after_photo:after_photo_id(*)")
    .eq("patient_id", patientId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as PhotoComparisonRow[];
  return Promise.all(
    rows.map(async (row) => {
      const beforePhoto = Array.isArray(row.before_photo) ? row.before_photo[0] : row.before_photo;
      const afterPhoto = Array.isArray(row.after_photo) ? row.after_photo[0] : row.after_photo;

      return {
        ...row,
        before_photo: beforePhoto
        ? {
            ...beforePhoto,
            signed_url: beforePhoto.image_path
              ? await getSignedUrl(bucket, beforePhoto.image_path)
              : null,
          }
        : null,
        after_photo: afterPhoto
        ? {
            ...afterPhoto,
            signed_url: afterPhoto.image_path
              ? await getSignedUrl(bucket, afterPhoto.image_path)
              : null,
          }
        : null,
      };
    })
  );
}

export async function updatePhotoVisibility(id: string, isVisible: boolean) {
  const { error } = await supabase
    .from("patient_photos")
    .update({ is_visible_to_patient: isVisible })
    .eq("id", id);
  if (error) throw error;
}
