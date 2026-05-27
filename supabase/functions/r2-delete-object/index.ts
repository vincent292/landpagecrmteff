import { DeleteObjectCommand } from "npm:@aws-sdk/client-s3";

import {
  corsHeaders,
  createR2Client,
  getRequiredEnv,
  isKnownPrivateBucket,
  isKnownPublicBucket,
  isStaffRole,
  json,
  normalizeObjectKey,
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
    const body = (await request.json()) as { bucket?: string; path?: string };

    if (!actor.user || !isStaffRole(actor.role)) {
      return json({ error: "Solo el personal autorizado puede borrar archivos." }, 403);
    }

    const bucket = body.bucket?.trim();
    const rawPath = body.path?.trim();

    if (!bucket || !rawPath) {
      return json({ error: "Debes enviar bucket y ruta." }, 400);
    }

    if (!isKnownPublicBucket(bucket) && !isKnownPrivateBucket(bucket)) {
      return json({ error: "Bucket no soportado." }, 400);
    }

    const key = isKnownPrivateBucket(bucket)
      ? resolvePrivateObjectKey(bucket, rawPath)
      : normalizeObjectKey(rawPath);

    const client = createR2Client(env);
    await client.send(
      new DeleteObjectCommand({
        Bucket: resolveBucketName(env, bucket),
        Key: key,
      })
    );

    return json({ ok: true, path: key }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo borrar el archivo." }, 500);
  }
});
