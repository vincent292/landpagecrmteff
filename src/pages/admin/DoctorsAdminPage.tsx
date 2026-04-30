import { useEffect, useState } from "react";

import { Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { PublicImageUpload } from "../../components/admin/PublicImageUpload";
import {
  createDoctorWithUser,
  deleteDoctor,
  getAdminDoctors,
  updateDoctor,
  type DoctorProfileRow,
} from "../../services/doctorService";

const emptyDoctor = {
  profile_id: "",
  full_name: "",
  specialty: "",
  bio: "",
  city: "Cochabamba",
  phone: "",
  whatsapp: "",
  email: "",
  password: "",
  instagram_url: "",
  tiktok_url: "",
  photo_url: "",
  is_featured: false,
  is_active: true,
};

export function DoctorsAdminPage() {
  const [rows, setRows] = useState<DoctorProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DoctorProfileRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    getAdminDoctors()
      .then(setRows)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
            Equipo medico
          </p>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-none sm:text-5xl">
            Doctoras registradas
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Administra perfiles publicos, WhatsApp de notificacion y vinculacion futura con usuarios doctora.
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Registrar doctora
        </button>
      </div>

      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-4">
        {loading && <LoadingState />}
        {!loading && rows.length === 0 && <EmptyState label="Todavia no hay doctoras registradas." />}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((doctor) => (
            <article key={doctor.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
              <img
                src={doctor.photo_url ?? "/doctora/dra1.jpg"}
                alt={doctor.full_name}
                className="h-52 w-full rounded-[20px] object-cover"
              />
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                {doctor.specialty ?? "Doctora"} · {doctor.city ?? "Sin ciudad"}
              </p>
              <h2 className="mt-2 text-xl font-semibold">{doctor.full_name}</h2>
              <p className="mt-2 line-clamp-3 text-sm leading-7 text-[var(--color-copy)]">{doctor.bio}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setEditing(doctor);
                    setShowForm(true);
                  }}
                  className="rounded-full border border-[var(--color-border)] p-3"
                  aria-label="Editar doctora"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void deleteDoctor(doctor.id).then(load)}
                  className="rounded-full border border-[var(--color-border)] p-3"
                  aria-label="Desactivar doctora"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {showForm && (
        <DoctorForm
          row={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function DoctorForm({ row, onClose, onSaved }: { row: DoctorProfileRow | null; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => ({
    ...emptyDoctor,
    ...(row ?? {}),
    profile_id: row?.profile_id ?? "",
    specialty: row?.specialty ?? "",
    bio: row?.bio ?? "",
    city: row?.city ?? "Cochabamba",
    phone: row?.phone ?? "",
    whatsapp: row?.whatsapp ?? "",
    email: row?.email ?? "",
    instagram_url: row?.instagram_url ?? "",
    tiktok_url: row?.tiktok_url ?? "",
    photo_url: row?.photo_url ?? "",
  }));
  const [error, setError] = useState("");
  const [createdPassword, setCreatedPassword] = useState("");

  const setValue = (name: string, value: string | boolean) => setValues((current) => ({ ...current, [name]: value }));

  const submit = async () => {
    try {
      setError("");
      const payload = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, value === "" ? null : value])
      );
      if (row) {
        delete payload.password;
        await updateDoctor(row.id, payload);
        onSaved();
      } else {
        delete payload.profile_id;
        const result = await createDoctorWithUser(payload);
        if (result.temporary_password) {
          setCreatedPassword(result.temporary_password);
          return;
        }
        onSaved();
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar la doctora.");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-6 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
              {row ? "Editar" : "Registrar"}
            </p>
            <h2 className="font-display mt-2 text-4xl font-semibold">Doctora</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] p-3">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Field label="Nombre completo">
            <input value={String(values.full_name)} onChange={(event) => setValue("full_name", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Especialidad">
            <input value={String(values.specialty)} onChange={(event) => setValue("specialty", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Ciudad">
            <input value={String(values.city)} onChange={(event) => setValue("city", event.target.value)} className="premium-input" />
          </Field>
          {row ? (
            <Field label="Profile ID del usuario doctora">
              <input value={String(values.profile_id)} onChange={(event) => setValue("profile_id", event.target.value)} className="premium-input" />
            </Field>
          ) : (
            <Field label="Clave inicial">
              <input
                type="password"
                value={String(values.password)}
                onChange={(event) => setValue("password", event.target.value)}
                className="premium-input"
                placeholder="Opcional, si lo dejas vacio se genera una"
              />
            </Field>
          )}
          <Field label="WhatsApp de la doctora">
            <input value={String(values.whatsapp)} onChange={(event) => setValue("whatsapp", event.target.value)} className="premium-input" placeholder="5917XXXXXXX" />
          </Field>
          <Field label="Email">
            <input value={String(values.email)} onChange={(event) => setValue("email", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Instagram">
            <input value={String(values.instagram_url)} onChange={(event) => setValue("instagram_url", event.target.value)} className="premium-input" />
          </Field>
          <Field label="TikTok">
            <input value={String(values.tiktok_url)} onChange={(event) => setValue("tiktok_url", event.target.value)} className="premium-input" />
          </Field>
          <PublicImageUpload
            label="Foto de la doctora"
            value={String(values.photo_url ?? "")}
            folder="doctoras"
            onChange={(url) => setValue("photo_url", url)}
          />
          <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/60 px-4 py-3 text-sm font-semibold">
            <input type="checkbox" checked={Boolean(values.is_featured)} onChange={(event) => setValue("is_featured", event.target.checked)} />
            Destacar en portada
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/60 px-4 py-3 text-sm font-semibold">
            <input type="checkbox" checked={Boolean(values.is_active)} onChange={(event) => setValue("is_active", event.target.checked)} />
            Activa
          </label>
          <div className="md:col-span-2">
            <Field label="Biografia">
              <textarea value={String(values.bio)} onChange={(event) => setValue("bio", event.target.value)} className="premium-input min-h-32" />
            </Field>
          </div>
        </div>

        {createdPassword && (
          <div className="mt-6 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-900">
            Doctora creada. Clave temporal: <strong>{createdPassword}</strong>
            <button onClick={onSaved} className="ml-3 font-semibold underline">
              Cerrar
            </button>
          </div>
        )}
        {error && <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}
        <button onClick={() => void submit()} className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
          <Save className="h-4 w-4" />
          Guardar
        </button>
      </div>
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
