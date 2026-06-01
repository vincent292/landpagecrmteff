import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Archive, Building2, Calculator, Landmark, Pencil, Receipt, Wallet } from "lucide-react";

import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { hardDeleteRecord, isSoftDeleted, restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import {
  closeCashRegisterSession,
  createCashDrawer,
  createCashMovement,
  createCashRegisterSession,
  getCashMovementAttachmentUrl,
  getCashDenominations,
  getCashDrawers,
  getCashMovements,
  getCashPaymentMethods,
  getCashRegisterSessions,
  getCashSessionCountLines,
  getCashSessionCounts,
  recordCashSessionCount,
  uploadCashMovementAttachment,
  updateCashDrawer,
  updateCashMovement,
  updateCashRegisterSession,
  type CashDenominationRow,
  type CashDrawerRow,
  type CashMovementRow,
  type CashPaymentMethodRow,
  type CashRegisterSessionRow,
  type CashSessionCountLineRow,
  type CashSessionCountRow,
} from "../../services/cashService";
import { getSavingsCardByTokenAdmin, redeemSavingsCard, type SavingsCardRow } from "../../services/savingsCardService";
import { getAdminTreatments, type TreatmentRow } from "../../services/treatmentService";
import { downloadCsv } from "../../utils/csv";
import { formatDate, formatMoney } from "../../utils/text";

type TabKey = "resumen" | "sesiones" | "movimientos" | "arqueos" | "configuracion";
type ModalKey = "session" | "movement" | "drawer" | "count" | "savingsCardRedeem" | null;

type SessionFormState = {
  session_date: string;
  drawer_id: string;
  city: string;
  location_name: string;
  opening_amount: number;
  opening_notes: string;
};

type MovementFormState = {
  register_session_id: string;
  drawer_id: string;
  movement_type: CashMovementRow["movement_type"];
  amount: number;
  payment_method: string;
  source_module: string;
  movement_category: string;
  concept: string;
  reference_name: string;
  city: string;
  movement_date: string;
  status: CashMovementRow["status"];
  notes: string;
};

type DrawerFormState = {
  name: string;
  city: string;
  location_name: string;
  base_amount: number;
  accepts_cash: boolean;
  accepts_qr: boolean;
  accepts_transfer: boolean;
  accepts_card: boolean;
  is_active: boolean;
};

type CountFormState = {
  sessionId: string;
  countType: CashSessionCountRow["count_type"];
  notes: string;
  quantities: Record<string, number>;
};

type SavingsCardRedeemFormState = {
  token: string;
  treatmentId: string;
  treatmentTitle: string;
  treatmentPrice: number;
  paymentMethod: string;
  notes: string;
};

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "resumen", label: "Resumen" },
  { key: "sesiones", label: "Aperturas y cierres" },
  { key: "movimientos", label: "Movimientos" },
  { key: "arqueos", label: "Arqueos" },
  { key: "configuracion", label: "Cajas y metodos" },
];

const boliviaTimeZone = "America/La_Paz";

const emptySessionForm: SessionFormState = {
  session_date: getBoliviaDateInputValue(),
  drawer_id: "",
  city: "",
  location_name: "",
  opening_amount: 0,
  opening_notes: "",
};

const emptyMovementForm: MovementFormState = {
  register_session_id: "",
  drawer_id: "",
  movement_type: "ingreso",
  amount: 0,
  payment_method: "efectivo",
  source_module: "",
  movement_category: "operacion",
  concept: "",
  reference_name: "",
  city: "",
  movement_date: getBoliviaDateInputValue(),
  status: "registrado",
  notes: "",
};

const emptyDrawerForm: DrawerFormState = {
  name: "",
  city: "",
  location_name: "",
  base_amount: 0,
  accepts_cash: true,
  accepts_qr: true,
  accepts_transfer: true,
  accepts_card: false,
  is_active: true,
};

const emptySavingsCardRedeemForm: SavingsCardRedeemFormState = {
  token: "",
  treatmentId: "",
  treatmentTitle: "",
  treatmentPrice: 0,
  paymentMethod: "efectivo",
  notes: "",
};

export function CashAdminPage() {
  const { role, profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("resumen");
  const [movements, setMovements] = useState<CashMovementRow[]>([]);
  const [sessions, setSessions] = useState<CashRegisterSessionRow[]>([]);
  const [drawers, setDrawers] = useState<CashDrawerRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [denominations, setDenominations] = useState<CashDenominationRow[]>([]);
  const [counts, setCounts] = useState<CashSessionCountRow[]>([]);
  const [countLines, setCountLines] = useState<CashSessionCountLineRow[]>([]);
  const [treatments, setTreatments] = useState<TreatmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [methodFilter, setMethodFilter] = useState("Todos");
  const [dateFilter, setDateFilter] = useState("");
  const [modal, setModal] = useState<ModalKey>(null);
  const [saving, setSaving] = useState(false);
  const [editingMovement, setEditingMovement] = useState<CashMovementRow | null>(null);
  const [editingSession, setEditingSession] = useState<CashRegisterSessionRow | null>(null);
  const [editingDrawer, setEditingDrawer] = useState<CashDrawerRow | null>(null);
  const [sessionForm, setSessionForm] = useState<SessionFormState>(emptySessionForm);
  const [movementForm, setMovementForm] = useState<MovementFormState>(emptyMovementForm);
  const [movementAttachmentFile, setMovementAttachmentFile] = useState<File | null>(null);
  const [drawerForm, setDrawerForm] = useState<DrawerFormState>(emptyDrawerForm);
  const [countForm, setCountForm] = useState<CountFormState>({ sessionId: "", countType: "arqueo", notes: "", quantities: {} });
  const [savingsCardRedeemForm, setSavingsCardRedeemForm] = useState<SavingsCardRedeemFormState>(emptySavingsCardRedeemForm);
  const [savingsCardLookup, setSavingsCardLookup] = useState<SavingsCardRow | null>(null);
  const [lookingUpSavingsCard, setLookingUpSavingsCard] = useState(false);
  const [savingSavingsCardRedeem, setSavingSavingsCardRedeem] = useState(false);

  const actorId = profile?.id ?? user?.id ?? null;
  const actorName = profile?.full_name ?? user?.user_metadata.full_name ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;
  const includeDeleted = role === "superadmin";

  const load = () => {
    setLoading(true);
    setError(false);
    Promise.all([
      getCashMovements(includeDeleted),
      getCashRegisterSessions(includeDeleted),
      getCashDrawers(includeDeleted),
      getCashPaymentMethods(true),
      getCashDenominations(true),
      getCashSessionCounts(includeDeleted),
      getAdminTreatments(),
    ])
      .then(async ([movementRows, sessionRows, drawerRows, methodRows, denominationRows, countRows, treatmentRows]) => {
        setMovements(movementRows);
        setSessions(sessionRows);
        setDrawers(drawerRows);
        setPaymentMethods(methodRows);
        setDenominations(denominationRows);
        setCounts(countRows);
        setTreatments(treatmentRows.filter((item) => !item.is_deleted && item.is_active !== false));
        const lines = await getCashSessionCountLines(countRows.map((row) => row.id));
        setCountLines(lines);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [includeDeleted]);

  const drawerMap = useMemo(() => new Map(drawers.map((drawer) => [drawer.id, drawer])), [drawers]);
  const sessionMap = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const countLinesByCount = useMemo(() => {
    const map = new Map<string, CashSessionCountLineRow[]>();
    countLines.forEach((line) => {
      const bucket = map.get(line.count_id) ?? [];
      bucket.push(line);
      map.set(line.count_id, bucket);
    });
    return map;
  }, [countLines]);

  const openSessions = useMemo(() => sessions.filter((session) => !session.is_deleted && session.status === "abierta"), [sessions]);
  const activeMovements = useMemo(() => movements.filter((row) => !isSoftDeleted(row) && row.status !== "anulado"), [movements]);
  const filteredMovements = useMemo(() => {
    const search = query.trim().toLowerCase();
    return movements.filter((row) => {
      const matchesQuery =
        !search || JSON.stringify([row.concept, row.reference_name, row.source_module, row.city, row.notes, row.movement_category]).toLowerCase().includes(search);
      const matchesType = typeFilter === "Todos" || row.movement_type === typeFilter;
      const matchesStatus = statusFilter === "Todos" || row.status === statusFilter;
      const matchesMethod = methodFilter === "Todos" || row.payment_method === methodFilter;
      const matchesDate = !dateFilter || row.movement_date === dateFilter;
      return matchesQuery && matchesType && matchesStatus && matchesMethod && matchesDate;
    });
  }, [dateFilter, methodFilter, movements, query, statusFilter, typeFilter]);

  const sessionExpectedMap = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((session) => {
      const movementDelta = movements
        .filter((row) => row.register_session_id === session.id && !isSoftDeleted(row) && row.status !== "anulado")
        .reduce((sum, row) => sum + (row.movement_type === "ingreso" ? Number(row.amount) : -Number(row.amount)), 0);
      map.set(session.id, Number(session.opening_amount ?? 0) + movementDelta);
    });
    return map;
  }, [movements, sessions]);

  const sessionMovementSummaryMap = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; net: number }>();
    sessions.forEach((session) => {
      const scoped = movements.filter(
        (row) =>
          row.register_session_id === session.id &&
          !isSoftDeleted(row) &&
          row.status !== "anulado"
      );
      const income = scoped
        .filter((row) => row.movement_type === "ingreso")
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const expense = scoped
        .filter((row) => row.movement_type === "egreso")
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      map.set(session.id, { income, expense, net: income - expense });
    });
    return map;
  }, [movements, sessions]);

  const totalDifference = counts.reduce((sum, row) => sum + Number(row.difference_amount ?? 0), 0);
  const sessionWithoutDrawer = sessions.filter((row) => !row.is_deleted && !row.drawer_id).length;
  const today = getBoliviaDateInputValue();
  const summaryDate = dateFilter || today;
  const summaryMovements = useMemo(
    () => activeMovements.filter((row) => row.movement_date === summaryDate),
    [activeMovements, summaryDate]
  );
  const summaryIncome = useMemo(
    () =>
      summaryMovements
        .filter((row) => row.movement_type === "ingreso")
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [summaryMovements]
  );
  const summaryExpense = useMemo(
    () =>
      summaryMovements
        .filter((row) => row.movement_type === "egreso")
        .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    [summaryMovements]
  );
  const summaryNet = summaryIncome - summaryExpense;
  const summaryDateLabel = dateFilter ? formatDate(summaryDate) : "hoy";
  const openSessionSummaries = useMemo(
    () =>
      openSessions.map((session) => {
        const movementSummary = sessionMovementSummaryMap.get(session.id) ?? { income: 0, expense: 0, net: 0 };
        const expectedAmount = sessionExpectedMap.get(session.id) ?? Number(session.opening_amount ?? 0);
        return {
          session,
          drawer: drawerMap.get(session.drawer_id ?? "") ?? null,
          income: movementSummary.income,
          expense: movementSummary.expense,
          net: movementSummary.net,
          expectedAmount,
        };
      }),
    [drawerMap, openSessions, sessionExpectedMap, sessionMovementSummaryMap]
  );
  const openNowIncome = useMemo(
    () => openSessionSummaries.reduce((sum, item) => sum + item.income, 0),
    [openSessionSummaries]
  );
  const openNowExpense = useMemo(
    () => openSessionSummaries.reduce((sum, item) => sum + item.expense, 0),
    [openSessionSummaries]
  );
  const openNowNet = openNowIncome - openNowExpense;
  const openNowExpected = useMemo(
    () => openSessionSummaries.reduce((sum, item) => sum + item.expectedAmount, 0),
    [openSessionSummaries]
  );

  const exportMovements = () => {
    downloadCsv(
      `caja-movimientos-${new Date().toISOString().slice(0, 10)}.csv`,
      filteredMovements.map((row) => ({
        fecha: row.movement_date,
        tipo: row.movement_type,
        categoria: row.movement_category,
        monto: row.amount,
        metodo: row.payment_method,
        modulo: row.source_module,
        concepto: row.concept,
        referencia: row.reference_name,
        origen_tabla: row.source_table,
        origen_id: row.source_id,
        ciudad: row.city,
        caja: drawerMap.get(row.drawer_id ?? "")?.name ?? "",
        sesion: sessionMap.get(row.register_session_id ?? "")?.session_date ?? "",
        estado: row.status,
        automatico: row.auto_created ? "Si" : "No",
        comprobante: row.attachment_path ?? "",
        notas: row.notes,
      }))
    );
  };

  const exportSessions = () => {
    downloadCsv(
      `caja-sesiones-${new Date().toISOString().slice(0, 10)}.csv`,
      sessions.map((session) => ({
        fecha: session.session_date,
        caja: drawerMap.get(session.drawer_id ?? "")?.name ?? "",
        ciudad: session.city,
        lugar: session.location_name,
        estado: session.status,
        apertura: session.opening_amount,
        esperado: session.closing_expected_amount ?? sessionExpectedMap.get(session.id) ?? 0,
        contado: session.closing_counted_amount,
        diferencia: session.closing_difference_amount,
        notas_apertura: session.opening_notes,
        notas_cierre: session.closing_notes,
      }))
    );
  };

  const exportCounts = () => {
    downloadCsv(
      `caja-arqueos-${new Date().toISOString().slice(0, 10)}.csv`,
      counts.map((count) => ({
        fecha: count.created_at,
        tipo: count.count_type,
        sesion: sessionMap.get(count.session_id)?.session_date ?? "",
        caja: drawerMap.get(sessionMap.get(count.session_id)?.drawer_id ?? "")?.name ?? "",
        esperado: count.expected_amount,
        contado: count.counted_amount,
        diferencia: count.difference_amount,
        notas: count.notes,
      }))
    );
  };

  const openSessionModal = (session?: CashRegisterSessionRow) => {
    setEditingSession(session ?? null);
    if (session) {
      setSessionForm({
        session_date: session.session_date,
        drawer_id: session.drawer_id ?? "",
        city: session.city ?? "",
        location_name: session.location_name ?? "",
        opening_amount: Number(session.opening_amount ?? 0),
        opening_notes: session.opening_notes ?? "",
      });
    } else {
      const firstDrawer = drawers.find((drawer) => !drawer.is_deleted && drawer.is_active) ?? null;
      setSessionForm({
        ...emptySessionForm,
        drawer_id: firstDrawer?.id ?? "",
        city: firstDrawer?.city ?? "",
        location_name: firstDrawer?.location_name ?? "",
        opening_amount: 0,
      });
    }
    setModal("session");
  };

  const openMovementModal = (movement?: CashMovementRow) => {
    setEditingMovement(movement ?? null);
    setMovementAttachmentFile(null);
    if (movement) {
      setMovementForm({
        register_session_id: movement.register_session_id ?? "",
        drawer_id: movement.drawer_id ?? "",
        movement_type: movement.movement_type,
        amount: Number(movement.amount ?? 0),
        payment_method: movement.payment_method,
        source_module: movement.source_module ?? "",
        movement_category: movement.movement_category,
        concept: movement.concept,
        reference_name: movement.reference_name ?? "",
        city: movement.city ?? "",
        movement_date: movement.movement_date,
        status: movement.status,
        notes: movement.notes ?? "",
      });
    } else {
      const currentSession = openSessions[0] ?? null;
      setMovementForm({
        ...emptyMovementForm,
        register_session_id: currentSession?.id ?? "",
        drawer_id: currentSession?.drawer_id ?? "",
        city: currentSession?.city ?? "",
        payment_method: paymentMethods.find((method) => method.is_default)?.code ?? "efectivo",
      });
    }
    setModal("movement");
  };

  const openDrawerModal = (drawer?: CashDrawerRow) => {
    setEditingDrawer(drawer ?? null);
    setDrawerForm(
      drawer
        ? {
            name: drawer.name,
            city: drawer.city ?? "",
            location_name: drawer.location_name ?? "",
            base_amount: Number(drawer.base_amount ?? 0),
            accepts_cash: drawer.accepts_cash,
            accepts_qr: drawer.accepts_qr,
            accepts_transfer: drawer.accepts_transfer,
            accepts_card: drawer.accepts_card,
            is_active: drawer.is_active,
          }
        : emptyDrawerForm
    );
    setModal("drawer");
  };

  const openCountModal = (sessionId: string, countType: CashSessionCountRow["count_type"]) => {
    setCountForm({
      sessionId,
      countType,
      notes: "",
      quantities: Object.fromEntries(denominations.map((item) => [item.id, 0])),
    });
    setModal("count");
  };

  const openSavingsCardRedeemModal = () => {
    setSavingsCardLookup(null);
    setSavingsCardRedeemForm({
      ...emptySavingsCardRedeemForm,
      paymentMethod: paymentMethods.find((method) => method.is_default)?.code ?? "efectivo",
    });
    setModal("savingsCardRedeem");
  };

  const submitSession = async () => {
    setSaving(true);
    try {
      const drawer = drawerMap.get(sessionForm.drawer_id);
      const payload = {
        session_date: sessionForm.session_date,
        drawer_id: normalizeText(sessionForm.drawer_id),
        city: normalizeText(sessionForm.city || drawer?.city || ""),
        location_name: normalizeText(sessionForm.location_name || drawer?.location_name || ""),
        opening_amount: Number(sessionForm.opening_amount),
        opening_notes: normalizeText(sessionForm.opening_notes),
      };

      if (editingSession) await updateCashRegisterSession(editingSession.id, payload);
      else await createCashRegisterSession({ ...payload, opened_by: actorId });

      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const submitMovement = async () => {
    setSaving(true);
    try {
      const session = sessionMap.get(movementForm.register_session_id);
      const attachmentPath =
        movementAttachmentFile != null
          ? await uploadCashMovementAttachment(movementAttachmentFile, editingMovement?.id ?? crypto.randomUUID())
          : editingMovement?.attachment_path ?? null;
      const payload = {
        register_session_id: normalizeText(movementForm.register_session_id),
        drawer_id: normalizeText(movementForm.drawer_id || session?.drawer_id || ""),
        movement_type: movementForm.movement_type,
        amount: Number(movementForm.amount),
        payment_method: movementForm.payment_method.trim(),
        source_module: normalizeText(movementForm.source_module),
        movement_category: movementForm.movement_category.trim() || "operacion",
        concept: movementForm.concept.trim(),
        reference_name: normalizeText(movementForm.reference_name),
        city: normalizeText(movementForm.city || session?.city || ""),
        movement_date: movementForm.movement_date,
        status: movementForm.status,
        notes: normalizeText(movementForm.notes),
        attachment_path: attachmentPath,
        updated_by: actorId,
      };

      if (editingMovement) await updateCashMovement(editingMovement.id, payload);
      else await createCashMovement({ ...payload, created_by: actorId });

      setModal(null);
      setMovementAttachmentFile(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const openMovementAttachment = async (path?: string | null) => {
    const url = await getCashMovementAttachmentUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const lookupSavingsCard = async () => {
    const token = savingsCardRedeemForm.token.trim().toUpperCase();
    if (!token) return;
    setLookingUpSavingsCard(true);
    setNotice("");
    setWarning("");
    try {
      const card = await getSavingsCardByTokenAdmin(token);
      setSavingsCardLookup(card);
      if (!card) {
        setWarning("No encontramos una tarjeta con ese token.");
        return;
      }

      const matchingTreatment = card.treatment_id ? treatments.find((item) => item.id === card.treatment_id) : null;

      setSavingsCardRedeemForm((current) => ({
        ...current,
        token,
        treatmentId: matchingTreatment?.id ?? card.treatment_id ?? current.treatmentId,
        treatmentTitle: card.treatment_title ?? current.treatmentTitle,
      }));
    } catch (lookupError) {
      setWarning(lookupError instanceof Error ? lookupError.message : "No pudimos validar el token.");
    } finally {
      setLookingUpSavingsCard(false);
    }
  };

  const submitSavingsCardRedeem = async () => {
    if (!savingsCardLookup) {
      setWarning("Primero valida el token de la tarjeta.");
      return;
    }

    const treatmentPrice = Number(savingsCardRedeemForm.treatmentPrice);
    const extraAmount = Math.max(treatmentPrice - Number(savingsCardLookup.approved_amount ?? 0), 0);
    const selectedTreatment = treatments.find((item) => item.id === savingsCardRedeemForm.treatmentId);
    const resolvedTreatmentTitle =
      savingsCardRedeemForm.treatmentTitle.trim() ||
      selectedTreatment?.title ||
      savingsCardLookup.treatment_title ||
      "Tratamiento";

    setSavingSavingsCardRedeem(true);
    setNotice("");
    setWarning("");
    try {
      await redeemSavingsCard({
        token: savingsCardRedeemForm.token,
        treatmentTitle: resolvedTreatmentTitle,
        treatmentPrice,
        extraAmountPaid: extraAmount,
        paymentMethod: extraAmount > 0 ? savingsCardRedeemForm.paymentMethod : null,
        notes: savingsCardRedeemForm.notes.trim() || null,
        treatmentId: savingsCardRedeemForm.treatmentId || null,
      });
      setModal(null);
      setNotice("Tarjeta canjeada correctamente. Si hubo diferencia, ya quedo registrada en caja.");
      setSavingsCardLookup(null);
      setSavingsCardRedeemForm(emptySavingsCardRedeemForm);
      load();
    } catch (redeemError) {
      setWarning(redeemError instanceof Error ? redeemError.message : "No pudimos canjear la tarjeta.");
    } finally {
      setSavingSavingsCardRedeem(false);
    }
  };

  const submitDrawer = async () => {
    setSaving(true);
    try {
      const payload = {
        ...drawerForm,
        city: normalizeText(drawerForm.city),
        location_name: normalizeText(drawerForm.location_name),
        base_amount: Number(drawerForm.base_amount),
        updated_by: actorId,
      };
      if (editingDrawer) await updateCashDrawer(editingDrawer.id, payload);
      else await createCashDrawer({ ...payload, created_by: actorId });
      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const submitCount = async () => {
    setSaving(true);
    try {
      const lines = denominations.map((item) => ({
        denomination_id: item.id,
        value: Number(item.value),
        label: item.label,
        unit_type: item.unit_type,
        quantity: Number(countForm.quantities[item.id] ?? 0),
      }));

      await recordCashSessionCount({
        sessionId: countForm.sessionId,
        countType: countForm.countType,
        notes: countForm.notes,
        lines,
      });
      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const closeWithoutCount = async (sessionId: string) => {
    setSaving(true);
    try {
      const expectedAmount = sessionExpectedMap.get(sessionId) ?? 0;
      await closeCashRegisterSession(
        sessionId,
        expectedAmount,
        "Cierre rapido sin arqueo manual."
      );
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Cargando caja..." />;
  if (error) return <ErrorState label="No pudimos cargar caja, arqueos y reportes." />;

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.96),rgba(239,229,218,0.94))] p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Caja integral</p>
            <h1 className="font-display mt-3 text-5xl font-semibold">Apertura, arqueo, cierre e ingresos del sistema</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
              Caja ahora recibe pagos manuales y tambien lo aprobado desde cursos, libros y citas. Todo queda con sesion, metodo, origen y trazabilidad.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={exportMovements} className="rounded-full border border-[var(--color-border)] bg-white/80 px-5 py-3 text-sm font-semibold">CSV movimientos</button>
            <button onClick={exportSessions} className="rounded-full border border-[var(--color-border)] bg-white/80 px-5 py-3 text-sm font-semibold">CSV sesiones</button>
            <button onClick={exportCounts} className="rounded-full border border-[var(--color-border)] bg-white/80 px-5 py-3 text-sm font-semibold">CSV arqueos</button>
            <button onClick={() => openSavingsCardRedeemModal()} className="rounded-full border border-[var(--color-border)] bg-white/80 px-5 py-3 text-sm font-semibold">Canjear tarjeta ahorro</button>
            <button onClick={() => openSessionModal()} className="rounded-full border border-[var(--color-border)] bg-white/80 px-5 py-3 text-sm font-semibold">Nueva apertura</button>
            <button onClick={() => openMovementModal()} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white">Nuevo movimiento</button>
          </div>
        </div>

        {notice ? (
          <div className="mt-4 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {notice}
          </div>
        ) : null}
        {warning ? (
          <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
            {warning}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3 rounded-full border border-[var(--color-border)] bg-[rgba(255,249,244,0.7)] p-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === tab.key ? "bg-[var(--color-mocha)] text-white" : "text-[var(--color-copy)]"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.72)] px-4 py-3 text-sm">
          <p className="text-[var(--color-copy)]">
            Resumen diario calculado con fecha local de Bolivia.
            {dateFilter ? ` Viendo ${formatDate(summaryDate)}.` : " Sin filtro toma hoy."}
          </p>
          <div className="flex flex-wrap gap-2">
            {dateFilter ? (
              <button onClick={() => setDateFilter("")} className="rounded-full border border-[var(--color-border)] px-4 py-2 font-semibold">
                Volver a hoy
              </button>
            ) : null}
            <button onClick={() => { setDateFilter(summaryDate); setActiveTab("movimientos"); }} className="rounded-full border border-[var(--color-border)] px-4 py-2 font-semibold">
              Ver movimientos del dia
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <SummaryCard icon={<Landmark className="h-5 w-5" />} label="Sesiones abiertas" value={String(openSessions.length)} onClick={() => setActiveTab("sesiones")} />
          <SummaryCard icon={<Wallet className="h-5 w-5" />} label="Ingresos del dia" caption={summaryDateLabel} value={formatMoney(summaryIncome)} onClick={() => { setDateFilter(summaryDate); setActiveTab("movimientos"); }} />
          <SummaryCard icon={<Archive className="h-5 w-5" />} label="Egresos del dia" caption={summaryDateLabel} value={formatMoney(summaryExpense)} onClick={() => { setDateFilter(summaryDate); setActiveTab("movimientos"); }} />
          <SummaryCard icon={<Calculator className="h-5 w-5" />} label="Neto del dia" caption={summaryDateLabel} value={formatMoney(summaryNet)} onClick={() => { setDateFilter(summaryDate); setActiveTab("movimientos"); }} />
          <SummaryCard icon={<Wallet className="h-5 w-5" />} label="Caja abierta ahora" value={formatMoney(openNowNet)} onClick={() => setActiveTab("sesiones")} />
          <SummaryCard icon={<Calculator className="h-5 w-5" />} label="Esperado abierto" value={formatMoney(openNowExpected)} onClick={() => setActiveTab("sesiones")} />
          <SummaryCard icon={<Calculator className="h-5 w-5" />} label="Diferencias de arqueo" value={formatMoney(totalDifference)} onClick={() => setActiveTab("arqueos")} />
          <SummaryCard icon={<Building2 className="h-5 w-5" />} label="Sesiones sin caja" value={String(sessionWithoutDrawer)} onClick={() => setActiveTab("configuracion")} />
        </div>
      </section>

      {activeTab === "resumen" ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Operacion diaria" action={<button onClick={() => openMovementModal()} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">Registrar</button>}>
            <div className="grid gap-3">
              <QuickAction label="Abrir nueva caja" onClick={() => openSessionModal()} />
              <QuickAction label="Registrar ingreso o egreso" onClick={() => openMovementModal()} />
              <QuickAction label="Hacer arqueo parcial" onClick={() => openCountModal(openSessions[0]?.id ?? "", "arqueo")} disabled={!openSessions[0]} />
              <QuickAction label="Cerrar caja con conteo" onClick={() => openCountModal(openSessions[0]?.id ?? "", "cierre")} disabled={!openSessions[0]} />
              <QuickAction label="Cerrar caja sin arqueo" onClick={() => void closeWithoutCount(openSessions[0]?.id ?? "")} disabled={!openSessions[0] || saving} />
              <QuickAction label="Canjear tarjeta de ahorro" onClick={() => openSavingsCardRedeemModal()} />
            </div>
          </Panel>

          <Panel title="Ultimos ingresos automáticos" action={<button onClick={() => setActiveTab("movimientos")} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">Ver todos</button>}>
            <div className="grid gap-3">
              {movements.filter((row) => row.auto_created && !row.is_deleted).slice(0, 5).map((row) => (
                <div key={row.id} className="rounded-[20px] border border-[var(--color-border)] bg-white/70 p-4">
                  <p className="text-sm font-semibold">{row.concept}</p>
                  <p className="mt-2 text-sm text-[var(--color-copy)]">
                    {formatMoney(row.amount)} - {row.payment_method} - {row.source_module ?? "sistema"}
                  </p>
                </div>
              ))}
              {movements.filter((row) => row.auto_created && !row.is_deleted).length === 0 ? <EmptyState label="Todavia no hay ingresos automáticos." /> : null}
            </div>
          </Panel>
          <Panel title="Caja abierta ahora" action={<button onClick={() => setActiveTab("sesiones")} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">Ver sesiones</button>}>
            <div className="grid gap-3">
              <div className="rounded-[20px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4">
                <p className="text-sm font-semibold">Consolidado actual</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                  Ingresos {formatMoney(openNowIncome)} - egresos {formatMoney(openNowExpense)} - neto {formatMoney(openNowNet)}
                  <br />
                  Esperado al cerrar {formatMoney(openNowExpected)}
                </p>
              </div>
              {openSessionSummaries.length === 0 ? <EmptyState label="No hay cajas abiertas en este momento." /> : null}
              {openSessionSummaries.map(({ session, drawer, income, expense, net, expectedAmount }) => (
                <div key={session.id} className="rounded-[20px] border border-[var(--color-border)] bg-white/70 p-4">
                  <p className="text-sm font-semibold">{drawer?.name ?? session.location_name ?? "Caja abierta"} · {session.city ?? "Sin ciudad"}</p>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                    Apertura {formatMoney(session.opening_amount)}
                    <br />
                    Ingresos {formatMoney(income)} - egresos {formatMoney(expense)} - neto {formatMoney(net)}
                    <br />
                    Esperado al cerrar {formatMoney(expectedAmount)}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {activeTab === "sesiones" ? (
        <Panel title="Sesiones de caja" action={<button onClick={() => openSessionModal()} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">Nueva apertura</button>}>
          <div className="grid gap-4">
            {sessions.length === 0 ? <EmptyState label="Todavia no hay aperturas registradas." /> : null}
            {sessions.map((session) => {
              const drawer = drawerMap.get(session.drawer_id ?? "");
              const expectedAmount = sessionExpectedMap.get(session.id) ?? Number(session.opening_amount ?? 0);
              const movementSummary = sessionMovementSummaryMap.get(session.id) ?? { income: 0, expense: 0, net: 0 };
              return (
                <div key={session.id} className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${session.status === "abierta" ? "bg-[rgba(111,122,96,0.14)] text-[var(--color-ink)]" : "bg-[rgba(62,42,31,0.08)] text-[var(--color-copy)]"}`}>
                          {session.status}
                        </span>
                        {drawer ? <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">{drawer.name}</span> : null}
                        {session.is_deleted ? <span className="rounded-full bg-[rgba(62,42,31,0.08)] px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">Archivada</span> : null}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold">
                        {session.session_date} - {session.city ?? "Sin ciudad"}
                      </h3>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                        Apertura {formatMoney(session.opening_amount)}
                        <br />
                        Ingresos {formatMoney(movementSummary.income)} - egresos {formatMoney(movementSummary.expense)} - neto {formatMoney(movementSummary.net)}
                        <br />
                        Esperado al cerrar {formatMoney(expectedAmount)}
                        <br />
                        {session.status === "cerrada"
                          ? `Contado ${formatMoney(session.closing_counted_amount ?? 0)} - diferencia ${formatMoney(session.closing_difference_amount ?? 0)}`
                          : "Caja todavia abierta"}
                      </p>
                      {session.location_name || drawer?.location_name ? (
                        <p className="text-sm text-[var(--color-copy)]">Lugar: {session.location_name ?? drawer?.location_name}</p>
                      ) : null}
                      {session.opening_notes ? (
                        <p className="text-sm text-[var(--color-copy)]">Notas: {session.opening_notes}</p>
                      ) : null}
                      <DeletedStatusNote row={session} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {session.status === "abierta" && !session.is_deleted ? <button onClick={() => openCountModal(session.id, "arqueo")} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">Arqueo</button> : null}
                      {session.status === "abierta" && !session.is_deleted ? <button onClick={() => openCountModal(session.id, "cierre")} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">Cerrar caja</button> : null}
                      {session.status === "abierta" && !session.is_deleted ? <button onClick={() => void closeWithoutCount(session.id)} disabled={saving} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold disabled:opacity-60">Cerrar sin arqueo</button> : null}
                      <button onClick={() => openSessionModal(session)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"><Pencil className="h-4 w-4" />Editar</button>
                      <DeleteActions
                        role={role}
                        row={session}
                        compact
                        onSoftDelete={() => void softDeleteRecord({ table: "cash_register_sessions", id: session.id, actorId, actorRole: role, actorName, actorEmail }).then(load)}
                        onRestore={() => void restoreRecord("cash_register_sessions", session.id).then(load)}
                        onHardDelete={() => void hardDeleteRecord("cash_register_sessions", session.id).then(load)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {activeTab === "movimientos" ? (
        <Panel title="Movimientos de caja" action={<button onClick={() => openMovementModal()} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">Nuevo movimiento</button>}>
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_180px_180px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por concepto, referencia o origen" className="premium-input" />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="premium-input">
              <option>Todos</option>
              <option value="ingreso">ingreso</option>
              <option value="egreso">egreso</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="premium-input">
              <option>Todos</option>
              <option value="registrado">registrado</option>
              <option value="confirmado">confirmado</option>
              <option value="anulado">anulado</option>
            </select>
            <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} className="premium-input">
              <option>Todos</option>
              {paymentMethods.map((method) => <option key={method.id} value={method.code}>{method.name}</option>)}
            </select>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="premium-input" />
          </div>

          <div className="mt-5 grid gap-4">
            {filteredMovements.length === 0 ? <EmptyState label="Todavia no hay movimientos que coincidan con esos filtros." /> : null}
            {filteredMovements.map((row) => {
              const session = sessionMap.get(row.register_session_id ?? "");
              const drawer = drawerMap.get(row.drawer_id ?? session?.drawer_id ?? "");
              return (
                <div key={row.id} className="rounded-[26px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-5">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.movement_type === "ingreso" ? "bg-[rgba(111,122,96,0.14)] text-[var(--color-ink)]" : "bg-[rgba(154,107,67,0.12)] text-[var(--color-ink)]"}`}>{row.movement_type}</span>
                        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">{row.payment_method}</span>
                        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">{row.movement_category}</span>
                        {row.auto_created ? <span className="rounded-full bg-[rgba(111,122,96,0.12)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">Automatico</span> : null}
                      </div>
                      <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">{row.concept}</h2>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                        {formatMoney(row.amount)} - {row.movement_date} - {row.city ?? "Sin ciudad"}
                        <br />
                        {row.source_module ?? "Manual"} - {row.reference_name ?? "Sin referencia"}
                        <br />
                        Caja {drawer?.name ?? "sin caja"} - apertura {session?.session_date ?? "sin sesion"}
                      </p>
                      <DeletedStatusNote row={row} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.attachment_path ? <button onClick={() => void openMovementAttachment(row.attachment_path)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">Comprobante</button> : null}
                      {!row.auto_created ? <button onClick={() => openMovementModal(row)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"><Pencil className="h-4 w-4" />Editar</button> : null}
                      <DeleteActions
                        role={role}
                        row={row}
                        compact
                        onSoftDelete={() => void softDeleteRecord({ table: "cash_movements", id: row.id, actorId, actorRole: role, actorName, actorEmail }).then(load)}
                        onRestore={() => void restoreRecord("cash_movements", row.id).then(load)}
                        onHardDelete={() => void hardDeleteRecord("cash_movements", row.id).then(load)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {activeTab === "arqueos" ? (
        <Panel title="Arqueos y diferencias" action={<button onClick={() => openCountModal(openSessions[0]?.id ?? "", "arqueo")} disabled={!openSessions[0]} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Nuevo arqueo</button>}>
          <div className="grid gap-4">
            {counts.length === 0 ? <EmptyState label="Todavia no hay arqueos registrados." /> : null}
            {counts.map((count) => {
              const session = sessionMap.get(count.session_id);
              const drawer = drawerMap.get(session?.drawer_id ?? "");
              return (
                <div key={count.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[rgba(198,162,123,0.16)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">{count.count_type}</span>
                        {drawer ? <span className="rounded-full bg-[rgba(62,42,31,0.08)] px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">{drawer.name}</span> : null}
                      </div>
                      <h3 className="mt-3 text-lg font-semibold">{formatDate(count.created_at)} - {session?.session_date ?? "Sin sesion"}</h3>
                      <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                        Esperado {formatMoney(count.expected_amount)} - contado {formatMoney(count.counted_amount)}
                        <br />
                        Diferencia {formatMoney(count.difference_amount)} - {count.notes ?? "Sin notas"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(countLinesByCount.get(count.id) ?? []).map((line) => (
                          <span key={line.id} className="rounded-full bg-[rgba(247,242,236,0.82)] px-3 py-1 text-xs font-semibold text-[var(--color-copy)]">
                            {line.denomination_label}: {line.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                    <DeleteActions
                      role={role}
                      row={count}
                      compact
                      onSoftDelete={() => void softDeleteRecord({ table: "cash_session_counts", id: count.id, actorId, actorRole: role, actorName, actorEmail }).then(load)}
                      onRestore={() => void restoreRecord("cash_session_counts", count.id).then(load)}
                      onHardDelete={() => void hardDeleteRecord("cash_session_counts", count.id).then(load)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {activeTab === "configuracion" ? (
        <div className="grid gap-6 xl:grid-cols-3">
          <Panel title="Cajas y sucursales" action={<button onClick={() => openDrawerModal()} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">Nueva caja</button>}>
            <div className="grid gap-3">
              {drawers.length === 0 ? <EmptyState label="Todavia no hay cajas creadas." /> : null}
              {drawers.map((drawer) => (
                <div key={drawer.id} className="rounded-[22px] border border-[var(--color-border)] bg-white/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{drawer.name}</p>
                      <p className="mt-2 text-sm text-[var(--color-copy)]">
                        {drawer.city ?? "Sin ciudad"} - {drawer.location_name ?? "Sin ubicacion"}
                        <br />
                        Base sugerida {formatMoney(drawer.base_amount)}
                      </p>
                      <DeletedStatusNote row={drawer} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => openDrawerModal(drawer)} className="rounded-full border border-[var(--color-border)] p-3"><Pencil className="h-4 w-4" /></button>
                      <DeleteActions
                        role={role}
                        row={drawer}
                        compact
                        onSoftDelete={() => void softDeleteRecord({ table: "cash_drawers", id: drawer.id, actorId, actorRole: role, actorName, actorEmail }).then(load)}
                        onRestore={() => void restoreRecord("cash_drawers", drawer.id).then(load)}
                        onHardDelete={() => void hardDeleteRecord("cash_drawers", drawer.id).then(load)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Metodos de pago">
            <div className="grid gap-3">
              {paymentMethods.map((method) => (
                <div key={method.id} className="rounded-[22px] border border-[var(--color-border)] bg-white/75 p-4">
                  <p className="font-semibold">{method.name}</p>
                  <p className="mt-2 text-sm text-[var(--color-copy)]">
                    {method.code} - {method.method_kind} {method.is_default ? "- predeterminado" : ""}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Denominaciones para arqueo">
            <div className="grid gap-3">
              {denominations.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-[var(--color-border)] bg-white/75 p-4">
                  <p className="font-semibold">{item.label}</p>
                  <p className="mt-2 text-sm text-[var(--color-copy)]">{item.unit_type} - {formatMoney(item.value)}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}

      {modal === "session" ? (
        <ModalShell title={editingSession ? "Editar apertura" : "Nueva apertura"} onClose={() => setModal(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Fecha de la apertura">
              <input type="date" value={sessionForm.session_date} onChange={(event) => setSessionForm({ ...sessionForm, session_date: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Caja">
              <select
                value={sessionForm.drawer_id}
                onChange={(event) => {
                  const drawer = drawerMap.get(event.target.value);
                  setSessionForm({
                    ...sessionForm,
                    drawer_id: event.target.value,
                    city: drawer?.city ?? sessionForm.city,
                    location_name: drawer?.location_name ?? sessionForm.location_name,
                    opening_amount: sessionForm.opening_amount,
                  });
                }}
                className="premium-input"
              >
                <option value="">Sin caja fija</option>
                {drawers.filter((drawer) => !drawer.is_deleted && drawer.is_active).map((drawer) => <option key={drawer.id} value={drawer.id}>{drawer.name}</option>)}
              </select>
            </Field>
            <Field label="Ciudad">
              <select value={sessionForm.city} onChange={(event) => setSessionForm({ ...sessionForm, city: event.target.value })} className="premium-input">
                <option value="">Selecciona ciudad</option>
                {boliviaCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lugar o caja">
              <input value={sessionForm.location_name} onChange={(event) => setSessionForm({ ...sessionForm, location_name: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Monto inicial">
              <input type="number" step="0.01" value={String(sessionForm.opening_amount)} onChange={(event) => setSessionForm({ ...sessionForm, opening_amount: Number(event.target.value) })} className="premium-input" />
            </Field>
            <Field label="Notas de apertura" className="md:col-span-2">
              <textarea value={sessionForm.opening_notes} onChange={(event) => setSessionForm({ ...sessionForm, opening_notes: event.target.value })} className="premium-input min-h-28" />
            </Field>
          </div>
          <ActionRow saving={saving} primaryLabel="Guardar apertura" onSave={() => void submitSession()} onCancel={() => setModal(null)} />
        </ModalShell>
      ) : null}

      {modal === "movement" ? (
        <ModalShell title={editingMovement ? "Editar movimiento" : "Nuevo movimiento"} onClose={() => setModal(null)} maxWidthClassName="max-w-4xl">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Apertura asociada">
              <select
                value={movementForm.register_session_id}
                onChange={(event) => {
                  const session = sessionMap.get(event.target.value);
                  setMovementForm({
                    ...movementForm,
                    register_session_id: event.target.value,
                    drawer_id: session?.drawer_id ?? movementForm.drawer_id,
                    city: session?.city ?? movementForm.city,
                  });
                }}
                className="premium-input"
              >
                <option value="">Sin apertura asociada</option>
                {openSessions.map((session) => <option key={session.id} value={session.id}>{session.session_date} - {drawerMap.get(session.drawer_id ?? "")?.name ?? session.location_name ?? "Caja"}</option>)}
              </select>
            </Field>
            <Field label="Caja">
              <select value={movementForm.drawer_id} onChange={(event) => setMovementForm({ ...movementForm, drawer_id: event.target.value })} className="premium-input">
                <option value="">Sin caja fija</option>
                {drawers.filter((drawer) => !drawer.is_deleted && drawer.is_active).map((drawer) => <option key={drawer.id} value={drawer.id}>{drawer.name}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select value={movementForm.movement_type} onChange={(event) => setMovementForm({ ...movementForm, movement_type: event.target.value as CashMovementRow["movement_type"] })} className="premium-input">
                <option value="ingreso">ingreso</option>
                <option value="egreso">egreso</option>
              </select>
            </Field>
            <Field label="Monto">
              <input type="number" min={0.01} step="0.01" value={String(movementForm.amount)} onChange={(event) => setMovementForm({ ...movementForm, amount: Number(event.target.value) })} className="premium-input" />
            </Field>
            <Field label="Metodo de pago">
              <select value={movementForm.payment_method} onChange={(event) => setMovementForm({ ...movementForm, payment_method: event.target.value })} className="premium-input">
                {paymentMethods.map((method) => <option key={method.id} value={method.code}>{method.name}</option>)}
              </select>
            </Field>
            <Field label="Categoria">
              <input value={movementForm.movement_category} onChange={(event) => setMovementForm({ ...movementForm, movement_category: event.target.value })} className="premium-input" placeholder="venta, gasto, retiro, ajuste..." />
            </Field>
            <Field label="Origen">
              <input value={movementForm.source_module} onChange={(event) => setMovementForm({ ...movementForm, source_module: event.target.value })} className="premium-input" placeholder="curso, cita, libro, gasto..." />
            </Field>
            <Field label="Concepto">
              <input value={movementForm.concept} onChange={(event) => setMovementForm({ ...movementForm, concept: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Referencia">
              <input value={movementForm.reference_name} onChange={(event) => setMovementForm({ ...movementForm, reference_name: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Ciudad">
              <select value={movementForm.city} onChange={(event) => setMovementForm({ ...movementForm, city: event.target.value })} className="premium-input">
                <option value="">Selecciona ciudad</option>
                {boliviaCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha">
              <input type="date" value={movementForm.movement_date} onChange={(event) => setMovementForm({ ...movementForm, movement_date: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Estado">
              <select value={movementForm.status} onChange={(event) => setMovementForm({ ...movementForm, status: event.target.value as CashMovementRow["status"] })} className="premium-input">
                <option value="registrado">registrado</option>
                <option value="confirmado">confirmado</option>
                <option value="anulado">anulado</option>
              </select>
            </Field>
            <Field label="Notas" className="md:col-span-2">
              <textarea value={movementForm.notes} onChange={(event) => setMovementForm({ ...movementForm, notes: event.target.value })} className="premium-input min-h-28" />
            </Field>
            <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold sm:w-auto">
                <Receipt className="h-4 w-4" />
                {movementAttachmentFile ? "Cambiar comprobante" : editingMovement?.attachment_path ? "Reemplazar comprobante" : "Subir comprobante o factura"}
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => setMovementAttachmentFile(event.target.files?.[0] ?? null)} />
              </label>
              {editingMovement?.attachment_path ? (
                <button onClick={() => void openMovementAttachment(editingMovement.attachment_path)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                  Ver comprobante actual
                </button>
              ) : null}
            </div>
          </div>
          <ActionRow saving={saving} primaryLabel="Guardar movimiento" onSave={() => void submitMovement()} onCancel={() => setModal(null)} />
        </ModalShell>
      ) : null}

      {modal === "drawer" ? (
        <ModalShell title={editingDrawer ? "Editar caja" : "Nueva caja"} onClose={() => setModal(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nombre">
              <input value={drawerForm.name} onChange={(event) => setDrawerForm({ ...drawerForm, name: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Ciudad">
              <select value={drawerForm.city} onChange={(event) => setDrawerForm({ ...drawerForm, city: event.target.value })} className="premium-input">
                <option value="">Selecciona ciudad</option>
                {boliviaCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ubicacion">
              <input value={drawerForm.location_name} onChange={(event) => setDrawerForm({ ...drawerForm, location_name: event.target.value })} className="premium-input" />
            </Field>
            <Field label="Monto base sugerido">
              <input type="number" min={0} step="0.01" value={String(drawerForm.base_amount)} onChange={(event) => setDrawerForm({ ...drawerForm, base_amount: Number(event.target.value) })} className="premium-input" />
            </Field>
            <CheckboxField label="Acepta efectivo" checked={drawerForm.accepts_cash} onChange={(checked) => setDrawerForm({ ...drawerForm, accepts_cash: checked })} />
            <CheckboxField label="Acepta QR" checked={drawerForm.accepts_qr} onChange={(checked) => setDrawerForm({ ...drawerForm, accepts_qr: checked })} />
            <CheckboxField label="Acepta transferencia" checked={drawerForm.accepts_transfer} onChange={(checked) => setDrawerForm({ ...drawerForm, accepts_transfer: checked })} />
            <CheckboxField label="Acepta tarjeta" checked={drawerForm.accepts_card} onChange={(checked) => setDrawerForm({ ...drawerForm, accepts_card: checked })} />
            <CheckboxField label="Activa" checked={drawerForm.is_active} onChange={(checked) => setDrawerForm({ ...drawerForm, is_active: checked })} />
          </div>
          <ActionRow saving={saving} primaryLabel="Guardar caja" onSave={() => void submitDrawer()} onCancel={() => setModal(null)} />
        </ModalShell>
      ) : null}

      {modal === "count" ? (
        <ModalShell title={countForm.countType === "cierre" ? "Cerrar caja con arqueo" : "Registrar arqueo"} onClose={() => setModal(null)} maxWidthClassName="max-w-4xl">
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Esperado segun movimientos</p>
              <p className="mt-2 text-2xl font-semibold">{formatMoney(sessionExpectedMap.get(countForm.sessionId) ?? 0)}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {denominations.map((item) => (
                <label key={item.id} className="rounded-[22px] border border-[var(--color-border)] bg-white/80 p-4">
                  <span className="text-sm font-semibold">{item.label}</span>
                  <span className="mt-1 block text-xs text-[var(--color-copy)]">{formatMoney(item.value)}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={String(countForm.quantities[item.id] ?? 0)}
                    onChange={(event) => setCountForm({ ...countForm, quantities: { ...countForm.quantities, [item.id]: Number(event.target.value) } })}
                    className="premium-input mt-3"
                  />
                </label>
              ))}
            </div>
            <Field label="Notas del arqueo">
              <textarea value={countForm.notes} onChange={(event) => setCountForm({ ...countForm, notes: event.target.value })} className="premium-input min-h-28" />
            </Field>
          </div>
          <ActionRow saving={saving} primaryLabel={countForm.countType === "cierre" ? "Cerrar caja" : "Guardar arqueo"} onSave={() => void submitCount()} onCancel={() => setModal(null)} />
        </ModalShell>
      ) : null}

      {modal === "savingsCardRedeem" ? (
        <ModalShell title="Canjear tarjeta de ahorro" onClose={() => setModal(null)} maxWidthClassName="max-w-4xl">
          <div className="grid gap-4">
            <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-7 text-amber-900">
              Usa aqui el token cuando la paciente ya tenga todas sus cuotas aprobadas. Si el tratamiento cuesta mas que
              el saldo acumulado, registraremos solo la diferencia restante como nuevo ingreso en caja.
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <Field label="Token">
                <input
                  value={savingsCardRedeemForm.token}
                  onChange={(event) => setSavingsCardRedeemForm({ ...savingsCardRedeemForm, token: event.target.value.toUpperCase() })}
                  className="premium-input"
                  placeholder="AHR-XXXX-XXXX-XXXX"
                />
              </Field>
              <div className="md:self-end">
                <button
                  type="button"
                  onClick={() => void lookupSavingsCard()}
                  disabled={lookingUpSavingsCard || !savingsCardRedeemForm.token.trim()}
                  className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {lookingUpSavingsCard ? "Validando..." : "Validar token"}
                </button>
              </div>
            </div>

            {savingsCardLookup ? (
              <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4">
                <p className="font-semibold">
                  {savingsCardLookup.patient_full_name}
                  {savingsCardLookup.treatment_title ? ` · ${savingsCardLookup.treatment_title}` : ""}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                  Estado {savingsCardLookup.status} · aprobado {formatMoney(savingsCardLookup.approved_amount)} · cuotas
                  {` ${savingsCardLookup.approved_installments_count}/${savingsCardLookup.months_count}`}
                  <br />
                  {savingsCardLookup.redeemed_at ? `Ya canjeada el ${formatDate(savingsCardLookup.redeemed_at)}.` : "Lista para registrar en caja si todo esta aprobado."}
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tratamiento">
                <select
                  value={savingsCardRedeemForm.treatmentId}
                  onChange={(event) => {
                    const selectedTreatment = treatments.find((item) => item.id === event.target.value) ?? null;
                    setSavingsCardRedeemForm({
                      ...savingsCardRedeemForm,
                      treatmentId: event.target.value,
                      treatmentTitle: event.target.value ? "" : savingsCardRedeemForm.treatmentTitle,
                    });
                    if (selectedTreatment) {
                      setSavingsCardRedeemForm((current) => ({
                        ...current,
                        treatmentId: event.target.value,
                        treatmentTitle: "",
                      }));
                    }
                  }}
                  className="premium-input"
                >
                  <option value="">Tratamiento libre</option>
                  {treatments.map((treatment) => (
                    <option key={treatment.id} value={treatment.id}>
                      {treatment.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Precio total del tratamiento">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(savingsCardRedeemForm.treatmentPrice)}
                  onChange={(event) => setSavingsCardRedeemForm({ ...savingsCardRedeemForm, treatmentPrice: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>
              {!savingsCardRedeemForm.treatmentId ? (
                <Field label="Nombre libre del tratamiento" className="md:col-span-2">
                  <input
                    value={savingsCardRedeemForm.treatmentTitle}
                    onChange={(event) => setSavingsCardRedeemForm({ ...savingsCardRedeemForm, treatmentTitle: event.target.value })}
                    className="premium-input"
                    placeholder="Ejemplo: Rinomodelacion"
                  />
                </Field>
              ) : null}
              <Field label="Metodo para la diferencia restante">
                <select
                  value={savingsCardRedeemForm.paymentMethod}
                  onChange={(event) => setSavingsCardRedeemForm({ ...savingsCardRedeemForm, paymentMethod: event.target.value })}
                  className="premium-input"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.code}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Notas" className="md:col-span-2">
                <textarea
                  value={savingsCardRedeemForm.notes}
                  onChange={(event) => setSavingsCardRedeemForm({ ...savingsCardRedeemForm, notes: event.target.value })}
                  className="premium-input min-h-28"
                  placeholder="Notas del canje o detalle del tratamiento..."
                />
              </Field>
            </div>

            {savingsCardLookup ? (
              <div className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-4">
                <p className="text-sm font-semibold">Resumen del canje</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                  Saldo aprobado: {formatMoney(savingsCardLookup.approved_amount)}
                  <br />
                  Precio del tratamiento: {formatMoney(savingsCardRedeemForm.treatmentPrice)}
                  <br />
                  Diferencia a cobrar en caja: {formatMoney(Math.max(Number(savingsCardRedeemForm.treatmentPrice) - Number(savingsCardLookup.approved_amount ?? 0), 0))}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void submitSavingsCardRedeem()}
              disabled={savingSavingsCardRedeem || !savingsCardLookup}
              className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {savingSavingsCardRedeem ? "Guardando..." : "Registrar canje"}
            </button>
            <button
              type="button"
              onClick={() => setModal(null)}
              className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
            >
              Cancelar
            </button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function SummaryCard({ icon, label, caption, value, onClick }: { icon: ReactNode; label: string; caption?: string; value: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-[24px] border border-[var(--color-border)] bg-white/78 p-5 text-left transition hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-copy)]">{label}</p>
          {caption ? <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--color-accent-strong)]">{caption}</p> : null}
        </div>
        <span className="rounded-full bg-[rgba(198,162,123,0.16)] p-2 text-[var(--color-mocha)]">{icon}</span>
      </div>
      <p className="mt-4 font-display text-4xl font-semibold">{value}</p>
    </button>
  );
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold">{title}</h2>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function QuickAction({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="rounded-[22px] border border-[var(--color-border)] bg-white/80 px-4 py-4 text-left text-sm font-semibold disabled:opacity-50">
      {label}
    </button>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={className}>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-[18px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.5)] px-4 py-3 text-sm font-semibold">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

function ActionRow({
  saving,
  primaryLabel,
  onSave,
  onCancel,
}: {
  saving: boolean;
  primaryLabel: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <button onClick={onSave} disabled={saving} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {saving ? "Guardando..." : primaryLabel}
      </button>
      <button onClick={onCancel} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
        Cancelar
      </button>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  maxWidthClassName = "max-w-3xl",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className={`max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8 ${maxWidthClassName}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Caja</p>
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

function normalizeText(value: string) {
  const next = value.trim();
  return next.length > 0 ? next : null;
}

function getBoliviaDateInputValue(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: boliviaTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}
