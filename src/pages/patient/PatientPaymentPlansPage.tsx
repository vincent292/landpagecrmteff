import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CheckCircle2, Landmark, UploadCloud, Wallet } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import {
  getMyPaymentPlans,
  getPaymentPlanReceiptUrl,
  submitPaymentPlanInstallmentReceipt,
  uploadPaymentPlanReceipt,
  type PaymentPlanInstallmentRow,
  type PaymentPlanReceiptRow,
  type PaymentPlanRow,
} from "../../services/paymentPlanService";
import { formatDate, formatMoney } from "../../utils/text";

const boliviaTimeZone = "America/La_Paz";

export function PatientPaymentPlansPage() {
  const [plans, setPlans] = useState<PaymentPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadingInstallmentId, setUploadingInstallmentId] = useState("");
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const [celebrationPlan, setCelebrationPlan] = useState<PaymentPlanRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const nextPlans = await getMyPaymentPlans();
      setPlans(nextPlans);
      setCelebrationPlan((current) => current ?? nextPlans.find((plan) => plan.status === "Liquidado") ?? null);
      setPaymentDates((current) => {
        const next = { ...current };
        nextPlans.forEach((plan) => {
          (plan.installments ?? []).forEach((installment) => {
            if (!next[installment.id]) next[installment.id] = getBoliviaDateInputValue();
          });
        });
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar tus planes de pago.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const uploadReceipt = async (installmentId: string, file?: File | null) => {
    if (!file) return;
    const paymentDate = paymentDates[installmentId] ?? getBoliviaDateInputValue();
    setUploadingInstallmentId(installmentId);
    setError("");
    setMessage("");
    try {
      const receiptPath = await uploadPaymentPlanReceipt(file, installmentId);
      await submitPaymentPlanInstallmentReceipt(installmentId, receiptPath, paymentDate);
      setMessage("Recibimos tu comprobante. Administracion debe revisarlo para aprobar esa cuota.");
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No pudimos subir tu comprobante.");
    } finally {
      setUploadingInstallmentId("");
    }
  };

  const openReceipt = async (path?: string | null) => {
    const url = await getPaymentPlanReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.status !== "Liquidado" && plan.status !== "Cancelado").length,
    [plans]
  );
  const overduePlans = useMemo(() => plans.filter((plan) => plan.status === "Con atraso").length, [plans]);
  const nextPendingInstallment = useMemo(() => {
    const allInstallments = plans.flatMap((plan) =>
      (plan.installments ?? []).map((installment) => ({
        plan,
        installment,
      }))
    );
    return (
      allInstallments
        .filter((item) => item.installment.status !== "Pagado")
        .sort((left, right) => left.installment.due_date.localeCompare(right.installment.due_date))[0] ?? null
    );
  }, [plans]);

  if (loading) return <LoadingState label="Cargando tus planes de pago..." />;
  if (error && plans.length === 0) return <ErrorState label={error} />;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.96),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Portal privado · planes de pago
        </p>
        <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.92] md:text-6xl">
          Sigue tus cuotas, sube tu comprobante y revisa cuanto falta para liquidar.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
          Cada cuota corresponde a un solo pago. Cuando administracion apruebe tu comprobante, el deposito quedara
          reflejado en caja con la fecha real que ingreses aqui.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Planes activos" value={String(activePlans)} icon={<Landmark className="h-5 w-5" />} />
        <SummaryCard label="Con atraso" value={String(overduePlans)} icon={<Wallet className="h-5 w-5" />} />
        <SummaryCard
          label="Proxima cuota"
          value={nextPendingInstallment ? formatDate(nextPendingInstallment.installment.due_date) : "Sin cuota"}
          icon={<UploadCloud className="h-5 w-5" />}
        />
        <SummaryCard
          label="Liquidado"
          value={String(plans.filter((plan) => plan.status === "Liquidado").length)}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
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

      {plans.length === 0 ? <EmptyState label="Aun no tienes planes de pago registrados en tu cuenta." /> : null}

      <section className="grid gap-5">
        {plans.map((plan) => (
          <article key={plan.id} className="rounded-[28px] border border-[var(--color-border)] bg-white/80 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.07)]">
            <div className="grid gap-5 xl:grid-cols-[1fr_320px] xl:items-start">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                      {plan.treatment_id ? "Plan ligado a tratamiento" : "Plan de pago general"}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">{plan.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                      Total {formatMoney(plan.total_amount)} · Anticipo {formatMoney(plan.initial_payment_amount)}
                      <br />
                      {plan.months_count} cuotas de {formatMoney(plan.installment_amount)} · pendiente {formatMoney(plan.pending_amount)}
                      <br />
                      {plan.allow_treatment_before_completion
                        ? "Tu tratamiento puede habilitarse antes de terminar de pagar."
                        : "Tu tratamiento se habilita solo cuando el plan quede liquidado."}
                    </p>
                  </div>
                  <StatusPill status={plan.status} />
                </div>

                {plan.status === "Liquidado" ? (
                  <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    Este plan ya esta liquidado.
                  </div>
                ) : null}

                {plan.status === "Con atraso" ? (
                  <div className="mt-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                    Tienes al menos una cuota vencida pendiente de aprobacion.
                  </div>
                ) : null}
              </div>

              <div className="rounded-[28px] border border-[var(--color-border)] bg-[linear-gradient(135deg,#fff8f1_0%,#efe2d5_100%)] p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Resumen del plan</p>
                <div className="mt-4 grid gap-3">
                  <MiniStat label="Pagado" value={formatMoney(plan.approved_amount)} />
                  <MiniStat label="Pendiente" value={formatMoney(plan.pending_amount)} />
                  <MiniStat label="Primera cuota" value={formatDate(plan.first_due_date)} />
                  <MiniStat label="Estado" value={plan.status} />
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {(plan.installments ?? []).map((installment) => {
                const latestReceipt = installment.receipts?.[0] ?? null;
                const canUpload = installment.status === "Pendiente" || installment.status === "Observado";

                return (
                  <InstallmentCard
                    key={installment.id}
                    installment={installment}
                    latestReceipt={latestReceipt}
                    paymentDate={paymentDates[installment.id] ?? getBoliviaDateInputValue()}
                    onPaymentDateChange={(value) =>
                      setPaymentDates((current) => ({ ...current, [installment.id]: value }))
                    }
                    uploading={uploadingInstallmentId === installment.id}
                    canUpload={canUpload}
                    onUpload={(file) => void uploadReceipt(installment.id, file)}
                    onOpenLatest={() => void openReceipt(latestReceipt?.receipt_path)}
                    onOpenReceipt={(path) => void openReceipt(path)}
                  />
                );
              })}
            </div>
          </article>
        ))}
      </section>

      {celebrationPlan ? (
        <ModalShell title="Plan liquidado" onClose={() => setCelebrationPlan(null)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
              <p className="text-lg font-semibold">Felicidades, ya liquidaste este plan de pago.</p>
            </div>
            <p className="text-sm leading-7 text-[var(--color-copy)]">
              El plan {celebrationPlan.title} ya no tiene saldo pendiente. Si estaba ligado a un tratamiento, ahora
              puedes revisar con administracion el siguiente paso.
            </p>
            <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4 text-sm leading-7 text-[var(--color-copy)]">
              <p className="font-semibold text-[var(--color-ink)]">{celebrationPlan.title}</p>
              <p>
                Total pagado: {formatMoney(celebrationPlan.approved_amount)}
                <br />
                Estado: {celebrationPlan.status}
              </p>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function InstallmentCard({
  installment,
  latestReceipt,
  paymentDate,
  onPaymentDateChange,
  uploading,
  canUpload,
  onUpload,
  onOpenLatest,
  onOpenReceipt,
}: {
  installment: PaymentPlanInstallmentRow;
  latestReceipt: PaymentPlanReceiptRow | null;
  paymentDate: string;
  onPaymentDateChange: (value: string) => void;
  uploading: boolean;
  canUpload: boolean;
  onUpload: (file?: File | null) => void;
  onOpenLatest: () => void;
  onOpenReceipt: (path?: string | null) => void;
}) {
  return (
    <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            Cuota {installment.installment_number} · vence {formatDate(installment.due_date)}
          </p>
          <p className="mt-1 text-sm text-[var(--color-copy)]">{formatMoney(installment.amount)}</p>
        </div>
        <SmallStatusPill status={installment.status} />
      </div>

      <p className="mt-3 text-xs leading-6 text-[var(--color-copy)]">
        {latestReceipt
          ? `Ultimo comprobante enviado ${formatDate(latestReceipt.submitted_at)}.`
          : "Todavia no subiste comprobante para esta cuota."}
      </p>

      {canUpload ? (
        <div className="mt-4 grid gap-3">
          <label>
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
              Fecha del deposito
            </span>
            <input
              type="date"
              value={paymentDate}
              onChange={(event) => onPaymentDateChange(event.target.value)}
              className="premium-input mt-2"
            />
          </label>
          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-900">
            Sube un solo comprobante por esta cuota e indica la fecha real del deposito para que caja la registre
            correctamente cuando administracion la apruebe.
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canUpload ? (
          <label className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold">
            {uploading ? "Subiendo..." : installment.status === "Observado" ? "Volver a subir" : "Subir comprobante"}
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(event) => onUpload(event.target.files?.[0] ?? null)}
              disabled={uploading}
            />
          </label>
        ) : null}
        {latestReceipt ? (
          <button
            type="button"
            onClick={onOpenLatest}
            className="rounded-full border border-[var(--color-border)] bg-white/80 px-4 py-2 text-sm font-semibold"
          >
            Ver ultimo comprobante
          </button>
        ) : null}
      </div>

      {installment.receipts?.length ? (
        <div className="mt-4 grid gap-2">
          {installment.receipts.map((receipt) => (
            <button
              key={receipt.id}
              type="button"
              onClick={() => onOpenReceipt(receipt.receipt_path)}
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

      {installment.status === "Observado" ? (
        <div className="mt-4 rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-3 text-xs leading-6 text-rose-800">
          <p className="font-semibold">Tu comprobante fue observado.</p>
          <p className="mt-1">{installment.admin_notes?.trim() || "Sube uno nuevo para retomar la revision."}</p>
        </div>
      ) : null}

      {installment.status === "Pagado" ? (
        <div className="mt-4 rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-800">
          Cuota aprobada.
        </div>
      ) : null}
    </div>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--color-border)] bg-white/80 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{label}</p>
      <p className="mt-2 font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function StatusPill({ status }: { status: PaymentPlanRow["status"] }) {
  const className =
    status === "Liquidado"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Con atraso"
        ? "bg-rose-100 text-rose-800"
        : status === "Activo" || status === "Al dia"
          ? "bg-amber-100 text-amber-800"
          : "bg-stone-100 text-stone-700";

  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{status}</span>;
}

function SmallStatusPill({ status }: { status: PaymentPlanInstallmentRow["status"] }) {
  const className =
    status === "Pagado"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Observado"
        ? "bg-rose-100 text-rose-800"
        : status === "En revision"
          ? "bg-sky-100 text-sky-800"
          : status === "Comprobante enviado"
            ? "bg-violet-100 text-violet-800"
            : "bg-amber-100 text-amber-800";

  return <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${className}`}>{status}</span>;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
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
