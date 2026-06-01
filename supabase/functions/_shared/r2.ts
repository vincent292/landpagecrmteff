import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.105.1";
import { S3Client } from "npm:@aws-sdk/client-s3";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const staffRoles = new Set(["superadmin", "admin", "doctor", "assistant"]);
const publicBucketAliases = new Set(["public-media", "public-gallery", "book-covers-public"]);
const privateBucketAliases = new Set([
  "payment-receipts-private",
  "patient-photos-private",
  "book-files-private",
  "medical-files-private",
]);

export type R2Env = {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucketName: string;
  privateBucketName: string;
};

export type ActorContext = {
  user: User | null;
  role: string | null;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
};

export function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getRequiredEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const publicBucketName = Deno.env.get("R2_PUBLIC_BUCKET_NAME");
  const privateBucketName = Deno.env.get("R2_PRIVATE_BUCKET_NAME");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Faltan variables de entorno de Supabase para la function.");
  }

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBucketName || !privateBucketName) {
    throw new Error("Faltan variables de entorno de Cloudflare R2.");
  }

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    accountId,
    accessKeyId,
    secretAccessKey,
    publicBucketName,
    privateBucketName,
  } satisfies R2Env;
}

export function createR2Client(env: R2Env) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
  });
}

export async function resolveActor(request: Request, env: R2Env) {
  const authorization = request.headers.get("Authorization") ?? "";
  const userClient = createClient(env.supabaseUrl, env.anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey);

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return {
      user: null,
      role: null,
      userClient,
      adminClient,
    } satisfies ActorContext;
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    user: data.user,
    role: typeof profile?.role === "string" ? profile.role : null,
    userClient,
    adminClient,
  } satisfies ActorContext;
}

export function isStaffRole(role?: string | null) {
  return staffRoles.has(role ?? "");
}

export function isKnownPublicBucket(bucket: string) {
  return publicBucketAliases.has(bucket);
}

export function isKnownPrivateBucket(bucket: string) {
  return privateBucketAliases.has(bucket);
}

export function resolveBucketName(env: R2Env, bucket: string) {
  if (isKnownPublicBucket(bucket)) return env.publicBucketName;
  if (isKnownPrivateBucket(bucket)) return env.privateBucketName;
  throw new Error(`Bucket no soportado: ${bucket}`);
}

export function normalizeObjectKey(value: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");

  if (!normalized || normalized.includes("..")) {
    throw new Error("La ruta del archivo no es valida.");
  }

  return normalized;
}

export function resolvePrivateObjectKey(bucket: string, path: string) {
  const normalized = normalizeObjectKey(path);

  if (bucket === "payment-receipts-private") {
    return normalized.startsWith("receipts/") ? normalized : `receipts/${normalized}`;
  }

  if (bucket === "patient-photos-private") {
    return normalized.startsWith("patients/photos/") ? normalized : `patients/photos/${normalized}`;
  }

  if (bucket === "book-files-private") {
    if (normalized.startsWith("books/files/")) return normalized;
    const withoutLegacyPrefix = normalized.replace(/^books\//, "");
    return `books/files/${withoutLegacyPrefix}`;
  }

  if (bucket === "medical-files-private") {
    if (normalized.startsWith("medical/private/")) return normalized;
    const withoutLegacyPrefix = normalized.replace(/^medical\//, "");
    return `medical/private/${withoutLegacyPrefix}`;
  }

  throw new Error(`Bucket privado no soportado: ${bucket}`);
}

export function clampExpiresIn(value?: number | null) {
  const numeric = Number(value ?? 600);
  if (!Number.isFinite(numeric)) return 600;
  return Math.max(60, Math.min(60 * 60, Math.round(numeric)));
}

export async function canAccessPrivateObject(
  adminClient: SupabaseClient,
  userId: string,
  role: string | null,
  path: string
) {
  if (isStaffRole(role)) return true;

  const exactChecks = [
    adminClient
      .from("appointment_reservations")
      .select("id")
      .eq("user_id", userId)
      .eq("payment_receipt_path", path)
      .eq("is_deleted", false)
      .maybeSingle(),
    adminClient
      .from("promotion_orders")
      .select("id")
      .eq("user_id", userId)
      .eq("payment_receipt_path", path)
      .eq("is_deleted", false)
      .maybeSingle(),
    adminClient
      .from("course_enrollments")
      .select("id")
      .eq("user_id", userId)
      .or(`payment_receipt_path.eq.${path},payment_receipt_url.eq.${path}`)
      .eq("is_deleted", false)
      .maybeSingle(),
    adminClient
      .from("book_orders")
      .select("id")
      .eq("user_id", userId)
      .eq("payment_receipt_path", path)
      .eq("is_deleted", false)
      .maybeSingle(),
  ];

  const results = await Promise.all(exactChecks);
  if (results.some((result) => result.data)) return true;

  const { data: savingsReceipt } = await adminClient
    .from("savings_card_receipts")
    .select("id, installment_id")
    .eq("receipt_path", path)
    .maybeSingle();

  if (savingsReceipt?.installment_id) {
    const { data: installment } = await adminClient
      .from("savings_card_installments")
      .select("id, card_id")
      .eq("id", savingsReceipt.installment_id)
      .maybeSingle();

    if (installment?.card_id) {
      const { data: card } = await adminClient
        .from("savings_cards")
        .select("id, patient_id")
        .eq("id", installment.card_id)
        .maybeSingle();

      if (card?.patient_id) {
        const { data: patient } = await adminClient
          .from("patients")
          .select("id")
          .eq("id", card.patient_id)
          .eq("profile_id", userId)
          .eq("is_deleted", false)
          .maybeSingle();

        if (patient) return true;
      }
    }
  }

  const { data: paymentPlanReceipt } = await adminClient
    .from("payment_plan_receipts")
    .select("id, installment_id")
    .eq("receipt_path", path)
    .maybeSingle();

  if (paymentPlanReceipt?.installment_id) {
    const { data: installment } = await adminClient
      .from("payment_plan_installments")
      .select("id, plan_id")
      .eq("id", paymentPlanReceipt.installment_id)
      .maybeSingle();

    if (installment?.plan_id) {
      const { data: plan } = await adminClient
        .from("payment_plans")
        .select("id, patient_id")
        .eq("id", installment.plan_id)
        .maybeSingle();

      if (plan?.patient_id) {
        const { data: patient } = await adminClient
          .from("patients")
          .select("id")
          .eq("id", plan.patient_id)
          .eq("profile_id", userId)
          .eq("is_deleted", false)
          .maybeSingle();

        if (patient) return true;
      }
    }
  }

  const { data: photo } = await adminClient
    .from("patient_photos")
    .select("id, patient_id, is_visible_to_patient")
    .eq("image_path", path)
    .eq("is_deleted", false)
    .maybeSingle();

  if (photo?.is_visible_to_patient) {
    const { data: patient } = await adminClient
      .from("patients")
      .select("id")
      .eq("id", photo.patient_id)
      .eq("profile_id", userId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (patient) return true;
  }

  return false;
}
