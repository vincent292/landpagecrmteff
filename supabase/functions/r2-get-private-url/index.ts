import { GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

import {
  clampExpiresIn,
  corsHeaders,
  createR2Client,
  getRequiredEnv,
  isKnownPrivateBucket,
  json,
  resolveActor,
  resolveBucketName,
  resolvePrivateObjectKey,
  canAccessPrivateObject,
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
    const body = (await request.json()) as {
      bucket?: string;
      path?: string;
      expiresIn?: number;
      downloadName?: string;
    };

    const bucket = body.bucket?.trim() || "payment-receipts-private";
    const rawPath = body.path?.trim();

    if (!rawPath) {
      return json({ error: "Debes enviar la ruta del archivo." }, 400);
    }

    if (!isKnownPrivateBucket(bucket)) {
      return json({ error: "Bucket privado no soportado." }, 400);
    }

    if (!actor.user) {
      return json({ error: "Debes iniciar sesion para ver este archivo." }, 401);
    }

    const key = resolvePrivateObjectKey(bucket, rawPath);
    const allowed = await canAccessPrivateObject(actor.adminClient, actor.user.id, actor.role, key);

    if (!allowed) {
      return json({ error: "No tienes permisos para ver este archivo." }, 403);
    }

    const client = createR2Client(env);
    const expiresIn = clampExpiresIn(body.expiresIn);
    const command = new GetObjectCommand({
      Bucket: resolveBucketName(env, bucket),
      Key: key,
      ResponseContentDisposition: body.downloadName?.trim()
        ? `inline; filename="${body.downloadName.trim().replace(/"/g, "")}"`
        : undefined,
    });

    const signedUrl = await getSignedUrl(client, command, { expiresIn });
    return json({ signedUrl, path: key, expiresIn }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo generar el acceso al archivo." }, 500);
  }
});
