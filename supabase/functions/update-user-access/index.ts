import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type UpdateUserAccessBody = {
  user_id: string;
  email: string;
  full_name?: string | null;
  password?: string | null;
  phone?: string | null;
  city?: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Supabase environment variables are missing.");
    }

    const authorization = request.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "No autenticado." }, 401);
    }

    const { data: actorProfile, error: actorProfileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (actorProfileError || actorProfile?.role !== "superadmin") {
      return json({ error: "Solo el superadmin puede actualizar accesos de usuarios." }, 403);
    }

    const body = (await request.json()) as UpdateUserAccessBody;
    const userId = body.user_id?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim() ?? "";

    if (!userId || !email) {
      return json({ error: "Usuario y correo son obligatorios." }, 400);
    }

    const authPayload: { email: string; password?: string; user_metadata?: Record<string, unknown> } = {
      email,
      user_metadata: {
        full_name: body.full_name?.trim() || undefined,
      },
    };

    if (password.length > 0) {
      if (password.length < 6) {
        return json({ error: "La nueva contraseña debe tener al menos 6 caracteres." }, 400);
      }
      authPayload.password = password;
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(userId, authPayload);
    if (updateAuthError) {
      throw updateAuthError;
    }

    const profilePatch: Record<string, unknown> = {
      email,
    };

    if (typeof body.full_name === "string") profilePatch.full_name = body.full_name.trim() || null;
    if (typeof body.phone === "string") profilePatch.phone = body.phone.trim() || null;
    if (typeof body.city === "string") profilePatch.city = body.city.trim() || null;

    await adminClient.from("profiles").update(profilePatch).eq("id", userId).throwOnError();
    await adminClient.from("doctor_profiles").update({ email }).eq("profile_id", userId).throwOnError();
    await adminClient.from("patients").update({ email }).eq("profile_id", userId).throwOnError();

    return json({ ok: true }, 200);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el acceso del usuario." },
      500
    );
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
