import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { authenticateCrmRequest, supabaseAdminRequest } from "../../lib/supabase/admin";

export const runtime = "nodejs";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

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
    if (isIP(hostname) || hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) return null;
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

async function upsertKnowledge(source: {
  source_type: string;
  source_url?: string | null;
  title: string;
  content: string;
  sync_error?: string | null;
}) {
  const hash = createHash("sha256").update(source.content).digest("hex");
  await supabaseAdminRequest("crm_knowledge_sources?on_conflict=source_type,title", {
    method: "POST",
    body: JSON.stringify({
      ...source,
      content_hash: hash,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    prefer: "resolution=merge-duplicates",
  });
}

export async function POST(request: Request) {
  try {
    await authenticateCrmRequest(request);

    const platformQueries = [
      ["Configuración pública", "site_settings?select=phone,whatsapp,email,address,city,business_hours,instagram_url,tiktok_url,assessment_label,assessment_price&limit=1"],
      ["Tratamientos", "treatments?is_active=eq.true&deleted_at=is.null&select=title,slug,short_description,description,public_info,benefits,duration,care_instructions,expected_results,city,treatment_price,assessment_price&limit=200"],
      ["Promociones", "promotions?is_active=eq.true&deleted_at=is.null&select=title,slug,description,public_info,old_price,promo_price,city,start_date,end_date,assessment_price&limit=200"],
      ["Cursos", "courses?is_active=eq.true&deleted_at=is.null&select=title,slug,short_description,description,public_info,city,start_date,start_time,modality,price,syllabus,requirements,certification&limit=200"],
      ["Doctoras", "doctor_profiles?is_active=eq.true&deleted_at=is.null&select=full_name,specialty,bio,city,instagram_url,tiktok_url&limit=50"],
    ] as const;

    let synced = 0;
    const errors: string[] = [];
    for (const [title, query] of platformQueries) {
      try {
        const data = await supabaseAdminRequest<unknown[]>(query);
        await upsertKnowledge({ source_type: "platform", title, content: JSON.stringify(data) });
        synced += 1;
      } catch (error) {
        errors.push(`${title}: ${error instanceof Error ? error.message : "error"}`);
      }
    }

    const configuredUrls = [
      process.env.PUBLIC_SITE_URL || process.env.VITE_SITE_URL || "",
      ...(process.env.CRM_SOCIAL_URLS || "").split(","),
      ...(process.env.CRM_KNOWLEDGE_URLS || "").split(","),
    ].map((item) => item.trim()).filter(Boolean);

    for (const value of [...new Set(configuredUrls)].slice(0, 15)) {
      const url = safeExternalUrl(value);
      if (!url) {
        errors.push(`URL omitida por seguridad: ${value}`);
        continue;
      }
      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "DraBallesterosCRMKnowledge/1.0" },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const content = cleanText(await response.text());
        if (content.length < 80) throw new Error("contenido no accesible o insuficiente");
        await upsertKnowledge({
          source_type: sourceTypeFor(url),
          source_url: url.toString(),
          title: `${sourceTypeFor(url)} · ${url.hostname}${url.pathname}`,
          content,
        });
        synced += 1;
      } catch (error) {
        errors.push(`${url.hostname}: ${error instanceof Error ? error.message : "error"}`);
      }
    }

    return json({ ok: true, synced, errors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    if (message === "UNAUTHORIZED") return json({ error: "Sesión inválida." }, 401);
    if (message === "FORBIDDEN") return json({ error: "No tienes acceso al CRM." }, 403);
    console.error("[crm] Knowledge sync failed", { message });
    return json({ error: "No se pudo sincronizar el conocimiento." }, 500);
  }
}
