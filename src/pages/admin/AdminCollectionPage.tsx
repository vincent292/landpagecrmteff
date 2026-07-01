import { useEffect, useMemo, useRef, useState } from "react";

import { MessageCircleMore, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { GalleryMediaEditor } from "../../components/admin/GalleryMediaEditor";
import { PublicImageUpload } from "../../components/admin/PublicImageUpload";
import {
  createCalendarEvent,
  getAdminCalendarEvents,
  updateCalendarEvent,
  type CalendarEventRow,
} from "../../services/calendarService";
import { createCourse, getAdminCourses, updateCourse, type CourseRow } from "../../services/courseService";
import {
  approveEnrollmentPayment,
  getCourseEnrollmentReceiptUrl,
  getCourseEnrollments,
  updateEnrollmentNotes,
  updateEnrollmentStatus,
  type EnrollmentRow,
} from "../../services/enrollmentService";
import {
  createGalleryAlbum,
  getAdminGalleryAlbums,
  getGalleryMediaItems,
  updateGalleryAlbum,
  type GalleryDisplayMode,
  type GalleryAlbumRow,
  type GalleryMediaRow,
} from "../../services/galleryService";
import { getAdminDoctors, getMyDoctorProfile, type DoctorProfileRow } from "../../services/doctorService";
import { getProfiles, updateProfileRole, updateUserAccess, type ProfileRow } from "../../services/profileService";
import {
  createPromotion,
  getAdminPromotions,
  updatePromotion,
  type PromotionRow,
  type PromotionVariantInput,
} from "../../services/promotionService";
import {
  getInformationRequests,
  updateInformationRequestNotes,
  updateInformationRequestStatus,
  type InformationRequestRow,
} from "../../services/requestService";
import {
  createTreatment,
  getAdminTreatments,
  updateTreatment,
  type TreatmentRow,
} from "../../services/treatmentService";
import { careModeOptions } from "../../lib/careMode";
import { slugify } from "../../utils/text";
import { canManageUsers, isDoctorRole, roleLabels } from "../../lib/roles";
import { useAuth } from "../../hooks/useAuth";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";
import { boliviaCities } from "../../data/cities";
import { hardDeleteRecord, restoreRecord, softDeleteRecord, type DeletableTable, type DeletionMetadata } from "../../services/adminDeletionService";
import { supabase } from "../../lib/supabaseClient";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";

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

type EnrollmentApprovalDraft = {
  enrollmentId: string;
  studentName: string;
  courseTitle: string;
  amount: number;
  paymentMethod: string;
  notes: string;
};

type AdminListFilters = {
  query: string;
  status: string;
  city: string;
  date: string;
  courseId: string;
  interestType: string;
};

type AdminRow =
  | TreatmentRow
  | PromotionRow
  | CourseRow
  | EnrollmentRow
  | InformationRequestRow
  | CalendarEventRow
  | GalleryAlbumRow
  | ProfileRow;

const requestStatuses = ["Nuevo", "Enviado", "Cerrado"];
const enrollmentStatuses = ["Pendiente", "En revision", "Confirmado", "Rechazado", "Cancelado", "Asistió"];
const eventTypes = ["Curso", "Procedimiento", "Cirugía", "Presentación", "Jornada", "Valoración"];
const appointmentTypeOptions = ["Valoracion estetica", "Control", "Procedimiento", "Promocion directa", "Revision postratamiento", "Consulta general"];
const galleryCategories = ["Eventos", "Tratamientos", "Cursos", "Testimonios", "Antes y despues autorizados", "Videos"];
const userRoles = ["superadmin", "doctor", "doctor_inventory", "admin", "assistant", "patient", "student", "user"] as const;

function getModuleDisplayName(module: Module) {
  if (module === "cursos") return "Academy";
  if (module === "inscripciones") return "Inscripciones";
  return module;
}

export function AdminCollectionPage({ module }: Props) {
  const { role, profile, user } = useAuth();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useWorkspaceState<AdminListFilters>(`admin:${module}:filters`, () => getDefaultFilters(module), {
    ttlMs: 1000 * 60 * 60 * 8,
  });
  const [pendingRealtime, setPendingRealtime] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [enrollmentApproval, setEnrollmentApproval] = useState<EnrollmentApprovalDraft | null>(null);
  const [savingApproval, setSavingApproval] = useState(false);
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [doctorProfileResolved, setDoctorProfileResolved] = useState(!isDoctorRole(role));
  const listRef = useRef<HTMLDivElement | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      getRows(module, role === "superadmin", isDoctorRole(role) ? doctorProfileId : null),
      module === "inscripciones" ? getCashPaymentMethods(true) : Promise.resolve([] as CashPaymentMethodRow[]),
    ])
      .then(([loadedRows, methods]) => {
        setRows(loadedRows);
        setPaymentMethods(methods);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isDoctorRole(role) || !profile?.id) {
      setDoctorProfileId(null);
      setDoctorProfileResolved(true);
      return;
    }

    setDoctorProfileResolved(false);
    getMyDoctorProfile(profile.id)
      .then((doctor) => setDoctorProfileId(doctor?.id ?? null))
      .catch(() => setDoctorProfileId(null))
      .finally(() => setDoctorProfileResolved(true));
  }, [profile?.id, role]);

  useEffect(() => {
    if (isDoctorRole(role) && !doctorProfileResolved) return;
    load();
  }, [doctorProfileId, doctorProfileResolved, module, role]);

  useEffect(() => {
    if (module !== "inscripciones" && module !== "solicitudes") return;

    const table = module === "inscripciones" ? "course_enrollments" : "information_requests";
    const isEditingListField = () => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) return false;
      if (!listRef.current?.contains(activeElement)) return false;
      return ["TEXTAREA", "INPUT", "SELECT"].includes(activeElement.tagName);
    };

    const syncRows = () => {
      if (isEditingListField()) {
        setPendingRealtime(true);
        return;
      }

      setPendingRealtime(false);
      load();
    };

    const channel = supabase
      .channel(`admin-live-list:${module}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, syncRows)
      .subscribe();

    const handleFocusChange = () => {
      if (!pendingRealtime) return;
      if (isEditingListField()) return;
      setPendingRealtime(false);
      load();
    };

    document.addEventListener("focusin", handleFocusChange);
    document.addEventListener("click", handleFocusChange);

    return () => {
      document.removeEventListener("focusin", handleFocusChange);
      document.removeEventListener("click", handleFocusChange);
      void supabase.removeChannel(channel);
    };
  }, [module, pendingRealtime, role]);

  const filteredRows = useMemo(() => filterRows(module, rows, filters), [filters, module, rows]);

  const openEnrollmentApproval = (row: EnrollmentRow) => {
    setEnrollmentApproval({
      enrollmentId: row.id,
      studentName: row.full_name ?? row.email ?? "Alumno",
      courseTitle: row.courses?.title ?? "Academy",
      amount: Number(row.payment_amount ?? row.courses?.price ?? 0),
      paymentMethod: row.payment_method ?? paymentMethods.find((method) => method.is_default)?.code ?? "qr",
      notes: row.admin_notes ?? "",
    });
  };

  const submitEnrollmentApproval = async () => {
    if (!enrollmentApproval || enrollmentApproval.amount <= 0) return;
    setSavingApproval(true);
    try {
      await approveEnrollmentPayment(enrollmentApproval.enrollmentId, {
        adminNotes: enrollmentApproval.notes,
        paymentAmount: enrollmentApproval.amount,
        paymentMethod: enrollmentApproval.paymentMethod,
      });
      setEnrollmentApproval(null);
      load();
    } finally {
      setSavingApproval(false);
    }
  };

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
          <h1 className="font-display mt-3 text-5xl font-semibold capitalize">{getModuleDisplayName(module)}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Gestion centralizada con estados, filtros y formularios listos para operar.
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

      <div ref={listRef} className="mt-8 rounded-[28px] border border-[var(--color-border)] bg-white/70 p-4">
        {pendingRealtime ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[rgba(184,138,90,0.18)] bg-[rgba(255,249,244,0.84)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              Llegaron cambios nuevos en tiempo real. Los aplicamos apenas termines de escribir.
            </p>
            <button
              type="button"
              onClick={() => {
                setPendingRealtime(false);
                load();
              }}
              className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white"
            >
              Actualizar ahora
            </button>
          </div>
        ) : null}
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && filteredRows.length === 0 && <EmptyState />}
        {!loading && !error && filteredRows.length > 0 && (
          <div className="grid gap-3">
            {filteredRows.map((row) =>
              module === "solicitudes" ? (
                <RequestListRow
                  key={row.id}
                  row={row as InformationRequestRow}
                  role={role}
                  actorId={profile?.id ?? user?.id ?? null}
                  actorName={profile?.full_name ?? user?.user_metadata.full_name ?? null}
                  actorEmail={profile?.email ?? user?.email ?? null}
                  onRefresh={load}
                />
              ) : (
                <AdminListRow
                  key={row.id}
                  module={module}
                  row={row}
                  onEdit={() => { setEditing(row); setShowForm(true); }}
                  role={role}
                  actorId={profile?.id ?? user?.id ?? null}
                  actorName={profile?.full_name ?? user?.user_metadata.full_name ?? null}
                  actorEmail={profile?.email ?? user?.email ?? null}
                  onRefresh={load}
                  onOpenEnrollmentApproval={module === "inscripciones" ? (selectedRow) => openEnrollmentApproval(selectedRow as EnrollmentRow) : undefined}
                />
              )
            )}
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

      {enrollmentApproval ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
          <div className="w-full max-w-2xl rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Inscripciones</p>
                <h2 className="font-display mt-2 text-4xl font-semibold">Aprobar inscripcion Academy</h2>
              </div>
              <button onClick={() => setEnrollmentApproval(null)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                Cerrar
              </button>
            </div>
            <div className="mt-6 grid gap-4">
              <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">{enrollmentApproval.courseTitle}</p>
                <p className="mt-2 text-lg font-semibold">{enrollmentApproval.studentName}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">Monto pagado</span>
                  <input type="number" min={0} step="0.01" value={String(enrollmentApproval.amount)} onChange={(event) => setEnrollmentApproval({ ...enrollmentApproval, amount: Number(event.target.value) })} className="premium-input" />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-semibold">Metodo de pago</span>
                  <select value={enrollmentApproval.paymentMethod} onChange={(event) => setEnrollmentApproval({ ...enrollmentApproval, paymentMethod: event.target.value })} className="premium-input">
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.code}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Notas administrativas</span>
                <textarea value={enrollmentApproval.notes} onChange={(event) => setEnrollmentApproval({ ...enrollmentApproval, notes: event.target.value })} className="premium-input min-h-28" />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => void submitEnrollmentApproval()} disabled={savingApproval} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {savingApproval ? "Guardando..." : "Aprobar, bajar cupo y mandar a caja"}
              </button>
              <button onClick={() => setEnrollmentApproval(null)} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  filters: AdminListFilters;
  setFilters: (filters: AdminListFilters) => void;
}) {
  if (module === "solicitudes") {
    return <RequestFilters rows={rows as InformationRequestRow[]} filters={filters} setFilters={setFilters} />;
  }

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
        {enrollmentStatuses.map((status) => <option key={status}>{status}</option>)}
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

function RequestFilters({
  rows,
  filters,
  setFilters,
}: {
  rows: InformationRequestRow[];
  filters: AdminListFilters;
  setFilters: (filters: AdminListFilters) => void;
}) {
  const typeOptions = ["Todos", ...new Set(rows.map((row) => row.interest_type ?? "General"))];
  const cities = [...new Set(rows.map((row) => row.city).filter(Boolean))];
  const counts = {
    all: rows.length,
    Nuevo: rows.filter((row) => normalizeRequestStatus(row.status) === "Nuevo").length,
    Enviado: rows.filter((row) => normalizeRequestStatus(row.status) === "Enviado").length,
    Cerrado: rows.filter((row) => normalizeRequestStatus(row.status) === "Cerrado").length,
  };

  return (
    <section className="mt-8 rounded-[28px] border border-[var(--color-border)] bg-white/70 p-4 sm:p-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <RequestStatCard label="Nuevas" value={counts.Nuevo} active={filters.status === "Nuevo"} onClick={() => setFilters({ ...filters, status: "Nuevo" })} />
        <RequestStatCard label="Enviadas" value={counts.Enviado} active={filters.status === "Enviado"} onClick={() => setFilters({ ...filters, status: "Enviado" })} />
        <RequestStatCard label="Cerradas" value={counts.Cerrado} active={filters.status === "Cerrado"} onClick={() => setFilters({ ...filters, status: "Cerrado" })} />
        <RequestStatCard label="Todas" value={counts.all} active={filters.status === "Todos"} onClick={() => setFilters({ ...filters, status: "Todos" })} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {typeOptions.map((interestType) => (
          <button
            key={interestType}
            type="button"
            onClick={() => setFilters({ ...filters, interestType })}
            className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
              filters.interestType === interestType
                ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
                : "border-[var(--color-border)] bg-white/80 text-[var(--color-ink)]"
            }`}
          >
            {interestType}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_210px_auto]">
        <input
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          placeholder="Buscar nombre, título, celular o ciudad"
          className="premium-input"
        />
        <input
          type="date"
          value={filters.date}
          onChange={(event) => setFilters({ ...filters, date: event.target.value })}
          className="premium-input"
        />
        <select value={filters.city} onChange={(event) => setFilters({ ...filters, city: event.target.value })} className="premium-input">
          <option value="Todas">Todas las ciudades</option>
          {cities.map((city) => <option key={city} value={city ?? ""}>{city}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setFilters({ ...filters, date: "" })}
          className="rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold"
        >
          {filters.date ? "Ver todas las fechas" : "Sin filtro de fecha"}
        </button>
      </div>
    </section>
  );
}

function RequestStatCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[22px] border p-4 text-left transition ${
        active
          ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white"
          : "border-[var(--color-border)] bg-[rgba(247,242,236,0.78)] text-[var(--color-ink)]"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${active ? "text-white/80" : "text-[var(--color-copy)]"}`}>{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </button>
  );
}

function AdminListRow({
  module,
  row,
  role,
  actorId,
  actorName,
  actorEmail,
  onEdit,
  onRefresh,
  onOpenEnrollmentApproval,
}: {
  module: Module;
  row: AdminRow;
  role: ReturnType<typeof useAuth>["role"];
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  onEdit: () => void;
  onRefresh: () => void;
  onOpenEnrollmentApproval?: (row: AdminRow) => void;
}) {
  const [editingUserAccess, setEditingUserAccess] = useState(false);
  const title = getTitle(module, row);
  const meta = getMeta(module, row);
  const tableName = getDeleteTableName(module);
  const deletionRow = row as AdminRow & DeletionMetadata;

  const handleSoftDelete = async () => {
    if (!tableName) return;
    await softDeleteRecord({
      table: tableName,
      id: row.id,
      actorId,
      actorRole: role,
      actorName,
      actorEmail,
    });
    onRefresh();
  };

  const handleRestore = async () => {
    if (!tableName) return;
    await restoreRecord(tableName, row.id);
    onRefresh();
  };

  const handleHardDelete = async () => {
    if (!tableName) return;
    await hardDeleteRecord(tableName, row.id);
    onRefresh();
  };

  const openEnrollmentReceipt = async () => {
    if (!("payment_receipt_path" in row) || !row.payment_receipt_path) return;
    const url = await getCourseEnrollmentReceiptUrl(row.payment_receipt_path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="grid gap-4 rounded-[22px] bg-[rgba(247,242,236,0.72)] p-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-copy)]">{meta}</p>
        {module === "usuarios" && "email" in row ? (
          <div className="mt-3 rounded-[18px] bg-white/80 px-4 py-3 text-sm text-[var(--color-copy)]">
            <p>
              <span className="font-semibold text-[var(--color-ink)]">Correo de acceso:</span>{" "}
              {row.email ?? "Sin correo"}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-[var(--color-ink)]">Usuario ID:</span> {row.id}
            </p>
          </div>
        ) : null}
        <DeletedStatusNote row={deletionRow} />
        {module === "inscripciones" && "payment_receipt_path" in row ? (
          <p className="mt-2 text-sm text-[var(--color-copy)]">
            {row.payment_receipt_path ? "Comprobante cargado por el alumno." : "Aun no se cargo comprobante."}
          </p>
        ) : null}
        {module === "solicitudes" && "internal_notes" in row && (
          <textarea
            defaultValue={row.internal_notes ?? ""}
            onBlur={(event) => void updateInformationRequestNotes(row.id, event.target.value).then(onRefresh)}
            placeholder="Notas internas"
            className="premium-input mt-3 min-h-20"
          />
        )}
        {module === "inscripciones" && "admin_notes" in row ? (
          <textarea
            defaultValue={row.admin_notes ?? ""}
            onBlur={(event) => void updateEnrollmentNotes(row.id, event.target.value).then(onRefresh)}
            placeholder="Notas internas"
            className="premium-input mt-3 min-h-20"
          />
        ) : null}
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
        {(module === "solicitudes" || module === "inscripciones") && "status" in row && (
          <select
            defaultValue={row.status}
            onChange={(event) => {
              if (module === "inscripciones" && event.target.value === "Confirmado" && onOpenEnrollmentApproval) {
                onOpenEnrollmentApproval(row);
                return;
              }

              void (module === "solicitudes"
                ? updateInformationRequestStatus(row.id, event.target.value)
                : updateEnrollmentStatus(row.id, event.target.value)
              ).then(onRefresh);
            }}
            className="rounded-full border border-[var(--color-border)] bg-white/70 px-3 py-2 text-sm"
          >
            {(module === "solicitudes" ? requestStatuses : enrollmentStatuses).map((status) => <option key={status}>{status}</option>)}
          </select>
        )}
        {module === "inscripciones" && "payment_receipt_path" in row && row.payment_receipt_path ? (
          <button onClick={() => void openEnrollmentReceipt()} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
            Ver comprobante
          </button>
        ) : null}
        {module === "inscripciones" && "payment_receipt_path" in row && row.payment_receipt_path && row.status !== "Confirmado" ? (
          <button onClick={() => onOpenEnrollmentApproval?.(row)} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
            Aprobar
          </button>
        ) : null}
        {module === "inscripciones" && "payment_receipt_path" in row && row.payment_receipt_path && row.status !== "Rechazado" ? (
          <button onClick={() => void updateEnrollmentStatus(row.id, "Rechazado").then(onRefresh)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
            Rechazar
          </button>
        ) : null}
        {module === "inscripciones" && "status" in row && row.status === "Confirmado" ? (
          <a
            href={whatsappHref(row, module)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[rgb(36,120,86)] px-4 py-2 text-sm font-semibold text-white"
          >
            <MessageCircleMore className="h-4 w-4" />
            WhatsApp aprobado
          </a>
        ) : null}
        {(module === "solicitudes" || module === "inscripciones") && (
          <a href={whatsappHref(row, module)} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] p-3" aria-label="WhatsApp">
            <MessageCircleMore className="h-4 w-4" />
          </a>
        )}
        {isCrudModule(module) && (
          <>
            <button onClick={onEdit} className="rounded-full border border-[var(--color-border)] p-3" aria-label="Editar">
              <Pencil className="h-4 w-4" />
            </button>
            <DeleteActions
              role={role}
              row={deletionRow}
              compact
              onSoftDelete={() => void handleSoftDelete()}
              onRestore={() => void handleRestore()}
              onHardDelete={() => void handleHardDelete()}
            />
          </>
        )}
        {(module === "inscripciones" || module === "solicitudes") && tableName ? (
          <DeleteActions
            role={role}
            row={deletionRow}
            compact
            onSoftDelete={() => void handleSoftDelete()}
            onRestore={() => void handleRestore()}
            onHardDelete={() => void handleHardDelete()}
          />
        ) : null}
        {module === "usuarios" && "role" in row && (
          <>
            <button
              type="button"
              onClick={() => setEditingUserAccess(true)}
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
            >
              Editar acceso
            </button>
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
          </>
        )}
      </div>
      </div>
      {module === "usuarios" && "role" in row ? (
        <UserAccessModal
          open={editingUserAccess}
          row={row}
          onClose={() => setEditingUserAccess(false)}
          onSaved={() => {
            setEditingUserAccess(false);
            onRefresh();
          }}
        />
      ) : null}
    </>
  );
}

function UserAccessModal({
  open,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  row: ProfileRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(row.full_name ?? "");
  const [email, setEmail] = useState(row.email ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [city, setCity] = useState(row.city ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFullName(row.full_name ?? "");
    setEmail(row.email ?? "");
    setPhone(row.phone ?? "");
    setCity(row.city ?? "");
    setPassword("");
    setConfirmPassword("");
    setError("");
  }, [open, row.city, row.email, row.full_name, row.phone]);

  if (!open) return null;

  const submit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("El correo es obligatorio.");
      return;
    }

    if (password && password.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setError("La confirmación de contraseña no coincide.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await updateUserAccess({
        userId: row.id,
        email: normalizedEmail,
        fullName,
        phone,
        city,
        password: password || null,
      });
      onSaved();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "No se pudo actualizar el acceso del usuario."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
              Usuarios
            </p>
            <h2 className="font-display mt-2 text-4xl font-semibold">Editar acceso</h2>
            <p className="mt-2 text-sm text-[var(--color-copy)]">
              Aqui puedes cambiar el correo de ingreso y forzar una nueva contraseña si hace falta.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
            Cerrar
          </button>
        </div>

        {error ? (
          <div className="mt-6 rounded-[20px] border border-[rgba(154,107,67,0.2)] bg-[rgba(154,107,67,0.08)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Nombre</span>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="premium-input" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Correo / usuario</span>
            <input value={email} onChange={(event) => setEmail(event.target.value)} className="premium-input" type="email" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Celular</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} className="premium-input" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Ciudad</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} className="premium-input" />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Nueva contraseña</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="premium-input"
              type="password"
              placeholder="Deja vacio si no vas a cambiarla"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Confirmar contraseña</span>
            <input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="premium-input"
              type="password"
              placeholder="Repite la nueva contraseña"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Guardar acceso"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function RequestListRow({
  row,
  role,
  actorId,
  actorName,
  actorEmail,
  onRefresh,
}: {
  row: InformationRequestRow;
  role: ReturnType<typeof useAuth>["role"];
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  onRefresh: () => void;
}) {
  const deletionRow = row as InformationRequestRow & DeletionMetadata;
  const normalizedStatus = normalizeRequestStatus(row.status);
  const phone = row.phone.replace(/\D/g, "");
  const price = extractPriceFromRequest(row);
  const whatsappMessage = row.whatsapp_prefill_message?.trim() || `Hola ${row.full_name}, te escribimos sobre tu solicitud para ${row.interest_title ?? row.interest_type ?? "General"}.`;

  const saveNotes = async (value: string) => {
    await updateInformationRequestNotes(row.id, value);
    onRefresh();
  };

  const updateStatus = async (status: string) => {
    await updateInformationRequestStatus(row.id, status);
    onRefresh();
  };

  const handleSoftDelete = async () => {
    await softDeleteRecord({
      table: "information_requests",
      id: row.id,
      actorId,
      actorRole: role,
      actorName,
      actorEmail,
    });
    onRefresh();
  };

  const handleRestore = async () => {
    await restoreRecord("information_requests", row.id);
    onRefresh();
  };

  const handleHardDelete = async () => {
    await hardDeleteRecord("information_requests", row.id);
    onRefresh();
  };

  return (
    <article className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4 shadow-[0_14px_36px_rgba(62,42,31,0.06)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(216,194,174,0.28)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
              {row.interest_type ?? "General"}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${normalizedStatus === "Nuevo" ? "bg-[rgba(124,90,57,0.12)] text-[var(--color-mocha)]" : normalizedStatus === "Enviado" ? "bg-[rgba(42,128,93,0.14)] text-[rgb(36,120,86)]" : "bg-[rgba(76,85,99,0.14)] text-slate-700"}`}>
              {normalizedStatus}
            </span>
          </div>

          <h2 className="mt-3 text-xl font-semibold text-[var(--color-ink)]">{row.full_name}</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--color-copy)]">{row.interest_title ?? "Solicitud general"}</p>
          <div className="mt-4 grid gap-3 text-sm text-[var(--color-copy)] sm:grid-cols-2 xl:grid-cols-3">
            <InfoMini label="Nombre" value={row.full_name} />
            <InfoMini label="Título" value={row.interest_title ?? "General"} />
            <InfoMini label="Tipo" value={row.interest_type ?? "General"} />
            <InfoMini label="Ciudad" value={row.city ?? "Sin ciudad"} />
            <InfoMini label="Fecha" value={formatRequestDate(row.created_at)} />
            <InfoMini label="Precio" value={price ?? "No especificado"} />
          </div>

          {row.message ? (
            <div className="mt-4 rounded-[18px] bg-white/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">Mensaje del paciente</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{row.message}</p>
            </div>
          ) : null}

          <textarea
            defaultValue={row.internal_notes ?? ""}
            onBlur={(event) => void saveNotes(event.target.value)}
            placeholder="Notas internas"
            className="premium-input mt-4 min-h-24"
          />
        </div>

        <div className="flex w-full flex-col gap-2 xl:w-[280px]">
          <a
            href={`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[rgb(36,120,86)] px-4 py-3 text-sm font-semibold text-white"
          >
            <MessageCircleMore className="h-4 w-4" />
            Abrir WhatsApp
          </a>
          {normalizedStatus !== "Enviado" ? (
            <button type="button" onClick={() => void updateStatus("Enviado")} className="rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold">
              Marcar como enviado
            </button>
          ) : null}
          {normalizedStatus !== "Cerrado" ? (
            <button type="button" onClick={() => void updateStatus("Cerrado")} className="rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold">
              Cerrar solicitud
            </button>
          ) : null}
          {normalizedStatus !== "Nuevo" ? (
            <button type="button" onClick={() => void updateStatus("Nuevo")} className="rounded-full border border-[var(--color-border)] px-4 py-3 text-sm font-semibold">
              Volver a nueva
            </button>
          ) : null}
          <DeleteActions
            role={role}
            row={deletionRow}
            compact
            onSoftDelete={() => void handleSoftDelete()}
            onRestore={() => void handleRestore()}
            onHardDelete={() => void handleHardDelete()}
          />
        </div>
      </div>
    </article>
  );
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] bg-white/72 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-1 break-words font-semibold text-[var(--color-ink)]">{value}</p>
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
  const { role, profile } = useAuth();
  const [values, setValues] = useState<Record<string, string | boolean | number>>(() => getInitialValues(module, row));
  const [promotionVariants, setPromotionVariants] = useState<PromotionVariantInput[]>(() => getInitialPromotionVariants(module, row));
  const [galleryItems, setGalleryItems] = useState<GalleryMediaRow[]>(() => getInitialGalleryItems(module, row));
  const [error, setError] = useState("");
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const fields = getFields(module);
  const needsDoctor = requiresDoctorAssignment(module);
  const galleryMode = module === "galeria"
    ? ((values.display_mode as GalleryDisplayMode | undefined) ?? "carousel")
    : "carousel";
  const galleryFolder = useMemo(() => {
    if (module !== "galeria") return "";
    const slug = String(values.slug ?? "").trim() || slugify(String(values.title ?? "")) || "galeria";
    return `gallery/${slug}`;
  }, [module, values.slug, values.title]);

  useEffect(() => {
    if (!isDoctorRole(role) || !profile?.id) return;

    getMyDoctorProfile(profile.id)
      .then((doctor) => setDoctorProfileId(doctor?.id ?? null))
      .catch(() => setDoctorProfileId(null));
  }, [profile?.id, role]);

  useEffect(() => {
    if (!needsDoctor) return;

    getAdminDoctors(role === "superadmin")
      .then(setDoctors)
      .catch(() => setDoctors([]));
  }, [needsDoctor, role]);

  useEffect(() => {
    if (!needsDoctor) return;

    const currentDoctorId = typeof values.doctor_id === "string" ? values.doctor_id : "";

    if (isDoctorRole(role) && doctorProfileId && currentDoctorId !== doctorProfileId) {
      setValues((current) => ({ ...current, doctor_id: doctorProfileId }));
      return;
    }

    if (currentDoctorId) return;

    if (row && "doctor_id" in row && typeof row.doctor_id === "string" && row.doctor_id) {
      const rowDoctorId = row.doctor_id;
      setValues((current) => ({ ...current, doctor_id: rowDoctorId }));
      return;
    }

    if (doctorProfileId) {
      setValues((current) => ({ ...current, doctor_id: doctorProfileId }));
      return;
    }

    if (doctors.length === 1) {
      setValues((current) => ({ ...current, doctor_id: doctors[0].id }));
    }
  }, [doctorProfileId, doctors, needsDoctor, role, row, values.doctor_id]);

  useEffect(() => {
    setValues(getInitialValues(module, row));
    setPromotionVariants(getInitialPromotionVariants(module, row));
    setGalleryItems(getInitialGalleryItems(module, row));
    setError("");
  }, [module, row]);

  const setValue = (name: string, value: string | boolean | number) => {
    const next = { ...values, [name]: value };
    if (name === "requires_assessment" && value === false) {
      next.assessment_mode = "presencial";
      next.assessment_price = 0;
      next.assessment_price_presencial = 0;
      next.assessment_price_virtual = 0;
    }
    if (name === "title" && !row) next.slug = slugify(String(value));
    if (module === "galeria" && name === "display_mode" && value === "comparison") {
      next.category = "Antes y despues autorizados";
    }
    setValues(next);
  };

  const submit = async () => {
    try {
      setError("");
      const selectedDoctorId =
        isDoctorRole(role)
          ? doctorProfileId
          : typeof values.doctor_id === "string" && values.doctor_id
            ? values.doctor_id
            : null;

      if (needsDoctor && !selectedDoctorId) {
        setError("Selecciona una doctora antes de guardar este registro.");
        return;
      }

      if (module === "tratamientos" && Boolean(values.allows_direct_booking)) {
        if (Number(values.treatment_price ?? 0) <= 0) {
          setError("Define un precio del tratamiento para permitir pago directo.");
          return;
        }
        if (Boolean(values.allows_partial_payment)) {
          const percent = Number(values.partial_payment_percent ?? 0);
          if (percent <= 0 || percent > 100) {
            setError("El porcentaje de anticipo debe estar entre 1 y 100.");
            return;
          }
        }
      }

      const payload = normalizePayload(module, values, selectedDoctorId);
      if (module === "galeria") {
        const publicGalleryItems = galleryItems.filter((item) => item.image_url?.trim());
        if (galleryMode === "comparison" && publicGalleryItems.length < 2) {
          setError("La comparacion necesita dos imagenes publicas: antes y despues.");
          return;
        }
        if (galleryMode === "carousel" && publicGalleryItems.length === 0) {
          setError("El carrusel necesita al menos una imagen o video.");
          return;
        }

        const firstImage = publicGalleryItems.find((item) => item.media_type !== "video") ?? null;
        const firstVideo = publicGalleryItems.find((item) => item.media_type === "video") ?? null;

        payload.display_mode = galleryMode;
        payload.category =
          galleryMode === "comparison"
            ? "Antes y despues autorizados"
            : payload.category ?? "Eventos";
        payload.cover_image = firstImage?.image_url ?? null;
        payload.video_url = galleryMode === "carousel" ? firstVideo?.image_url ?? null : null;
        payload.gallery_images = publicGalleryItems;
      }

      const cleanPromotionVariants =
        module === "promociones"
          ? promotionVariants
              .map((variant) => ({
                ...variant,
                title: variant.title.trim(),
                price_total: Number(variant.price_total ?? 0),
                available_slots: Number(variant.available_slots ?? 0),
                partial_payment_percent: Number(variant.partial_payment_percent ?? 0),
              }))
              .filter((variant) => variant.title.length > 0 && variant.price_total > 0)
          : [];
      if (row) {
        await handleUpdate(module, row.id, payload, cleanPromotionVariants);
      } else {
        await handleCreate(module, payload, cleanPromotionVariants);
      }
      onSaved();
    } catch (submitError) {
      console.error(`Error guardando ${module}`, { rowId: row?.id, values, submitError });
      setError(formatSubmitError(submitError));
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">{row ? "Editar" : "Crear"}</p>
            <h2 className="font-display mt-2 text-4xl font-semibold capitalize">{module}</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] p-3"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {fields
            .filter((field) => {
              if (field.name === "assessment_mode") {
                return Boolean(values.requires_assessment);
              }
              if (field.name === "assessment_price" || field.name === "assessment_price_presencial") {
                return Boolean(values.requires_assessment) && values.assessment_mode !== "virtual";
              }
              if (field.name === "assessment_price_virtual") {
                return Boolean(values.requires_assessment) && values.assessment_mode !== "presencial";
              }
              if (module === "tratamientos" && ["treatment_price", "available_slots", "allows_partial_payment"].includes(field.name)) {
                return Boolean(values.allows_direct_booking);
              }
              if (module === "tratamientos" && field.name === "partial_payment_percent") {
                return Boolean(values.allows_direct_booking) && Boolean(values.allows_partial_payment);
              }
              return true;
            })
            .map((field) => (
            <label key={field.name} className={field.type === "textarea" ? "md:col-span-2" : ""}>
              <span className="text-sm font-semibold">{field.label}</span>
              {field.type === "textarea" ? (
                <textarea value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2 min-h-28" />
              ) : field.type === "image" ? (
                <div className="mt-2">
                  <PublicImageUpload
                    label={field.label}
                    value={String(values[field.name] ?? "")}
                    folder={module}
                    aspectRatio={getUploadAspectRatio(module)}
                    onChange={(url) => setValue(field.name, url)}
                  />
                </div>
              ) : field.name === "doctor_id" ? (
                <select
                  value={String(values[field.name] ?? "")}
                  onChange={(event) => setValue(field.name, event.target.value)}
                  className="premium-input mt-2"
                  disabled={isDoctorRole(role) && Boolean(doctorProfileId)}
                >
                  <option value="">{doctors.length > 0 ? "Selecciona doctora" : "Sin doctoras disponibles"}</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.full_name}
                    </option>
                  ))}
                </select>
              ) : field.type === "checkbox" ? (
                <input type="checkbox" checked={Boolean(values[field.name])} onChange={(event) => setValue(field.name, event.target.checked)} className="mt-4 block" />
              ) : field.name === "event_type" ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2">
                  {eventTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              ) : field.type === "select-gallery-category" ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2">
                  {galleryCategories.map((type) => <option key={type}>{type}</option>)}
                </select>
              ) : field.type === "select-gallery-display" ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2">
                  <option value="carousel">Carrusel publico</option>
                  <option value="comparison">Comparacion antes y despues</option>
                </select>
              ) : field.type === "select-agenda-mode" ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2">
                  <option value="none">No agenda cita</option>
                  <option value="coordinate">Coordinar por WhatsApp</option>
                  <option value="choose_slot">Elegir horario disponible</option>
                </select>
              ) : field.type === "select-care-mode" ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2">
                  {careModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "select-appointment-type" ? (
                <select value={String(values[field.name] ?? "")} onChange={(event) => setValue(field.name, event.target.value)} className="premium-input mt-2">
                  {appointmentTypeOptions.map((type) => <option key={type}>{type}</option>)}
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
        {(module === "tratamientos" || module === "promociones") && Boolean(values.requires_assessment) ? (
          <div className="mt-6 rounded-[24px] border border-[rgba(184,138,90,0.18)] bg-[rgba(255,249,244,0.84)] p-4 text-sm leading-7 text-[var(--color-copy)]">
            <p className="font-semibold text-[var(--color-ink)]">Como llenar esta parte</p>
            <p className="mt-2">
              Si la doctora atendera la misma hora tanto presencial como virtual, elige <strong className="text-[var(--color-ink)]">Presencial y virtual</strong>. Luego define un precio para cada modalidad y usa en disponibilidad el mismo criterio para que la paciente vea solo los horarios compatibles.
            </p>
            <p className="mt-2">
              El <strong className="text-[var(--color-ink)]">tipo de cita en agenda</strong> debe coincidir con el que uses al crear la disponibilidad de valoracion.
            </p>
          </div>
        ) : null}
        {module === "promociones" ? (
          <PromotionVariantsEditor variants={promotionVariants} onChange={setPromotionVariants} />
        ) : null}
        {module === "galeria" ? (
          <GalleryMediaEditor
            mode={galleryMode}
            baseFolder={galleryFolder}
            items={galleryItems}
            onChange={setGalleryItems}
          />
        ) : null}
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

async function getRows(module: Module, includeDeleted: boolean, doctorId?: string | null): Promise<AdminRow[]> {
  if (module === "tratamientos") return getAdminTreatments(includeDeleted, doctorId);
  if (module === "promociones") return getAdminPromotions(includeDeleted, doctorId);
  if (module === "cursos") return getAdminCourses(includeDeleted, doctorId);
  if (module === "inscripciones") return getCourseEnrollments(includeDeleted);
  if (module === "solicitudes") return getInformationRequests(includeDeleted);
  if (module === "agenda") return getAdminCalendarEvents(includeDeleted, doctorId);
  if (module === "galeria") return getAdminGalleryAlbums(includeDeleted, doctorId);
  return getProfiles(includeDeleted);
}

function getUploadAspectRatio(module: Module) {
  if (module === "galeria") return 16 / 10;
  return 4 / 5;
}

function PromotionVariantsEditor({
  variants,
  onChange,
}: {
  variants: PromotionVariantInput[];
  onChange: (variants: PromotionVariantInput[]) => void;
}) {
  const addVariant = () => {
    onChange([
      ...variants,
      {
        title: "",
        price_total: 0,
        available_slots: 0,
        allows_partial_payment: true,
        partial_payment_percent: 50,
        is_active: true,
      },
    ]);
  };

  const updateVariant = (index: number, patch: Partial<PromotionVariantInput>) => {
    onChange(variants.map((variant, currentIndex) => (currentIndex === index ? { ...variant, ...patch } : variant)));
  };

  const removeVariant = (index: number) => {
    onChange(variants.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <section className="mt-8 rounded-[24px] border border-[var(--color-border)] bg-white/65 p-4 md:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">Opciones de la promocion</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-copy)]">Agrega cada tratamiento o paquete con su precio y cupos.</p>
        </div>
        <button type="button" onClick={addVariant} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" />
          Agregar opcion
        </button>
      </div>

      <div className="mt-5 grid gap-4">
        {variants.map((variant, index) => (
          <div key={variant.id ?? `variant-${index}`} className="rounded-[20px] border border-[rgba(198,162,123,0.18)] bg-[rgba(247,242,236,0.72)] p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_120px_120px_150px_120px_auto] lg:items-end">
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Titulo de la opcion</span>
                <input
                  value={variant.title}
                  onChange={(event) => updateVariant(index, { title: event.target.value })}
                  className="premium-input"
                  placeholder="Limpieza Facial Premium + Vitamina C"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Precio</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(variant.price_total)}
                  onChange={(event) => updateVariant(index, { price_total: Number(event.target.value) })}
                  className="premium-input"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Cupos</span>
                <input
                  type="number"
                  min={0}
                  value={String(variant.available_slots)}
                  onChange={(event) => updateVariant(index, { available_slots: Number(event.target.value) })}
                  className="premium-input"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Anticipo</span>
                <select
                  value={variant.allows_partial_payment ? "si" : "no"}
                  onChange={(event) => updateVariant(index, { allows_partial_payment: event.target.value === "si" })}
                  className="premium-input"
                >
                  <option value="si">Permite</option>
                  <option value="no">No permite</option>
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-semibold">% anticipo</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={String(variant.partial_payment_percent)}
                  onChange={(event) => updateVariant(index, { partial_payment_percent: Number(event.target.value) })}
                  className="premium-input"
                  disabled={!variant.allows_partial_payment}
                />
              </label>
              <button
                type="button"
                onClick={() => removeVariant(index)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-red-200 text-red-700"
                aria-label="Quitar opcion"
                title="Quitar opcion"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {variant.id ? (
              <p className="mt-3 text-xs text-[var(--color-copy)]">ID interno: {variant.id}</p>
            ) : null}
          </div>
        ))}
        {variants.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[var(--color-border)] bg-white/60 p-5 text-sm text-[var(--color-copy)]">
            Todavia no hay opciones. Agrega la primera para que aparezca en la landing.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function filterRows(module: Module, rows: AdminRow[], filters: AdminListFilters) {
  const query = filters.query.toLowerCase();
  return rows.filter((row) => {
    const text = JSON.stringify(row).toLowerCase();
    const statusOk =
      (module !== "solicitudes" && module !== "inscripciones") ||
      filters.status === "Todos" ||
      ("status" in row &&
        (module === "solicitudes"
          ? normalizeRequestStatus(row.status) === filters.status
          : row.status === filters.status));
    const cityOk = filters.city === "Todas" || ("city" in row && row.city === filters.city);
    const courseOk = module !== "inscripciones" || filters.courseId === "Todos" || ("course_id" in row && row.course_id === filters.courseId);
    const interestTypeOk =
      module !== "solicitudes" ||
      filters.interestType === "Todos" ||
      ("interest_type" in row && (row.interest_type ?? "General") === filters.interestType);
    const dateOk =
      module !== "solicitudes" ||
      !filters.date ||
      ("created_at" in row && toInputDate(row.created_at) === filters.date);
    return text.includes(query) && statusOk && cityOk && courseOk && interestTypeOk && dateOk;
  });
}

function getDefaultFilters(module: Module): AdminListFilters {
  return {
    query: "",
    status: module === "solicitudes" ? "Nuevo" : "Todos",
    city: "Todas",
    date: "",
    courseId: "Todos",
    interestType: "Todos",
  };
}

function getTitle(module: Module, row: AdminRow) {
  if ("title" in row) return row.title;
  if ("full_name" in row && row.full_name) return row.full_name;
  if ("email" in row && row.email) return row.email;
  return module;
}

function getMeta(module: Module, row: AdminRow) {
  if (module === "solicitudes" && "interest_title" in row) return `${row.phone} · ${row.city ?? "Sin ciudad"} · ${row.interest_title ?? "General"}`;
  if (module === "inscripciones" && "courses" in row) return `${row.courses?.title ?? "Academy"} · ${row.phone ?? "Sin celular"} · ${row.status} · ${row.payment_receipt_path ? "Con comprobante" : "Sin comprobante"}`;
  if (module === "usuarios" && "role" in row) {
    return `${row.city ?? "Sin ciudad"} · ${roleLabels[(row.role as keyof typeof roleLabels) ?? "user"] ?? row.role}`;
  }
  if ("city" in row && row.city) return row.city;
  if ("is_active" in row) return row.is_active ? "Activo" : "Inactivo";
  return "Registro";
}

function whatsappHref(row: AdminRow, module: Module) {
  const phone = "phone" in row ? row.phone ?? "" : "";
  const cleaned = phone.replace(/\D/g, "");

  if (module === "inscripciones" && "courses" in row) {
    const studentName = row.full_name?.trim() || "hola";
    const courseTitle = row.courses?.title ?? "tu programa de Academy";

    if (row.status === "Confirmado") {
      return `https://wa.me/${cleaned}?text=${encodeURIComponent(`Hola ${studentName}, tu inscripción a Academy en "${courseTitle}" fue aprobada. Ingresa a tu plataforma para ver recursos, actualizaciones y proximos pasos.`)}`;
    }

    return `https://wa.me/${cleaned}?text=${encodeURIComponent(`Hola ${studentName}, te escribimos de parte de la Dra. sobre tu inscripcion a Academy en "${courseTitle}".`)}`;
  }

  if (module === "solicitudes" && "whatsapp_prefill_message" in row && row.whatsapp_prefill_message?.trim()) {
    return `https://wa.me/${cleaned}?text=${encodeURIComponent(row.whatsapp_prefill_message)}`;
  }

  const interest = "interest_title" in row ? row.interest_title ?? "tu solicitud" : "tu solicitud";
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(`Hola, te escribimos de parte de la Dra. sobre tu solicitud de información para ${interest}.`)}`;
}

function normalizeRequestStatus(status?: string | null) {
  const value = (status ?? "").trim().toLowerCase();
  if (value === "enviado" || value === "contactado" || value === "agendado") return "Enviado";
  if (value === "cerrado" || value === "finalizado" || value === "descartado") return "Cerrado";
  return "Nuevo";
}

function toInputDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function formatRequestDate(value: string) {
  return new Date(value).toLocaleString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractPriceFromRequest(row: InformationRequestRow) {
  const match = row.whatsapp_prefill_message?.match(/(\d+[.,]?\d*)/);
  if (!match) return null;
  return `Bs. ${match[1]}`;
}

const assessmentFields = [
  { name: "requires_assessment", label: "Requiere valoracion previa", type: "checkbox" },
  { name: "assessment_mode", label: "La valoracion sera", type: "select-care-mode" },
  { name: "assessment_price_presencial", label: "Precio valoracion presencial", type: "number" },
  { name: "assessment_price_virtual", label: "Precio valoracion virtual", type: "number" },
] as const;

function getFields(module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">) {
  const common = [
    { name: "title", label: "Título", type: "text" },
    { name: "slug", label: "Slug", type: "text" },
  ];
  if (module === "tratamientos") return [
    ...common,
    { name: "doctor_id", label: "Doctora", type: "select-doctor" },
    { name: "short_description", label: "Descripción corta", type: "textarea" },
    { name: "description", label: "Descripción completa", type: "textarea" },
    { name: "public_info", label: "Informacion visible para solicitud", type: "textarea" },
    { name: "whatsapp_prefill_message", label: "Mensaje predeterminado WhatsApp", type: "textarea" },
    { name: "benefits", label: "Beneficios", type: "textarea" },
    { name: "duration", label: "Duración", type: "text" },
    { name: "care_instructions", label: "Cuidados", type: "textarea" },
    { name: "expected_results", label: "Resultados esperados", type: "textarea" },
    { name: "cover_image", label: "Imagen principal", type: "image" },
    { name: "city", label: "Ciudad", type: "text" },
    ...assessmentFields,
    { name: "allows_direct_booking", label: "Permite optar y pagar directo", type: "checkbox" },
    { name: "treatment_price", label: "Precio del tratamiento", type: "number" },
    { name: "available_slots", label: "Cupos para pago directo", type: "number" },
    { name: "allows_partial_payment", label: "Permite anticipo", type: "checkbox" },
    { name: "partial_payment_percent", label: "Porcentaje de anticipo", type: "number" },
    { name: "agenda_mode", label: "Agenda", type: "select-agenda-mode" },
    { name: "appointment_type", label: "Tipo de cita agenda", type: "select-appointment-type" },
    { name: "agenda_tag", label: "Tag de agenda opcional", type: "text" },
    { name: "is_featured", label: "Destacado", type: "checkbox" },
    { name: "is_active", label: "Activo", type: "checkbox" },
  ];
  if (module === "promociones") return [
    ...common,
    { name: "doctor_id", label: "Doctora", type: "select-doctor" },
    { name: "description", label: "Descripción", type: "textarea" },
    { name: "public_info", label: "Informacion visible para solicitud", type: "textarea" },
    { name: "whatsapp_prefill_message", label: "Mensaje predeterminado WhatsApp", type: "textarea" },
    { name: "cover_image", label: "Imagen", type: "image" },
    { name: "old_price", label: "Precio anterior", type: "number" },
    { name: "promo_price", label: "Precio promocional", type: "number" },
    { name: "city", label: "Ciudad", type: "text" },
    { name: "start_date", label: "Fecha inicio", type: "date" },
    { name: "end_date", label: "Fecha fin", type: "date" },
    { name: "available_slots", label: "Cupos", type: "number" },
    ...assessmentFields,
    { name: "allows_direct_booking", label: "Permite pedir y pagar directo", type: "checkbox" },
    { name: "agenda_mode", label: "Agenda", type: "select-agenda-mode" },
    { name: "appointment_type", label: "Tipo de cita agenda", type: "select-appointment-type" },
    { name: "agenda_tag", label: "Tag de agenda opcional", type: "text" },
    { name: "allows_partial_payment", label: "Permite anticipo", type: "checkbox" },
    { name: "partial_payment_percent", label: "Porcentaje de anticipo", type: "number" },
    { name: "is_active", label: "Activa", type: "checkbox" },
  ];
  if (module === "cursos") return [
    ...common,
    { name: "doctor_id", label: "Doctora", type: "select-doctor" },
    { name: "short_description", label: "Descripción corta", type: "textarea" },
    { name: "description", label: "Descripción completa", type: "textarea" },
    { name: "cover_image", label: "Imagen", type: "image" },
    { name: "city", label: "Ciudad", type: "text" },
    { name: "public_info", label: "Informacion visible para solicitud", type: "textarea" },
    { name: "whatsapp_prefill_message", label: "Mensaje predeterminado WhatsApp", type: "textarea" },
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
    { name: "doctor_id", label: "Doctora", type: "select-doctor" },
    { name: "city", label: "Ciudad", type: "text" },
    { name: "event_type", label: "Tipo", type: "text" },
    { name: "event_date", label: "Fecha", type: "date" },
    { name: "start_time", label: "Hora inicio", type: "time" },
    { name: "end_time", label: "Hora fin", type: "time" },
    { name: "location", label: "Lugar", type: "text" },
    { name: "description", label: "Descripción", type: "textarea" },
    { name: "cover_image", label: "Imagen", type: "image" },
    { name: "available_slots", label: "Cupos", type: "number" },
    { name: "is_active", label: "Activo", type: "checkbox" },
  ];
  return [
    ...common,
    { name: "doctor_id", label: "Doctora", type: "select-doctor" },
    { name: "city", label: "Ciudad", type: "text" },
    { name: "event_date", label: "Fecha", type: "date" },
    { name: "category", label: "Categoria", type: "select-gallery-category" },
    { name: "display_mode", label: "Modo visual", type: "select-gallery-display" },
    { name: "treatment_name", label: "Tratamiento relacionado", type: "text" },
    { name: "description", label: "Descripción", type: "textarea" },
    { name: "is_featured", label: "Destacado", type: "checkbox" },
    { name: "is_active", label: "Activo", type: "checkbox" },
  ];
}

function getInitialValues(module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">, row: AdminRow | null) {
  const fields = getFields(module);
  const defaults: Record<string, string | boolean | number> = {};

  fields.forEach((field) => {
    if (field.type === "checkbox") {
      defaults[field.name] = field.name === "is_active";
      return;
    }

    if (field.type === "number") {
      defaults[field.name] = field.name === "partial_payment_percent" ? 50 : 0;
      return;
    }

    if (field.name === "event_type") {
      defaults[field.name] = "Jornada";
      return;
    }

    if (field.name === "category") {
      defaults[field.name] = "Eventos";
      return;
    }

    if (field.name === "display_mode") {
      defaults[field.name] = "carousel";
      return;
    }

    if (field.name === "agenda_mode") {
      defaults[field.name] = module === "promociones" ? "choose_slot" : "coordinate";
      return;
    }

    if (field.name === "appointment_type") {
      defaults[field.name] = module === "promociones" ? "Promocion directa" : "Valoracion estetica";
      return;
    }

    if (field.name === "assessment_mode") {
      defaults[field.name] = "presencial";
      return;
    }

    defaults[field.name] = "";
  });

  if (!row) return defaults;

  const next = { ...defaults };
  fields.forEach((field) => {
    const value = row[field.name as keyof typeof row];
    if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") {
      next[field.name] = value;
    } else if (value == null) {
      if (field.type === "checkbox") next[field.name] = false;
      else if (field.type === "number") next[field.name] = 0;
      else next[field.name] = "";
    }
  });

  if (module === "tratamientos" && Number(next.treatment_price ?? 0) <= 0) {
    const legacyPrice = Number((row as { direct_booking_price?: number | null }).direct_booking_price ?? 0);
    if (legacyPrice > 0) next.treatment_price = legacyPrice;
  }

  return next;
}

function getInitialGalleryItems(
  module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">,
  row: AdminRow | null
) {
  if (module !== "galeria" || !row) return [];
  return "gallery_images" in row ? getGalleryMediaItems(row as GalleryAlbumRow) : [];
}

function getInitialPromotionVariants(
  module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">,
  row: AdminRow | null
) {
  if (module !== "promociones" || !row || !("promotion_variants" in row)) return [];

  return ((row as PromotionRow).promotion_variants ?? []).map((variant) => ({
    id: variant.id,
    title: variant.title,
    price_total: Number(variant.price_total ?? 0),
    available_slots: Number(variant.available_slots ?? 0),
    allows_partial_payment: Boolean(variant.allows_partial_payment),
    partial_payment_percent: Number(variant.partial_payment_percent ?? 0),
    is_active: variant.is_active,
  }));
}

function requiresDoctorAssignment(module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">) {
  return ["tratamientos", "promociones", "cursos", "agenda", "galeria"].includes(module);
}

function normalizePayload(
  module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">,
  values: Record<string, string | boolean | number>,
  doctorProfileId: string | null = null
) {
  const allowedFields = new Set(getFields(module).map((field) => field.name));
  const payload: Record<string, unknown> = Object.fromEntries(
    Object.entries(values)
      .filter(([key]) => allowedFields.has(key))
      .map(([key, value]) => [key, value === "" ? null : value])
  );

  if (requiresDoctorAssignment(module)) {
    payload.doctor_id = doctorProfileId;
  }

  if (module === "tratamientos" || module === "promociones") {
    if (module === "tratamientos" && !values.allows_direct_booking) {
      payload.direct_booking_price = null;
      payload.direct_booking_label = null;
    }

    if (!values.requires_assessment) {
      payload.assessment_mode = "presencial";
      payload.assessment_price = null;
      payload.assessment_price_presencial = null;
      payload.assessment_price_virtual = null;
    } else {
      const assessmentMode = String(values.assessment_mode || "presencial");
      const presencialPrice = Number(values.assessment_price_presencial ?? 0);
      const virtualPrice = Number(values.assessment_price_virtual ?? 0);

      payload.assessment_mode = assessmentMode;
      payload.assessment_price_presencial = assessmentMode === "virtual" ? null : presencialPrice;
      payload.assessment_price_virtual = assessmentMode === "presencial" ? null : virtualPrice;
      payload.assessment_price = resolveAssessmentPriceForLegacyField(
        assessmentMode,
        presencialPrice,
        virtualPrice
      );
    }
  }

  if (module === "tratamientos") {
    if (!values.allows_direct_booking) {
      payload.treatment_price = null;
      payload.direct_booking_price = null;
      payload.direct_booking_label = null;
      payload.available_slots = 0;
      payload.allows_partial_payment = false;
      payload.partial_payment_percent = 50;
    } else {
      const treatmentPrice = Number(values.treatment_price ?? 0);
      payload.treatment_price = treatmentPrice;
      payload.direct_booking_price = treatmentPrice;
      payload.available_slots = Number(values.available_slots ?? 0);
      payload.allows_partial_payment = Boolean(values.allows_partial_payment);
      payload.partial_payment_percent = Number(values.partial_payment_percent ?? 50);
    }
  }

  if (module === "agenda") {
    payload.date = payload.event_date;
    payload.time = payload.start_time;
    payload.active = payload.is_active ?? true;
    payload.image_url = payload.cover_image;
    payload.spots = payload.available_slots;
  }

  return payload;
}

function resolveAssessmentPriceForLegacyField(
  mode: string,
  presencialPrice: number,
  virtualPrice: number
) {
  if (mode === "virtual") return virtualPrice;
  if (mode === "ambas") return presencialPrice || virtualPrice || 0;
  return presencialPrice;
}

function formatSubmitError(error: unknown) {
  if (error && typeof error === "object") {
    const maybeSupabase = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    const parts = [
      maybeSupabase.message,
      maybeSupabase.details,
      maybeSupabase.hint,
      maybeSupabase.code ? `Codigo: ${maybeSupabase.code}` : undefined,
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(" · ");
  }

  return error instanceof Error ? error.message : "No se pudo guardar el registro.";
}

async function handleCreate(
  module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">,
  payload: Record<string, unknown>,
  promotionVariants: PromotionVariantInput[] = []
) {
  if (module === "tratamientos") return createTreatment(payload);
  if (module === "promociones") return createPromotion(payload, promotionVariants);
  if (module === "cursos") return createCourse(payload);
  if (module === "agenda") return createCalendarEvent(payload);
  return createGalleryAlbum(payload);
}

async function handleUpdate(
  module: Exclude<Module, "inscripciones" | "solicitudes" | "usuarios">,
  id: string,
  payload: Record<string, unknown>,
  promotionVariants: PromotionVariantInput[] = []
) {
  if (module === "tratamientos") return updateTreatment(id, payload);
  if (module === "promociones") return updatePromotion(id, payload, promotionVariants);
  if (module === "cursos") return updateCourse(id, payload);
  if (module === "agenda") return updateCalendarEvent(id, payload);
  return updateGalleryAlbum(id, payload);
}

function getDeleteTableName(module: Module): DeletableTable | null {
  if (module === "tratamientos") return "treatments";
  if (module === "promociones") return "promotions";
  if (module === "cursos") return "courses";
  if (module === "agenda") return "calendar_events";
  if (module === "galeria") return "gallery_albums";
  if (module === "inscripciones") return "course_enrollments";
  if (module === "solicitudes") return "information_requests";
  if (module === "usuarios") return "profiles";
  return null;
}

