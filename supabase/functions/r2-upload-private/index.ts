import { PutObjectCommand } from "npm:@aws-sdk/client-s3";

import {
  corsHeaders,
  createR2Client,
  getRequiredEnv,
  isKnownPrivateBucket,
  isStaffRole,
  json,
  resolveActor,
  resolveBucketName,
  resolvePrivateObjectKey,
} from "../_shared/r2.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Metodo no permitido." }, 405);
  }

  try {
    const env = getRequiredEnv();
    const actor = await resolveActor(request, env);
    const formData = await request.formData();

    const file = formData.get("file");
    const rawPath = formData.get("path");
    const bucket = typeof formData.get("bucket") === "string"
      ? String(formData.get("bucket"))
      : "payment-receipts-private";

    if (!(file instanceof File)) {
      return json({ error: "Debes enviar un archivo." }, 400);
    }

    if (typeof rawPath !== "string" || !rawPath.trim()) {
      return json({ error: "Debes enviar la ruta destino." }, 400);
    }

    if (!isKnownPrivateBucket(bucket)) {
      return json({ error: "Bucket privado no soportado." }, 400);
    }

    const key = resolvePrivateObjectKey(bucket, rawPath);

    const allowed = canUploadPrivate(actor.role, key, Boolean(actor.user));

    if (!actor.user && !allowed) {
      return json(
        { error: "Tu sesion no es valida para subir archivos privados. Cierra sesion y vuelve a entrar." },
        401
      );
    }

    if (!allowed) {
      return json({ error: `No tienes permisos para subir este archivo privado en la ruta ${key}.` }, 403);
    }

    const client = createR2Client(env);
    const bytes = new Uint8Array(await file.arrayBuffer());

    await client.send(
      new PutObjectCommand({
        Bucket: resolveBucketName(env, bucket),
        Key: key,
        Body: bytes,
        ContentType: file.type || "application/octet-stream",
        CacheControl: "private, max-age=0, no-cache",
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
    return json({ error: error instanceof Error ? error.message : "No se pudo subir el archivo privado." }, 500);
  }
});

function canUploadPrivate(role: string | null, key: string, hasUser: boolean) {
  if (isStaffRole(role)) return true;
  if (!hasUser) {
    return (
      key.startsWith("receipts/appointments/public-assessment/") ||
      key.startsWith("receipts/appointments/manual-payment/") ||
      key.startsWith("receipts/promotions/") ||
      key.startsWith("receipts/treatments/")
    );
  }

  return (
    key.startsWith("receipts/appointments/") ||
    key.startsWith("receipts/promotions/") ||
    key.startsWith("receipts/treatments/") ||
    key.startsWith("receipts/courses/") ||
    key.startsWith("receipts/books/") ||
    key.startsWith("receipts/savings-cards/") ||
    key.startsWith("receipts/payment-plans/") ||
    key.startsWith("receipts/appointments/public-assessment/") ||
    key.startsWith("receipts/appointments/manual-payment/") ||
    key.startsWith("receipts/books/")
  );
}
