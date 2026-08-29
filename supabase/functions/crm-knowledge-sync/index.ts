import { corsHeaders, json, requireCrmManager } from "../_shared/whatsapp-crm.ts";

function cleanText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30000);
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")
    ) return null;
    return url;
  } catch {
    return null;
  }
}

function sourceTypeFor(url: URL) {
  if (url.hostname.includes("instagram.com")) return "instagram";
  if (url.hostname.includes("facebook.com")) return "facebook";
  if (url.hostname.includes("tiktok.com")) return "tiktok";
  return "website";
}

function normalizedUrl(value: URL) {
  const url = new URL(value.toString());
  url.hash = "";
  if (url.pathname !== "/" && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}

function extractSameSiteLinks(html: string, pageUrl: URL) {
  const links = new Set<string>();
  const usefulPath = /^\/(?:tratamientos|promociones|cursos|galeria|contacto|reservar-cita|sobre|servicios)(?:\/|$)/i;
  for (const match of html.matchAll(/\bhref=["']([^"'#]+)["']/gi)) {
    try {
      const href = match[1]?.trim();
      if (!href || /^(?:mailto:|tel:|whatsapp:|javascript:)/i.test(href)) continue;
      const url = new URL(href, pageUrl);
      if (url.protocol !== "https:" || url.hostname !== pageUrl.hostname) continue;
      if (!usefulPath.test(url.pathname) && url.pathname !== "/") continue;
      if (/\.(?:png|jpe?g|webp|gif|svg|pdf|zip|mp4|mov)$/i.test(url.pathname)) continue;
      links.add(normalizedUrl(url));
    } catch {
      continue;
    }
  }
  return [...links];
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const { admin } = await requireCrmManager(request);
    let synced = 0;
    const errors: string[] = [];

    async function upsertSource(source: { source_type: string; source_url?: string | null; title: string; content: string }) {
      const { error } = await admin.from("crm_knowledge_sources").upsert({
        ...source,
        content_hash: await sha256(source.content),
        last_synced_at: new Date().toISOString(),
        sync_error: null,
      }, { onConflict: "source_type,title" });
      if (error) throw error;
    }

    const platformSources: Array<{ title: string; load: () => Promise<{ data: unknown; error: { message: string } | null }> }> = [
      {
        title: "Configuración pública",
        load: async () => await admin.from("site_settings").select("phone,whatsapp,email,address,city,business_hours,instagram_url,tiktok_url,assessment_label,assessment_price").limit(1),
      },
      {
        title: "Tratamientos",
        load: async () => await admin.from("treatments").select("title,slug,short_description,description,public_info,benefits,duration,care_instructions,expected_results,city,treatment_price,assessment_price").eq("is_active", true).is("deleted_at", null).limit(200),
      },
      {
        title: "Promociones",
        load: async () => await admin.from("promotions").select("title,slug,description,public_info,old_price,promo_price,city,start_date,end_date,assessment_price").eq("is_active", true).is("deleted_at", null).limit(200),
      },
      {
        title: "Cursos",
        load: async () => await admin.from("courses").select("title,slug,short_description,description,public_info,city,start_date,start_time,modality,price,syllabus,requirements,certification").eq("is_active", true).is("deleted_at", null).limit(200),
      },
      {
        title: "Doctoras",
        load: async () => await admin.from("doctor_profiles").select("full_name,specialty,bio,city,instagram_url,tiktok_url").eq("is_active", true).is("deleted_at", null).limit(50),
      },
    ];

    for (const source of platformSources) {
      try {
        const result = await source.load();
        if (result.error) throw new Error(result.error.message);
        await upsertSource({ source_type: "platform", title: source.title, content: JSON.stringify(result.data ?? []) });
        synced += 1;
      } catch (error) {
        errors.push(`${source.title}: ${error instanceof Error ? error.message : "error"}`);
      }
    }

    const publicSite = safeExternalUrl(Deno.env.get("PUBLIC_SITE_URL") || "https://www.draballesteros.com");
    const siteSettings = await admin.from("site_settings").select("instagram_url,tiktok_url").limit(1).maybeSingle();
    if (siteSettings.error) errors.push(`Redes sociales: ${siteSettings.error.message}`);
    const socialUrls = Object.values(siteSettings.data ?? {}).filter((item) => typeof item === "string") as string[];
    const configuredUrls = [
      publicSite?.toString() || "",
      ...(publicSite ? ["/tratamientos", "/promociones", "/cursos", "/galeria", "/contacto"].map((path) => new URL(path, publicSite).toString()) : []),
      ...socialUrls,
      ...(Deno.env.get("CRM_SOCIAL_URLS") || "").split(","),
      ...(Deno.env.get("CRM_KNOWLEDGE_URLS") || "").split(","),
    ].map((item) => item.trim()).filter(Boolean);

    const queue = [...new Set(configuredUrls)].slice(0, 20);
    const visited = new Set<string>();
    for (let index = 0; index < queue.length && visited.size < 30; index += 1) {
      const value = queue[index];
      const url = safeExternalUrl(value);
      if (!url) {
        errors.push(`URL omitida por seguridad: ${value}`);
        continue;
      }
      const key = normalizedUrl(url);
      if (visited.has(key)) continue;
      visited.add(key);
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "DraBallesterosCRMKnowledge/1.0" },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const content = cleanText(html);
        if (content.length < 80) throw new Error("contenido no accesible o insuficiente");
        const type = sourceTypeFor(url);
        await upsertSource({
          source_type: type,
          source_url: url.toString(),
          title: `${type} · ${url.hostname}${url.pathname}`,
          content,
        });
        synced += 1;
        if (publicSite && url.hostname === publicSite.hostname) {
          for (const link of extractSameSiteLinks(html, url)) {
            if (!visited.has(link) && queue.length < 35) queue.push(link);
          }
        }
      } catch (error) {
        errors.push(`${url.hostname}: ${error instanceof Error ? error.message : "error"}`);
      }
    }

    return json({ ok: true, synced, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    if (message === "UNAUTHORIZED") return json({ error: "Sesión inválida." }, 401);
    if (message === "FORBIDDEN") return json({ error: "No tienes acceso al CRM." }, 403);
    console.error("[crm-knowledge-sync] Failed", error);
    return json({ error: "No se pudo sincronizar el conocimiento." }, 500);
  }
});
