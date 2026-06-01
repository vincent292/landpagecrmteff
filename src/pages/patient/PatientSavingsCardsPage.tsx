import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CheckCircle2, Gift, ShieldCheck, UploadCloud } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { SavingsTokenCard } from "../../components/ui/SavingsTokenCard";
import { useAuth } from "../../hooks/useAuth";
import {
  activateSavingsCardToken,
  formatSavingsCardMonth,
  getMySavingsCards,
  getSavingsCardReceiptUrl,
  submitSavingsCardInstallmentReceipt,
  uploadSavingsCardReceipt,
  type SavingsCardInstallmentRow,
  type SavingsCardReceiptRow,
  type SavingsCardRow,
} from "../../services/savingsCardService";
import { formatDate, formatMoney } from "../../utils/text";

export function PatientSavingsCardsPage() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<SavingsCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [activating, setActivating] = useState(false);
  const [uploadingInstallmentId, setUploadingInstallmentId] = useState("");
  const [celebrationCard, setCelebrationCard] = useState<SavingsCardRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const nextCards = await getMySavingsCards();
      setCards(nextCards);
      setCelebrationCard((current) => current ?? nextCards.find((card) => card.status === "Completada" && !card.redeemed_at) ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No pudimos cargar tus tarjetas de ahorro.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const activateToken = async () => {
    setActivating(true);
    setError("");
    setMessage("");
    try {
      await activateSavingsCardToken(token);
      setToken("");
      setMessage("Token activado correctamente. Ya puedes ver tu plan y subir comprobantes por cada mes.");
      await load();
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "No pudimos activar tu token.");
    } finally {
      setActivating(false);
    }
  };

  const uploadReceipt = async (installmentId: string, file?: File | null) => {
    if (!file) return;
    setUploadingInstallmentId(installmentId);
    setError("");
    setMessage("");
    try {
      const receiptPath = await uploadSavingsCardReceipt(file, installmentId);
      await submitSavingsCardInstallmentReceipt(installmentId, receiptPath);
      setMessage("Recibimos tu comprobante. Administracion debe revisarlo para aprobar esa cuota.");
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No pudimos subir tu comprobante.");
    } finally {
      setUploadingInstallmentId("");
    }
  };

  const openReceipt = async (path?: string | null) => {
    const url = await getSavingsCardReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const previewHolder = profile?.full_name?.trim() || "Tu cuenta";
  const previewDocument = profile?.document_number?.trim() || "Completa tu carnet en perfil";
  const nextCardToUse = useMemo(() => cards.find((card) => !card.redeemed_at) ?? null, [cards]);

  if (loading) return <LoadingState label="Cargando tus tarjetas de ahorro..." />;
  if (error && cards.length === 0) return <ErrorState label={error} />;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-[linear-gradient(135deg,rgba(255,249,244,0.96),rgba(239,229,218,0.92))] p-6 shadow-[0_24px_80px_rgba(62,42,31,0.10)] md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
          Portal privado · tarjetas de ahorro
        </p>
        <h1 className="font-display mt-4 text-5xl font-semibold leading-[0.92] md:text-6xl">
          Activa tu token y sigue tus cuotas con una vista mucho mas clara.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
          Tu tarjeta vive solo en la cuenta correcta del paciente asignado por carnet. Cada cuota lleva su propio
          comprobante y el canje solo se habilita cuando todas las cuotas queden aprobadas.
        </p>
      </section>

      <section className="rounded-[30px] border border-[var(--color-border)] bg-white/78 p-5 shadow-[0_18px_48px_rgba(62,42,31,0.08)] md:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr] xl:items-center">
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold">Activar token</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                Pega aqui el token que te enviamos por WhatsApp o correo. La tarjeta visual se va llenando mientras
                escribes y te recuerda en que cuenta intentaras activarlo.
              </p>
            </div>

            <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Importante antes de pagar</p>
              <p className="mt-2 text-sm leading-7 text-amber-900">
                Aunque adelantes varios meses, debes subir un comprobante por cada cuota. Asi administracion revisa y
                aprueba mes por mes sin confusiones.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={token}
                onChange={(event) => setToken(event.target.value.toUpperCase())}
                placeholder="Ejemplo: AHR-1A2B-3C4D-5E6F"
                className="premium-input"
              />
              <button
                type="button"
                onClick={() => void activateToken()}
                disabled={activating || !token.trim()}
                className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {activating ? "Activando..." : "Activar token"}
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <InfoCard
                title="Cuenta actual"
                detail={previewHolder}
                caption={previewDocument}
              />
              <InfoCard
                title="Regla de seguridad"
                detail="Token ligado a tu carnet"
                caption="Si la cuenta no coincide con el carnet asignado, no se activara."
              />
            </div>
          </div>

          <div className="mx-auto w-full max-w-[420px]">
            <SavingsTokenCard
              token={token}
              holderName={previewHolder}
              title={nextCardToUse?.treatment_title?.trim() || "Tarjeta de ahorro"}
              subtitle="Dra. Estefany"
              footerLabel="Carnet"
              footerValue={previewDocument}
              backLabel="Cuenta asignada"
              backValue={`Esta tarjeta solo podra activarse en la cuenta de ${previewHolder}.`}
            />
          </div>
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

      {cards.length === 0 ? <EmptyState label="Aun no tienes tarjetas activadas. Ingresa tu token para comenzar." /> : null}

      <section className="grid gap-5">
        {cards.map((card) => (
          <article key={card.id} className="rounded-[28px] border border-[var(--color-border)] bg-white/80 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.07)]">
            <div className="grid gap-5 xl:grid-cols-[1fr_330px] xl:items-start">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                      {card.treatment_title?.trim() ? "Plan ligado a tratamiento" : "Plan flexible"}
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {card.treatment_title?.trim() ? card.treatment_title : "Tarjeta de ahorro activa"}
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                      Token {card.token}
                      <br />
                      {card.months_count} meses · {formatMoney(card.monthly_amount)} por mes · Total {formatMoney(card.total_amount)}
                      <br />
                      Pagado {formatMoney(card.approved_amount)} · Pendiente {formatMoney(card.pending_amount)}
                    </p>
                  </div>
                  <StatusPill status={card.status} />
                </div>

                {card.status === "Completada" && !card.redeemed_at ? (
                  <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    Tus pagos ya estan completos. Tu token esta listo para que administracion lo use en caja y aplique el
                    saldo a tu tratamiento.
                  </div>
                ) : null}

                {card.redeemed_at ? (
                  <div className="mt-4 rounded-[20px] border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-800">
                    Esta tarjeta ya fue canjeada el {formatDate(card.redeemed_at)}.
                  </div>
                ) : null}
              </div>

              <SavingsTokenCard
                token={card.token}
                holderName={profile?.full_name ?? card.patient_full_name}
                title={card.treatment_title?.trim() || "Tarjeta de ahorro"}
                subtitle="Saldo privado"
                footerLabel="Estado"
                footerValue={card.status}
                backLabel="Canje"
                backValue={
                  card.redeemed_at
                    ? `Canjeada el ${formatDate(card.redeemed_at)}.`
                    : card.status === "Completada"
                      ? "Lista para usarse en caja con tu tratamiento."
                      : "Aun necesitas completar y aprobar todas tus cuotas."
                }
                className="mx-auto w-full max-w-[360px]"
              />
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {(card.installments ?? []).map((installment) => {
                const latestReceipt = installment.receipts?.[0] ?? null;
                const canUpload = installment.status === "Pendiente" || installment.status === "Observado";

                return (
                  <InstallmentCard
                    key={installment.id}
                    installment={installment}
                    latestReceipt={latestReceipt}
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

      {celebrationCard ? (
        <ModalShell title="Pagos completos" onClose={() => setCelebrationCard(null)}>
          <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-center">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
                <p className="text-lg font-semibold">Felicidades, ya cumpliste con todos tus pagos.</p>
              </div>
              <p className="text-sm leading-7 text-[var(--color-copy)]">
                Tu tarjeta {celebrationCard.token} ya esta lista para canjearse. Cuando administracion registre el pago
                en caja, podra aplicar tu saldo al tratamiento correspondiente.
              </p>
              <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4 text-sm leading-7 text-[var(--color-copy)]">
                <p className="font-semibold text-[var(--color-ink)]">
                  {celebrationCard.treatment_title?.trim() || "Tarjeta de ahorro completada"}
                </p>
                <p>
                  Total acumulado: {formatMoney(celebrationCard.approved_amount)}
                  <br />
                  Token listo: {celebrationCard.token}
                </p>
              </div>
            </div>

            <SavingsTokenCard
              token={celebrationCard.token}
              holderName={profile?.full_name ?? celebrationCard.patient_full_name}
              title={celebrationCard.treatment_title?.trim() || "Plan completado"}
              subtitle="Meta alcanzada"
              footerLabel="Saldo aprobado"
              footerValue={formatMoney(celebrationCard.approved_amount)}
              backLabel="Siguiente paso"
              backValue="Administracion ya puede usar este token en caja para aplicar tu saldo al tratamiento."
            />
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function InstallmentCard({
  installment,
  latestReceipt,
  uploading,
  canUpload,
  onUpload,
  onOpenLatest,
  onOpenReceipt,
}: {
  installment: SavingsCardInstallmentRow;
  latestReceipt: SavingsCardReceiptRow | null;
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
          <p className="font-semibold capitalize">
            Cuota {installment.installment_number} · {formatSavingsCardMonth(installment.due_date)}
          </p>
          <p className="mt-1 text-sm text-[var(--color-copy)]">{formatMoney(installment.amount)}</p>
        </div>
        <SmallStatusPill status={installment.status} />
      </div>

      <p className="mt-3 text-xs leading-6 text-[var(--color-copy)]">
        {latestReceipt ? `Ultimo comprobante enviado ${formatDate(latestReceipt.submitted_at)}.` : "Todavia no subiste comprobante para este mes."}
      </p>

      {canUpload ? (
        <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-6 text-amber-900">
          Sube un solo comprobante para esta cuota. Si pagaste varias de una vez, repite el proceso en cada mes
          correspondiente.
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

function InfoCard({ title, detail, caption }: { title: string; detail: string; caption: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.74)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">{title}</p>
      <p className="mt-2 font-semibold text-[var(--color-ink)]">{detail}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">{caption}</p>
    </div>
  );
}

function StatusPill({ status }: { status: SavingsCardRow["status"] }) {
  const className =
    status === "Completada"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Canjeada"
        ? "bg-sky-100 text-sky-800"
        : status === "Cancelada"
          ? "bg-rose-100 text-rose-800"
          : "bg-amber-100 text-amber-800";

  const icon =
    status === "Completada" ? <Gift className="h-4 w-4" /> : status === "Canjeada" ? <ShieldCheck className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${className}`}>
      {icon}
      {status}
    </span>
  );
}

function SmallStatusPill({ status }: { status: SavingsCardInstallmentRow["status"] }) {
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
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
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
