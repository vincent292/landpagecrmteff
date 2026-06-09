import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const allowedRoles = new Set(["superadmin", "admin", "doctor", "doctor_inventory"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Metodo no permitido." }, 405);
  }

  try {
    const env = getRequiredEnv();

    const authorization = request.headers.get("Authorization") ?? "";
    const userClient = createClient(env.supabaseUrl, env.anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "No autenticado." }, 401);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !allowedRoles.has(profile?.role ?? "")) {
      return json({ error: "No tienes permisos para subir archivos publicos." }, 403);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const rawPath = formData.get("path");

    if (!(file instanceof File)) {
      return json({ error: "Debes enviar un archivo." }, 400);
    }

    if (typeof rawPath !== "string" || !rawPath.trim()) {
      return json({ error: "Debes enviar la ruta destino." }, 400);
    }

    const key = normalizeKey(rawPath);
    const bytes = new Uint8Array(await file.arrayBuffer());

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    });

    await client.send(
      new PutObjectCommand({
        Bucket: env.publicBucketName,
        Key: key,
        Body: bytes,
        ContentType: file.type || "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    return json(
      {
        key,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      },
      200
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo subir el archivo." }, 500);
  }
});

function getRequiredEnv() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const publicBucketName = Deno.env.get("R2_PUBLIC_BUCKET_NAME");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("Faltan variables de entorno de Supabase para la function.");
  }

  if (!accountId || !accessKeyId || !secretAccessKey || !publicBucketName) {
    throw new Error("Faltan variables de entorno de Cloudflare R2 para subida publica.");
  }

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    accountId,
    accessKeyId,
    secretAccessKey,
    publicBucketName,
  };
}

function normalizeKey(value: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  if (!normalized || normalized.includes("..")) {
    throw new Error("La ruta del archivo no es valida.");
  }
  return normalized;
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
