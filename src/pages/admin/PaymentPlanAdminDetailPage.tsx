import { useEffect, useState, type ReactNode } from "react";

import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { shouldHidePatientPhone } from "../../lib/patientPrivacy";
import { hardDeleteRecord, restoreRecord, softDeleteRecord } from "../../services/adminDeletionService";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import {
  getPaymentPlanByIdAdmin,
  getPaymentPlanReceiptUrl,
  reviewPaymentPlanReceipt,
  type PaymentPlanInstallmentRow,
  type PaymentPlanReceiptRow,
  type PaymentPlanRow,
} from "../../services/paymentPlanService";
import { formatDate, formatMoney } from "../../utils/text";

type ReviewDraft = {
  installment: PaymentPlanInstallmentRow;
  receipt: PaymentPlanReceiptRow;
  action: "review" | "approve" | "observe";
  notes: string;
  paymentMethod: string;
  paymentDate: string;
};

export function PaymentPlanAdminDetailPage() {
  const { role, profile, user } = useAuth();
  const hidePatientPhone = shouldHidePatientPhone(role);
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightedInstallmentId = searchParams.get("cuota") ?? "";

  const [plan, setPlan] = useState<PaymentPlanRow | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const actorId = profile?.id ?? user?.id ?? null;
  const actorName = profile?.full_name ?? user?.user_metadata.full_name ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextPlan, nextMethods] = await Promise.all([
        getPaymentPlanByIdAdmin(id, role === "superadmin", role),
        getCashPaymentMethods(true),
      ]);
      setPlan(nextPlan);
      setPaymentMethods(nextMethods);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar este plan de pago.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id, role]);

  useEffect(() => {
    if (!highlightedInstallmentId || loading) return;
    const element = document.getElementById(`payment-plan-installment-${highlightedInstallmentId}`);
    if (!element) return;
    window.setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [highlightedInstallmentId, loading]);

  const openReceipt = async (path?: string | null) => {
    const url = await getPaymentPlanReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openReview = (
    installment: PaymentPlanInstallmentRow,
    receipt: PaymentPlanReceiptRow,
    action: ReviewDraft["action"]
  ) => {
    setReviewDraft({
      installment,
      receipt,
      action,
      notes: installment.admin_notes ?? "",
      paymentMethod: paymentMethods.find((item) => item.is_default)?.code ?? paymentMethods[0]?.code ?? "qr",
      paymentDate: receipt.payment_date,
    });
  };

  const submitReview = async () => {
    if (!reviewDraft) return;
    setSavingReview(true);
    setError("");
    setMessage("");
    try {
      await reviewPaymentPlanReceipt({
        receiptId: reviewDraft.receipt.id,
        action: reviewDraft.action,
        adminNotes: reviewDraft.notes.trim() || null,
        paymentMethod: reviewDraft.action === "approve" ? reviewDraft.paymentMethod : null,
        paymentDate: reviewDraft.paymentDate,
      });

      setMessage(
        reviewDraft.action === "approve"
          ? "Cuota aprobada y reflejada en caja."
          : reviewDraft.action === "observe"
            ? "Comprobante observado. El historial queda guardado y la paciente debera subir uno nuevo."
            : "Comprobante marcado en revision."
      );
      setReviewDraft(null);
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "No pudimos actualizar el comprobante.");
    } finally {
      setSavingReview(false);
    }
  };

  if (loading) return <LoadingState label="Cargando ficha del plan..." />;
  if (error && !plan) return <ErrorState label={error} />;
  if (!plan) return <EmptyState label="No encontramos este plan de pago." />;

  const pendingReviewCount = (plan.installments ?? []).filter(
    (installment) => installment.status === "Comprobante enviado" || installment.status === "En revision"
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.96),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_70px_rgba(62,42,31,0.10)] md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/panel/planes-pago"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a planes
          </Link>
          {role === "superadmin" ? (
            <DeleteActions
              role={role}
              row={plan}
              onSoftDelete={() =>
                void softDeleteRecord({
                  table: "payment_plans",
                  id: plan.id,
                  actorId,
                  actorRole: role,
                  actorName,
                  actorEmail,
                }).then(load)
              }
              onRestore={() => void restoreRecord("payment_plans", plan.id).then(load)}
              onHardDelete={() =>
                void hardDeleteRecord("payment_plans", plan.id).then(() => {
                  void navigate("/panel/planes-pago");
                })
              }
            />
          ) : null}
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Operacion · detalle del plan
        </p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <h1 className="font-display text-4xl font-semibold leading-[0.95] md:text-5xl">{plan.patient_full_name}</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)] md:text-base">
              {plan.title}
              <br />
              Carnet {plan.patient_document_number ?? "sin carnet"} · primera cuota {formatDate(plan.first_due_date)}
              <br />
              {plan.allow_treatment_before_completion
                ? "Tratamiento habilitable antes de liquidar."
                : "Tratamiento solo permitido al liquidar el plan."}
            </p>
          </div>
          <StatusPill status={plan.status} />
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
      <DeletedStatusNote row={plan} />

      {highlightedInstallmentId ? (
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
          Abriste esta ficha desde una cuota pendiente. La vista se desplaza hasta esa cuota para revisarla mas rapido.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoStat label="Estado" value={plan.status} />
        <InfoStat label="Total" value={formatMoney(plan.total_amount)} />
        <InfoStat label="Pagado" value={formatMoney(plan.approved_amount)} />
        <InfoStat label="Pendiente" value={formatMoney(plan.pending_amount)} />
        <InfoStat label="Anticipo" value={formatMoney(plan.initial_payment_amount)} />
        <InfoStat label="Cuotas" value={`${plan.months_count} x ${formatMoney(plan.installment_amount)}`} />
        <InfoStat label="Pagadas" value={`${plan.approved_installments_count}/${plan.months_count}`} />
        <InfoStat label="Por revisar" value={String(pendingReviewCount)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel title="Resumen del plan">
          <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-5 text-sm leading-7 text-[var(--color-copy)]">
            <p className="font-semibold text-[var(--color-ink)]">{plan.title}</p>
            <p className="mt-3">
              Paciente: {plan.patient_full_name}
              <br />
              Carnet: {plan.patient_document_number ?? "sin carnet"}
              {!hidePatientPhone && plan.patients?.phone ? ` · ${plan.patients.phone}` : ""}
              <br />
              Monto total: {formatMoney(plan.total_amount)}
              <br />
              Anticipo: {formatMoney(plan.initial_payment_amount)}
              {plan.initial_payment_date ? ` · ${formatDate(plan.initial_payment_date)}` : ""}
              {plan.initial_payment_method ? ` · ${plan.initial_payment_method}` : ""}
              <br />
              Saldo financiado: {formatMoney(plan.financed_amount)}
              <br />
              {plan.allow_treatment_before_completion
                ? "Puede realizar tratamiento antes de liquidar."
                : "Debe liquidar el plan antes de realizar el tratamiento."}
            </p>
            {plan.notes?.trim() ? <p className="mt-4 rounded-[18px] bg-white/80 px-4 py-3">Notas: {plan.notes}</p> : null}
          </div>
        </Panel>

        <Panel title="Alertas y acceso">
          <div className="grid gap-3">
            {plan.observed_receipts_count > 0 ? (
              <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Este plan tiene {plan.observed_receipts_count} comprobante(s) observados. El historial no se borra y
                queda como alerta para seguimiento.
              </div>
            ) : null}

            {plan.status === "Liquidado" ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                El plan ya quedo liquidado. Todas las cuotas fueron aprobadas.
              </div>
            ) : null}

            {plan.allow_treatment_before_completion ? (
              <div className="rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                Este plan permite continuar con el tratamiento antes del pago total, si operacion decide habilitarlo.
              </div>
            ) : (
              <div className="rounded-[20px] border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                Este plan no habilita el tratamiento hasta que quede liquidado.
              </div>
            )}
          </div>
        </Panel>
      </section>

      <Panel title="Cuotas y comprobantes" actionLabel="Cada cuota aprobada entra a caja con la fecha del deposito.">
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {(plan.installments ?? []).map((installment) => {
            const latestReceipt = installment.receipts?.[0] ?? null;
            const highlighted = installment.id === highlightedInstallmentId;

            return (
              <article
                id={`payment-plan-installment-${installment.id}`}
                key={installment.id}
                className={`rounded-[24px] border bg-[rgba(247,242,236,0.74)] p-4 transition ${highlighted ? "border-sky-300 ring-2 ring-sky-200" : "border-[var(--color-border)]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      Cuota {installment.installment_number} · vence {formatDate(installment.due_date)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-copy)]">{formatMoney(installment.amount)}</p>
                  </div>
                  <StatusPill status={installment.status} small />
                </div>

                <p className="mt-3 text-xs leading-6 text-[var(--color-copy)]">
                  {latestReceipt
                    ? `Ultimo envio ${formatDate(latestReceipt.submitted_at)} · pago ${formatDate(latestReceipt.payment_date)}`
                    : "Sin comprobante enviado todavia."}
                </p>

                {latestReceipt ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void openReceipt(latestReceipt.receipt_path)}
                      className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-xs font-semibold"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Ver comprobante
                      </span>
                    </button>
                    {installment.status !== "Pagado" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openReview(installment, latestReceipt, "review")}
                          className="rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-2 text-xs font-semibold"
                        >
                          En revision
                        </button>
                        <button
                          type="button"
                          onClick={() => openReview(installment, latestReceipt, "approve")}
                          className="rounded-full bg-[var(--color-mocha)] px-3 py-2 text-xs font-semibold text-white"
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => openReview(installment, latestReceipt, "observe")}
                          className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800"
                        >
                          Observar
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {installment.receipts?.length ? (
                  <div className="mt-4 grid gap-2">
                    {installment.receipts.map((receipt) => (
                      <button
                        key={receipt.id}
                        type="button"
                        onClick={() => void openReceipt(receipt.receipt_path)}
                        className="flex items-center justify-between gap-3 rounded-[18px] bg-white/80 px-3 py-2 text-left text-xs"
                      >
                        <span>
                          {formatDate(receipt.submitted_at)} · {receipt.status}
                        </span>
                        <span className="font-semibold text-[var(--color-mocha)]">Abrir</span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {installment.admin_notes ? (
                  <p className="mt-3 text-xs leading-6 text-[var(--color-copy)]">Admin: {installment.admin_notes}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </Panel>

      {reviewDraft ? (
        <ModalShell
          title={
            reviewDraft.action === "approve"
              ? "Aprobar cuota"
              : reviewDraft.action === "observe"
                ? "Observar comprobante"
                : "Marcar en revision"
          }
          onClose={() => setReviewDraft(null)}
        >
          <div className="grid gap-4">
            <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4 text-sm leading-7 text-[var(--color-copy)]">
              <p className="font-semibold text-[var(--color-ink)]">
                {plan.patient_full_name} · cuota {reviewDraft.installment.installment_number}
              </p>
              <p>
                Vencimiento {formatDate(reviewDraft.installment.due_date)} · {formatMoney(reviewDraft.installment.amount)}
              </p>
              <p>Plan: {plan.title}</p>
            </div>

            <Field label="Fecha real del deposito">
              <input
                type="date"
                value={reviewDraft.paymentDate}
                onChange={(event) => setReviewDraft({ ...reviewDraft, paymentDate: event.target.value })}
                className="premium-input"
              />
            </Field>

            {reviewDraft.action === "approve" ? (
              <Field label="Metodo de pago">
                <select
                  value={reviewDraft.paymentMethod}
                  onChange={(event) => setReviewDraft({ ...reviewDraft, paymentMethod: event.target.value })}
                  className="premium-input"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.code}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Notas administrativas">
              <textarea
                value={reviewDraft.notes}
                onChange={(event) => setReviewDraft({ ...reviewDraft, notes: event.target.value })}
                className="premium-input min-h-28"
                placeholder={reviewDraft.action === "observe" ? "Explica por que el comprobante se observa o rechaza." : "Notas internas opcionales."}
              />
            </Field>
          </div>
          <ActionRow
            saving={savingReview}
            primaryLabel={
              reviewDraft.action === "approve"
                ? "Aprobar y mandar a caja"
                : reviewDraft.action === "observe"
                  ? "Guardar observacion"
                  : "Guardar revision"
            }
            onSave={() => void submitReview()}
            onCancel={() => setReviewDraft(null)}
          />
        </ModalShell>
      ) : null}
    </div>
  );
}

function Panel({
  title,
  children,
  actionLabel,
}: {
  title: string;
  children: ReactNode;
  actionLabel?: string;
}) {
  return (
    <section className="rounded-[30px] border border-[var(--color-border)] bg-white/78 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.07)]">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {actionLabel ? <p className="mt-1 text-sm text-[var(--color-copy)]">{actionLabel}</p> : null}
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

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--color-border)] bg-white/78 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
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
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
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
