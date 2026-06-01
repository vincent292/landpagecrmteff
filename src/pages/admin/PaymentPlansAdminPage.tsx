import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";

import { AlertTriangle, CheckCircle2, ChevronRight, CreditCard, Receipt, Search, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import { getPatients, type PatientRow } from "../../services/patientService";
import {
  createPaymentPlan,
  type PaymentPlanInstallmentRow,
  type PaymentPlanReceiptRow,
  type PaymentPlanRow,
  getPaymentPlansAdmin,
} from "../../services/paymentPlanService";
import { getAdminTreatments, type TreatmentRow } from "../../services/treatmentService";
import { formatDate, formatMoney } from "../../utils/text";

type CreateFormState = {
  patientId: string;
  treatmentId: string;
  title: string;
  totalAmount: number;
  initialPaymentAmount: number;
  initialPaymentDate: string;
  initialPaymentMethod: string;
  monthsCount: number;
  installmentAmount: number;
  firstDueDate: string;
  allowTreatmentBeforeCompletion: boolean;
  notes: string;
};

type ReviewQueueItem = {
  plan: PaymentPlanRow;
  installment: PaymentPlanInstallmentRow;
  receipt: PaymentPlanReceiptRow;
};

type SearchOption = {
  id: string;
  label: string;
  hint?: string | null;
};

const boliviaTimeZone = "America/La_Paz";

const emptyCreateForm: CreateFormState = {
  patientId: "",
  treatmentId: "",
  title: "",
  totalAmount: 0,
  initialPaymentAmount: 0,
  initialPaymentDate: getBoliviaDateInputValue(),
  initialPaymentMethod: "qr",
  monthsCount: 10,
  installmentAmount: 0,
  firstDueDate: getBoliviaDateInputValue(),
  allowTreatmentBeforeCompletion: false,
  notes: "",
};

export function PaymentPlansAdminPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PaymentPlanRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [treatments, setTreatments] = useState<TreatmentRow[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todas");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(emptyCreateForm);
  const [patientSearch, setPatientSearch] = useState("");
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);

  const deferredQuery = useDeferredValue(query);
  const deferredPatientSearch = useDeferredValue(patientSearch);
  const deferredTreatmentSearch = useDeferredValue(treatmentSearch);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextPlans, nextPatients, nextTreatments, nextMethods] = await Promise.all([
        getPaymentPlansAdmin(),
        getPatients(),
        getAdminTreatments(),
        getCashPaymentMethods(true),
      ]);
      setPlans(nextPlans);
      setPatients(nextPatients.filter((item) => !item.is_deleted));
      setTreatments(nextTreatments.filter((item) => !item.is_deleted && item.is_active !== false));
      setPaymentMethods(nextMethods);
      setCreateForm((current) => ({
        ...current,
        initialPaymentMethod: current.initialPaymentMethod || nextMethods.find((item) => item.is_default)?.code || "qr",
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar los planes de pago.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredPlans = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();
    return plans.filter((plan) => {
      const matchesQuery =
        !search ||
        [
          plan.patient_full_name,
          plan.patient_document_number,
          plan.title,
          plan.treatment_title,
          plan.patients?.phone,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesStatus = statusFilter === "Todas" || plan.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [deferredQuery, plans, statusFilter]);

  const pendingReviewItems = useMemo(() => {
    return plans
      .flatMap((plan) =>
        (plan.installments ?? [])
          .filter((installment) => installment.status === "Comprobante enviado" || installment.status === "En revision")
          .map((installment) => ({
            plan,
            installment,
            receipt: installment.receipts?.[0] ?? null,
          }))
      )
      .filter((item) => item.receipt)
      .sort((left, right) => {
        const leftDate = left.receipt?.submitted_at ?? left.installment.latest_submission_at ?? "";
        const rightDate = right.receipt?.submitted_at ?? right.installment.latest_submission_at ?? "";
        return rightDate.localeCompare(leftDate);
      }) as ReviewQueueItem[];
  }, [plans]);

  const patientOptions = useMemo<SearchOption[]>(
    () =>
      patients.map((patient) => ({
        id: patient.id,
        label: patient.full_name,
        hint: patient.document_number ? `Carnet ${patient.document_number}` : patient.phone ?? "Sin carnet",
      })),
    [patients]
  );

  const treatmentOptions = useMemo<SearchOption[]>(
    () =>
      treatments.map((treatment) => ({
        id: treatment.id,
        label: treatment.title,
        hint: treatment.city ?? treatment.slug,
      })),
    [treatments]
  );

  const selectedPatient = patients.find((patient) => patient.id === createForm.patientId) ?? null;
  const selectedTreatment = treatments.find((treatment) => treatment.id === createForm.treatmentId) ?? null;

  const filteredPatientOptions = patientOptions.filter((option) => {
    const search = deferredPatientSearch.trim().toLowerCase();
    if (!search) return true;
    return `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(search);
  });

  const filteredTreatmentOptions = treatmentOptions.filter((option) => {
    const search = deferredTreatmentSearch.trim().toLowerCase();
    if (!search) return true;
    return `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(search);
  });

  const openDetail = (planId: string, installmentId?: string) => {
    const search = installmentId ? `?cuota=${encodeURIComponent(installmentId)}` : "";
    void navigate(`/panel/planes-pago/${planId}${search}`);
  };

  const submitCreate = async () => {
    setSavingCreate(true);
    setError("");
    setMessage("");
    try {
      const created = await createPaymentPlan({
        patientId: createForm.patientId,
        totalAmount: Number(createForm.totalAmount),
        initialPaymentAmount: Number(createForm.initialPaymentAmount),
        initialPaymentDate: createForm.initialPaymentAmount > 0 ? createForm.initialPaymentDate : null,
        initialPaymentMethod: createForm.initialPaymentAmount > 0 ? createForm.initialPaymentMethod : null,
        monthsCount: Number(createForm.monthsCount),
        installmentAmount: Number(createForm.installmentAmount),
        firstDueDate: createForm.firstDueDate,
        allowTreatmentBeforeCompletion: createForm.allowTreatmentBeforeCompletion,
        treatmentId: createForm.treatmentId || null,
        title: createForm.treatmentId ? null : createForm.title.trim() || null,
        notes: createForm.notes.trim() || null,
      });

      if (!created) throw new Error("El plan se creo, pero no pudimos recargarlo.");

      setCreateOpen(false);
      setCreateForm({
        ...emptyCreateForm,
        initialPaymentMethod: paymentMethods.find((item) => item.is_default)?.code ?? "qr",
      });
      setPatientSearch("");
      setTreatmentSearch("");
      setMessage("Plan de pago creado correctamente.");
      await load();
      openDetail(created.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No pudimos crear el plan de pago.");
    } finally {
      setSavingCreate(false);
    }
  };

  if (loading) return <LoadingState label="Cargando planes de pago..." />;
  if (error && plans.length === 0) return <ErrorState label={error} />;

  const totalPlans = plans.length;
  const activePlans = plans.filter((plan) => plan.status === "Activo" || plan.status === "Al dia").length;
  const overduePlans = plans.filter((plan) => plan.status === "Con atraso").length;
  const paidPlans = plans.filter((plan) => plan.status === "Liquidado").length;
  const totalBreakdownAmount = Number(createForm.initialPaymentAmount || 0) + Number(createForm.installmentAmount || 0) * Number(createForm.monthsCount || 0);

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.96),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_70px_rgba(62,42,31,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Operacion · planes de pago
        </p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl font-semibold leading-[0.95] md:text-5xl">
              Controla cuotas reales, comprobantes y dinero reflejado en caja.
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)] md:text-base">
              Aqui creas acuerdos de pago con o sin tratamiento. Cada cuota aprobada entra a caja y el detalle se abre
              en una vista separada para revisar comprobantes sin saturar la pantalla principal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
          >
            <Sparkles className="h-4 w-4" />
            Nuevo plan
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Planes creados" value={String(totalPlans)} icon={<CreditCard className="h-5 w-5" />} />
        <SummaryCard label="Activos" value={String(activePlans)} icon={<Receipt className="h-5 w-5" />} />
        <SummaryCard label="Con atraso" value={String(overduePlans)} icon={<AlertTriangle className="h-5 w-5" />} />
        <SummaryCard label="Liquidados" value={String(paidPlans)} icon={<CheckCircle2 className="h-5 w-5" />} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Buscar plan" actionLabel="Filtra por nombre, carnet, tratamiento o concepto.">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-copy)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, carnet, tratamiento o concepto..."
                className="premium-input pl-11"
              />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="premium-input">
              <option value="Todas">Todas</option>
              <option value="Activo">Activo</option>
              <option value="Al dia">Al dia</option>
              <option value="Con atraso">Con atraso</option>
              <option value="Liquidado">Liquidado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>
        </Panel>

        <Panel title="Pendientes de revision" actionLabel={`${pendingReviewItems.length} por revisar`} compact>
          {pendingReviewItems.length === 0 ? (
            <EmptyState label="No hay comprobantes nuevos para revisar ahora mismo." />
          ) : (
            <div className="grid gap-3">
              {pendingReviewItems.slice(0, 6).map((item) => (
                <button
                  key={item.receipt.id}
                  type="button"
                  onClick={() => openDetail(item.plan.id, item.installment.id)}
                  className="rounded-[20px] border border-[var(--color-border)] bg-white/80 p-4 text-left transition hover:bg-white hover:shadow-[0_12px_30px_rgba(62,42,31,0.08)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--color-ink)]">{item.plan.patient_full_name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
                        Cuota {item.installment.installment_number} · vence {formatDate(item.installment.due_date)}
                      </p>
                    </div>
                    <StatusPill status={item.installment.status} small />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-copy)]">
                    {formatMoney(item.installment.amount)} · pago {formatDate(item.receipt.payment_date)}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-mocha)]">
                    Abrir detalle
                    <ChevronRight className="h-4 w-4" />
                  </p>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <Panel title={`Resultados (${filteredPlans.length})`} actionLabel="Haz clic en un plan para abrir su ficha completa.">
        {filteredPlans.length === 0 ? (
          <EmptyState label="No encontramos planes con esos filtros." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {filteredPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => openDetail(plan.id)}
                className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-5 text-left transition hover:bg-white hover:shadow-[0_12px_30px_rgba(62,42,31,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--color-ink)]">{plan.patient_full_name}</p>
                    <p className="mt-1 text-sm text-[var(--color-copy)]">
                      {plan.patient_document_number ?? "sin carnet"} · {plan.title}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[var(--color-copy)]" />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusPill status={plan.status} />
                  {plan.allow_treatment_before_completion ? (
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">Tratamiento anticipado</span>
                  ) : null}
                </div>

                <p className="mt-4 text-sm leading-6 text-[var(--color-copy)]">
                  Primera cuota {formatDate(plan.first_due_date)}
                  <br />
                  {plan.months_count} cuotas de {formatMoney(plan.installment_amount)}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <InlineStat label="Pagado" value={formatMoney(plan.approved_amount)} />
                  <InlineStat label="Pendiente" value={formatMoney(plan.pending_amount)} />
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {createOpen ? (
        <ModalShell title="Nuevo plan de pago" onClose={() => setCreateOpen(false)} maxWidthClassName="max-w-5xl">
          <div className="grid gap-4">
            <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4 text-sm leading-7 text-[var(--color-copy)]">
              Busca el paciente por nombre o carnet. Si ligas el plan a un tratamiento, puedes decidir si se permite
              realizarlo antes de liquidar. El total debe coincidir con anticipo mas cuotas.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <SearchSelect
                label="Paciente"
                placeholder="Busca por nombre o carnet..."
                value={createForm.patientId}
                searchValue={selectedPatient?.full_name ?? patientSearch}
                onSearchChange={(value) => {
                  setPatientSearch(value);
                  if (createForm.patientId) setCreateForm({ ...createForm, patientId: "" });
                }}
                options={filteredPatientOptions}
                onSelect={(option) => {
                  setCreateForm({ ...createForm, patientId: option.id });
                  setPatientSearch(option.label);
                }}
              />

              <SearchSelect
                label="Tratamiento opcional"
                placeholder="Busca tratamiento..."
                value={createForm.treatmentId}
                searchValue={selectedTreatment?.title ?? treatmentSearch}
                onSearchChange={(value) => {
                  setTreatmentSearch(value);
                  if (createForm.treatmentId) setCreateForm({ ...createForm, treatmentId: "" });
                }}
                options={filteredTreatmentOptions}
                emptyLabel="No encontramos tratamientos. Puedes usar titulo libre."
                onSelect={(option) => {
                  setCreateForm({ ...createForm, treatmentId: option.id, title: "" });
                  setTreatmentSearch(option.label);
                }}
              />

              {!createForm.treatmentId ? (
                <Field label="Titulo libre del plan" className="md:col-span-2">
                  <input
                    value={createForm.title}
                    onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })}
                    className="premium-input"
                    placeholder="Ejemplo: Plan estetico facial"
                  />
                </Field>
              ) : null}

              <Field label="Monto total">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(createForm.totalAmount)}
                  onChange={(event) => setCreateForm({ ...createForm, totalAmount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>

              <Field label="Anticipo o pago inicial">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(createForm.initialPaymentAmount)}
                  onChange={(event) => setCreateForm({ ...createForm, initialPaymentAmount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>

              {createForm.initialPaymentAmount > 0 ? (
                <>
                  <Field label="Fecha del anticipo">
                    <input
                      type="date"
                      value={createForm.initialPaymentDate}
                      onChange={(event) => setCreateForm({ ...createForm, initialPaymentDate: event.target.value })}
                      className="premium-input"
                    />
                  </Field>
                  <Field label="Metodo del anticipo">
                    <select
                      value={createForm.initialPaymentMethod}
                      onChange={(event) => setCreateForm({ ...createForm, initialPaymentMethod: event.target.value })}
                      className="premium-input"
                    >
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.code}>
                          {method.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              ) : null}

              <Field label="Cantidad de cuotas">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={String(createForm.monthsCount)}
                  onChange={(event) => setCreateForm({ ...createForm, monthsCount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>

              <Field label="Monto fijo por cuota">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={String(createForm.installmentAmount)}
                  onChange={(event) => setCreateForm({ ...createForm, installmentAmount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>

              <Field label="Fecha de la primera cuota">
                <input
                  type="date"
                  value={createForm.firstDueDate}
                  onChange={(event) => setCreateForm({ ...createForm, firstDueDate: event.target.value })}
                  className="premium-input"
                />
              </Field>

              <CheckboxField
                label="Permitir tratamiento antes de liquidar"
                checked={createForm.allowTreatmentBeforeCompletion}
                onChange={(checked) => setCreateForm({ ...createForm, allowTreatmentBeforeCompletion: checked })}
              />

              <Field label="Notas internas" className="md:col-span-2">
                <textarea
                  value={createForm.notes}
                  onChange={(event) => setCreateForm({ ...createForm, notes: event.target.value })}
                  className="premium-input min-h-28"
                  placeholder="Acuerdo interno, observaciones o reglas del plan..."
                />
              </Field>
            </div>

            <div className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-4 text-sm leading-7 text-[var(--color-copy)]">
              <p className="font-semibold text-[var(--color-ink)]">Resumen rapido</p>
              <p>
                Anticipo: {formatMoney(createForm.initialPaymentAmount)}
                <br />
                Cuotas: {createForm.monthsCount} x {formatMoney(createForm.installmentAmount)}
                <br />
                Total calculado: {formatMoney(totalBreakdownAmount)}
                <br />
                Total declarado: {formatMoney(createForm.totalAmount)}
              </p>
            </div>
          </div>
          <ActionRow saving={savingCreate} primaryLabel="Crear plan" onSave={() => void submitCreate()} onCancel={() => setCreateOpen(false)} />
        </ModalShell>
      ) : null}
    </div>
  );
}

function SearchSelect({
  label,
  placeholder,
  value,
  searchValue,
  onSearchChange,
  options,
  onSelect,
  emptyLabel = "No encontramos resultados.",
}: {
  label: string;
  placeholder: string;
  value: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  options: SearchOption[];
  onSelect: (option: SearchOption) => void;
  emptyLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const showOptions = focused || (!value && searchValue.trim().length > 0);

  return (
    <label className="relative">
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-2">
        <input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder={placeholder}
          className="premium-input"
        />
      </div>

      {showOptions ? (
        <div className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[0_18px_46px_rgba(62,42,31,0.12)]">
          {options.length === 0 ? (
            <p className="rounded-[16px] px-3 py-3 text-sm text-[var(--color-copy)]">{emptyLabel}</p>
          ) : (
            <div className="grid gap-2">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelect(option)}
                  className="rounded-[16px] border border-transparent bg-white/70 px-3 py-3 text-left transition hover:border-[var(--color-border)] hover:bg-white"
                >
                  <p className="font-semibold text-[var(--color-ink)]">{option.label}</p>
                  {option.hint ? <p className="mt-1 text-sm text-[var(--color-copy)]">{option.hint}</p> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </label>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-[24px] border border-[var(--color-border)] bg-white/78 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--color-copy)]">{label}</p>
        <span className="rounded-full bg-[rgba(198,162,123,0.16)] p-2 text-[var(--color-mocha)]">{icon}</span>
      </div>
      <p className="mt-4 text-3xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function Panel({
  title,
  action,
  actionLabel,
  children,
  compact = false,
}: {
  title: string;
  action?: ReactNode;
  actionLabel?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`rounded-[30px] border border-[var(--color-border)] bg-white/78 shadow-[0_18px_50px_rgba(62,42,31,0.07)] ${compact ? "p-5" : "p-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {actionLabel ? <p className="mt-1 text-sm text-[var(--color-copy)]">{actionLabel}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatusPill({
  status,
  small = false,
}: {
  status: PaymentPlanRow["status"] | PaymentPlanInstallmentRow["status"];
  small?: boolean;
}) {
  const className =
    status === "Liquidado" || status === "Pagado"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Con atraso" || status === "Observado"
        ? "bg-rose-100 text-rose-800"
        : status === "En revision"
          ? "bg-sky-100 text-sky-800"
          : status === "Comprobante enviado"
            ? "bg-violet-100 text-violet-800"
            : status === "Activo" || status === "Al dia"
              ? "bg-amber-100 text-amber-800"
              : "bg-stone-100 text-stone-700";

  return <span className={`rounded-full px-3 py-1 font-semibold ${small ? "text-[11px]" : "text-xs"} ${className}`}>{status}</span>;
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-2 font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
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

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
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
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? "Guardando..." : primaryLabel}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
      >
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
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className={`max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8 ${maxWidthClassName}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
              Planes de pago
            </p>
            <h2 className="font-display mt-2 text-4xl font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
          >
            Cerrar
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
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
