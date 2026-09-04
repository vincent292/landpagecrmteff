import { supabase } from "../lib/supabaseClient";
import { getVisibleDeletionFilter, type DeletionMetadata } from "./adminDeletionService";
import { normalizeDocumentNumber } from "../utils/documentNumber";

export type ProfileRow = DeletionMetadata & {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  document_number?: string | null;
  role: string | null;
  created_at: string;
  doctor_profile?: (DeletionMetadata & {
    id: string;
    full_name: string;
    is_active: boolean;
    access_role?: "doctor" | "doctor_inventory" | null;
  }) | null;
};

export async function getCurrentProfile() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase.from("profiles").select("*").eq("id", auth.user.id).eq("is_deleted", false).maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function getProfiles(includeDeleted = false) {
  let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
  const filter = getVisibleDeletionFilter("profiles", includeDeleted);
  if (filter.column) query = query.eq(filter.column, filter.value);
  const { data, error } = await query;
  if (error) throw error;
  const profiles = (data ?? []) as ProfileRow[];
  const profileIds = profiles.map((profile) => profile.id);

  if (profileIds.length === 0) return profiles;

  let doctorQuery = supabase
    .from("doctor_profiles")
    .select("id, profile_id, full_name, is_active, access_role, deleted_at, deleted_by, deleted_by_role, deleted_by_name, deleted_by_email")
    .in("profile_id", profileIds);

  if (!includeDeleted) {
    doctorQuery = doctorQuery.is("deleted_at", null);
  }

  const { data: doctors, error: doctorsError } = await doctorQuery;
  if (doctorsError) throw doctorsError;

  const doctorByProfileId = new Map(
    (doctors ?? []).map((doctor) => [doctor.profile_id as string, doctor])
  );

  return profiles.map((profile) => ({
    ...profile,
    doctor_profile: doctorByProfileId.get(profile.id) ?? null,
  })) as ProfileRow[];
}

export async function updateProfileRole(id: string, role: string) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function updateMyProfile(id: string, data: Partial<ProfileRow>) {
  const payload = { ...data };
  if ("document_number" in payload) {
    payload.document_number = normalizeDocumentNumber(payload.document_number);
  }
  const { error } = await supabase.from("profiles").update(payload).eq("id", id);
  if (error) throw error;
}

type UpdateUserAccessInput = {
  userId: string;
  email: string;
  fullName?: string | null;
  password?: string | null;
  phone?: string | null;
  city?: string | null;
};

export async function updateUserAccess(input: UpdateUserAccessInput) {
  try {
    const { data, error } = await supabase.functions.invoke("update-user-access", {
      body: {
        user_id: input.userId,
        email: input.email,
        full_name: input.fullName ?? null,
        password: input.password?.trim() ? input.password.trim() : null,
        phone: input.phone ?? null,
        city: input.city ?? null,
      },
    });

    if (error) throw await formatUpdateUserAccessError(error);
    if (data?.error) throw new Error(data.error);
    return data;
  } catch (error) {
    throw await formatUpdateUserAccessError(error);
  }
}

async function formatUpdateUserAccessError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const payload = await readFunctionErrorPayload(error);
  const functionMessage = payload?.error || message;

  if (
    /failed to send a request to the edge function/i.test(functionMessage) ||
    /functionsfetcherror/i.test(functionMessage) ||
    /load failed/i.test(functionMessage) ||
    /network/i.test(functionMessage)
  ) {
    return new Error("No pudimos contactar la función segura para cambiar el acceso. Verifica que la Edge Function update-user-access esté desplegada en Supabase y vuelve a intentar.");
  }

  return new Error(functionMessage || "No se pudo actualizar el acceso del usuario.");
}

async function readFunctionErrorPayload(error: unknown) {
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  if (!context) return null;
  if (context instanceof Response) {
    return await context.clone().json().catch(() => null) as { error?: string } | null;
  }
  if (typeof context === "object" && "json" in context && typeof context.json === "function") {
    return await (context.json as () => Promise<unknown>)().catch(() => null) as { error?: string } | null;
  }
  if (typeof context === "object" && "error" in context && typeof (context as { error?: unknown }).error === "string") {
    return { error: (context as { error: string }).error };
  }
  return null;
}
