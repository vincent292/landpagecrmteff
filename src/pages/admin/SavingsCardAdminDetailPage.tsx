import { useEffect, useState, type ReactNode } from "react";

import { ArrowLeft, Copy, ExternalLink, MessageSquareShare } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getCashPaymentMethods, type CashPaymentMethodRow } from "../../services/cashService";
import {
  buildSavingsCardShareMessage,
  formatSavingsCardMonth,
  getSavingsCardByIdAdmin,
  getSavingsCardReceiptUrl,
  reviewSavingsCardReceipt,
  type SavingsCardInstallmentRow,
  type SavingsCardReceiptRow,
  type SavingsCardRow,
} from "../../services/savingsCardService";
import { formatDate, formatMoney } from "../../utils/text";

type ReviewDraft = {
  installment: SavingsCardInstallmentRow;
  receipt: SavingsCardReceiptRow;
  action: "review" | "approve" | "observe";
  notes: string;
  paymentMethod: string;
};

export function SavingsCardAdminDetailPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const highlightedInstallmentId = searchParams.get("cuota") ?? "";

  const [card, setCard] = useState<SavingsCardRow | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<CashPaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [savingReview, setSavingReview] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextCard, nextMethods] = await Promise.all([
        getSavingsCardByIdAdmin(id),
        getCashPaymentMethods(true),
      ]);
      setCard(nextCard);
      setPaymentMethods(nextMethods);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar esta tarjeta de ahorro.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!highlightedInstallmentId || loading) return;
    const element = document.getElementById(`installment-${highlightedInstallmentId}`);
    if (!element) return;
    window.setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [highlightedInstallmentId, loading]);

  const openReceipt = async (path?: string | null) => {
    const url = await getSavingsCardReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyText = async (value: string, success: string) => {
    await navigator.clipboard.writeText(value);
    setMessage(success);
  };

  const openReview = (
    installment: SavingsCardInstallmentRow,
    receipt: SavingsCardReceiptRow,
    action: ReviewDraft["action"]
  ) => {
    setReviewDraft({
      installment,
      receipt,
      action,
      notes: installment.admin_notes ?? "",
      paymentMethod: paymentMethods.find((item) => item.is_default)?.code ?? paymentMethods[0]?.code ?? "qr",
    });
  };

  const submitReview = async () => {
    if (!reviewDraft) return;
    setSavingReview(true);
    setError("");
    setMessage("");
    try {
      await reviewSavingsCardReceipt({
        receiptId: reviewDraft.receipt.id,
        action: reviewDraft.action,
        adminNotes: reviewDraft.notes.trim() || null,
        paymentMethod: reviewDraft.action === "approve" ? reviewDraft.paymentMethod : null,
      });

      setMessage(
        reviewDraft.action === "approve"
          ? "Cuota aprobada y enviada a caja."
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

  if (loading) return <LoadingState label="Cargando ficha de la tarjeta..." />;
  if (error && !card) return <ErrorState label={error} />;
  if (!card) return <EmptyState label="No encontramos esta tarjeta de ahorro." />;

  const pendingReviewCount = (card.installments ?? []).filter(
    (installment) => installment.status === "Comprobante enviado" || installment.status === "En revision"
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.96),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_70px_rgba(62,42,31,0.10)] md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/panel/tarjetas-ahorro"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a tarjetas
          </Link>
          <button
            type="button"
            onClick={() => void copyText(card.token, "Token copiado al portapapeles.")}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold"
          >
            <Copy className="h-4 w-4" />
            Copiar token
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold"
          >
            <MessageSquareShare className="h-4 w-4" />
            Ver mensaje
          </button>
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Operacion · detalle de tarjeta
        </p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <h1 className="font-display text-4xl font-semibold leading-[0.95] md:text-5xl">{card.patient_full_name}</h1>
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)] md:text-base">
              {card.treatment_title?.trim() || "Sin tratamiento fijo"} · token {card.token}
              <br />
              Carnet {card.patient_document_number ?? "sin carnet"} · inicio {formatDate(card.start_month)}
              {card.activated_at ? ` · activada ${formatDate(card.activated_at)}` : " · aun no activada"}
            </p>
          </div>
          <StatusPill status={card.status} />
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

      {highlightedInstallmentId ? (
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
          Abriste esta ficha desde una cuota pendiente. La tarjeta se desplaza hasta esa cuota para revisarla mas rapido.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoStat label="Estado" value={card.status} />
        <InfoStat label="Plan" value={`${card.months_count} meses`} />
        <InfoStat label="Mensualidad" value={formatMoney(card.monthly_amount)} />
        <InfoStat label="Pendientes de revision" value={String(pendingReviewCount)} />
        <InfoStat label="Aprobado" value={formatMoney(card.approved_amount)} />
        <InfoStat label="Pendiente" value={formatMoney(card.pending_amount)} />
        <InfoStat label="Cuotas pagadas" value={`${card.approved_installments_count}/${card.months_count}`} />
        <InfoStat label="Alertas" value={String(card.observed_receipts_count)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel title="Resumen del paciente">
          <div className="rounded-[24px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-5 text-sm leading-7 text-[var(--color-copy)]">
            <p className="font-semibold text-[var(--color-ink)]">{card.treatment_title?.trim() || "Sin tratamiento fijo"}</p>
            <p className="mt-3">
              Paciente: {card.patient_full_name}
              <br />
              Carnet: {card.patient_document_number ?? "sin carnet"}
              {card.patients?.phone ? ` · ${card.patients.phone}` : ""}
              <br />
              Inicio del plan: {formatDate(card.start_month)}
              <br />
              {card.activated_at ? `Activada ${formatDate(card.activated_at)}` : "Todavia no fue activada por la paciente"}
              <br />
              {card.redeemed_at ? `Canjeada ${formatDate(card.redeemed_at)}` : "Aun no canjeada"}
            </p>
            {card.notes?.trim() ? <p className="mt-4 rounded-[18px] bg-white/80 px-4 py-3">Notas: {card.notes}</p> : null}
          </div>
        </Panel>

        <Panel title="Seguimiento">
          <div className="grid gap-3">
            <div className="rounded-[20px] border border-[var(--color-border)] bg-white/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">Token</p>
              <p className="mt-2 break-all font-mono text-sm font-semibold tracking-[0.18em] text-[var(--color-ink)]">
                {card.token}
              </p>
            </div>

            {card.observed_receipts_count > 0 ? (
              <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Esta tarjeta tiene {card.observed_receipts_count} comprobante(s) observados. El historial no se borra y
                queda como alerta para seguimiento.
              </div>
            ) : null}

            {card.status === "Completada" && !card.redeemed_at ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Todas las cuotas quedaron aprobadas. Esta tarjeta ya puede usarse en caja.
              </div>
            ) : null}
          </div>
        </Panel>
      </section>

      <Panel title="Cuotas y comprobantes" actionLabel="Revisa cada mes desde aqui.">
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {(card.installments ?? []).map((installment) => {
            const latestReceipt = installment.receipts?.[0] ?? null;
            const highlighted = installment.id === highlightedInstallmentId;

            return (
              <article
                id={`installment-${installment.id}`}
                key={installment.id}
                className={`rounded-[24px] border bg-[rgba(247,242,236,0.74)] p-4 transition ${highlighted ? "border-sky-300 ring-2 ring-sky-200" : "border-[var(--color-border)]"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold capitalize">
                      Cuota {installment.installment_number} · {formatSavingsCardMonth(installment.due_date)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--color-copy)]">{formatMoney(installment.amount)}</p>
                  </div>
                  <StatusPill status={installment.status} small />
                </div>

                <p className="mt-3 text-xs leading-6 text-[var(--color-copy)]">
                  {latestReceipt
                    ? `Ultimo envio ${formatDate(latestReceipt.submitted_at)} · ${latestReceipt.status}`
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

      {shareOpen ? (
        <ModalShell title="Token y mensaje listos" onClose={() => setShareOpen(false)}>
          <div className="grid gap-4">
            <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Token unico</p>
              <p className="mt-3 break-all font-mono text-lg font-semibold tracking-[0.18em] text-[var(--color-ink)]">
                {card.token}
              </p>
            </div>
            <textarea readOnly value={buildSavingsCardShareMessage(card)} className="premium-input min-h-44" />
            <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Este token solo funcionara en la cuenta del paciente asignado por carnet.
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void copyText(card.token, "Token copiado al portapapeles.")}
              className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold"
            >
              Copiar token
            </button>
            <button
              type="button"
              onClick={() => void copyText(buildSavingsCardShareMessage(card), "Mensaje listo copiado al portapapeles.")}
              className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"
            >
              Copiar mensaje
            </button>
          </div>
        </ModalShell>
      ) : null}

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
                {card.patient_full_name} · cuota {reviewDraft.installment.installment_number}
              </p>
              <p>
                {formatSavingsCardMonth(reviewDraft.installment.due_date)} · {formatMoney(reviewDraft.installment.amount)}
              </p>
              <p>Token: {card.token}</p>
            </div>

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
