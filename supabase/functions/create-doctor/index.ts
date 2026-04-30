import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CreateDoctorBody = {
  email: string;
  password?: string;
  full_name: string;
  specialty?: string;
  bio?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  instagram_url?: string;
  tiktok_url?: string;
  photo_url?: string;
  is_featured?: boolean;
  is_active?: boolean;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !["superadmin", "admin"].includes(profile?.role)) {
      return json({ error: "Solo administracion puede crear doctoras." }, 403);
    }

    const body = (await request.json()) as CreateDoctorBody;
    if (!body.email?.trim() || !body.full_name?.trim()) {
      return json({ error: "Email y nombre son obligatorios." }, 400);
    }

    const password = body.password?.trim() || crypto.randomUUID();
    const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
      email: body.email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name.trim(), role: "doctor" },
    });

    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error("No se pudo crear el usuario doctora.");
    }

    await adminClient
      .from("profiles")
      .upsert({
        id: createdUser.user.id,
        full_name: body.full_name.trim(),
        email: body.email.trim(),
        phone: body.phone ?? null,
        city: body.city ?? null,
        role: "doctor",
      })
      .throwOnError();

    const { data: doctor, error: doctorError } = await adminClient
      .from("doctor_profiles")
      .insert({
        profile_id: createdUser.user.id,
        full_name: body.full_name.trim(),
        specialty: body.specialty ?? null,
        bio: body.bio ?? null,
        city: body.city ?? null,
        phone: body.phone ?? null,
        whatsapp: body.whatsapp ?? null,
        email: body.email.trim(),
        instagram_url: body.instagram_url ?? null,
        tiktok_url: body.tiktok_url ?? null,
        photo_url: body.photo_url ?? null,
        is_featured: body.is_featured ?? false,
        is_active: body.is_active ?? true,
      })
      .select("*")
      .single();

    if (doctorError) throw doctorError;

    return json({ doctor, temporary_password: body.password ? null : password }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudo crear la doctora." }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
