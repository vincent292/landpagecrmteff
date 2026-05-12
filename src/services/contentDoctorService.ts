import { supabase } from "../lib/supabaseClient";

export type PublicDoctorProfile = {
  id?: string;
  full_name: string;
  specialty: string | null;
  photo_url: string | null;
};

type RowWithDoctor = {
  doctor_id: string | null;
  doctor_profiles?: { full_name: string; specialty: string | null; photo_url: string | null } | null;
};

export async function attachDoctorProfiles<T extends RowWithDoctor>(rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;

  const doctorIds = [...new Set(rows.map((row) => row.doctor_id).filter(Boolean))] as string[];
  if (doctorIds.length === 0) return rows;

  const { data, error } = await supabase
    .from("doctor_profiles")
    .select("id, full_name, specialty, photo_url")
    .in("id", doctorIds)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) throw error;

  const doctorMap = new Map((data ?? []).map((doctor) => [doctor.id, doctor]));

  return rows.map((row) => ({
    ...row,
    doctor_profiles: row.doctor_id ? doctorMap.get(row.doctor_id) ?? row.doctor_profiles ?? null : row.doctor_profiles ?? null,
  })) as T[];
}

export async function attachDoctorProfile<T extends RowWithDoctor>(row: T | null): Promise<T | null> {
  if (!row) return null;
  const [enrichedRow] = await attachDoctorProfiles([row]);
  return (enrichedRow ?? row) as T;
}
