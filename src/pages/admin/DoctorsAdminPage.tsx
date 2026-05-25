import { useEffect, useState } from "react";

import { Pencil, Plus, Save, X } from "lucide-react";

import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { PublicImageUpload } from "../../components/admin/PublicImageUpload";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { hardDeleteRecord, restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import { createDoctor, getAdminDoctors, updateDoctor, type DoctorProfileRow } from "../../services/doctorService";
import { normalizeDocumentNumber } from "../../utils/documentNumber";

const emptyDoctor = {
  profile_id: "",
  full_name: "",
  document_number: "",
  specialty: "",
  bio: "",
  city: "Cochabamba",
  phone: "",
  whatsapp: "",
  email: "",
  instagram_url: "",
  tiktok_url: "",
  photo_url: "",
  is_featured: false,
  is_active: true,
};

export function DoctorsAdminPage() {
  const { role, profile, user } = useAuth();
  const [rows, setRows] = useState<DoctorProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DoctorProfileRow | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    setLoading(true);
    getAdminDoctors(role === "superadmin")
      .then(setRows)
      .finally(() => setLoading(false));
  };

  useEffect(load, [role]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">Equipo medico</p>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-none sm:text-5xl">Doctoras registradas</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Aqui pre-registras a cada doctora con su carnet unico. Cuando ella cree su cuenta con ese mismo carnet, el sistema le dara acceso como doctora automaticamente.
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
              <p className="mt-2 text-sm text-[var(--color-copy)]">CI: {doctor.document_number ?? "Sin carnet"}</p>
              <p className="mt-2 line-clamp-3 text-sm leading-7 text-[var(--color-copy)]">{doctor.bio}</p>
              <DeletedStatusNote row={doctor} />
              <div className="mt-4 inline-flex rounded-full bg-[rgba(216,194,174,0.24)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                {doctor.profile_id ? "Cuenta reclamada" : "Pendiente de registro"}
              </div>
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
                <DeleteActions
                  role={role}
                  row={doctor}
                  compact
                  onSoftDelete={() =>
                    void softDeleteRecord({
                      table: "doctor_profiles",
                      id: doctor.id,
                      actorId: profile?.id ?? user?.id ?? null,
                      actorRole: role,
                      actorName: profile?.full_name ?? user?.user_metadata.full_name ?? null,
                      actorEmail: profile?.email ?? user?.email ?? null,
                    }).then(load)
                  }
                  onRestore={() => void restoreRecord("doctor_profiles", doctor.id).then(load)}
                  onHardDelete={() => void hardDeleteRecord("doctor_profiles", doctor.id).then(load)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      {showForm ? (
        <DoctorForm
          row={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function DoctorForm({ row, onClose, onSaved }: { row: DoctorProfileRow | null; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string | boolean | null>>(() => ({
    ...emptyDoctor,
    ...(row ?? {}),
    profile_id: row?.profile_id ?? "",
    document_number: row?.document_number ?? "",
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

  const setValue = (name: string, value: string | boolean | null) => setValues((current) => ({ ...current, [name]: value }));

  const submit = async () => {
    try {
      setError("");

      const fullName = String(values.full_name ?? "").trim();
      const documentNumber = normalizeDocumentNumber(String(values.document_number ?? ""));

      if (fullName.length < 3) {
        setError("Escribe el nombre completo de la doctora.");
        return;
      }

      if (documentNumber.length < 5) {
        setError("Escribe un numero de carnet valido.");
        return;
      }

      const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === "" ? null : value]));
      payload.full_name = fullName;
      payload.document_number = documentNumber;

      if (row) {
        await updateDoctor(row.id, payload);
      } else {
        delete payload.profile_id;
        await createDoctor(payload);
      }

      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar la doctora.");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-6 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">{row ? "Editar" : "Registrar"}</p>
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
          <Field label="Numero de carnet / CI">
            <input
              value={String(values.document_number)}
              onChange={(event) => setValue("document_number", normalizeDocumentNumber(event.target.value))}
              className="premium-input"
              disabled={Boolean(row?.profile_id)}
            />
          </Field>
          <Field label="Especialidad">
            <input value={String(values.specialty)} onChange={(event) => setValue("specialty", event.target.value)} className="premium-input" />
          </Field>
          <Field label="Ciudad">
            <select value={String(values.city)} onChange={(event) => setValue("city", event.target.value)} className="premium-input">
              <option value="">Selecciona ciudad</option>
              {boliviaCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado de vinculacion">
            <input
              value={row?.profile_id ? `Cuenta conectada: ${row.profile_id}` : "Aun no reclamada por la doctora"}
              className="premium-input"
              readOnly
            />
          </Field>
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
            aspectRatio={4 / 5}
            helperText="Recomendado: imagen vertical 1200 x 1500 px o relacion 4:5, en JPG o PNG, bien iluminada y centrada."
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

        {!row ? (
          <div className="mt-6 rounded-[20px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.78)] px-4 py-3 text-sm leading-7 text-[var(--color-copy)]">
            Este formulario solo reserva el carnet y deja listo el perfil publico. La contraseña la crea la misma doctora cuando se registre por su cuenta.
          </div>
        ) : null}
        {error ? <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}
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
