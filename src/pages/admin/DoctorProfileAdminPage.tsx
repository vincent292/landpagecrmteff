import { useEffect, useState, type ReactNode } from "react";

import { Save } from "lucide-react";

import { PublicImageUpload } from "../../components/admin/PublicImageUpload";
import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { isDoctorRole } from "../../lib/roles";
import { getMyDoctorProfile, updateMyDoctorProfile, type DoctorProfileRow } from "../../services/doctorService";

const emptyDoctorProfileForm = {
  full_name: "",
  specialty: "",
  bio: "",
  city: "",
  phone: "",
  whatsapp: "",
  email: "",
  instagram_url: "",
  tiktok_url: "",
  photo_url: "",
};

type DoctorProfileForm = typeof emptyDoctorProfileForm;

export function DoctorProfileAdminPage() {
  const { profile, refreshProfile, role } = useAuth();
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfileRow | null>(null);
  const [values, setValues] = useState<DoctorProfileForm>(emptyDoctorProfileForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    getMyDoctorProfile(profile.id)
      .then((row) => {
        setDoctorProfile(row);
        setValues(row ? doctorProfileToForm(row) : emptyDoctorProfileForm);
      })
      .catch((error) => {
        console.error("Error cargando perfil medico", error);
        setDoctorProfile(null);
      })
      .finally(() => setLoading(false));
  }, [profile?.id]);

  const setValue = (name: keyof DoctorProfileForm, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
  };

  const save = async () => {
    const fullName = values.full_name.trim();
    if (fullName.length < 3) {
      setStatus({ type: "error", text: "Escribe tu nombre completo para actualizar el perfil." });
      return;
    }

    setSaving(true);
    setStatus(null);
    try {
      const updated = await updateMyDoctorProfile({
        fullName,
        specialty: normalizeText(values.specialty),
        bio: normalizeText(values.bio),
        city: normalizeText(values.city),
        phone: normalizeText(values.phone),
        whatsapp: normalizeText(values.whatsapp),
        email: normalizeText(values.email),
        instagramUrl: normalizeText(values.instagram_url),
        tiktokUrl: normalizeText(values.tiktok_url),
        photoUrl: normalizeText(values.photo_url),
      });
      setDoctorProfile(updated);
      setValues(doctorProfileToForm(updated));
      await refreshProfile();
      setStatus({ type: "success", text: "Tu perfil medico se actualizo correctamente." });
    } catch (error) {
      setStatus({ type: "error", text: error instanceof Error ? error.message : "No pudimos actualizar tu perfil medico." });
    } finally {
      setSaving(false);
    }
  };

  if (!isDoctorRole(role)) {
    return (
      <section className="max-w-3xl rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Perfil medico</p>
        <h1 className="font-display mt-3 text-4xl font-semibold">Este espacio es para doctoras vinculadas.</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
          Si necesitas editar el equipo medico completo, usa el modulo Doctoras desde administracion.
        </p>
      </section>
    );
  }

  if (loading) return <LoadingState label="Cargando tu perfil medico..." />;

  if (!doctorProfile) {
    return (
      <section className="max-w-3xl rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <EmptyState label="No encontramos un perfil medico vinculado a tu cuenta." />
        <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
          Pide a administracion que registre tu carnet en Doctoras. Cuando coincida con tu cuenta, podras editar foto y datos desde aqui.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Mi perfil medico</p>
        <h1 className="font-display mt-3 text-4xl font-semibold md:text-5xl">Foto y datos publicos</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
          Estos datos aparecen en la pagina publica de doctoras y ayudan a pacientes a identificar tu atencion.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Field label="Nombre completo">
            <input value={values.full_name} onChange={(event) => setValue("full_name", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Carnet / CI">
            <input value={doctorProfile.document_number ?? "No registrado"} disabled className="premium-input opacity-70" />
          </Field>
          <Field label="Especialidad">
            <input value={values.specialty} onChange={(event) => setValue("specialty", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Ciudad">
            <select value={values.city} onChange={(event) => setValue("city", event.target.value)} className="premium-input">
              <option value="">Selecciona ciudad</option>
              {boliviaCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Telefono">
            <input value={values.phone} onChange={(event) => setValue("phone", event.target.value)} className="premium-input" />
          </Field>
          <Field label="WhatsApp publico">
            <input value={values.whatsapp} onChange={(event) => setValue("whatsapp", event.target.value)} className="premium-input" placeholder="5917XXXXXXX" />
          </Field>
          <Field label="Email publico">
            <input value={values.email} onChange={(event) => setValue("email", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Instagram">
            <input value={values.instagram_url} onChange={(event) => setValue("instagram_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="TikTok">
            <input value={values.tiktok_url} onChange={(event) => setValue("tiktok_url", event.target.value)} className="premium-input" />
          </Field>
          <div className="md:col-span-2">
            <Field label="Biografia">
              <textarea value={values.bio} onChange={(event) => setValue("bio", event.target.value)} className="premium-input min-h-32" />
            </Field>
          </div>
        </div>

        {status ? (
          <div className={`mt-6 rounded-[20px] border px-4 py-3 text-sm font-semibold ${status.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            {status.text}
          </div>
        ) : null}

        <button onClick={() => void save()} disabled={saving} className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? "Guardando..." : "Guardar perfil"}
        </button>
      </section>

      <aside className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5">
        <img src={values.photo_url || "/doctora/dra1.jpg"} alt={values.full_name || "Doctora"} className="h-72 w-full rounded-[24px] object-cover" />
        <div className="mt-5">
          <PublicImageUpload
            label="Cambiar foto"
            value={values.photo_url}
            folder="doctoras"
            aspectRatio={4 / 5}
            helperText="Recomendado: imagen vertical 1200 x 1500 px o relacion 4:5, bien iluminada."
            onChange={(url) => setValue("photo_url", url)}
          />
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function doctorProfileToForm(row: DoctorProfileRow): DoctorProfileForm {
  return {
    full_name: row.full_name ?? "",
    specialty: row.specialty ?? "",
    bio: row.bio ?? "",
    city: row.city ?? "",
    phone: row.phone ?? "",
    whatsapp: row.whatsapp ?? "",
    email: row.email ?? "",
    instagram_url: row.instagram_url ?? "",
    tiktok_url: row.tiktok_url ?? "",
    photo_url: row.photo_url ?? "",
  };
}

function normalizeText(value?: string | null) {
  const next = String(value ?? "").trim();
  return next.length > 0 ? next : null;
}
