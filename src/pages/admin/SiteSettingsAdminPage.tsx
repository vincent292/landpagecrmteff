import { useEffect, useState } from "react";

import { Save } from "lucide-react";

import { LoadingState } from "../../components/common/AsyncState";
import { getSiteSettings, updateSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";

export function SiteSettingsAdminPage() {
  const [values, setValues] = useState<Partial<SiteSettingsRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getSiteSettings()
      .then(setValues)
      .finally(() => setLoading(false));
  }, []);

  const setValue = (name: keyof SiteSettingsRow, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      await updateSiteSettings(values);
      setMessage("Configuracion guardada.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Cargando configuracion..." />;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
          Configuracion
        </p>
        <h1 className="font-display mt-3 text-4xl font-semibold leading-none sm:text-5xl">
          Datos publicos del consultorio
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
          Estos datos alimentan footer, pagina de contacto, mapa y accesos publicos. Asi nadie tiene que tocar el entorno.
        </p>
      </div>

      <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Telefono">
            <input value={values.phone ?? ""} onChange={(event) => setValue("phone", event.target.value)} className="premium-input" />
          </Field>
          <Field label="WhatsApp principal">
            <input value={values.whatsapp ?? ""} onChange={(event) => setValue("whatsapp", event.target.value)} className="premium-input" placeholder="5917XXXXXXX" />
          </Field>
          <Field label="Correo">
            <input value={values.email ?? ""} onChange={(event) => setValue("email", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Ciudad">
            <input value={values.city ?? ""} onChange={(event) => setValue("city", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Instagram URL">
            <input value={values.instagram_url ?? ""} onChange={(event) => setValue("instagram_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="TikTok URL">
            <input value={values.tiktok_url ?? ""} onChange={(event) => setValue("tiktok_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Google Maps URL">
            <input value={values.maps_url ?? ""} onChange={(event) => setValue("maps_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Google Maps embed URL">
            <input value={values.maps_embed_url ?? ""} onChange={(event) => setValue("maps_embed_url", event.target.value)} className="premium-input" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Direccion">
              <textarea value={values.address ?? ""} onChange={(event) => setValue("address", event.target.value)} className="premium-input min-h-24" />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Texto footer">
              <textarea value={values.footer_text ?? ""} onChange={(event) => setValue("footer_text", event.target.value)} className="premium-input min-h-24" />
            </Field>
          </div>
        </div>

        {message && <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}
        <button disabled={saving} onClick={() => void save()} className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "Guardando..." : "Guardar configuracion"}
        </button>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
