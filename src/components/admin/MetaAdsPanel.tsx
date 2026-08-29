/* eslint-disable react-hooks/set-state-in-effect -- Hydrates ad data from Supabase when this CRM section mounts. */
import { ExternalLink, Megaphone, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getMetaCtwaAds,
  getMetaCtwaTargets,
  updateMetaCtwaAd,
  type MetaCtwaAd,
  type MetaCtwaTarget,
} from "../../services/crmService";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function targetValue(ad: MetaCtwaAd) {
  if (ad.treatment_id) return `treatment:${ad.treatment_id}`;
  if (ad.promotion_id) return `promotion:${ad.promotion_id}`;
  return "";
}

export function MetaAdsPanel() {
  const [ads, setAds] = useState<MetaCtwaAd[]>([]);
  const [targets, setTargets] = useState<MetaCtwaTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [nextAds, nextTargets] = await Promise.all([getMetaCtwaAds(), getMetaCtwaTargets()]);
    setAds(nextAds);
    setTargets(nextTargets);
  }, []);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudieron cargar los anuncios de Meta."))
      .finally(() => setLoading(false));
  }, [load]);

  const pending = useMemo(() => ads.filter((ad) => ad.status === "pending").length, [ads]);

  async function save(ad: MetaCtwaAd, values: Parameters<typeof updateMetaCtwaAd>[1]) {
    setSavingId(ad.id);
    setError(null);
    try {
      const updated = await updateMetaCtwaAd(ad.id, values);
      setAds((rows) => rows.map((row) => row.id === ad.id ? { ...row, ...updated } : row));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el anuncio.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-[30px] border border-[var(--color-border)] bg-white/70 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]"><Megaphone className="h-4 w-4" /> Anuncios de Meta</p>
          <h2 className="font-display mt-2 text-2xl font-semibold">Click-to-WhatsApp detectados</h2>
          <p className="mt-1 text-sm text-[var(--color-copy)]">Los anuncios aparecen automáticamente al llegar el primer contacto con referral de Meta.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${pending ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{pending ? `${pending} pendiente${pending === 1 ? "" : "s"}` : "Todo configurado"}</span>
          <button type="button" onClick={() => void load().catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo actualizar."))} disabled={loading || savingId !== null} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualizar</button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {loading ? <p className="mt-5 text-sm text-[var(--color-copy)]">Cargando anuncios…</p> : null}
      {!loading && !ads.length ? <p className="mt-5 rounded-2xl border border-dashed border-[var(--color-border)] bg-[#fbf7f2] p-4 text-sm text-[var(--color-copy)]">Aún no hay anuncios detectados. No debes cargar IDs: el primer mensaje que llegue desde un anuncio se registrará aquí como “Pendiente de vincular”.</p> : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {ads.map((ad) => (
          <article key={ad.id} className="rounded-2xl border border-[var(--color-border)] bg-[#fffcf9] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{ad.headline || ad.body || "Anuncio sin título"}</p>
                <p className="mt-1 break-all text-[11px] text-[var(--color-copy)]">ID Meta: {ad.source_id}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${ad.status === "configured" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{ad.status === "configured" ? "Configurado" : "Pendiente de vincular"}</span>
            </div>
            {ad.body ? <p className="mt-3 line-clamp-3 text-sm text-[var(--color-copy)]">{ad.body}</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--color-copy)]"><span>{ad.conversation_count} conversación{ad.conversation_count === 1 ? "" : "es"}</span><span className="text-right">Último: {formatDate(ad.last_seen_at)}</span></div>
            {ad.source_url ? <a href={ad.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-accent-strong)]">Ver URL del anuncio <ExternalLink className="h-3.5 w-3.5" /></a> : null}

            <label className="mt-4 block text-xs font-semibold">Tratamiento o promoción relacionada</label>
            <select value={targetValue(ad)} disabled={savingId === ad.id} onChange={(event) => {
              const [kind, id] = event.target.value.split(":");
              void save(ad, { treatment_id: kind === "treatment" ? id || null : null, promotion_id: kind === "promotion" ? id || null : null });
            }} className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm disabled:opacity-50">
              <option value="">Sin vincular</option>
              {targets.map((target) => <option key={`${target.kind}-${target.id}`} value={`${target.kind}:${target.id}`}>{target.kind === "treatment" ? "Tratamiento" : "Promoción"}: {target.title}</option>)}
            </select>
            <label className="mt-3 block text-xs font-semibold">Instrucciones o mensaje de bienvenida</label>
            <textarea key={`${ad.id}-${ad.welcome_message ?? ""}`} defaultValue={ad.welcome_message ?? ""} onBlur={(event) => {
              const welcomeMessage = event.target.value.trim() || null;
              if (welcomeMessage !== (ad.welcome_message ?? null)) void save(ad, { welcome_message: welcomeMessage });
            }} rows={3} placeholder="Ej.: ¡Hola! Gracias por consultar la promoción…" className="mt-1.5 w-full resize-none rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm" />
          </article>
        ))}
      </div>
    </section>
  );
}
