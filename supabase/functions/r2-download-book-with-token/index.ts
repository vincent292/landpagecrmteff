import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";
import { GetObjectCommand } from "npm:@aws-sdk/client-s3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner";

import {
  clampExpiresIn,
  corsHeaders,
  createR2Client,
  getRequiredEnv,
  json,
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
    const adminClient = createClient(env.supabaseUrl, env.serviceRoleKey);
    const body = (await request.json()) as { token?: string; expiresIn?: number };
    const token = body.token?.trim().toUpperCase();

    if (!token) {
      return json({ error: "Debes enviar un token valido." }, 400);
    }

    const { data, error } = await adminClient.rpc("public_download_book_with_token", {
      p_token: token,
    });
    if (error) {
      return json({ error: error.message || "Token invalido o agotado." }, 400);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.signed_file_path) {
      return json({ error: "Token invalido o agotado." }, 400);
    }

    const key = resolvePrivateObjectKey("book-files-private", row.signed_file_path);
    const client = createR2Client(env);
    const signedUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: env.privateBucketName,
        Key: key,
      }),
      { expiresIn: clampExpiresIn(body.expiresIn ?? 60 * 5) }
    );

    const { error: consumeError } = await adminClient.rpc("public_consume_book_token", {
      p_token: token,
    });
    if (consumeError) {
      return json({ error: consumeError.message || "No se pudo consumir el token." }, 400);
    }

    return json(
      {
        signedUrl,
        token: row.token_value,
        title: row.book_title ?? "Libro",
        path: key,
      },
      200
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo descargar el libro." }, 500);
  }
});
