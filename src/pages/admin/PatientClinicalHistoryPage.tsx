import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, ClipboardList, FileText, PackageMinus, Pencil, Printer, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { canSoftDelete, softDeleteRecord } from "../../services/adminDeletionService";
import {
  createClinicalEvolution,
  createClinicalHistory,
  getClinicalEvolutions,
  getClinicalHistoriesByPatient,
  getClinicalInventoryUsages,
  recordClinicalInventoryUsage,
  updateClinicalHistory,
  type ClinicalNoteType,
} from "../../services/clinicalHistoryService";
import { getAdminDoctors, getMyDoctorProfile, type DoctorProfileRow } from "../../services/doctorService";
import { getInventoryItems, getInventoryLots, type InventoryItemRow, type InventoryLotRow } from "../../services/inventoryService";
import { getPatientById } from "../../services/patientService";
import { getPatientPhotos, uploadPatientPhoto, type PatientPhotoRow } from "../../services/patientPhotoService";
import { formatPublicTime } from "../../utils/publicContent";
import { formatDate } from "../../utils/text";

const maxPhotoSize = 20 * 1024 * 1024;

const noteTypes: Array<{ id: ClinicalNoteType; label: string; title: string }> = [
  { id: "historia_base", label: "Historia clinica", title: "Historia clinica base" },
  { id: "preconsulta", label: "Preconsulta", title: "Evaluacion previa" },
  { id: "procedimiento", label: "Procedimiento", title: "Atencion realizada" },
  { id: "postconsulta", label: "Postconsulta", title: "Control posterior" },
];

const tabs = [
  { id: "resumen", label: "Resumen" },
  ...noteTypes.map((item) => ({ id: item.id, label: item.label })),
  { id: "insumos", label: "Insumos" },
  { id: "fotos", label: "Fotos" },
  { id: "documentos", label: "Documentos" },
] as const;

const noteSchema = z.object({
  note_type: z.enum(["historia_base", "preconsulta", "procedimiento", "postconsulta"]),
  doctor_id: z.string().min(1, "Selecciona la doctora responsable"),
  session_title: z.string().min(3, "Escribe el titulo clinico"),
  session_date: z.string().min(1, "Selecciona la fecha"),
  session_time: z.string().optional(),
  reason_for_consultation: z.string().min(3, "Describe el motivo o contexto"),
  medical_history: z.string().optional(),
  allergies: z.string().optional(),
  current_medications: z.string().optional(),
  previous_procedures: z.string().optional(),
  diagnosis: z.string().optional(),
  treatment_plan: z.string().optional(),
  procedure_details: z.string().optional(),
  pre_consultation_notes: z.string().optional(),
  post_consultation_notes: z.string().optional(),
  consent_notes: z.string().optional(),
  observations: z.string().optional(),
  internal_notes: z.string().optional(),
  photo_type: z.enum(["antes", "despues", "evolucion", "otro"]),
  photo_notes: z.string().optional(),
  is_visible_to_patient: z.boolean(),
});

const evolutionSchema = z.object({
  clinical_history_id: z.string().min(1, "Selecciona la nota clinica"),
  doctor_id: z.string().min(1, "Selecciona la doctora responsable"),
  title: z.string().min(3, "Escribe el titulo del control"),
  description: z.string().min(6, "Describe la evolucion"),
  treatment_performed: z.string().optional(),
  recommendations: z.string().optional(),
});

type NoteValues = z.infer<typeof noteSchema>;
type EvolutionValues = z.infer<typeof evolutionSchema>;
type PendingPhoto = { file: File; previewUrl: string };
type ActiveTab = (typeof tabs)[number]["id"];

function getTodayValue() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatClinicalTime(value?: string | null, fallbackDateTime?: string | null) {
  if (value) return formatPublicTime(value);
  if (!fallbackDateTime) return "Hora no registrada";
  return new Date(fallbackDateTime).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
}

function formatInventoryNumber(value?: number | string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toLocaleString("es-BO", { maximumFractionDigits: 2 });
}

function formatPresentationHint(item?: InventoryItemRow | null, lot?: InventoryLotRow | null) {
  const unitsPerPresentation = Number(lot?.units_per_presentation ?? item?.units_per_presentation ?? 0);
  const hasPresentation = Boolean(lot?.presentation_unit_id ?? item?.presentation_unit_id);
  if (!item || !hasPresentation || unitsPerPresentation <= 1) return null;
  return `Cada presentacion equivale a ${formatInventoryNumber(unitsPerPresentation)} ${item.unit}.`;
}

function emptyNote(doctorId = "", noteType: ClinicalNoteType = "procedimiento"): NoteValues {
  return {
    note_type: noteType,
    doctor_id: doctorId,
    session_title: noteType === "historia_base" ? "Historia clinica base" : "",
    session_date: getTodayValue(),
    session_time: getCurrentTimeValue(),
    reason_for_consultation: "",
    medical_history: "",
    allergies: "",
    current_medications: "",
    previous_procedures: "",
    diagnosis: "",
    treatment_plan: "",
    procedure_details: "",
    pre_consultation_notes: "",
    post_consultation_notes: "",
    consent_notes: "",
    observations: "",
    internal_notes: "",
    photo_type: "evolucion",
    photo_notes: "",
    is_visible_to_patient: false,
  };
}

function revokePendingPhotoUrls(photos: PendingPhoto[]) {
  photos.forEach((item) => URL.revokeObjectURL(item.previewUrl));
}

export function PatientClinicalHistoryPage() {
  const { id = "" } = useParams();
  const { user, role, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("resumen");
  const [patient, setPatient] = useState<Awaited<ReturnType<typeof getPatientById>> | null>(null);
  const [histories, setHistories] = useState<Awaited<ReturnType<typeof getClinicalHistoriesByPatient>>>([]);
  const [evolutions, setEvolutions] = useState<Awaited<ReturnType<typeof getClinicalEvolutions>>>([]);
  const [photos, setPhotos] = useState<Awaited<ReturnType<typeof getPatientPhotos>>>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRow[]>([]);
  const [inventoryLots, setInventoryLots] = useState<InventoryLotRow[]>([]);
  const [inventoryUsages, setInventoryUsages] = useState<Awaited<ReturnType<typeof getClinicalInventoryUsages>>>([]);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [myDoctorProfile, setMyDoctorProfile] = useState<DoctorProfileRow | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [inventoryForm, setInventoryForm] = useState({
    clinical_history_id: "",
    item_id: "",
    lot_id: "",
    quantity: 1,
    notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingEvolution, setSavingEvolution] = useState(false);
  const [savingInventory, setSavingInventory] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const noteForm = useForm<NoteValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: emptyNote(),
  });

  const evolutionForm = useForm<EvolutionValues>({
    resolver: zodResolver(evolutionSchema),
    defaultValues: {
      clinical_history_id: "",
      doctor_id: "",
      title: "",
      description: "",
      treatment_performed: "",
      recommendations: "",
    },
  });

  const resetPendingPhotos = () => {
    setPendingPhotos((current) => {
      revokePendingPhotoUrls(current);
      return [];
    });
  };

  const currentDoctorId = role === "doctor" ? myDoctorProfile?.id ?? "" : noteForm.getValues("doctor_id");
  const doctorReadOnly = role === "doctor";

  const resetNoteForm = (noteType: ClinicalNoteType = "procedimiento") => {
    noteForm.reset(emptyNote(role === "doctor" ? myDoctorProfile?.id ?? "" : "", noteType));
    setEditingHistoryId(null);
    resetPendingPhotos();
  };

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const [patientRow, historyRows, evolutionRows, photoRows, itemRows, lotRows, usageRows, doctorRows, myDoctorRow] = await Promise.all([
        getPatientById(id),
        getClinicalHistoriesByPatient(id),
        getClinicalEvolutions(id),
        getPatientPhotos(id),
        getInventoryItems(role === "superadmin"),
        getInventoryLots(role === "superadmin"),
        getClinicalInventoryUsages(id),
        role === "doctor" ? Promise.resolve([] as DoctorProfileRow[]) : getAdminDoctors(role === "superadmin"),
        user?.id ? getMyDoctorProfile(user.id) : Promise.resolve(null),
      ]);

      setPatient(patientRow);
      setHistories(historyRows);
      setEvolutions(evolutionRows);
      setPhotos(photoRows);
      setInventoryItems(itemRows);
      setInventoryLots(lotRows);
      setInventoryUsages(usageRows);
      setDoctors(doctorRows);
      setMyDoctorProfile(myDoctorRow);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id, role, user?.id]);

  useEffect(() => {
    const doctorId = role === "doctor" ? myDoctorProfile?.id ?? "" : "";
    if (doctorId) {
      noteForm.setValue("doctor_id", doctorId);
      evolutionForm.setValue("doctor_id", doctorId);
    }

    const latestProcedure = histories.find((item) => (item.note_type ?? "procedimiento") === "procedimiento") ?? histories[0];
    if (latestProcedure?.id && !evolutionForm.getValues("clinical_history_id")) {
      evolutionForm.setValue("clinical_history_id", latestProcedure.id);
      setInventoryForm((current) => ({ ...current, clinical_history_id: latestProcedure.id }));
    }
  }, [evolutionForm, histories, myDoctorProfile?.id, noteForm, role]);

  useEffect(() => {
    return () => revokePendingPhotoUrls(pendingPhotos);
  }, [pendingPhotos]);

  const doctorOptions = useMemo(() => {
    if (role === "doctor") return myDoctorProfile ? [myDoctorProfile] : [];
    return doctors.filter((doctor) => !doctor.is_deleted && doctor.is_active);
  }, [doctors, myDoctorProfile, role]);

  const activeNoteType = noteTypes.some((item) => item.id === activeTab) ? (activeTab as ClinicalNoteType) : "procedimiento";
  const notesByType = useMemo(() => {
    return noteTypes.reduce<Record<ClinicalNoteType, typeof histories>>((accumulator, item) => {
      accumulator[item.id] = histories.filter((history) => (history.note_type ?? "procedimiento") === item.id);
      return accumulator;
    }, {} as Record<ClinicalNoteType, typeof histories>);
  }, [histories]);

  const photosByHistory = useMemo(() => {
    return photos.reduce<Record<string, PatientPhotoRow[]>>((accumulator, photo) => {
      if (!photo.clinical_history_id) return accumulator;
      accumulator[photo.clinical_history_id] = accumulator[photo.clinical_history_id] ?? [];
      accumulator[photo.clinical_history_id].push(photo);
      return accumulator;
    }, {});
  }, [photos]);

  const evolutionsByHistory = useMemo(() => {
    return evolutions.reduce<Record<string, typeof evolutions>>((accumulator, evolution) => {
      if (!evolution.clinical_history_id) return accumulator;
      accumulator[evolution.clinical_history_id] = accumulator[evolution.clinical_history_id] ?? [];
      accumulator[evolution.clinical_history_id].push(evolution);
      return accumulator;
    }, {});
  }, [evolutions]);

  const usagesByHistory = useMemo(() => {
    return inventoryUsages.reduce<Record<string, typeof inventoryUsages>>((accumulator, usage) => {
      if (!usage.clinical_history_id) return accumulator;
      accumulator[usage.clinical_history_id] = accumulator[usage.clinical_history_id] ?? [];
      accumulator[usage.clinical_history_id].push(usage);
      return accumulator;
    }, {});
  }, [inventoryUsages]);

  const filteredLots = inventoryLots.filter((lot) => lot.item_id === inventoryForm.item_id && !lot.is_deleted && Number(lot.current_quantity) > 0);
  const selectedItem = inventoryItems.find((item) => item.id === inventoryForm.item_id) ?? null;

  const canManageHistory = (doctorId?: string | null) => {
    if (role === "superadmin" || role === "admin") return true;
    if (role === "doctor" && myDoctorProfile?.id) return doctorId === myDoctorProfile.id;
    return false;
  };

  const onSelectFiles = (fileList: FileList | null) => {
    if (!fileList?.length) {
      resetPendingPhotos();
      return;
    }

    const nextPending: PendingPhoto[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) {
        setStatus({ type: "error", text: "Solo se permiten imagenes." });
        continue;
      }
      if (file.size > maxPhotoSize) {
        setStatus({ type: "error", text: "Cada imagen debe pesar menos de 20 MB." });
        continue;
      }
      nextPending.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    resetPendingPhotos();
    setPendingPhotos(nextPending);
    if (nextPending.length > 0) setStatus(null);
  };

  const saveNote = noteForm.handleSubmit(async (values) => {
    setSavingNote(true);
    setStatus(null);
    try {
      const payload = {
        patient_id: id,
        created_by: user?.id ?? null,
        doctor_id: values.doctor_id,
        note_type: values.note_type,
        session_title: values.session_title,
        session_date: values.session_date,
        session_time: values.session_time || null,
        reason_for_consultation: values.reason_for_consultation,
        medical_history: values.medical_history || null,
        allergies: values.allergies || null,
        current_medications: values.current_medications || null,
        previous_procedures: values.previous_procedures || null,
        diagnosis: values.diagnosis || null,
        treatment_plan: values.treatment_plan || null,
        procedure_details: values.procedure_details || null,
        pre_consultation_notes: values.pre_consultation_notes || null,
        post_consultation_notes: values.post_consultation_notes || null,
        consent_notes: values.consent_notes || null,
        observations: values.observations || null,
        internal_notes: values.internal_notes || null,
      };

      const savedRow = editingHistoryId ? await updateClinicalHistory(editingHistoryId, payload) : await createClinicalHistory(payload);

      if (pendingPhotos.length > 0) {
        await Promise.all(
          pendingPhotos.map((pendingPhoto) =>
            uploadPatientPhoto(pendingPhoto.file, id, {
              clinical_history_id: savedRow.id,
              uploaded_by: user?.id ?? null,
              doctor_id: values.doctor_id,
              photo_type: values.photo_type,
              treatment_name: values.session_title,
              notes: values.photo_notes || null,
              is_visible_to_patient: values.is_visible_to_patient,
            })
          )
        );
      }

      await load();
      resetNoteForm(values.note_type);
      setActiveTab(values.note_type);
      setStatus({ type: "success", text: editingHistoryId ? "Registro clinico actualizado." : "Registro clinico guardado." });
    } catch {
      setStatus({ type: "error", text: "No pudimos guardar el registro clinico." });
    } finally {
      setSavingNote(false);
    }
  });

  const saveEvolution = evolutionForm.handleSubmit(async (values) => {
    setSavingEvolution(true);
    setStatus(null);
    try {
      await createClinicalEvolution({ ...values, patient_id: id, created_by: user?.id ?? null });
      evolutionForm.reset({ ...values, title: "", description: "", treatment_performed: "", recommendations: "" });
      await load();
      setStatus({ type: "success", text: "Postconsulta o seguimiento guardado." });
    } catch {
      setStatus({ type: "error", text: "No pudimos guardar el seguimiento." });
    } finally {
      setSavingEvolution(false);
    }
  });

  const saveInventoryUsage = async () => {
    if (!inventoryForm.item_id || Number(inventoryForm.quantity) <= 0) {
      setStatus({ type: "error", text: "Selecciona el insumo y una cantidad valida." });
      return;
    }

    setSavingInventory(true);
    setStatus(null);
    try {
      await recordClinicalInventoryUsage({
        patientId: id,
        clinicalHistoryId: inventoryForm.clinical_history_id || null,
        itemId: inventoryForm.item_id,
        lotId: inventoryForm.lot_id || null,
        quantity: Number(inventoryForm.quantity),
        unitLabel: selectedItem?.unit ?? null,
        notes: inventoryForm.notes || `Uso clinico de ${selectedItem?.name ?? "insumo"}`,
      });
      setInventoryForm({ clinical_history_id: inventoryForm.clinical_history_id, item_id: "", lot_id: "", quantity: 1, notes: "" });
      await load();
      setStatus({ type: "success", text: "Insumo registrado y descontado del inventario." });
    } catch {
      setStatus({ type: "error", text: "No pudimos descontar el insumo. Revisa stock, lote y permisos." });
    } finally {
      setSavingInventory(false);
    }
  };

  const startEditing = (historyId: string) => {
    const selected = histories.find((item) => item.id === historyId);
    if (!selected) return;
    const noteType = selected.note_type ?? "procedimiento";

    noteForm.reset({
      note_type: noteType,
      doctor_id: selected.doctor_id ?? currentDoctorId,
      session_title: selected.session_title ?? "",
      session_date: selected.session_date ?? getTodayValue(),
      session_time: selected.session_time ?? "",
      reason_for_consultation: selected.reason_for_consultation ?? "",
      medical_history: selected.medical_history ?? "",
      allergies: selected.allergies ?? "",
      current_medications: selected.current_medications ?? "",
      previous_procedures: selected.previous_procedures ?? "",
      diagnosis: selected.diagnosis ?? "",
      treatment_plan: selected.treatment_plan ?? "",
      procedure_details: selected.procedure_details ?? "",
      pre_consultation_notes: selected.pre_consultation_notes ?? "",
      post_consultation_notes: selected.post_consultation_notes ?? "",
      consent_notes: selected.consent_notes ?? "",
      observations: selected.observations ?? "",
      internal_notes: selected.internal_notes ?? "",
      photo_type: "evolucion",
      photo_notes: "",
      is_visible_to_patient: false,
    });
    setEditingHistoryId(selected.id);
    setActiveTab(noteType);
    resetPendingPhotos();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const archiveHistory = async (historyId: string) => {
    if (!canSoftDelete(role) || !user?.id) return;

    try {
      await softDeleteRecord({
        table: "clinical_histories",
        id: historyId,
        actorId: user.id,
        actorRole: role,
        actorName: profile?.full_name ?? user.email ?? "equipo medico",
        actorEmail: profile?.email ?? user.email ?? null,
      });
      await load();
      setStatus({ type: "success", text: "Registro clinico borrado de la vista activa." });
    } catch {
      setStatus({ type: "error", text: "No pudimos borrar el registro de la vista." });
    }
  };

  const startNewNote = (noteType: ClinicalNoteType) => {
    resetNoteForm(noteType);
    setActiveTab(noteType);
  };

  if (loading) return <LoadingState label="Cargando expediente clinico..." />;
  if (error) return <ErrorState label="No pudimos cargar el expediente clinico." />;
  if (!patient) return <EmptyState label="No encontramos este paciente." />;

  const renderedNotes = noteTypes.some((item) => item.id === activeTab) ? notesByType[activeNoteType] : histories;
  const baseHistory = notesByType.historia_base[0] ?? null;
  const latestProcedure = notesByType.procedimiento[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="border-b border-[var(--color-border)] pb-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
              Expediente clinico
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold lg:text-5xl">{patient.full_name}</h1>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              Historia base, preconsulta, procedimientos, postconsulta, fotos, recetas e insumos usados.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => startNewNote("historia_base")} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white">
              Historia clinica
            </button>
            <button onClick={() => startNewNote("procedimiento")} className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold">
              Nuevo procedimiento
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold">
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
                activeTab === tab.id
                  ? "bg-[var(--color-mocha)] text-white"
                  : "border border-[var(--color-border)] bg-white/70 text-[var(--color-copy)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {status ? (
        <div className={`rounded-[20px] p-4 text-sm ${status.type === "success" ? "bg-[rgba(111,122,96,0.12)] text-[var(--color-copy)]" : "bg-red-50 text-red-700"}`}>
          {status.text}
        </div>
      ) : null}

      {activeTab === "resumen" ? (
        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryMetric label="Historia base" value={baseHistory ? "Completa" : "Pendiente"} />
            <SummaryMetric label="Preconsultas" value={String(notesByType.preconsulta.length)} />
            <SummaryMetric label="Procedimientos" value={String(notesByType.procedimiento.length)} />
            <SummaryMetric label="Insumos usados" value={String(inventoryUsages.length)} />
            <SummaryMetric label="Fotos clinicas" value={String(photos.length)} />
            <SummaryMetric label="Postconsultas" value={String(notesByType.postconsulta.length + evolutions.length)} />
          </div>
          <div className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">Lectura rapida</p>
            <h2 className="mt-2 text-2xl font-semibold">{latestProcedure?.session_title ?? baseHistory?.session_title ?? "Sin atenciones registradas"}</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              {latestProcedure?.diagnosis ?? baseHistory?.diagnosis ?? baseHistory?.reason_for_consultation ?? "Registra la historia clinica base para tener el contexto medico del paciente."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {noteTypes.map((type) => (
                <button key={type.id} onClick={() => startNewNote(type.id)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                  Nuevo: {type.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {noteTypes.some((item) => item.id === activeTab) ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <ClinicalNoteForm
            noteType={activeNoteType}
            noteForm={noteForm}
            doctorReadOnly={doctorReadOnly}
            doctorOptions={doctorOptions}
            myDoctorProfile={myDoctorProfile}
            pendingPhotos={pendingPhotos}
            saving={savingNote}
            editingHistoryId={editingHistoryId}
            onSubmit={saveNote}
            onSelectFiles={onSelectFiles}
            onCancel={() => resetNoteForm(activeNoteType)}
          />
          <NotesList
            notes={renderedNotes}
            photosByHistory={photosByHistory}
            evolutionsByHistory={evolutionsByHistory}
            usagesByHistory={usagesByHistory}
            canManageHistory={canManageHistory}
            onEdit={startEditing}
            onArchive={archiveHistory}
          />
        </section>
      ) : null}

      {activeTab === "insumos" ? (
        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5">
            <div className="flex items-center gap-2">
              <PackageMinus className="h-5 w-5 text-[var(--color-mocha)]" />
              <h2 className="text-xl font-semibold">Registrar insumo usado</h2>
            </div>
            <div className="mt-5 grid gap-4">
              <Field label="Relacionado con">
                <select value={inventoryForm.clinical_history_id} onChange={(event) => setInventoryForm({ ...inventoryForm, clinical_history_id: event.target.value })} className="premium-input">
                  <option value="">Sin nota especifica</option>
                  {histories.map((history) => (
                    <option key={history.id} value={history.id}>
                      {history.session_title ?? "Nota clinica"} - {formatDate(history.session_date ?? history.created_at)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Item de inventario">
                <select value={inventoryForm.item_id} onChange={(event) => setInventoryForm({ ...inventoryForm, item_id: event.target.value, lot_id: "" })} className="premium-input">
                  <option value="">Selecciona item</option>
                  {inventoryItems.filter((item) => !item.is_deleted && item.is_active).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - stock {formatInventoryNumber(item.current_stock)} {item.unit}{Number(item.units_per_presentation ?? 1) > 1 ? ` - x ${formatInventoryNumber(item.units_per_presentation)}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lote">
                <select value={inventoryForm.lot_id} onChange={(event) => setInventoryForm({ ...inventoryForm, lot_id: event.target.value })} className="premium-input">
                  <option value="">Sin lote</option>
                  {filteredLots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lot_number} - {formatInventoryNumber(lot.current_quantity)} disponibles{Number(lot.units_per_presentation ?? selectedItem?.units_per_presentation ?? 1) > 1 ? ` - x ${formatInventoryNumber(lot.units_per_presentation ?? selectedItem?.units_per_presentation ?? 1)}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Cantidad usada${selectedItem ? ` (${selectedItem.unit})` : ""}`}>
                <input type="number" min="0.01" step="0.01" value={inventoryForm.quantity} onChange={(event) => setInventoryForm({ ...inventoryForm, quantity: Number(event.target.value) })} className="premium-input" />
              </Field>
              {selectedItem ? (
                <p className="text-xs text-[var(--color-copy)]">
                  Se descuenta del stock global compartido entre todas las doctoras. {formatPresentationHint(selectedItem, filteredLots.find((lot) => lot.id === inventoryForm.lot_id) ?? null) ?? "Registra siempre la cantidad real usada en la unidad interna del item."}
                </p>
              ) : null}
              <Field label="Notas">
                <textarea value={inventoryForm.notes} onChange={(event) => setInventoryForm({ ...inventoryForm, notes: event.target.value })} className="premium-input min-h-24" placeholder="Ej. Toxina botulinica aplicada en zona frontal" />
              </Field>
              <button disabled={savingInventory} onClick={() => void saveInventoryUsage()} className="w-fit rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
                {savingInventory ? "Descontando..." : "Registrar y descontar"}
              </button>
            </div>
          </div>

          <div className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5">
            <h2 className="text-xl font-semibold">Insumos usados en el paciente</h2>
            <div className="mt-5 space-y-3">
              {inventoryUsages.length === 0 ? (
                <EmptyState label="Aun no hay insumos usados en este paciente." />
              ) : (
                inventoryUsages.map((usage) => (
                  <div key={usage.id} className="rounded-[8px] bg-[rgba(247,242,236,0.78)] p-4">
                    <p className="font-semibold">{usage.inventory_items?.name ?? "Insumo"}</p>
                    <p className="mt-1 text-sm text-[var(--color-copy)]">
                      {usage.quantity} {usage.unit_label ?? usage.inventory_items?.unit ?? "u"} - {formatDate(usage.created_at)}
                    </p>
                    {usage.inventory_lots?.lot_number ? <p className="mt-1 text-xs text-[var(--color-copy)]">Lote: {usage.inventory_lots.lot_number}</p> : null}
                    {usage.notes ? <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">{usage.notes}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "fotos" ? (
        <section className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Galeria clinica del expediente</h2>
              <p className="mt-2 text-sm text-[var(--color-copy)]">Fotos asociadas a notas clinicas, visibles o privadas segun criterio medico.</p>
            </div>
            <Link to={`/panel/pacientes/${id}/fotos`} className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold">Abrir galeria completa</Link>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {photos.length === 0 ? <EmptyState label="No hay fotos clinicas registradas." /> : photos.map((photo) => (
              <div key={photo.id} className="rounded-[8px] bg-[rgba(247,242,236,0.78)] p-3">
                <img src={photo.signed_url ?? ""} alt={photo.photo_type} className="h-48 w-full rounded-[8px] object-cover" />
                <p className="mt-3 font-semibold">{photo.treatment_name ?? photo.photo_type}</p>
                <p className="text-xs text-[var(--color-copy)]">{photo.is_visible_to_patient ? "Visible para paciente" : "Privada"}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {activeTab === "documentos" ? (
        <section className="grid gap-5 xl:grid-cols-2">
          <DocumentAction title="Historia clinica completa" detail="Resumen imprimible del expediente, antecedentes y atenciones." onPrint={() => window.print()} />
          <DocumentAction title="Receta medica" detail="Abre la seccion de recetas para imprimir indicaciones y firma." href={`/panel/pacientes/${id}/recetas`} />
          <DocumentAction title="Consentimiento / procedimiento" detail="Imprime la nota de procedimiento con espacio para firmas." onPrint={() => window.print()} />
          <DocumentAction title="Galeria y evolucion" detail="Fotos y controles posteriores para archivo clinico." href={`/panel/pacientes/${id}/fotos`} />
        </section>
      ) : null}

      {activeTab === "postconsulta" ? (
        <section className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5">
          <h2 className="text-xl font-semibold">Control de evolucion</h2>
          <form onSubmit={saveEvolution} className="mt-5 grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Nota relacionada" error={evolutionForm.formState.errors.clinical_history_id?.message}>
                <select {...evolutionForm.register("clinical_history_id")} className="premium-input">
                  <option value="">Selecciona una nota</option>
                  {histories.map((history) => (
                    <option key={history.id} value={history.id}>{history.session_title ?? "Nota clinica"}</option>
                  ))}
                </select>
              </Field>
              <Field label="Doctora" error={evolutionForm.formState.errors.doctor_id?.message}>
                {doctorReadOnly ? (
                  <div className="premium-input flex items-center bg-[rgba(247,242,236,0.78)]">{myDoctorProfile?.full_name ?? "Doctora"}</div>
                ) : (
                  <select {...evolutionForm.register("doctor_id")} className="premium-input">
                    <option value="">Selecciona una doctora</option>
                    {doctorOptions.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Titulo" error={evolutionForm.formState.errors.title?.message}>
                <input {...evolutionForm.register("title")} className="premium-input" />
              </Field>
              <Field label="Tratamiento">
                <input {...evolutionForm.register("treatment_performed")} className="premium-input" />
              </Field>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <Field label="Evolucion clinica" error={evolutionForm.formState.errors.description?.message}>
                <textarea {...evolutionForm.register("description")} className="premium-input min-h-28" />
              </Field>
              <Field label="Recomendaciones">
                <textarea {...evolutionForm.register("recommendations")} className="premium-input min-h-28" />
              </Field>
            </div>
            <button disabled={savingEvolution} className="w-fit rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
              {savingEvolution ? "Guardando..." : "Guardar control"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function ClinicalNoteForm({
  noteType,
  noteForm,
  doctorReadOnly,
  doctorOptions,
  myDoctorProfile,
  pendingPhotos,
  saving,
  editingHistoryId,
  onSubmit,
  onSelectFiles,
  onCancel,
}: {
  noteType: ClinicalNoteType;
  noteForm: ReturnType<typeof useForm<NoteValues>>;
  doctorReadOnly: boolean;
  doctorOptions: DoctorProfileRow[];
  myDoctorProfile: DoctorProfileRow | null;
  pendingPhotos: PendingPhoto[];
  saving: boolean;
  editingHistoryId: string | null;
  onSubmit: () => void;
  onSelectFiles: (fileList: FileList | null) => void;
  onCancel: () => void;
}) {
  const title = noteTypes.find((item) => item.id === noteType)?.title ?? "Registro clinico";

  useEffect(() => {
    noteForm.setValue("note_type", noteType);
  }, [noteForm, noteType]);

  return (
    <form onSubmit={onSubmit} className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{title}</p>
          <h2 className="mt-2 text-xl font-semibold">{editingHistoryId ? "Editar registro" : "Nuevo registro"}</h2>
        </div>
        {editingHistoryId ? <button type="button" onClick={onCancel} className="w-fit rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">Cancelar</button> : null}
      </div>

      <div className="mt-5 grid gap-4">
        <input type="hidden" {...noteForm.register("note_type")} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Doctora responsable" error={noteForm.formState.errors.doctor_id?.message}>
            {doctorReadOnly ? (
              <div className="premium-input flex items-center bg-[rgba(247,242,236,0.78)]">{myDoctorProfile?.full_name ?? "Doctora sin perfil"}</div>
            ) : (
              <select {...noteForm.register("doctor_id")} className="premium-input">
                <option value="">Selecciona una doctora</option>
                {doctorOptions.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Titulo clinico" error={noteForm.formState.errors.session_title?.message}>
            <input {...noteForm.register("session_title")} className="premium-input" />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Fecha" error={noteForm.formState.errors.session_date?.message}>
            <input type="date" {...noteForm.register("session_date")} className="premium-input" />
          </Field>
          <Field label="Hora">
            <input type="time" {...noteForm.register("session_time")} className="premium-input" />
          </Field>
          <Field label="Impresion diagnostica">
            <input {...noteForm.register("diagnosis")} className="premium-input" />
          </Field>
        </div>

        <Field label={noteType === "historia_base" ? "Motivo y contexto general" : "Motivo de consulta"} error={noteForm.formState.errors.reason_for_consultation?.message}>
          <textarea {...noteForm.register("reason_for_consultation")} className="premium-input min-h-24" />
        </Field>

        {noteType === "historia_base" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Field label="Antecedentes personales y familiares"><textarea {...noteForm.register("medical_history")} className="premium-input min-h-28" /></Field>
            <Field label="Alergias y contraindicaciones"><textarea {...noteForm.register("allergies")} className="premium-input min-h-28" /></Field>
            <Field label="Medicacion actual"><textarea {...noteForm.register("current_medications")} className="premium-input min-h-28" /></Field>
            <Field label="Procedimientos previos"><textarea {...noteForm.register("previous_procedures")} className="premium-input min-h-28" /></Field>
          </div>
        ) : null}

        {noteType === "preconsulta" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Field label="Evaluacion previa"><textarea {...noteForm.register("pre_consultation_notes")} className="premium-input min-h-28" /></Field>
            <Field label="Plan terapeutico propuesto"><textarea {...noteForm.register("treatment_plan")} className="premium-input min-h-28" /></Field>
            <Field label="Consentimiento e indicaciones previas"><textarea {...noteForm.register("consent_notes")} className="premium-input min-h-28" /></Field>
            <Field label="Observaciones"><textarea {...noteForm.register("observations")} className="premium-input min-h-28" /></Field>
          </div>
        ) : null}

        {noteType === "procedimiento" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Field label="Procedimiento realizado"><textarea {...noteForm.register("procedure_details")} className="premium-input min-h-28" /></Field>
            <Field label="Plan / proximos pasos"><textarea {...noteForm.register("treatment_plan")} className="premium-input min-h-28" /></Field>
            <Field label="Consentimiento y firma"><textarea {...noteForm.register("consent_notes")} className="premium-input min-h-28" /></Field>
            <Field label="Observaciones medicas"><textarea {...noteForm.register("observations")} className="premium-input min-h-28" /></Field>
          </div>
        ) : null}

        {noteType === "postconsulta" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <Field label="Evolucion postconsulta"><textarea {...noteForm.register("post_consultation_notes")} className="premium-input min-h-28" /></Field>
            <Field label="Recomendaciones y control"><textarea {...noteForm.register("treatment_plan")} className="premium-input min-h-28" /></Field>
          </div>
        ) : null}

        <Field label="Notas internas">
          <textarea {...noteForm.register("internal_notes")} className="premium-input min-h-24" />
        </Field>

        <div className="rounded-[8px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.62)] p-4">
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 text-[var(--color-mocha)]" />
            <p className="font-semibold">Fotos opcionales</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Imagenes"><input type="file" accept="image/*" multiple onChange={(event) => onSelectFiles(event.target.files)} className="premium-input" /></Field>
            <Field label="Tipo"><select {...noteForm.register("photo_type")} className="premium-input"><option value="antes">Antes</option><option value="despues">Despues</option><option value="evolucion">Evolucion</option><option value="otro">Otro</option></select></Field>
            <Field label="Visible"><label className="premium-input flex items-center gap-3"><input type="checkbox" {...noteForm.register("is_visible_to_patient")} />Paciente</label></Field>
            <Field label="Notas"><input {...noteForm.register("photo_notes")} className="premium-input" /></Field>
          </div>
          {pendingPhotos.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pendingPhotos.map((photo) => <img key={photo.previewUrl} src={photo.previewUrl} alt={photo.file.name} className="h-36 w-full rounded-[8px] object-cover" />)}
            </div>
          ) : null}
        </div>

        <button disabled={saving} className="w-fit rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
          {saving ? "Guardando..." : editingHistoryId ? "Actualizar registro" : "Guardar registro"}
        </button>
      </div>
    </form>
  );
}

function NotesList({
  notes,
  photosByHistory,
  evolutionsByHistory,
  usagesByHistory,
  canManageHistory,
  onEdit,
  onArchive,
}: {
  notes: Awaited<ReturnType<typeof getClinicalHistoriesByPatient>>;
  photosByHistory: Record<string, PatientPhotoRow[]>;
  evolutionsByHistory: Record<string, Awaited<ReturnType<typeof getClinicalEvolutions>>>;
  usagesByHistory: Record<string, Awaited<ReturnType<typeof getClinicalInventoryUsages>>>;
  canManageHistory: (doctorId?: string | null) => boolean;
  onEdit: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  if (notes.length === 0) return <EmptyState label="No hay registros en esta seccion." />;

  return (
    <div className="space-y-4">
      {notes.map((note) => {
        const notePhotos = photosByHistory[note.id] ?? [];
        const noteEvolutions = evolutionsByHistory[note.id] ?? [];
        const noteUsages = usagesByHistory[note.id] ?? [];
        const canManage = canManageHistory(note.doctor_id);

        return (
          <article key={note.id} className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                  {formatDate(note.session_date ?? note.created_at)} - {formatClinicalTime(note.session_time, note.created_at)}
                </p>
                <h3 className="mt-2 text-xl font-semibold">{note.session_title ?? "Registro clinico"}</h3>
                <p className="mt-1 text-sm text-[var(--color-copy)]">Doctora: {note.doctor_profiles?.full_name ?? note.profiles?.full_name ?? "Equipo medico"}</p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <button onClick={() => onEdit(note.id)} className="rounded-full border border-[var(--color-border)] p-2" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => onArchive(note.id)} className="rounded-full border border-red-200 p-2 text-red-700" aria-label="Borrar de la vista"><Trash2 className="h-4 w-4" /></button>
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              <ClinicalBlock label="Motivo / contexto" value={note.reason_for_consultation} />
              <ClinicalBlock label="Diagnostico" value={note.diagnosis} />
              <ClinicalBlock label="Plan terapeutico" value={note.treatment_plan} />
              <ClinicalBlock label="Procedimiento" value={note.procedure_details} />
              <ClinicalBlock label="Preconsulta" value={note.pre_consultation_notes} />
              <ClinicalBlock label="Postconsulta" value={note.post_consultation_notes} />
              <ClinicalBlock label="Observaciones" value={note.observations} />
              <ClinicalBlock label="Consentimiento" value={note.consent_notes} />
            </div>
            {noteUsages.length > 0 ? <TagLine icon={<PackageMinus className="h-4 w-4" />} text={noteUsages.map((usage) => `${usage.inventory_items?.name ?? "Insumo"}: ${usage.quantity} ${usage.unit_label ?? ""}`).join(" | ")} /> : null}
            {noteEvolutions.length > 0 ? <TagLine icon={<ClipboardList className="h-4 w-4" />} text={`${noteEvolutions.length} control(es) registrado(s)`} /> : null}
            {notePhotos.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {notePhotos.slice(0, 3).map((photo) => <img key={photo.id} src={photo.signed_url ?? ""} alt={photo.photo_type} className="h-32 w-full rounded-[8px] object-cover" />)}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}

function ClinicalBlock({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="rounded-[8px] bg-[rgba(247,242,236,0.78)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-2 whitespace-pre-line text-sm leading-7 text-[var(--color-copy)]">{value}</p>
    </div>
  );
}

function TagLine({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="mt-4 flex items-center gap-2 rounded-[8px] bg-[rgba(111,122,96,0.10)] px-4 py-3 text-sm font-semibold text-[var(--color-copy)]">
      {icon}
      <span>{text}</span>
    </div>
  );
}

function DocumentAction({ title, detail, href, onPrint }: { title: string; detail: string; href?: string; onPrint?: () => void }) {
  const content = (
    <>
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-[var(--color-mocha)]" />
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{detail}</p>
    </>
  );

  if (href) {
    return <Link to={href} className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5">{content}</Link>;
  }

  return <button onClick={onPrint} className="rounded-[8px] border border-[var(--color-border)] bg-white/75 p-5 text-left">{content}</button>;
}
