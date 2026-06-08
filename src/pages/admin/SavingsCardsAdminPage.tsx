import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";

import { CheckCircle2, ChevronRight, Copy, CreditCard, Receipt, Search, ShieldAlert, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { hardDeleteRecord, restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import { getPatients, type PatientRow } from "../../services/patientService";
import {
  buildSavingsCardShareMessage,
  createSavingsCard,
  formatSavingsCardMonth,
  getSavingsCardsAdmin,
  type SavingsCardInstallmentRow,
  type SavingsCardReceiptRow,
  type SavingsCardRow,
} from "../../services/savingsCardService";
import { getAdminTreatments, type TreatmentRow } from "../../services/treatmentService";
import { formatDate, formatMoney } from "../../utils/text";

type CreateFormState = {
  patientId: string;
  treatmentId: string;
  treatmentTitle: string;
  monthsCount: number;
  monthlyAmount: number;
  startMonth: string;
  notes: string;
};

type ReviewQueueItem = {
  card: SavingsCardRow;
  installment: SavingsCardInstallmentRow;
  receipt: SavingsCardReceiptRow;
};

type SearchOption = {
  id: string;
  label: string;
  hint?: string | null;
};

const emptyCreateForm: CreateFormState = {
  patientId: "",
  treatmentId: "",
  treatmentTitle: "",
  monthsCount: 10,
  monthlyAmount: 100,
  startMonth: getMonthInputValue(),
  notes: "",
};

export function SavingsCardsAdminPage() {
  const { role, profile, user } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<SavingsCardRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [treatments, setTreatments] = useState<TreatmentRow[]>([]);
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
  const [shareCard, setShareCard] = useState<SavingsCardRow | null>(null);

  const deferredQuery = useDeferredValue(query);
  const deferredPatientSearch = useDeferredValue(patientSearch);
  const deferredTreatmentSearch = useDeferredValue(treatmentSearch);
  const actorId = profile?.id ?? user?.id ?? null;
  const actorName = profile?.full_name ?? user?.user_metadata.full_name ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextCards, nextPatients, nextTreatments] = await Promise.all([
        getSavingsCardsAdmin(role === "superadmin", role),
        getPatients(false, role),
        getAdminTreatments(),
      ]);
      setCards(nextCards);
      setPatients(nextPatients.filter((item) => !item.is_deleted));
      setTreatments(nextTreatments.filter((item) => !item.is_deleted && item.is_active !== false));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar las tarjetas de ahorro.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [role]);

  const visibleCards = useMemo(() => cards.filter((card) => !card.is_deleted), [cards]);

  const filteredCards = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesQuery =
        !search ||
        [
          card.patient_full_name,
          card.patient_document_number,
          card.token,
          card.treatment_title,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      const matchesStatus = statusFilter === "Todas" || card.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [cards, deferredQuery, statusFilter]);

  const pendingReviewItems = useMemo(() => {
    return visibleCards
      .flatMap((card) =>
        (card.installments ?? [])
          .filter((installment) => installment.status === "Comprobante enviado" || installment.status === "En revision")
          .map((installment) => ({
            card,
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
  }, [visibleCards]);

  const totalCards = visibleCards.length;
  const activeCards = visibleCards.filter((card) => card.status === "Activa").length;
  const readyCards = visibleCards.filter((card) => card.status === "Completada").length;
  const observedCards = visibleCards.filter((card) => card.observed_receipts_count > 0).length;

  const patientOptions = useMemo<SearchOption[]>(
    () =>
      patients.map((patient) => ({
        id: patient.id,
        label: patient.full_name,
        hint: patient.document_number ? `Carnet ${patient.document_number}` : "Sin carnet",
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

  const copyText = async (value: string, success: string) => {
    await navigator.clipboard.writeText(value);
    setMessage(success);
  };

  const openDetail = (cardId: string, installmentId?: string) => {
    const search = installmentId ? `?cuota=${encodeURIComponent(installmentId)}` : "";
    void navigate(`/panel/tarjetas-ahorro/${cardId}${search}`);
  };

  const submitCreate = async () => {
    setSavingCreate(true);
    setError("");
    setMessage("");
    try {
      const created = await createSavingsCard({
        patientId: createForm.patientId,
        treatmentId: createForm.treatmentId || null,
        treatmentTitle: createForm.treatmentId ? null : createForm.treatmentTitle.trim() || null,
        monthsCount: Number(createForm.monthsCount),
        monthlyAmount: Number(createForm.monthlyAmount),
        startMonth: `${createForm.startMonth}-01`,
        notes: createForm.notes.trim() || null,
      });

      if (!created) throw new Error("La tarjeta se creo, pero no pudimos recargarla.");

      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      setPatientSearch("");
      setTreatmentSearch("");
      setShareCard(created);
      setMessage("Tarjeta de ahorro creada correctamente.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No pudimos crear la tarjeta.");
    } finally {
      setSavingCreate(false);
    }
  };

  if (loading) return <LoadingState label="Cargando tarjetas de ahorro..." />;
  if (error && cards.length === 0) return <ErrorState label={error} />;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.96),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_70px_rgba(62,42,31,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Operacion · tarjetas de ahorro
        </p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="font-display text-4xl font-semibold leading-[0.95] md:text-5xl">
              Busca, filtra y abre cada tarjeta en una vista separada.
            </h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)] md:text-base">
              Aqui queda solo el buscador, la bandeja de pendientes y el listado de resultados. Cuando haces clic en una
              tarjeta, entras a otra vista para revisar cuotas y comprobantes sin mezclar todo en una sola pantalla.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
          >
            <Sparkles className="h-4 w-4" />
            Nueva tarjeta
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
        <SummaryCard label="Tarjetas creadas" value={String(totalCards)} icon={<CreditCard className="h-5 w-5" />} />
        <SummaryCard label="Activas" value={String(activeCards)} icon={<Receipt className="h-5 w-5" />} />
        <SummaryCard label="Listas para canje" value={String(readyCards)} icon={<CheckCircle2 className="h-5 w-5" />} />
        <SummaryCard label="Con alertas" value={String(observedCards)} icon={<ShieldAlert className="h-5 w-5" />} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Buscar tarjeta" actionLabel="Filtra por nombre, carnet, token o tratamiento.">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-copy)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nombre, carnet, token o tratamiento..."
                className="premium-input pl-11"
              />
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="premium-input">
              <option value="Todas">Todas</option>
              <option value="Activa">Activas</option>
              <option value="Completada">Completadas</option>
              <option value="Canjeada">Canjeadas</option>
              <option value="Cancelada">Canceladas</option>
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
                  onClick={() => openDetail(item.card.id, item.installment.id)}
                  className="rounded-[20px] border border-[var(--color-border)] bg-white/80 p-4 text-left transition hover:bg-white hover:shadow-[0_12px_30px_rgba(62,42,31,0.08)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--color-ink)]">{item.card.patient_full_name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
                        Cuota {item.installment.installment_number} · {formatSavingsCardMonth(item.installment.due_date)}
                      </p>
                    </div>
                    <StatusPill status={item.installment.status} small />
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--color-copy)]">
                    {formatMoney(item.installment.amount)} · enviado {formatDate(item.receipt.submitted_at)}
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

      <Panel title={`Resultados (${filteredCards.length})`} actionLabel="Haz clic en una tarjeta para abrir su ficha completa.">
        {filteredCards.length === 0 ? (
          <EmptyState label="No encontramos tarjetas con esos filtros." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {filteredCards.map((card) => (
              <article
                key={card.id}
                className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-5 text-left transition hover:bg-white hover:shadow-[0_12px_30px_rgba(62,42,31,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--color-ink)]">{card.patient_full_name}</p>
                    <p className="mt-1 text-sm text-[var(--color-copy)]">
                      {card.patient_document_number ?? "sin carnet"} · {card.token}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openDetail(card.id)}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-mocha)]"
                  >
                    Abrir
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-copy)]" />
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusPill status={card.status} />
                  {card.observed_receipts_count > 0 ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      {card.observed_receipts_count} alerta{card.observed_receipts_count === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>

                <p className="mt-4 text-sm leading-6 text-[var(--color-copy)]">
                  {card.treatment_title?.trim() || "Sin tratamiento fijo"}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <InlineStat label="Aprobado" value={formatMoney(card.approved_amount)} />
                  <InlineStat label="Pendiente" value={formatMoney(card.pending_amount)} />
                </div>
                {role === "superadmin" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <DeleteActions
                      role={role}
                      row={card}
                      onSoftDelete={() =>
                        void softDeleteRecord({
                          table: "savings_cards",
                          id: card.id,
                          actorId,
                          actorRole: role,
                          actorName,
                          actorEmail,
                        }).then(load)
                      }
                      onRestore={() => void restoreRecord("savings_cards", card.id).then(load)}
                      onHardDelete={() => void hardDeleteRecord("savings_cards", card.id).then(load)}
                    />
                  </div>
                ) : null}
                <DeletedStatusNote row={card} />
              </article>
            ))}
          </div>
        )}
      </Panel>

      {createOpen ? (
        <ModalShell title="Nueva tarjeta de ahorro" onClose={() => setCreateOpen(false)} maxWidthClassName="max-w-4xl">
          <div className="grid gap-4">
            <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4 text-sm leading-7 text-[var(--color-copy)]">
              Busca el paciente por nombre o carnet. El tratamiento tambien se puede buscar; si no quieres ligarlo,
              puedes dejar un nombre manual.
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
                emptyLabel="No encontramos tratamientos. Puedes usar nombre libre."
                onSelect={(option) => {
                  setCreateForm({ ...createForm, treatmentId: option.id, treatmentTitle: "" });
                  setTreatmentSearch(option.label);
                }}
              />

              {!createForm.treatmentId ? (
                <Field label="Nombre libre del tratamiento" className="md:col-span-2">
                  <input
                    value={createForm.treatmentTitle}
                    onChange={(event) => setCreateForm({ ...createForm, treatmentTitle: event.target.value })}
                    className="premium-input"
                    placeholder="Opcional, por ejemplo: Rinomodelacion"
                  />
                </Field>
              ) : null}

              <Field label="Cantidad de meses">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={String(createForm.monthsCount)}
                  onChange={(event) => setCreateForm({ ...createForm, monthsCount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>

              <Field label="Monto fijo por mes">
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  value={String(createForm.monthlyAmount)}
                  onChange={(event) => setCreateForm({ ...createForm, monthlyAmount: Number(event.target.value) })}
                  className="premium-input"
                />
              </Field>

              <Field label="Mes inicial">
                <input
                  type="month"
                  value={createForm.startMonth}
                  onChange={(event) => setCreateForm({ ...createForm, startMonth: event.target.value })}
                  className="premium-input"
                />
              </Field>

              <Field label="Notas internas" className="md:col-span-2">
                <textarea
                  value={createForm.notes}
                  onChange={(event) => setCreateForm({ ...createForm, notes: event.target.value })}
                  className="premium-input min-h-28"
                  placeholder="Instrucciones, observaciones o acuerdo interno..."
                />
              </Field>
            </div>
          </div>
          <ActionRow saving={savingCreate} primaryLabel="Crear tarjeta" onSave={() => void submitCreate()} onCancel={() => setCreateOpen(false)} />
        </ModalShell>
      ) : null}

      {shareCard ? (
        <ModalShell title="Token y mensaje listos" onClose={() => setShareCard(null)} maxWidthClassName="max-w-4xl">
          <div className="grid gap-4">
            <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Token unico</p>
              <p className="mt-3 break-all font-mono text-lg font-semibold tracking-[0.18em] text-[var(--color-ink)]">
                {shareCard.token}
              </p>
            </div>

            <textarea readOnly value={buildSavingsCardShareMessage(shareCard)} className="premium-input min-h-44" />

            <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Este token solo funcionara en la cuenta del paciente asignado por carnet. Si intenta usarlo desde otra
              cuenta, el sistema no lo habilitara.
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => openDetail(shareCard.id)}
              className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold"
            >
              Abrir ficha
            </button>
            <button
              type="button"
              onClick={() => void copyText(shareCard.token, "Token copiado al portapapeles.")}
              className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold"
            >
              <span className="inline-flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Copiar token
              </span>
            </button>
            <button
              type="button"
              onClick={() => void copyText(buildSavingsCardShareMessage(shareCard), "Mensaje listo copiado al portapapeles.")}
              className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
            >
              Copiar mensaje
            </button>
          </div>
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
  status: SavingsCardRow["status"] | SavingsCardInstallmentRow["status"];
  small?: boolean;
}) {
  const className =
    status === "Completada" || status === "Pagado"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Canjeada" || status === "En revision"
        ? "bg-sky-100 text-sky-800"
        : status === "Cancelada" || status === "Observado"
          ? "bg-rose-100 text-rose-800"
          : status === "Comprobante enviado"
            ? "bg-violet-100 text-violet-800"
            : "bg-amber-100 text-amber-800";

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
              Tarjetas de ahorro
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

function getMonthInputValue(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}
