import { useEffect, useMemo, useState, type ReactNode } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, Search, Send, UserRoundPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { EmptyState, LoadingState } from "../../components/common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { useFormDraft } from "../../hooks/useFormDraft";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";
import { getCareModeLabel } from "../../lib/careMode";
import { shouldHidePatientPhone } from "../../lib/patientPrivacy";
import { hardDeleteRecord, restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import { getAppointmentsAdmin, updateAppointment, updateAppointmentStatus, type AppointmentAdminRow } from "../../services/appointmentService";
import { getAvailableSlots, type AvailableSlot } from "../../services/availabilityService";
import { getCashPaymentMethods, getCashRegisterSessions, type CashPaymentMethodRow } from "../../services/cashService";
import { getAdminDoctors, getMyDoctorProfile, type DoctorProfileRow } from "../../services/doctorService";
import { createPatient, getPatients, type PatientRow } from "../../services/patientService";
import {
  approveReservationPayment,
  createManualAppointmentReservation,
  getReservationReceiptUrl,
  getReservationsAdmin,
  regenerateManualReservationPaymentLink,
  rejectReservationPayment,
  uploadManualReservationReceipt,
  updateReservation,
  updateReservationStatus,
  type AppointmentReservationRow,
  type ReservationStatus,
} from "../../services/reservationService";
import { getSiteSettings, type SiteSettingsRow } from "../../services/siteSettingsService";
import { normalizeDocumentNumber } from "../../utils/documentNumber";
import { formatDate, formatMoney } from "../../utils/text";
import { buildWhatsAppHref } from "../../utils/whatsapp";

const reservationStatuses: ReservationStatus[] = ["Pendiente", "Confirmada", "Realizada", "Cancelada", "Rechazada"];
const appointmentStatuses = ["Todos", "Pendiente", "Programada", "Confirmada", "Realizada", "Cancelada", "Rechazada"];
const appointmentTypes = ["Valoracion estetica", "Control", "Procedimiento", "Promocion directa", "Revision postratamiento", "Consulta general"];

const manualSchema = z.object({
  patient_id: z.string().min(1, "Selecciona paciente."),
  doctor_id: z.string().optional(),
  city: z.string().min(2, "Ciudad obligatoria."),
  appointment_type: z.string().min(2, "Tipo obligatorio."),
  date: z.string().optional(),
  notes: z.string().optional(),
  collect_payment_now: z.boolean().default(false),
  payment_amount: z.coerce.number().min(0, "El monto no puede ser negativo."),
  payment_method: z.string().min(1, "Selecciona metodo."),
  payment_window_hours: z.coerce.number().min(1, "El plazo minimo es 1 hora.").max(72, "El plazo maximo es 72 horas."),
});

const quickPatientSchema = z.object({
  full_name: z.string().min(3, "Escribe el nombre completo."),
  document_number: z.string().min(5, "Escribe el numero de carnet."),
  phone: z.string().optional(),
  email: z.string().email("Correo invalido").or(z.literal("")),
  city: z.string().min(2, "Selecciona ciudad."),
});

type ManualFormInput = z.input<typeof manualSchema>;
type ManualForm = z.output<typeof manualSchema>;
type QuickPatientFormInput = z.input<typeof quickPatientSchema>;
type QuickPatientForm = z.output<typeof quickPatientSchema>;

type ApprovalDraft = {
  reservationId: string;
  patientName: string;
  appointmentType: string;
  careMode: string | null;
  doctorName: string | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  amount: number;
  paymentMethod: string;
  notes: string;
};

type ViewMode = "create" | "scheduled";
type SourceFilter = "Todos" | "Reservas" | "Internas";

export function ReservationsAdminPage() {
  const { role, profile, user } = useAuth();
  const hidePatientPhone = shouldHidePatientPhone(role);
  const [rows, setRows] = useState<AppointmentReservationRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentAdminRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [doctors, setDoctors] = useState<DoctorProfileRow[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettingsRow | null>(null);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDraft | null>(null);
  const [viewMode, setViewMode] = useWorkspaceState<ViewMode>("admin:reservations:view-mode", "create", { ttlMs: 1000 * 60 * 60 * 8 });
  const [patientQuery, setPatientQuery] = useWorkspaceState("admin:reservations:patient-query", "", { ttlMs: 1000 * 60 * 60 });
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [doctorQuery, setDoctorQuery] = useWorkspaceState("admin:reservations:doctor-query", "", { ttlMs: 1000 * 60 * 60 });
  const [doctorPickerOpen, setDoctorPickerOpen] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useWorkspaceState("admin:reservations:patient-modal-open", false, { ttlMs: 1000 * 60 * 60 });
  const [patientModalError, setPatientModalError] = useState("");
  const [savingPatient, setSavingPatient] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [doctorProfileId, setDoctorProfileId] = useState<string | null>(null);
  const [doctorProfileName, setDoctorProfileName] = useState("");
  const [doctorProfileResolved, setDoctorProfileResolved] = useState(role !== "doctor");
  const [cashOpen, setCashOpen] = useState(false);
  const [followUpWhatsappHref, setFollowUpWhatsappHref] = useState<string | null>(null);
  const [followUpWhatsappLabel, setFollowUpWhatsappLabel] = useState("");
  const [scheduleFilters, setScheduleFilters] = useWorkspaceState("admin:reservations:schedule-filters", () => ({
    query: "",
    city: "Todas",
    status: "Todos",
    date: "",
    source: "Todos" as SourceFilter,
  }), { ttlMs: 1000 * 60 * 60 * 8 });
  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [savingApproval, setSavingApproval] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const actorId = profile?.id ?? user?.id ?? null;
  const actorName = profile?.full_name ?? user?.user_metadata.full_name ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;

  const form = useForm<ManualFormInput, undefined, ManualForm>({
    resolver: zodResolver(manualSchema),
    defaultValues: {
      patient_id: "",
      doctor_id: "",
      city: "Cochabamba",
      appointment_type: "Valoracion estetica",
      date: "",
      notes: "",
      collect_payment_now: false,
      payment_amount: 0,
      payment_method: "efectivo",
      payment_window_hours: 24,
    },
  });

  const quickPatientForm = useForm<QuickPatientFormInput, undefined, QuickPatientForm>({
    resolver: zodResolver(quickPatientSchema),
    defaultValues: {
      full_name: "",
      document_number: "",
      phone: "",
      email: "",
      city: "Cochabamba",
    },
  });

  const watched = form.watch();
  const { clearDraft: clearManualDraft } = useFormDraft(form, "admin:reservations:manual-draft", {
    ttlMs: 1000 * 60 * 60,
    enabled: viewMode === "create",
    isEmpty: (value) => !Object.values(value ?? {}).some((item) => {
      if (typeof item === "boolean") return item;
      if (typeof item === "number") return item > 0;
      return typeof item === "string" && item.trim().length > 0;
    }),
  });
  const { clearDraft: clearQuickPatientDraft } = useFormDraft(quickPatientForm, "admin:reservations:quick-patient-draft", {
    ttlMs: 1000 * 60 * 60,
    enabled: patientModalOpen,
    isEmpty: (value) => !Object.values(value ?? {}).some((item) => typeof item === "string" && item.trim().length > 0),
  });
  const doctorFieldLocked = role === "doctor" && Boolean(doctorProfileId);

  const load = () => {
    if (role === "doctor" && !doctorProfileResolved) return;
    if (role === "doctor" && !doctorProfileId) {
      setRows([]);
      setAppointments([]);
      setDoctors([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    Promise.all([
      getReservationsAdmin(role === "doctor" ? { doctor_id: doctorProfileId } : {}, role === "superadmin", role),
      getAppointmentsAdmin(role === "superadmin", role === "doctor" ? doctorProfileId : null, role),
      getPatients(false, role),
      getAdminDoctors().then((doctorRows) =>
        role === "doctor" && doctorProfileId ? doctorRows.filter((doctor) => doctor.id === doctorProfileId) : doctorRows
      ),
      getCashPaymentMethods(true),
      getCashRegisterSessions(),
      getSiteSettings(),
    ])
      .then(([reservations, nextAppointments, nextPatients, nextDoctors, methods, sessions, settings]) => {
        setRows(reservations);
        setAppointments(nextAppointments);
        setPatients(nextPatients);
        setDoctors(nextDoctors.filter((doctor) => doctor.is_active));
        setPaymentMethods(methods);
        setCashOpen(sessions.some((session) => session.status === "abierta"));
        setSiteSettings(settings);
      })
      .catch((loadError) => setError(getErrorMessage(loadError, "No pudimos cargar las citas.")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (role !== "doctor" || !profile?.id) {
      setDoctorProfileId(null);
      setDoctorProfileName("");
      setDoctorProfileResolved(true);
      return;
    }

    setDoctorProfileResolved(false);
    getMyDoctorProfile(profile.id)
      .then((doctor) => {
        setDoctorProfileId(doctor?.id ?? null);
        setDoctorProfileName(doctor?.full_name ?? "");
      })
      .catch(() => {
        setDoctorProfileId(null);
        setDoctorProfileName("");
      })
      .finally(() => setDoctorProfileResolved(true));
  }, [profile?.id, role]);

  useEffect(() => {
    load();
  }, [doctorProfileId, doctorProfileResolved, role]);

  useEffect(() => {
    if (!watched.city || !watched.appointment_type) {
      setSlots([]);
      return;
    }

    const from = watched.date?.trim() ? watched.date : new Date().toISOString().slice(0, 10);
    const toDate = new Date(from);
    if (!watched.date?.trim()) {
      toDate.setDate(toDate.getDate() + 14);
    }

    setLoadingSlots(true);
    setSelectedSlot(null);
    getAvailableSlots({
      city: watched.city,
      appointment_type: watched.appointment_type,
      doctor_id: watched.doctor_id || null,
      date_from: from,
      date_to: watched.date?.trim() ? watched.date : toDate.toISOString().slice(0, 10),
    })
      .then(setSlots)
      .catch((slotsError) => setError(getErrorMessage(slotsError, "No pudimos cargar horarios disponibles.")))
      .finally(() => setLoadingSlots(false));
  }, [watched.appointment_type, watched.city, watched.date, watched.doctor_id]);

  const cities = useMemo(
    () =>
      [...new Set([...rows.map((row) => row.city), ...appointments.map((item) => item.city)].filter(Boolean))] as string[],
    [appointments, rows]
  );

  const selectedPatient = patients.find((patient) => patient.id === watched.patient_id) ?? null;
  const selectedDoctor = doctors.find((doctor) => doctor.id === watched.doctor_id) ?? null;

  useEffect(() => {
    if (!selectedPatient) return;
    setPatientQuery((current) => current || buildPatientLabel(selectedPatient));
  }, [selectedPatient, setPatientQuery]);

  useEffect(() => {
    if (!selectedDoctor) return;
    setDoctorQuery((current) => current || selectedDoctor.full_name);
  }, [selectedDoctor, setDoctorQuery]);

  useEffect(() => {
    if (!doctorFieldLocked || !doctorProfileId) return;
    if (watched.doctor_id !== doctorProfileId) {
      form.setValue("doctor_id", doctorProfileId, { shouldDirty: false, shouldValidate: false });
    }
    if (!doctorQuery) {
      setDoctorQuery(doctorProfileName);
    }
  }, [doctorFieldLocked, doctorProfileId, doctorProfileName, doctorQuery, form, setDoctorQuery, watched.doctor_id]);

  const filteredPatients = useMemo(() => {
    const normalizedQuery = normalizeSearchText(patientQuery);
    if (!normalizedQuery) return patients.slice(0, 8);

    return patients
      .filter((patient) => buildPatientSearchIndex(patient, hidePatientPhone).includes(normalizedQuery))
      .slice(0, 8);
  }, [hidePatientPhone, patientQuery, patients]);

  const filteredDoctors = useMemo(() => {
    const normalizedQuery = normalizeSearchText(doctorQuery);
    if (!normalizedQuery) return doctors.slice(0, 8);

    return doctors
      .filter((doctor) => buildDoctorSearchIndex(doctor).includes(normalizedQuery))
      .slice(0, 8);
  }, [doctorQuery, doctors]);

  const filteredReservations = useMemo(() => {
    return rows
      .filter((row) => {
      const normalizedQuery = scheduleFilters.query.trim().toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        JSON.stringify({
          patient: row.patients,
          type: row.appointment_type,
          city: row.city,
          status: row.status,
        })
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCity = scheduleFilters.city === "Todas" || row.city === scheduleFilters.city;
      const matchesStatus = scheduleFilters.status === "Todos" || row.status === scheduleFilters.status;
      const matchesDate = !scheduleFilters.date || row.appointment_date === scheduleFilters.date;
      const matchesSource = scheduleFilters.source === "Todos" || scheduleFilters.source === "Reservas";
      return matchesQuery && matchesCity && matchesStatus && matchesDate && matchesSource;
      })
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [rows, scheduleFilters]);

  const filteredAppointments = useMemo(() => {
    return appointments
      .filter((item) => {
      const normalizedQuery = scheduleFilters.query.trim().toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        JSON.stringify({
          patient: item.patients,
          title: item.title,
          city: item.city,
          status: item.status,
        })
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesCity = scheduleFilters.city === "Todas" || item.city === scheduleFilters.city;
      const matchesStatus = scheduleFilters.status === "Todos" || item.status === scheduleFilters.status;
      const matchesDate = !scheduleFilters.date || item.appointment_date === scheduleFilters.date;
      const matchesSource = scheduleFilters.source === "Todos" || scheduleFilters.source === "Internas";
      return matchesQuery && matchesCity && matchesStatus && matchesDate && matchesSource;
      })
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [appointments, scheduleFilters]);

  const openApproval = (row: AppointmentReservationRow) => {
    setApprovalDraft({
      reservationId: row.id,
      patientName: row.patients?.full_name ?? "Paciente",
      appointmentType: row.appointment_type,
      careMode: row.care_mode ?? null,
      doctorName: row.doctor_profiles?.full_name ?? null,
      appointmentDate: row.appointment_date,
      startTime: row.start_time,
      endTime: row.end_time,
      amount: Number(row.payment_amount ?? 0),
      paymentMethod: row.payment_method ?? paymentMethods.find((method) => method.is_default)?.code ?? "qr",
      notes: row.admin_notes ?? "",
    });
  };

  const submitApproval = async () => {
    if (!approvalDraft) return;
    if (approvalDraft.amount <= 0) {
      setError("Indica el monto pagado antes de aprobar.");
      return;
    }

    setSavingApproval(true);
    setError("");
    try {
      await approveReservationPayment(approvalDraft.reservationId, {
        adminNotes: approvalDraft.notes,
        paymentAmount: approvalDraft.amount,
        paymentMethod: approvalDraft.paymentMethod,
      });
      setSuccess("Pago aprobado y enviado a caja automaticamente.");
      setApprovalDraft(null);
      load();
    } catch (approvalError) {
      setError(getErrorMessage(approvalError, "No pudimos aprobar el pago."));
    } finally {
      setSavingApproval(false);
    }
  };

  const openManualPaymentLink = (row: AppointmentReservationRow) => {
    if (hidePatientPhone || !row.public_payment_token || !row.patients?.phone) {
      setError("Esta cita manual todavia no tiene un enlace disponible o la paciente no tiene WhatsApp registrado.");
      return;
    }

    const paymentLink = `${window.location.origin}/pago-cita/${row.public_payment_token}`;
    const hoursLeft = getHoursUntilExpiration(row.public_payment_token_expires_at);
    const whatsappMessage = [
      `Hola ${row.patients?.full_name ?? "paciente"},`,
      `te compartimos el enlace para confirmar tu cita de ${row.title ?? row.appointment_type} en modalidad ${getCareModeLabel(row.care_mode).toLowerCase()} el ${formatDate(row.appointment_date)} a las ${row.start_time.slice(0, 5)}${row.doctor_profiles?.full_name ? ` con la Dra. ${row.doctor_profiles.full_name}` : ""}.`,
      `Monto pendiente: ${formatMoney(row.payment_amount ?? 0)}.`,
      `Para confirmar tu reserva tienes ${buildPaymentWindowLabel(hoursLeft)} para realizar el pago y subir tu comprobante.`,
      `Enlace de pago: ${paymentLink}`,
    ].join("\n");

    const href = buildWhatsAppHref(row.patients.phone, whatsappMessage);
    if (!href) {
      setError("No encontramos un numero de WhatsApp valido para esta paciente.");
      return;
    }

    window.open(href, "_blank", "noopener,noreferrer");
  };

  const regenerateAndOpenManualPaymentLink = async (row: AppointmentReservationRow) => {
    try {
      const regenerated = await regenerateManualReservationPaymentLink(row.id, getHoursUntilExpiration(row.public_payment_token_expires_at));
      setSuccess("Enlace de pago regenerado correctamente. Ya puedes reenviarlo por WhatsApp.");
      setError("");
      await load();
      window.setTimeout(() => openManualPaymentLink(regenerated), 100);
    } catch (regenerateError) {
      setError(getErrorMessage(regenerateError, "No pudimos regenerar el enlace de pago."));
    }
  };

  const handleSelectPatient = (patient: PatientRow) => {
    form.setValue("patient_id", patient.id, { shouldDirty: true, shouldValidate: true });
    if (patient.city) {
      form.setValue("city", patient.city, { shouldDirty: true });
    }
    setPatientQuery(buildPatientLabel(patient));
    setPatientPickerOpen(false);
    setPatientModalOpen(false);
    setPatientModalError("");
    clearQuickPatientDraft();
  };

  const handleSelectDoctor = (doctor: DoctorProfileRow | null) => {
    form.setValue("doctor_id", doctor?.id ?? "", { shouldDirty: true, shouldValidate: false });
    setDoctorQuery(doctor ? doctor.full_name : "");
    setDoctorPickerOpen(false);
  };

  const submitQuickPatient = async (values: QuickPatientForm) => {
    setSavingPatient(true);
    setPatientModalError("");

    const normalizedDocument = normalizeDocumentNumber(values.document_number);
    const existing = patients.find((patient) => normalizeDocumentNumber(patient.document_number).toLowerCase() === normalizedDocument.toLowerCase());
    if (existing) {
      handleSelectPatient(existing);
      setSavingPatient(false);
      clearQuickPatientDraft();
      setSuccess("Ese paciente ya existia. Lo dejamos seleccionado para que sigas con la cita.");
      return;
    }

    try {
      const created = await createPatient({
        full_name: values.full_name,
        document_number: normalizedDocument,
        phone: values.phone,
        email: values.email || null,
        city: values.city,
      });
      setPatients((current) => [created, ...current]);
      handleSelectPatient(created);
      clearQuickPatientDraft();
      quickPatientForm.reset({
        full_name: "",
        document_number: "",
        phone: "",
        email: "",
        city: values.city,
      });
      setSuccess("Paciente creado y listo para agendar.");
    } catch (createError) {
      setPatientModalError(getErrorMessage(createError, "No pudimos crear el paciente."));
    } finally {
      setSavingPatient(false);
    }
  };

  const submit = async (values: ManualForm) => {
    if (!selectedSlot) {
      setError("Selecciona un horario disponible.");
      return;
    }
    if (!selectedPatient) {
      setError("Selecciona un paciente antes de continuar.");
      return;
    }
    if (values.payment_amount <= 0) {
      setError("Define el monto de la cita antes de guardarla.");
      return;
    }
    if (values.collect_payment_now && !cashOpen) {
      setError("Primero abre la caja para registrar y confirmar esta cita con pago inmediato.");
      return;
    }
    if (values.collect_payment_now && values.payment_method.toLowerCase() !== "efectivo" && !receiptFile) {
      setError("Si cobras con QR o un medio digital, sube el comprobante antes de confirmar.");
      return;
    }

    setError("");
    setSuccess("");
    setFollowUpWhatsappHref(null);
    setFollowUpWhatsappLabel("");
    try {
      const directReceiptPath =
        values.collect_payment_now && values.payment_method.toLowerCase() !== "efectivo" && receiptFile
          ? await uploadManualReservationReceipt(receiptFile, selectedPatient.document_number ?? selectedPatient.id)
          : null;

      const created = await createManualAppointmentReservation({
        patient_id: selectedPatient.id,
        user_id: selectedPatient.profile_id ?? null,
        doctor_id: selectedSlot.doctor_id ?? values.doctor_id ?? null,
        slot: {
          rule_id: selectedSlot.rule_id,
          doctor_id: selectedSlot.doctor_id ?? values.doctor_id ?? null,
          date: selectedSlot.date,
          start_time: selectedSlot.start_time,
          end_time: selectedSlot.end_time,
          city: selectedSlot.city,
          location: selectedSlot.location,
          appointment_type: selectedSlot.appointment_type,
          care_mode: selectedSlot.care_mode,
        },
        title: selectedSlot.appointment_type,
        notes: values.notes,
        payment_amount: values.payment_amount,
        payment_method: values.collect_payment_now ? values.payment_method : null,
        payment_receipt_path: directReceiptPath,
        payment_window_hours: values.payment_window_hours,
        created_by: user?.id ?? null,
        confirm_immediately: values.collect_payment_now,
      });

      if (values.collect_payment_now) {
        setSuccess(
          values.payment_method.toLowerCase() === "efectivo"
            ? "Cita manual creada, confirmada y enviada a caja como efectivo."
            : "Cita manual creada, comprobante recibido y pago enviado a caja."
        );
      } else {
        const paymentLink = created.public_payment_token ? `${window.location.origin}/pago-cita/${created.public_payment_token}` : null;
        const deadlineLabel = buildPaymentWindowLabel(values.payment_window_hours);
        const selectedSlotDoctorName =
          doctors.find((doctor) => doctor.id === selectedSlot.doctor_id)?.full_name ??
          selectedDoctor?.full_name ??
          null;
        const whatsappMessage = [
          `Hola ${selectedPatient.full_name},`,
          `te compartimos el enlace para confirmar tu cita de ${selectedSlot.appointment_type} en modalidad ${getCareModeLabel(selectedSlot.care_mode).toLowerCase()} el ${formatDate(selectedSlot.date)} a las ${selectedSlot.start_time.slice(0, 5)}${selectedSlotDoctorName ? ` con la Dra. ${selectedSlotDoctorName}` : ""}.`,
          `Monto pendiente: ${formatMoney(values.payment_amount)}.`,
          `Para confirmar tu reserva tienes ${deadlineLabel} para realizar el pago y subir tu comprobante.`,
          paymentLink ? `Enlace de pago: ${paymentLink}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        const whatsappHref = buildWhatsAppHref(selectedPatient.phone, whatsappMessage);

        setFollowUpWhatsappHref(hidePatientPhone ? null : whatsappHref);
        setFollowUpWhatsappLabel("Enviar enlace de pago por WhatsApp");
        setSuccess(
          hidePatientPhone
            ? "Cita manual creada como pendiente de pago."
            : "Cita manual creada como pendiente de pago. Ya puedes mandarle el enlace por WhatsApp para que pague sin registrarse."
        );
      }

      form.reset({
        patient_id: "",
        doctor_id: doctorFieldLocked ? doctorProfileId ?? "" : values.doctor_id,
        city: values.city,
        appointment_type: values.appointment_type,
        date: "",
        notes: "",
        collect_payment_now: false,
        payment_amount: 0,
        payment_method: values.payment_method,
        payment_window_hours: values.payment_window_hours,
      });
      clearManualDraft();
      setPatientQuery("");
      setDoctorQuery(doctorFieldLocked ? doctorProfileName : values.doctor_id ? doctorQuery : "");
      setReceiptFile(null);
      setSelectedSlot(null);
      setViewMode("scheduled");
      load();
    } catch (submitError) {
      setError(getErrorMessage(submitError, "No pudimos reservar ese horario."));
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">Reservas y citas</p>
          <h1 className="font-display mt-3 text-5xl font-semibold">Agenda clinica conectada con caja</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-copy)]">
            Busca pacientes por nombre o carnet, registra fichas clinicas rapidas y separa claramente la creacion de nuevas citas del seguimiento diario.
          </p>
        </div>
      </div>

      {success ? <div className="rounded-[24px] border border-[rgba(111,122,96,0.24)] bg-[rgba(111,122,96,0.12)] px-5 py-4 text-sm font-semibold text-[var(--color-ink)]">{success}</div> : null}
      {followUpWhatsappHref ? (
        <a
          href={followUpWhatsappHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-5 py-3 text-sm font-semibold text-[var(--color-ink)]"
        >
          {followUpWhatsappLabel}
        </a>
      ) : null}
      {error ? <div className="rounded-[24px] border border-[rgba(154,107,67,0.2)] bg-[rgba(154,107,67,0.08)] px-5 py-4 text-sm font-semibold text-[var(--color-ink)]">{error}</div> : null}

      <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-3 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setViewMode("create")}
            className={`rounded-[24px] px-5 py-4 text-left transition ${
              viewMode === "create" ? "bg-[var(--color-mocha)] text-white shadow-[0_18px_35px_rgba(62,42,31,0.16)]" : "border border-[var(--color-border)] bg-[rgba(247,242,236,0.75)] text-[var(--color-ink)]"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-80">Crear cita</p>
            <p className="mt-2 text-xl font-semibold">Nueva agenda manual</p>
            <p className="mt-2 text-sm opacity-80">Busca a la paciente, agrega una ficha rapida si no existe y toma el horario sin perder el ritmo.</p>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("scheduled")}
            className={`rounded-[24px] px-5 py-4 text-left transition ${
              viewMode === "scheduled" ? "bg-[var(--color-mocha)] text-white shadow-[0_18px_35px_rgba(62,42,31,0.16)]" : "border border-[var(--color-border)] bg-[rgba(247,242,236,0.75)] text-[var(--color-ink)]"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-80">Citas programadas</p>
            <p className="mt-2 text-xl font-semibold">{rows.length + appointments.length} registros activos</p>
            <p className="mt-2 text-sm opacity-80">Revisa reservas con pago y citas internas desde una sola vista mucho mas clara.</p>
          </button>
        </div>
      </section>

      {viewMode === "create" ? (
        <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Crear cita manual</h2>
              <p className="mt-1 text-sm text-[var(--color-copy)]">Si no encuentras a la paciente, usa el icono para crear una ficha clinica rapida sin salir de esta vista.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(198,162,123,0.16)] px-4 py-2 text-xs font-semibold text-[var(--color-mocha)]">
              <CalendarClock className="h-4 w-4" />
              {selectedPatient?.profile_id ? "Tiene acceso al portal" : selectedPatient ? "Ficha clinica sin cuenta aun" : "Esperando paciente"}
            </div>
          </div>

          <form onSubmit={form.handleSubmit(submit)} className="mt-6 grid gap-6">
            <div className="grid gap-4">
              <Field label="Paciente" error={form.formState.errors.patient_id?.message}>
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-copy)]" />
                      <input
                        value={patientQuery}
                        onFocus={() => setPatientPickerOpen(true)}
                        onBlur={() => window.setTimeout(() => setPatientPickerOpen(false), 120)}
                        onChange={(event) => {
                          setPatientQuery(event.target.value);
                          setPatientPickerOpen(true);
                          form.setValue("patient_id", "", { shouldDirty: true, shouldValidate: true });
                        }}
                        placeholder={hidePatientPhone ? "Buscar por nombre, CI o correo" : "Buscar por nombre, CI, celular o correo"}
                        className="premium-input !pl-12"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        quickPatientForm.reset({
                          full_name: "",
                          document_number: "",
                          phone: "",
                          email: "",
                          city: watched.city || "Cochabamba",
                        });
                        setPatientModalError("");
                        setPatientModalOpen(true);
                      }}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/80 text-[var(--color-mocha)] transition hover:bg-[rgba(198,162,123,0.12)]"
                      aria-label="Crear paciente rapido"
                      title="Crear paciente rapido"
                    >
                      <UserRoundPlus className="h-5 w-5" />
                    </button>
                  </div>

                  {patientPickerOpen ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white shadow-[0_18px_45px_rgba(62,42,31,0.12)]">
                      {filteredPatients.length > 0 ? (
                        <div className="max-h-72 overflow-y-auto p-2">
                          {filteredPatients.map((patient) => (
                            <button
                              type="button"
                              key={patient.id}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleSelectPatient(patient)}
                              className="flex w-full flex-col rounded-[18px] px-4 py-3 text-left transition hover:bg-[rgba(247,242,236,0.82)]"
                            >
                              <span className="text-sm font-semibold text-[var(--color-ink)]">{patient.full_name}</span>
                              <span className="mt-1 text-xs text-[var(--color-copy)]">
                                CI {patient.document_number ?? "sin carnet"}
                                {!hidePatientPhone ? ` · ${patient.phone ?? "sin celular"}` : ""}
                                {` · ${patient.city ?? "sin ciudad"}`}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-3 p-4">
                          <p className="text-sm text-[var(--color-copy)]">No encontramos coincidencias. Puedes crear una ficha rapida y seguir desde aqui mismo.</p>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              quickPatientForm.reset({
                                full_name: patientQuery.trim(),
                                document_number: "",
                                phone: "",
                                email: "",
                                city: watched.city || "Cochabamba",
                              });
                              setPatientModalError("");
                              setPatientModalOpen(true);
                            }}
                            className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
                          >
                            <UserRoundPlus className="h-4 w-4" />
                            Crear paciente desde aqui
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </Field>

              {selectedPatient ? (
                <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Paciente seleccionado</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-lg font-semibold text-[var(--color-ink)]">{selectedPatient.full_name}</p>
                      <p className="mt-1 text-sm text-[var(--color-copy)]">
                        CI {selectedPatient.document_number ?? "sin carnet"}
                        {!hidePatientPhone ? ` · ${selectedPatient.phone ?? "sin celular"}` : ""}
                        {` · ${selectedPatient.city ?? "sin ciudad"}`}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                      {selectedPatient.profile_id ? "Cuenta vinculada" : "Solo ficha clinica"}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Doctora">
                  <div className="relative">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-copy)]" />
                      <input
                        value={doctorQuery}
                        onFocus={() => setDoctorPickerOpen(true)}
                        onBlur={() => window.setTimeout(() => setDoctorPickerOpen(false), 120)}
                        onChange={(event) => {
                          setDoctorQuery(event.target.value);
                          setDoctorPickerOpen(true);
                          form.setValue("doctor_id", "", { shouldDirty: true, shouldValidate: false });
                        }}
                        placeholder="Escribe para filtrar por doctora"
                        className="premium-input !pl-12"
                        disabled={doctorFieldLocked}
                      />
                    </div>
                    {!doctorFieldLocked && doctorPickerOpen ? (
                      <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-white shadow-[0_18px_45px_rgba(62,42,31,0.12)]">
                        <div className="max-h-72 overflow-y-auto p-2">
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelectDoctor(null)}
                            className="flex w-full flex-col rounded-[18px] px-4 py-3 text-left transition hover:bg-[rgba(247,242,236,0.82)]"
                          >
                            <span className="text-sm font-semibold text-[var(--color-ink)]">Todas las doctoras</span>
                            <span className="mt-1 text-xs text-[var(--color-copy)]">Mostrar horarios sin filtrar por una doctora especifica.</span>
                          </button>
                          {filteredDoctors.map((doctor) => (
                            <button
                              type="button"
                              key={doctor.id}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleSelectDoctor(doctor)}
                              className="flex w-full flex-col rounded-[18px] px-4 py-3 text-left transition hover:bg-[rgba(247,242,236,0.82)]"
                            >
                              <span className="text-sm font-semibold text-[var(--color-ink)]">{doctor.full_name}</span>
                              <span className="mt-1 text-xs text-[var(--color-copy)]">{doctor.specialty ?? "Doctora"} · {doctor.city ?? "sin ciudad"}</span>
                            </button>
                          ))}
                          {filteredDoctors.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-[var(--color-copy)]">No encontramos doctoras con ese nombre.</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </Field>
                <Field label="Ciudad" error={form.formState.errors.city?.message}>
                  <select {...form.register("city")} className="premium-input">
                    <option value="">Selecciona ciudad</option>
                    {boliviaCities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tipo de cita" error={form.formState.errors.appointment_type?.message}>
                  <select {...form.register("appointment_type")} className="premium-input">
                    {appointmentTypes.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Fecha opcional" error={form.formState.errors.date?.message}>
                <input type="date" min={new Date().toISOString().slice(0, 10)} {...form.register("date")} className="premium-input" />
              </Field>
              <p className="text-xs leading-6 text-[var(--color-copy)]">
                Si no eliges fecha, te mostraremos los proximos horarios disponibles de la doctora segun el tipo de consulta.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Monto de la cita" error={form.formState.errors.payment_amount?.message}>
                  <input type="number" min={0} step="0.01" {...form.register("payment_amount")} className="premium-input" />
                </Field>
                <Field label="Tiempo para pagar el enlace" error={form.formState.errors.payment_window_hours?.message}>
                  <select {...form.register("payment_window_hours")} className="premium-input">
                    <option value="1">1 hora</option>
                    <option value="6">6 horas</option>
                    <option value="12">12 horas</option>
                    <option value="24">24 horas</option>
                    <option value="48">48 horas</option>
                  </select>
                </Field>
              </div>

              <Field label="Notas internas">
                <textarea {...form.register("notes")} className="premium-input min-h-24" />
              </Field>
            </div>

            <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input type="checkbox" {...form.register("collect_payment_now")} className="h-4 w-4" />
                Registrar pago ahora y confirmar la cita
              </label>
              <p className="mt-2 text-xs leading-6 text-[var(--color-copy)]">
                {cashOpen
                  ? "La caja esta abierta. Si cobras ahora, la cita confirmada entrara directo al flujo de caja."
                  : "La caja esta cerrada. Para cobrar y confirmar en este momento primero debes abrir caja."}
              </p>
              {watched.collect_payment_now ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Metodo de pago" error={form.formState.errors.payment_method?.message}>
                    <select {...form.register("payment_method")} className="premium-input">
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.code}>
                          {method.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {watched.payment_method.toLowerCase() !== "efectivo" ? (
                    <Field label="Comprobante QR / digital">
                      <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[18px] border border-[var(--color-border)] bg-white/82 px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">
                        {receiptFile ? "Cambiar comprobante" : "Subir comprobante"}
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                    </Field>
                  ) : null}
                </div>
              ) : null}
              {!watched.collect_payment_now ? (
                <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
                  Si dejas esta opcion apagada, la cita se crea como <strong className="text-[var(--color-ink)]">pendiente de pago</strong> y te dejaremos listo el boton para enviarle el enlace por WhatsApp sin necesidad de registro.
                </p>
              ) : null}
              {watched.collect_payment_now && watched.payment_method.toLowerCase() !== "efectivo" && siteSettings?.payment_qr_image ? (
                <div className="mt-4 rounded-[22px] bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">QR configurado</p>
                  <img src={siteSettings.payment_qr_image} alt="QR de pago" className="mx-auto mt-3 h-36 w-36 rounded-[20px] object-contain" />
                  {receiptFile ? <p className="mt-3 text-xs text-[var(--color-copy)]">Comprobante listo: {receiptFile.name}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
              <p className="text-sm font-semibold">{watched.date?.trim() ? "Horarios disponibles" : "Proximos horarios disponibles"}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {loadingSlots ? <p className="col-span-full text-sm text-[var(--color-copy)]">Buscando horarios...</p> : null}
                {!loadingSlots && slots.length === 0 ? <p className="col-span-full text-sm text-[var(--color-copy)]">No hay horarios para esos filtros.</p> : null}
                {slots.map((slot) => {
                  const isSelected = selectedSlot ? getSlotKey(selectedSlot) === getSlotKey(slot) : false;
                  return (
                    <button
                      type="button"
                      key={getSlotKey(slot)}
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-[22px] border px-4 py-4 text-left text-sm font-semibold transition ${
                        isSelected ? "border-[var(--color-mocha)] bg-[var(--color-mocha)] text-white" : "border-[var(--color-border)] bg-white/75"
                      }`}
                    >
                      <span className="block text-xs uppercase tracking-[0.16em] opacity-80">{formatDate(slot.date)}</span>
                      <span className="block text-base">{slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}</span>
                      <span className="mt-2 block text-xs uppercase tracking-[0.16em] opacity-80">{slot.appointment_type}</span>
                      <span className="mt-1 block text-xs opacity-80">{slot.location ?? slot.city}</span>
                      <span className="mt-1 block text-xs opacity-80">{slot.available_capacity} cupo(s) libres</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
              <Send className="h-4 w-4" />
              {watched.collect_payment_now ? "Guardar, confirmar y mandar a caja" : "Crear cita"}
            </button>
          </form>
        </section>
      ) : null}

      {viewMode === "scheduled" ? (
        <section className="space-y-6">
          <section className="rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Citas programadas</h2>
                <p className="mt-1 text-sm text-[var(--color-copy)]">Filtra por fecha, ciudad o estado para concentrarte en lo que toca mover hoy.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["Todos", "Reservas", "Internas"] as SourceFilter[]).map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setScheduleFilters((current) => ({ ...current, source }))}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      scheduleFilters.source === source ? "bg-[var(--color-mocha)] text-white" : "border border-[var(--color-border)] bg-white/80 text-[var(--color-ink)]"
                    }`}
                  >
                    {source}
                    <span className="ml-2 text-xs opacity-80">
                      {source === "Todos" ? rows.length + appointments.length : source === "Reservas" ? rows.length : appointments.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-[1.15fr_0.8fr_0.75fr_0.75fr]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-copy)]" />
                  <input
                    value={scheduleFilters.query}
                    onChange={(event) => setScheduleFilters((current) => ({ ...current, query: event.target.value }))}
                    className="premium-input !pl-12"
                    placeholder="Buscar paciente, carnet, celular o tipo"
                  />
                </div>
              <select value={scheduleFilters.city} onChange={(event) => setScheduleFilters((current) => ({ ...current, city: event.target.value }))} className="premium-input">
                <option value="Todas">Todas las ciudades</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={scheduleFilters.date}
                onChange={(event) => setScheduleFilters((current) => ({ ...current, date: event.target.value }))}
                className="premium-input"
              />
              <select value={scheduleFilters.status} onChange={(event) => setScheduleFilters((current) => ({ ...current, status: event.target.value }))} className="premium-input">
                {appointmentStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Reservas con pago o panel</h3>
                <span className="rounded-full bg-[rgba(198,162,123,0.16)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">{filteredReservations.length}</span>
              </div>
              {loading ? <LoadingState /> : null}
              {!loading && filteredReservations.length === 0 ? <EmptyState label="No hay reservas con esos filtros." /> : null}
              {!loading &&
                filteredReservations.map((row) => (
                <ReservationCard
                  key={row.id}
                  row={row}
                  role={role}
                  hidePatientPhone={hidePatientPhone}
                  actorId={actorId}
                  actorName={actorName}
                  actorEmail={actorEmail}
                  doctors={doctors}
                  doctorFieldLocked={doctorFieldLocked}
                  onChanged={load}
                    onOpenApproval={openApproval}
                    onSendManualPaymentLink={openManualPaymentLink}
                    onRegenerateManualPaymentLink={regenerateAndOpenManualPaymentLink}
                  />
                ))}
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Citas internas</h3>
                <span className="rounded-full bg-[rgba(111,122,96,0.14)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">{filteredAppointments.length}</span>
              </div>
              {loading ? <LoadingState /> : null}
              {!loading && filteredAppointments.length === 0 ? <EmptyState label="No hay citas internas con esos filtros." /> : null}
              {!loading &&
                filteredAppointments.map((item) => (
                <AppointmentCard
                  key={item.id}
                  item={item}
                  role={role}
                  hidePatientPhone={hidePatientPhone}
                  actorId={actorId}
                  actorName={actorName}
                  actorEmail={actorEmail}
                  doctors={doctors}
                  doctorFieldLocked={doctorFieldLocked}
                  onChanged={load}
                  />
                ))}
            </section>
          </div>
        </section>
      ) : null}

      {approvalDraft ? (
        <ModalShell title="Aprobar pago de cita" onClose={() => setApprovalDraft(null)}>
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Reserva</p>
              <p className="mt-2 text-lg font-semibold">{approvalDraft.patientName}</p>
              <p className="mt-1 text-sm text-[var(--color-copy)]">{approvalDraft.appointmentType}</p>
              <p className="mt-2 text-sm text-[var(--color-copy)]">
                {formatDate(approvalDraft.appointmentDate)} - {approvalDraft.startTime.slice(0, 5)} a {approvalDraft.endTime.slice(0, 5)}
                {approvalDraft.doctorName ? ` · Dra. ${approvalDraft.doctorName}` : ""}
                <br />
                Modalidad: {getCareModeLabel(approvalDraft.careMode)}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monto pagado">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(approvalDraft.amount)}
                  onChange={(event) => setApprovalDraft({ ...approvalDraft, amount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>
              <Field label="Metodo de pago">
                <select
                  value={approvalDraft.paymentMethod}
                  onChange={(event) => setApprovalDraft({ ...approvalDraft, paymentMethod: event.target.value })}
                  className="premium-input"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.code}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notas administrativas">
              <textarea
                value={approvalDraft.notes}
                onChange={(event) => setApprovalDraft({ ...approvalDraft, notes: event.target.value })}
                className="premium-input min-h-28"
              />
            </Field>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => void submitApproval()} disabled={savingApproval} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {savingApproval ? "Guardando..." : "Aprobar y mandar a caja"}
            </button>
            <button onClick={() => setApprovalDraft(null)} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
              Cancelar
            </button>
          </div>
        </ModalShell>
      ) : null}

      {patientModalOpen ? (
        <ModalShell
          title="Crear paciente rapido"
          onClose={() => {
            setPatientModalOpen(false);
            setPatientModalError("");
            clearQuickPatientDraft();
            quickPatientForm.reset({
              full_name: "",
              document_number: "",
              phone: "",
              email: "",
              city: "Cochabamba",
            });
          }}
        >
          <form onSubmit={quickPatientForm.handleSubmit((values) => void submitQuickPatient(values))} className="grid gap-4">
            {patientModalError ? <div className="rounded-[20px] border border-[rgba(154,107,67,0.2)] bg-[rgba(154,107,67,0.08)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">{patientModalError}</div> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre completo" error={quickPatientForm.formState.errors.full_name?.message}>
                <input {...quickPatientForm.register("full_name")} className="premium-input" />
              </Field>
              <Field label="Numero de carnet / CI" error={quickPatientForm.formState.errors.document_number?.message}>
                <input
                  {...quickPatientForm.register("document_number", {
                    onChange: (event) => {
                      event.target.value = normalizeDocumentNumber(event.target.value);
                    },
                  })}
                  className="premium-input"
                />
              </Field>
              {!hidePatientPhone ? (
                <Field label="WhatsApp / celular" error={quickPatientForm.formState.errors.phone?.message}>
                  <input {...quickPatientForm.register("phone")} className="premium-input" />
                </Field>
              ) : null}
              <Field label="Correo" error={quickPatientForm.formState.errors.email?.message}>
                <input {...quickPatientForm.register("email")} className="premium-input" />
              </Field>
              <Field label="Ciudad" error={quickPatientForm.formState.errors.city?.message}>
                <select {...quickPatientForm.register("city")} className="premium-input">
                  {boliviaCities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <button disabled={savingPatient} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {savingPatient ? "Guardando..." : "Guardar y usar en esta cita"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPatientModalOpen(false);
                  setPatientModalError("");
                  clearQuickPatientDraft();
                  quickPatientForm.reset({
                    full_name: "",
                    document_number: "",
                    phone: "",
                    email: "",
                    city: "Cochabamba",
                  });
                }}
                className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}

function ReservationCard({
  row,
  role,
  hidePatientPhone,
  actorId,
  actorName,
  actorEmail,
  doctors,
  doctorFieldLocked,
  onChanged,
  onOpenApproval,
  onSendManualPaymentLink,
  onRegenerateManualPaymentLink,
}: {
  row: AppointmentReservationRow;
  role: ReturnType<typeof useAuth>["role"];
  hidePatientPhone: boolean;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  doctors: DoctorProfileRow[];
  doctorFieldLocked: boolean;
  onChanged: () => void;
  onOpenApproval: (row: AppointmentReservationRow) => void;
  onSendManualPaymentLink: (row: AppointmentReservationRow) => void;
  onRegenerateManualPaymentLink: (row: AppointmentReservationRow) => void;
}) {
  const phone = hidePatientPhone ? "" : row.patients?.phone?.replace(/\D/g, "") ?? "";
  const message = `Hola ${row.patients?.full_name ?? ""}, te escribimos de parte de la Dra. Estefany sobre tu cita de ${row.appointment_type} en modalidad ${getCareModeLabel(row.care_mode).toLowerCase()} del ${formatDate(row.appointment_date)} a las ${row.start_time.slice(0, 5)}${row.doctor_profiles?.full_name ? ` con la Dra. ${row.doctor_profiles.full_name}` : ""}.`;
  const hasReceipt = Boolean(row.payment_receipt_path);
  const isManualReservation = (row.source ?? "").toLowerCase().includes("admin_manual");
  const canSendManualLink = !hidePatientPhone && isManualReservation && row.status === "Pendiente" && !hasReceipt && Boolean(row.public_payment_token);
  const canRegenerateManualLink = !hidePatientPhone && isManualReservation && row.status === "Rechazada";

  const openReceipt = async () => {
    const url = await getReservationReceiptUrl(row.payment_receipt_path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleStatusChange = async (nextStatus: ReservationStatus) => {
    if (nextStatus === "Confirmada" && row.status !== "Confirmada") {
      onOpenApproval(row);
      return;
    }
    await updateReservationStatus(row.id, nextStatus);
    onChanged();
  };

  return (
    <article className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(198,162,123,0.16)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">{row.city}</span>
            <span className="rounded-full bg-[rgba(62,42,31,0.08)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">{row.status}</span>
            <span className="rounded-full bg-[rgba(247,242,236,0.9)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">Reserva</span>
            {row.cash_movement_id ? (
              <span className="rounded-full bg-[rgba(111,122,96,0.14)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">En caja</span>
            ) : null}
          </div>
          <h3 className="mt-3 text-lg font-semibold">{row.patients?.full_name ?? "Paciente"}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            {row.appointment_type}
            <br />
            {formatDate(row.appointment_date)} - {row.start_time.slice(0, 5)} a {row.end_time.slice(0, 5)}
            <br />
            Modalidad: {getCareModeLabel(row.care_mode)}
            {row.doctor_profiles?.full_name ? ` - Dra. ${row.doctor_profiles.full_name}` : ""}
            <br />
            {row.location ?? "Sin ubicacion"} - Origen: {getReservationSourceLabel(row.source)}
            <br />
            {row.payment_amount ? `${formatMoney(row.payment_amount)} - ${row.payment_method ?? "sin metodo"}` : hasReceipt ? "Comprobante cargado, falta validar monto." : "Sin pago confirmado"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={row.status} onChange={(event) => void handleStatusChange(event.target.value as ReservationStatus)} className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold">
            {reservationStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select
            value={row.doctor_id ?? ""}
            onChange={(event) => void updateReservation(row.id, { doctor_id: event.target.value || null }).then(onChanged)}
            className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold"
            disabled={doctorFieldLocked}
          >
            <option value="">Sin doctora</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.full_name}
              </option>
            ))}
          </select>
          {hasReceipt ? (
            <button onClick={() => void openReceipt()} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
              Ver comprobante
            </button>
          ) : null}
          {hasReceipt && row.status === "Pendiente" ? (
            <button onClick={() => onOpenApproval(row)} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
              Aprobar pago
            </button>
          ) : null}
          {hasReceipt && row.status === "Pendiente" ? (
            <button onClick={() => void rejectReservationPayment(row.id, row.admin_notes ?? "").then(onChanged)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
              Rechazar
            </button>
          ) : null}
          {canSendManualLink ? (
            <button onClick={() => onSendManualPaymentLink(row)} className="rounded-full bg-[rgb(48,146,91)] px-4 py-2 text-sm font-semibold text-white">
              Enviar link
            </button>
          ) : null}
          {canRegenerateManualLink ? (
            <button onClick={() => void onRegenerateManualPaymentLink(row)} className="rounded-full bg-[rgb(48,146,91)] px-4 py-2 text-sm font-semibold text-white">
              Regenerar link
            </button>
          ) : null}
          {phone ? (
            <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
              Abrir WhatsApp
            </a>
          ) : null}
          <DeleteActions
            role={role}
            row={row}
            onSoftDelete={() => void softDeleteRecord({ table: "appointment_reservations", id: row.id, actorId, actorRole: role, actorName, actorEmail }).then(onChanged)}
            onRestore={() => void restoreRecord("appointment_reservations", row.id).then(onChanged)}
            onHardDelete={() => void hardDeleteRecord("appointment_reservations", row.id).then(onChanged)}
          />
        </div>
      </div>
      <textarea
        defaultValue={row.admin_notes ?? ""}
        onBlur={(event) => void updateReservation(row.id, { admin_notes: event.target.value }).then(onChanged)}
        className="premium-input mt-4 min-h-24"
        placeholder="Notas administrativas"
      />
      <DeletedStatusNote row={row} />
    </article>
  );
}

function AppointmentCard({
  item,
  role,
  hidePatientPhone,
  actorId,
  actorName,
  actorEmail,
  doctors,
  doctorFieldLocked,
  onChanged,
}: {
  item: AppointmentAdminRow;
  role: ReturnType<typeof useAuth>["role"];
  hidePatientPhone: boolean;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  doctors: DoctorProfileRow[];
  doctorFieldLocked: boolean;
  onChanged: () => void;
}) {
  const phone = hidePatientPhone ? "" : item.patients?.phone?.replace(/\D/g, "") ?? "";
  const message = `Hola ${item.patients?.full_name ?? ""}, te escribimos de parte de la Dra. Estefany sobre tu cita de ${item.title} del ${item.appointment_date} a las ${item.start_time}.`;

  return (
    <article className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgba(111,122,96,0.14)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">{item.city}</span>
            <span className="rounded-full bg-[rgba(62,42,31,0.08)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">{item.status}</span>
            <span className="rounded-full bg-[rgba(247,242,236,0.9)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">Interna</span>
            {item.cash_movement_id ? (
              <span className="rounded-full bg-[rgba(111,122,96,0.14)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">En caja</span>
            ) : null}
          </div>
          <h3 className="mt-3 text-lg font-semibold">{item.patients?.full_name ?? "Paciente"}</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            {item.title}
            <br />
            {formatDate(item.appointment_date)} - {item.start_time.slice(0, 5)}{item.end_time ? ` a ${item.end_time.slice(0, 5)}` : ""}
            <br />
            {item.location ?? "Sin ubicacion"} - CI {item.patients?.document_number ?? "sin carnet"}
            <br />
            {item.payment_amount ? `${formatMoney(item.payment_amount)} - ${item.payment_method ?? "sin metodo"}` : "Sin pago confirmado"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={item.status} onChange={(event) => void updateAppointmentStatus(item.id, event.target.value).then(onChanged)} className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold">
            <option>Programada</option>
            <option>Confirmada</option>
            <option>Realizada</option>
            <option>Cancelada</option>
          </select>
          <select
            value={item.doctor_id ?? ""}
            onChange={(event) => void updateAppointment(item.id, { doctor_id: event.target.value || null }).then(onChanged)}
            className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-sm font-semibold"
            disabled={doctorFieldLocked}
          >
            <option value="">Sin doctora</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.full_name}
              </option>
            ))}
          </select>
          {phone ? (
            <a href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
              Abrir WhatsApp
            </a>
          ) : null}
          <DeleteActions
            role={role}
            row={item}
            onSoftDelete={() => void softDeleteRecord({ table: "appointments", id: item.id, actorId, actorRole: role, actorName, actorEmail }).then(onChanged)}
            onRestore={() => void restoreRecord("appointments", item.id).then(onChanged)}
            onHardDelete={() => void hardDeleteRecord("appointments", item.id).then(onChanged)}
          />
        </div>
      </div>
      <textarea
        defaultValue={item.notes ?? ""}
        onBlur={(event) => void updateAppointment(item.id, { notes: event.target.value }).then(onChanged)}
        className="premium-input mt-4 min-h-24"
        placeholder="Notas administrativas"
      />
      <DeletedStatusNote row={item} />
    </article>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="w-full max-w-2xl rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Reservas</p>
            <h2 className="font-display mt-2 text-4xl font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
            Cerrar
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </label>
  );
}

function buildPatientSearchIndex(patient: PatientRow, hidePatientPhone = false) {
  return normalizeSearchText([
    patient.full_name,
    patient.document_number,
    hidePatientPhone ? null : patient.phone,
    patient.email,
    patient.city,
  ].filter(Boolean).join(" "));
}

function buildPatientLabel(patient: PatientRow) {
  return `${patient.full_name} · CI ${patient.document_number ?? "sin carnet"}`;
}

function buildDoctorSearchIndex(doctor: DoctorProfileRow) {
  return normalizeSearchText([doctor.full_name, doctor.specialty, doctor.city, doctor.email].filter(Boolean).join(" "));
}

function normalizeSearchText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9a-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const maybeMessage = "message" in error ? error.message : null;
    const maybeDetails = "details" in error ? error.details : null;
    const maybeHint = "hint" in error ? error.hint : null;
    const parts = [maybeMessage, maybeDetails, maybeHint].filter((value) => typeof value === "string" && value.trim().length > 0);
    if (parts.length > 0) return parts.join(" · ");
  }
  return fallback;
}

function getSlotKey(slot: AvailableSlot) {
  return `${slot.rule_id}-${slot.date}-${slot.start_time}-${slot.end_time}-${slot.city}-${slot.appointment_type}`;
}

function buildPaymentWindowLabel(hours: number) {
  if (hours <= 1) return "1 hora";
  if (hours < 24) return `${hours} horas`;
  if (hours === 24) return "24 horas";
  return `${hours} horas`;
}

function getHoursUntilExpiration(value?: string | null) {
  if (!value) return 24;
  const diff = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return 24;
  return Math.max(1, Math.round(diff / (60 * 60 * 1000)));
}

function getReservationSourceLabel(source?: string | null) {
  const normalized = (source ?? "").toLowerCase();
  if (normalized.includes("admin_manual")) return "Cita manual";
  if (normalized.includes("assessment") || normalized.includes("valoracion")) return "Valoracion";
  if (normalized.includes("promotion") || normalized.includes("promocion")) return "Promocion";
  if (normalized === "admin") return "Panel admin";
  if (normalized === "patient") return "Paciente";
  return source ?? "Sistema";
}
