import { useEffect, useMemo, useState } from "react";

import { MessageCircleMore, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getAdminCalendarEvents,
  updateCalendarEvent,
  type CalendarEventRow,
} from "../../services/calendarService";
import { createCourse, deleteCourse, getAdminCourses, updateCourse, type CourseRow } from "../../services/courseService";
import { getCourseEnrollments, updateEnrollmentStatus, type EnrollmentRow } from "../../services/enrollmentService";
import {
  createGalleryAlbum,
  deleteGalleryAlbum,
  getAdminGalleryAlbums,
  updateGalleryAlbum,
  type GalleryAlbumRow,
} from "../../services/galleryService";
import { getProfiles, updateProfileRole, type ProfileRow } from "../../services/profileService";
import {
  createPromotion,
  deletePromotion,
  getAdminPromotions,
  updatePromotion,
  type PromotionRow,
} from "../../services/promotionService";
import {
  getInformationRequests,
  updateInformationRequestNotes,
  updateInformationRequestStatus,
  type InformationRequestRow,
} from "../../services/requestService";
import {
  createTreatment,
  deleteTreatment,
  getAdminTreatments,
  updateTreatment,
  type TreatmentRow,
} from "../../services/treatmentService";
import { slugify } from "../../utils/text";
import { canManageUsers, roleLabels } from "../../lib/roles";
import { useAuth } from "../../hooks/useAuth";
import { boliviaCities } from "../../data/cities";

type Module =
  | "tratamientos"
  | "promociones"
  | "cursos"
  | "inscripciones"
  | "solicitudes"
  | "agenda"
  | "galeria"
  | "usuarios";

type Props = { module: Module };

type AdminRow =
  | TreatmentRow
  | PromotionRow
  | CourseRow
  | EnrollmentRow
  | InformationRequestRow
  | CalendarEventRow
  | GalleryAlbumRow
  | ProfileRow;

const requestStatuses = ["Nuevo", "Contactado", "Agendado", "Finalizado", "Descartado"];
const enrollmentStatuses = ["Pendiente", "Confirmado", "Cancelado", "Asistió"];
const eventTypes = ["Curso", "Procedimiento", "Cirugía", "Presentación", "Jornada", "Valoración"];
const userRoles = ["superadmin", "doctor", "admin", "assistant", "patient", "student", "user"] as const;

export function AdminCollectionPage({ module }: Props) {
  const { role } = useAuth();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ query: "", status: "Todos", city: "Todas", courseId: "Todos" });

  const load = () => {
    setLoading(true);
    setError(false);
    getRows(module)
      .then(setRows)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [module]);

  const filteredRows = useMemo(() => filterRows(module, rows, filters), [filters, module, rows]);

  if (module === "usuarios" && !canManageUsers(role)) {
    return (
      <div className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
          Acceso restringido
        </p>
        <h1 className="font-display mt-3 text-5xl font-semibold">
          Solo el superusuario puede gestionar roles.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--color-copy)]">
          Tu rol actual es {roleLabels[role]}. Puedes gestionar los módulos operativos,
          pero no cambiar permisos de usuarios.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">Administración</p>
          <h1 className="font-display mt-3 text-5xl font-semibold capitalize">{module}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Gestión conectada a Supabase con estados, filtros y formularios base.
          </p>
        </div>
        {isCrudModule(module) && (
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" />
            Crear
          </button>
        )}
      </div>

      {(module === "solicitudes" || module === "inscripciones") && (
        <AdminFilters module={module} rows={rows} filters={filters} setFilters={setFilters} />
      )}

      <div className="mt-8 rounded-[28px] border border-[var(--color-border)] bg-white/70 p-4">
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && filteredRows.length === 0 && <EmptyState />}
        {!loading && !error && filteredRows.length > 0 && (
          <div className="grid gap-3">
            {filteredRows.map((row) => (
              <AdminListRow
                key={row.id}
                module={module}
                row={row}
                onEdit={() => { setEditing(row); setShowForm(true); }}
                onDelete={() => void handleDelete(module, row.id).then(load)}
                onRefresh={load}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && isCrudModule(module) && (
        <AdminEntityForm
          module={module}
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

function AdminFilters({
  module,
  rows,
  filters,
  setFilters,
}: {
  module: Module;
  rows: AdminRow[];
  filters: { query: string; status: string; city: string; courseId: string };
  setFilters: (filters: { query: string; status: string; city: string; courseId: string }) => void;
}) {
  const cities = [...new Set(rows.map((row) => ("city" in row ? row.city : null)).filter(Boolean))];
  const courses = rows
    .filter((row): row is EnrollmentRow => "course_id" in row)
    .map((row) => ({ id: row.course_id, title: row.courses?.title ?? row.course_id }));

  return (
    <div className="mt-8 grid gap-3 md:grid-cols-4">
      <input
        value={filters.query}
        onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        placeholder="Buscar nombre, celular o interés"
        className="premium-input"
      />
      <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="premium-input">
        <option>Todos</option>
        {(module === "solicitudes" ? requestStatuses : enrollmentStatuses).map((status) => <option key={status}>{status}</option>)}
      </select>
      <select value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })} className="premium-input">
        <option>Todas</option>
        {cities.map((city) => <option key={city}>{city}</option>)}
      </select>
      {module === "inscripciones" && (
        <select value={filters.courseId} onChange={(event) => setFilters({ ...filters, courseId: event.target.value })} className="premium-input">
          <option>Todos</option>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
        </select>
      )}
    </div>
  );
}

function AdminListRow({
  module,
  row,
  onEdit,
  onDelete,
  onRefresh,
}: {
  module: Module;
  row: AdminRow;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const title = getTitle(module, row);
  const meta = getMeta(module, row);

  return (
    <div className="grid gap-4 rounded-[22px] bg-[rgba(247,242,236,0.72)] p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-copy)]">{meta}</p>
        {module === "solicitudes" && "internal_notes" in row && (
          <textarea
            defaultValue={row.internal_notes ?? ""}
            onBlur={(event) => void updateInformationRequestNotes(row.id, event.target.value).then(onRefresh)}
            placeholder="Notas internas"
            className="premium-input mt-3 min-h-20"
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {(module === "solicitudes" || module === "inscripciones") && "status" in row && (
          <select
            defaultValue={row.status}
            onChange={(event) =>
              void (module === "solicitudes"
                ? updateInformationRequestStatus(row.id, event.target.value)
                : updateEnrollmentStatus(row.id, event.target.value)
              ).then(onRefresh)
            }
            className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-2 text-sm"
          >
            {(module === "solicitudes" ? requestStatuses : enrollmentStatuses).map((status) => <option key={status}>{status}</option>)}
          </select>
        )}
        {(module === "solicitudes" || module === "inscripciones") && (
          <a href={whatsappHref(row)} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] p-3" aria-label="WhatsApp">
            <MessageCircleMore className="h-4 w-4" />
          </a>
        )}
        {isCrudModule(module) && (
          <>
            <button onClick={onEdit} className="rounded-full border border-[var(--color-border)] p-3" aria-label="Editar">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="rounded-full border border-[var(--color-border)] p-3" aria-label="Eliminar">
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
        {module === "usuarios" && "role" in row && (
          <select
            defaultValue={row.role ?? "user"}
            onChange={(event) => void updateProfileRole(row.id, event.target.value).then(onRefresh)}
            className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-2 text-sm"
          >
            {userRoles.map((roleOption) => (
              <option key={roleOption} value={roleOption}>
                {roleLabels[roleOption]}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function AdminEntityForm({
  module,
  row,
  onClose,
  onSaved,
}: {
  module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">;
  row: AdminRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string | boolean | number>>(() => getInitialValues(module, row));
  const [error, setError] = useState("");
  const fields = getFields(module);

  const setValue = (name: string, value: string | boolean | number) => {
    const next = { ...values, [name]: value };
    if (name === "title" && !row) next.slug = slugify(String(value));
    setValues(next);
  };

  const submit = async () => {
    try {
      setError("");
      const payload = normalizePayload(module, values);
      if (row) {
        await handleUpdate(module, row.id, payload);
      } else {
        await handleCreate(module, payload);
      }
      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo guardar el registro.");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-6 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">{row ? "Editar" : "Crear"}</p>
            <h2 className="font-display mt-2 text-4xl font-semibold capitalize">{module}</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] p-3"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field.name} className={field.type === "textarea" ? "md:col-span-2" : ""}>
              <span className="text-sm font-semibold">{field.label}</span>
              {field.type === "textarea" ? (
                <textarea value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2 min-h-28" />
              ) : field.type === "checkbox" ? (
                <input type="checkbox" checked={Boolean(values[field.name])} onChange={(event) => setValue(field.name, event.target.checked)} className="mt-4 block" />
              ) : field.name === "event_type" ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2">
                  {eventTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              ) : field.name === "city" ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2">
                  <option value="">Selecciona ciudad</option>
                  {boliviaCities.map((city) => <option key={city}>{city}</option>)}
                </select>
              ) : (
                <input type={field.type} value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, field.type === "number" ? Number(event.target.value) : event.target.value)} className="premium-input mt-2" />
              )}
            </label>
          ))}
        </div>
        {error && (
          <div className="mt-6 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}
        <button onClick={() => void submit()} className="mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
          <Save className="h-4 w-4" />
          Guardar
        </button>
      </div>
    </div>
  );
}

function isCrudModule(module: Module): module is Exclude<Module, "inscripciones" | "solicitudes" | "usuarios"> {
  return ["tratamientos", "promociones", "cursos", "agenda", "galeria"].includes(module);
}

async function getRows(module: Module): Promise<AdminRow[]> {
  if (module === "tratamientos") return getAdminTreatments();
  if (module === "promociones") return getAdminPromotions();
  if (module === "cursos") return getAdminCourses();
  if (module === "inscripciones") return getCourseEnrollments();
  if (module === "solicitudes") return getInformationRequests();
  if (module === "agenda") return getAdminCalendarEvents();
  if (module === "galeria") return getAdminGalleryAlbums();
  return getProfiles();
}

function filterRows(module: Module, rows: AdminRow[], filters: { query: string; status: string; city: string; courseId: string }) {
  const query = filters.query.toLowerCase();
  return rows.filter((row) => {
    const text = JSON.stringify(row).toLowerCase();
    const statusOk = filters.status === "Todos" || ("status" in row && row.status === filters.status);
    const cityOk = filters.city === "Todas" || ("city" in row && row.city === filters.city);
    const courseOk = module !== "inscripciones" || filters.courseId === "Todos" || ("course_id" in row && row.course_id === filters.courseId);
    return text.includes(query) && statusOk && cityOk && courseOk;
  });
}

function getTitle(module: Module, row: AdminRow) {
  if ("title" in row) return row.title;
  if ("full_name" in row && row.full_name) return row.full_name;
  if ("email" in row && row.email) return row.email;
  return module;
}

function getMeta(module: Module, row: AdminRow) {
  if (module === "solicitudes" && "interest_title" in row) return `${row.phone} · ${row.city ?? "Sin ciudad"} · ${row.interest_title ?? "General"}`;
  if (module === "inscripciones" && "courses" in row) return `${row.courses?.title ?? "Curso"} · ${row.phone ?? "Sin celular"} · ${row.status}`;
  if (module === "usuarios" && "role" in row) {
    return `${row.city ?? "Sin ciudad"} · ${roleLabels[(row.role as keyof typeof roleLabels) ?? "user"] ?? row.role}`;
  }
  if ("city" in row && row.city) return row.city;
  if ("is_active" in row) return row.is_active ? "Activo" : "Inactivo";
  return "Registro";
}

function whatsappHref(row: AdminRow) {
  const phone = "phone" in row ? row.phone ?? "" : "";
  const interest = "interest_title" in row ? row.interest_title ?? "tu solicitud" : "tu inscripción";
  const cleaned = phone.replace(/\D/g, "");
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(`Hola, te escribimos de parte de la Dra. sobre tu solicitud de información para ${interest}.`)}`;
}

function getFields(module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">) {
  const common = [
    { name: "title", label: "Título", type: "text" },
    { name: "slug", label: "Slug", type: "text" },
  ];
  if (module === "tratamientos") return [
    ...common,
    { name: "short_description", label: "Descripción corta", type: "textarea" },
    { name: "description", label: "Descripción completa", type: "textarea" },
    { name: "benefits", label: "Beneficios", type: "textarea" },
    { name: "duration", label: "Duración", type: "text" },
    { name: "care_instructions", label: "Cuidados", type: "textarea" },
    { name: "expected_results", label: "Resultados esperados", type: "textarea" },
    { name: "cover_image", label: "Imagen principal URL", type: "text" },
    { name: "city", label: "Ciudad", type: "text" },
    { name: "is_featured", label: "Destacado", type: "checkbox" },
    { name: "is_active", label: "Activo", type: "checkbox" },
  ];
  if (module === "promociones") return [
    ...common,
    { name: "description", label: "Descripción", type: "textarea" },
    { name: "cover_image", label: "Imagen URL", type: "text" },
    { name: "old_price", label: "Precio anterior", type: "number" },
    { name: "promo_price", label: "Precio promocional", type: "number" },
    { name: "city", label: "Ciudad", type: "text" },
    { name: "start_date", label: "Fecha inicio", type: "date" },
    { name: "end_date", label: "Fecha fin", type: "date" },
    { name: "available_slots", label: "Cupos", type: "number" },
    { name: "is_active", label: "Activa", type: "checkbox" },
  ];
  if (module === "cursos") return [
    ...common,
    { name: "short_description", label: "Descripción corta", type: "textarea" },
    { name: "description", label: "Descripción completa", type: "textarea" },
    { name: "cover_image", label: "Imagen URL", type: "text" },
    { name: "city", label: "Ciudad", type: "text" },
    { name: "start_date", label: "Fecha", type: "date" },
    { name: "start_time", label: "Hora", type: "time" },
    { name: "modality", label: "Modalidad", type: "text" },
    { name: "price", label: "Precio", type: "number" },
    { name: "available_slots", label: "Cupos", type: "number" },
    { name: "syllabus", label: "Temario", type: "textarea" },
    { name: "requirements", label: "Requisitos", type: "textarea" },
    { name: "certification", label: "Certificación", type: "textarea" },
    { name: "is_active", label: "Activo", type: "checkbox" },
  ];
  if (module === "agenda") return [
    ...common,
    { name: "city", label: "Ciudad", type: "text" },
    { name: "event_type", label: "Tipo", type: "text" },
    { name: "event_date", label: "Fecha", type: "date" },
    { name: "start_time", label: "Hora inicio", type: "time" },
    { name: "end_time", label: "Hora fin", type: "time" },
    { name: "location", label: "Lugar", type: "text" },
    { name: "description", label: "Descripción", type: "textarea" },
    { name: "cover_image", label: "Imagen URL", type: "text" },
    { name: "available_slots", label: "Cupos", type: "number" },
    { name: "is_active", label: "Activo", type: "checkbox" },
  ];
  return [
    ...common,
    { name: "city", label: "Ciudad", type: "text" },
    { name: "event_date", label: "Fecha", type: "date" },
    { name: "description", label: "Descripción", type: "textarea" },
    { name: "cover_image", label: "Imagen principal URL", type: "text" },
    { name: "is_featured", label: "Destacado", type: "checkbox" },
    { name: "is_active", label: "Activo", type: "checkbox" },
  ];
}

function getInitialValues(module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">, row: AdminRow | null) {
  const base = row ? { ...row } as Record<string, string | boolean | number> : { title: "", slug: "", is_active: true };
  if (module === "tratamientos") return { is_featured: false, ...base };
  if (module === "agenda") return { event_type: "Jornada", available_slots: 0, ...base };
  if (module === "galeria") return { is_featured: false, ...base };
  return base;
}

function normalizePayload(
  module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">,
  values: Record<string, string | boolean | number>
) {
  const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === "" ? null : value]));

  if (module === "agenda") {
    payload.date = payload.event_date;
    payload.time = payload.start_time;
    payload.active = payload.is_active ?? true;
    payload.image_url = payload.cover_image;
    payload.spots = payload.available_slots;
  }

  return payload;
}

async function handleCreate(module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">, payload: Record<string, unknown>) {
  if (module === "tratamientos") return createTreatment(payload);
  if (module === "promociones") return createPromotion(payload);
  if (module === "cursos") return createCourse(payload);
  if (module === "agenda") return createCalendarEvent(payload);
  return createGalleryAlbum(payload);
}

async function handleUpdate(module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">, id: string, payload: Record<string, unknown>) {
  if (module === "tratamientos") return updateTreatment(id, payload);
  if (module === "promociones") return updatePromotion(id, payload);
  if (module === "cursos") return updateCourse(id, payload);
  if (module === "agenda") return updateCalendarEvent(id, payload);
  return updateGalleryAlbum(id, payload);
}

async function handleDelete(module: Module, id: string) {
  if (module === "tratamientos") return deleteTreatment(id);
  if (module === "promociones") return deletePromotion(id);
  if (module === "cursos") return deleteCourse(id);
  if (module === "agenda") return deleteCalendarEvent(id);
  if (module === "galeria") return deleteGalleryAlbum(id);
}
