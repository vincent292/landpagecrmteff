type SupabaseRequestOptions = RequestInit & {
  prefer?: string;
};

function requiredServerEnv(name: string, fallbackName?: string) {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : "");
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

export function getSupabaseServerConfig() {
  return {
    url: requiredServerEnv("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, ""),
    serviceRoleKey: requiredServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export async function supabaseAdminRequest<T>(path: string, options: SupabaseRequestOptions = {}) {
  const { url, serviceRoleKey } = getSupabaseServerConfig();
  const response = await fetch(`${url}/rest/v1/${path.replace(/^\//, "")}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${detail.slice(0, 500)}`);
  }

  if (response.status === 204) return null as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export type CrmActor = {
  id: string;
  role: "superadmin" | "admin";
  email?: string;
};

export async function authenticateCrmRequest(request: Request): Promise<CrmActor> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authHeader.slice(7).trim();
  const { url, serviceRoleKey } = getSupabaseServerConfig();
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) throw new Error("UNAUTHORIZED");

  const user = (await userResponse.json()) as { id?: string; email?: string };
  if (!user.id) throw new Error("UNAUTHORIZED");

  const profiles = await supabaseAdminRequest<Array<{ id: string; role: string }>>(
    `profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role&limit=1`
  );
  const role = profiles[0]?.role;
  if (role !== "superadmin" && role !== "admin") throw new Error("FORBIDDEN");

  return { id: user.id, role, email: user.email };
}
