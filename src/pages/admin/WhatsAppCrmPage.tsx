/* eslint-disable react-hooks/set-state-in-effect -- Effect callbacks hydrate and subscribe to external Supabase state. */
import {
  Bot,
  CalendarDays,
  CheckCheck,
  Clock3,
  CreditCard,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UserRoundCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildCanonicalUrl } from "../../lib/siteUrl";
import {
  getCrmConversations,
  getCrmBookingSession,
  getCrmMessages,
  getCrmReservationOptions,
  getCrmSettings,
  markCrmConversationRead,
  sendCrmMessage,
  subscribeToCrm,
  syncCrmKnowledge,
  updateCrmContact,
  updateCrmConversation,
  updateCrmSettings,
  type CrmBookingSession,
  type CrmConversation,
  type CrmLeadStage,
  type CrmMessage,
  type CrmReservation,
  type CrmSettings,
} from "../../services/crmService";
import { getReservationReceiptUrl } from "../../services/reservationService";
import { getSiteSettings } from "../../services/siteSettingsService";
import { MetaAdsPanel } from "../../components/admin/MetaAdsPanel";

const stages: Array<{ value: CrmLeadStage; label: string }> = [
  { value: "nuevo", label: "Nuevo" },
  { value: "calificado", label: "Calificado" },
  { value: "cita", label: "Cita" },
  { value: "pago", label: "Pago" },
  { value: "paciente", label: "Paciente" },
  { value: "cerrado", label: "Cerrado" },
];

const bookingStatusLabels: Record<CrmBookingSession["status"], string> = {
  collecting_identity: "Solicitando datos",
  choosing_date: "Eligiendo fecha",
  choosing_time: "Eligiendo horario",
  awaiting_payment: "Esperando comprobante",
  payment_review: "Pago por revisar",
  approved: "Cita confirmada",
  rejected: "Pago rechazado",
  expired: "Retención vencida",
  cancelled: "Proceso cancelado",
  needs_human: "Requiere administración",
};

function formatTime(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function conversationName(conversation: CrmConversation) {
  return conversation.crm_contacts.full_name || `+${conversation.crm_contacts.phone}`;
}

export function WhatsAppCrmPage() {
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [reservations, setReservations] = useState<CrmReservation[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todas" | "no_leidas" | "humano">("todas");
  const [draft, setDraft] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);
  const [booking, setBooking] = useState<CrmBookingSession | null>(null);
  const [automationSettings, setAutomationSettings] = useState<CrmSettings | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const loadConversations = useCallback(async () => {
    const rows = await getCrmConversations();
    setConversations(rows);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const rows = await getCrmMessages(conversationId);
    setMessages(rows);
  }, []);

  const loadBooking = useCallback(async (conversationId: string) => {
    setBooking(await getCrmBookingSession(conversationId));
  }, []);

  useEffect(() => {
    void Promise.all([loadConversations(), getCrmReservationOptions(), getSiteSettings(), getCrmSettings()])
      .then(([, reservationRows, settings, crmSettings]) => {
        setReservations(reservationRows);
        setPaymentQrUrl(settings.payment_qr_image ?? settings.appointment_qr_payment_image ?? null);
        setAutomationSettings(crmSettings);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el CRM."))
      .finally(() => setLoading(false));
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void Promise.all([loadMessages(selectedId), loadBooking(selectedId), markCrmConversationRead(selectedId)])
      .then(() => setConversations((rows) => rows.map((row) => row.id === selectedId ? { ...row, unread_count: 0 } : row)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo abrir la conversación."));
  }, [loadBooking, loadMessages, selectedId]);

  useEffect(() => subscribeToCrm(selectedId, () => {
    void loadConversations();
    if (selectedId) {
      void loadMessages(selectedId);
      void loadBooking(selectedId);
    }
  }), [loadBooking, loadConversations, loadMessages, selectedId]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const path = selected?.appointment_reservations?.payment_receipt_path;
    if (!path) {
      setReceiptUrl(null);
      return;
    }
    void getReservationReceiptUrl(path).then(setReceiptUrl).catch(() => setReceiptUrl(null));
  }, [selected?.appointment_reservations?.payment_receipt_path]);

  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter === "no_leidas" && conversation.unread_count === 0) return false;
      if (filter === "humano" && !conversation.needs_human) return false;
      if (!normalized) return true;
      return [conversationName(conversation), conversation.crm_contacts.phone, conversation.last_message_preview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [conversations, filter, query]);

  const windowOpen = selected?.customer_service_window_expires_at
    ? new Date(selected.customer_service_window_expires_at).getTime() > clock
    : false;

  async function refreshSelected() {
    await loadConversations();
    if (selectedId) await loadMessages(selectedId);
  }

  async function handleSend(body = draft, imageUrl?: string) {
    if (!selected || (!body.trim() && !imageUrl) || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendCrmMessage({ conversationId: selected.id, body: body.trim() || undefined, imageUrl });
      setDraft("");
      await refreshSelected();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  }

  async function handleTemplateSend() {
    if (!selected || !templateName.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendCrmMessage({ conversationId: selected.id, templateName: templateName.trim() });
      setTemplateName("");
      await refreshSelected();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar la plantilla.");
    } finally {
      setSending(false);
    }
  }

  async function patchConversation(values: Parameters<typeof updateCrmConversation>[1]) {
    if (!selected) return;
    try {
      await updateCrmConversation(selected.id, values);
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la conversación.");
    }
  }

  async function patchContact(values: Parameters<typeof updateCrmContact>[1]) {
    if (!selected) return;
    try {
      await updateCrmContact(selected.crm_contacts.id, values);
      await loadConversations();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar el contacto.");
    }
  }

  async function handleKnowledgeSync() {
    setSyncing(true);
    setError(null);
    try {
      const result = await syncCrmKnowledge() as { synced?: number; errors?: string[] };
      setNotice(`Conocimiento actualizado: ${result.synced ?? 0} fuentes${result.errors?.length ? `, ${result.errors.length} con advertencias` : ""}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleReservationLink(reservationId: string) {
    await patchConversation({ appointment_reservation_id: reservationId || null });
    if (reservationId) await patchContact({ lead_stage: "cita" });
  }

  async function patchAutomationSettings(values: Partial<CrmSettings>) {
    try {
      const updated = await updateCrmSettings(values);
      setAutomationSettings(updated);
      setNotice("Configuración de automatización actualizada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la automatización.");
    }
  }

  const reservation = selected?.appointment_reservations;
  const paymentLink = reservation?.public_payment_token
    ? buildCanonicalUrl(`/pago-cita/${reservation.public_payment_token}`)
    : null;

  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 rounded-[28px] border border-[var(--color-border)] bg-white/70 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.06)] md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">CRM · WhatsApp Cloud API</p>
          <h1 className="font-display mt-2 text-3xl font-semibold">Conversaciones y seguimiento</h1>
          <p className="mt-1 text-sm text-[var(--color-copy)]">Meta, Gemini, citas, pagos QR y comprobantes en una sola bandeja.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Metric label="Abiertas" value={conversations.filter((item) => item.status === "abierta").length} />
          <Metric label="Sin leer" value={conversations.reduce((total, item) => total + item.unread_count, 0)} />
          <Metric label="Requieren persona" value={conversations.filter((item) => item.needs_human).length} />
          {automationSettings ? (
            <button
              type="button"
              onClick={() => void patchAutomationSettings({ ai_enabled: !automationSettings.ai_enabled })}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold ${automationSettings.ai_enabled ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"}`}
            >
              <Bot className="h-4 w-4" />
              IA global {automationSettings.ai_enabled ? "activa" : "pausada"}
            </button>
          ) : null}
          <button type="button" onClick={() => void handleKnowledgeSync()} disabled={syncing} className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar información
          </button>
        </div>
      </section>

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</p> : null}

      <MetaAdsPanel />

      <section className="grid min-h-[680px] overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/65 shadow-[0_22px_70px_rgba(62,42,31,0.08)] xl:grid-cols-[320px_minmax(0,1fr)_330px]">
        <aside className="border-b border-[var(--color-border)] bg-[#fbf7f2]/75 xl:border-b-0 xl:border-r">
          <div className="border-b border-[var(--color-border)] p-4">
            <label className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white/80 px-3 py-2">
              <Search className="h-4 w-4 text-[var(--color-copy)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre o teléfono" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            <div className="mt-3 flex gap-2 text-[11px] font-semibold">
              {([['todas', 'Todas'], ['no_leidas', 'No leídas'], ['humano', 'Humano']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 ${filter === value ? "bg-[var(--color-mocha)] text-white" : "border border-[var(--color-border)] bg-white/70"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="max-h-[640px] overflow-y-auto p-2">
            {loading ? <p className="p-4 text-sm text-[var(--color-copy)]">Cargando conversaciones…</p> : null}
            {!loading && visibleConversations.length === 0 ? <p className="p-5 text-center text-sm text-[var(--color-copy)]">Aún no hay conversaciones para este filtro.</p> : null}
            {visibleConversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={`mb-1 w-full rounded-2xl border p-3 text-left transition ${selectedId === conversation.id ? "border-[var(--color-mocha)] bg-white shadow-sm" : "border-transparent hover:bg-white/70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{conversationName(conversation)}</p>
                    <p className="mt-1 truncate text-xs text-[var(--color-copy)]">{conversation.last_message_preview || "Conversación nueva"}</p>
                  </div>
                  {conversation.unread_count ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{conversation.unread_count}</span> : null}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--color-copy)]">
                  <span className="capitalize">{conversation.crm_contacts.lead_stage}</span>
                  <span>{formatTime(conversation.last_message_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[680px] min-w-0 flex-col border-b border-[var(--color-border)] xl:border-b-0 xl:border-r">
          {selected ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-white/60 p-4">
                <div>
                  <p className="font-semibold">{conversationName(selected)}</p>
                  <p className="text-xs text-[var(--color-copy)]">+{selected.crm_contacts.phone} · {windowOpen ? "ventana de 24 h activa" : "requiere plantilla aprobada"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => void patchConversation(selected.ai_enabled ? { ai_enabled: false } : { ai_enabled: true, needs_human: false })} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${selected.ai_enabled && !selected.needs_human ? "bg-violet-100 text-violet-800" : "bg-stone-100 text-stone-600"}`}>
                    <Bot className="h-4 w-4" /> {selected.ai_enabled && !selected.needs_human ? "IA responde" : "IA pausada"}
                  </button>
                  <button type="button" onClick={() => void patchConversation(selected.needs_human ? { needs_human: false, ai_enabled: true } : { needs_human: true, ai_enabled: false })} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${selected.needs_human ? "bg-amber-100 text-amber-900" : "border border-[var(--color-border)] bg-white"}`}>
                    <UserRoundCheck className="h-4 w-4" /> {selected.needs_human ? "Devolver a IA" : "Tomar chat"}
                  </button>
                </div>
              </header>

              <div className="flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,#f8f3ed,#fffaf5)] p-4 sm:p-6">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] rounded-[22px] px-4 py-3 text-sm shadow-sm ${message.direction === "outbound" ? "rounded-br-md bg-[var(--color-mocha)] text-white" : "rounded-bl-md border border-[var(--color-border)] bg-white text-[var(--color-ink)]"}`}>
                      {message.body ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : <p className="italic">[{message.message_type}{message.media_filename ? `: ${message.media_filename}` : ""}]</p>}
                      <div className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] ${message.direction === "outbound" ? "text-white/70" : "text-[var(--color-copy)]"}`}>
                        {message.sender_type === "ai" ? <Bot className="h-3 w-3" /> : null}
                        <span>{formatTime(message.occurred_at)}</span>
                        {message.direction === "outbound" ? <CheckCheck className="h-3 w-3" /> : null}
                      </div>
                      {message.error_detail ? <p className="mt-1 text-[10px] text-red-200">{message.error_detail}</p> : null}
                    </div>
                  </div>
                ))}
              </div>

              <footer className="border-t border-[var(--color-border)] bg-white/75 p-4">
                {!windowOpen ? (
                  <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                    <p className="flex items-center gap-2 text-xs text-amber-800"><Clock3 className="h-4 w-4" /> Meta solo permite texto libre dentro de las 24 horas posteriores al último mensaje del contacto.</p>
                    <div className="mt-2 flex gap-2">
                      <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="nombre_plantilla_aprobada" className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs outline-none" />
                      <button type="button" onClick={() => void handleTemplateSend()} disabled={sending || !templateName.trim()} className="rounded-full bg-amber-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Enviar plantilla</button>
                    </div>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} rows={2} disabled={!windowOpen || sending} placeholder={windowOpen ? "Escribe una respuesta…" : "Ventana cerrada; usa una plantilla aprobada"} className="min-h-[48px] flex-1 resize-none rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none disabled:bg-stone-100" />
                  <button type="button" onClick={() => void handleSend()} disabled={!windowOpen || sending || !draft.trim()} className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-mocha)] text-white disabled:opacity-40" aria-label="Enviar"><Send className="h-5 w-5" /></button>
                </div>
              </footer>
            </>
          ) : <div className="grid flex-1 place-items-center p-8 text-center text-[var(--color-copy)]"><div><MessageCircle className="mx-auto h-10 w-10" /><p className="mt-3">Selecciona una conversación.</p></div></div>}
        </div>

        <aside className="bg-white/50 p-5">
          {selected ? (
            <div className="grid gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Contacto</p>
                <input key={`${selected.crm_contacts.id}-name`} defaultValue={selected.crm_contacts.full_name ?? ""} onBlur={(event) => void patchContact({ full_name: event.target.value.trim() || null })} placeholder="Nombre" className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm" />
                <input key={`${selected.crm_contacts.id}-email`} defaultValue={selected.crm_contacts.email ?? ""} onBlur={(event) => void patchContact({ email: event.target.value.trim() || null })} placeholder="Correo" className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm" />
                <input key={`${selected.crm_contacts.id}-city`} defaultValue={selected.crm_contacts.city ?? ""} onBlur={(event) => void patchContact({ city: event.target.value.trim() || null })} placeholder="Ciudad" className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm" />
                <select value={selected.crm_contacts.lead_stage} onChange={(event) => void patchContact({ lead_stage: event.target.value as CrmLeadStage })} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm">
                  {stages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                </select>
              </div>

              {booking ? (
                <div className="border-t border-[var(--color-border)] pt-5">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]"><CreditCard className="h-4 w-4" /> Reserva por WhatsApp</p>
                  <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[#fbf7f2] p-3 text-xs">
                    <p className="font-semibold">{booking.treatments?.title || "Tratamiento"}</p>
                    <p className="mt-1 text-[var(--color-copy)]">{bookingStatusLabels[booking.status]}</p>
                    {booking.appointment_date ? <p className="mt-2">{booking.appointment_date} · {booking.start_time?.slice(0, 5)}–{booking.end_time?.slice(0, 5)}</p> : null}
                    {booking.amount_due ? <p className="mt-1">Pago solicitado: {Number(booking.amount_due).toFixed(2)} Bs</p> : null}
                    {booking.hold_expires_at && booking.status === "awaiting_payment" ? <p className="mt-1 text-amber-800">Retención hasta {formatTime(booking.hold_expires_at)}</p> : null}
                    {booking.payment_receipt_path ? <p className="mt-1 font-semibold text-emerald-800">Comprobante recibido</p> : null}
                    {booking.status === "payment_review" ? <a href="/panel/pagos-reservas" className="mt-3 flex w-full items-center justify-center rounded-full bg-[var(--color-mocha)] px-3 py-2 font-semibold text-white">Revisar y aprobar pago</a> : null}
                  </div>
                </div>
              ) : null}

              <div className="border-t border-[var(--color-border)] pt-5">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]"><CalendarDays className="h-4 w-4" /> Cita vinculada</p>
                <select value={selected.appointment_reservation_id ?? ""} onChange={(event) => void handleReservationLink(event.target.value)} className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs">
                  <option value="">Sin vincular</option>
                  {reservations.map((item) => <option key={item.id} value={item.id}>{item.appointment_date} · {item.start_time.slice(0, 5)} · {item.patients?.full_name || item.appointment_type}</option>)}
                </select>
                {reservation ? (
                  <div className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[#fbf7f2] p-3 text-xs">
                    <p className="font-semibold">{reservation.appointment_type}</p>
                    <p className="mt-1 text-[var(--color-copy)]">{reservation.appointment_date} · {reservation.start_time.slice(0, 5)} · {reservation.status}</p>
                    {paymentLink ? <button type="button" disabled={!windowOpen || sending} onClick={() => void handleSend(`Para completar la reserva, realiza el pago por QR y sube tu comprobante aquí: ${paymentLink}`)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-3 py-2 font-semibold text-white disabled:opacity-40"><CreditCard className="h-4 w-4" /> Enviar enlace de pago</button> : <p className="mt-2 text-amber-800">Esta cita todavía no tiene un enlace público de pago.</p>}
                    {paymentQrUrl ? <button type="button" disabled={!windowOpen || sending} onClick={() => void handleSend("Este es el QR oficial para realizar el pago. Conserva el comprobante y súbelo en el enlace de tu reserva.", paymentQrUrl)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-2 font-semibold disabled:opacity-40">Enviar QR</button> : null}
                    {receiptUrl ? <a href={receiptUrl} target="_blank" rel="noreferrer" className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800"><ExternalLink className="h-4 w-4" /> Ver comprobante</a> : <p className="mt-2 text-[var(--color-copy)]">Comprobante aún no recibido.</p>}
                  </div>
                ) : null}
              </div>

              <div className="border-t border-[var(--color-border)] pt-5">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Notas internas</label>
                <textarea key={`${selected.crm_contacts.id}-notes`} defaultValue={selected.crm_contacts.notes ?? ""} onBlur={(event) => void patchContact({ notes: event.target.value.trim() || null })} rows={5} placeholder="Seguimiento, preferencias o contexto comercial…" className="mt-3 w-full resize-none rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm" />
              </div>

              {automationSettings ? (
                <div className="border-t border-[var(--color-border)] pt-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Automatización Meta</p>
                  <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">
                    <span>IA global</span>
                    <input type="checkbox" checked={automationSettings.ai_enabled} onChange={(event) => void patchAutomationSettings({ ai_enabled: event.target.checked })} />
                  </label>
                  <label className="mt-3 block text-[11px] text-[var(--color-copy)]">URL de reserva</label>
                  <input key={`booking-url-${automationSettings.booking_url}`} defaultValue={automationSettings.booking_url} onBlur={(event) => void patchAutomationSettings({ booking_url: event.target.value.trim() || "/reservar-cita" })} className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
                  <label className="mt-3 block text-[11px] text-[var(--color-copy)]">Plantilla de confirmación al paciente</label>
                  <input key={`patient-template-${automationSettings.patient_confirmation_template}`} defaultValue={automationSettings.patient_confirmation_template ?? ""} onBlur={(event) => void patchAutomationSettings({ patient_confirmation_template: event.target.value.trim() || null })} placeholder="cita_confirmada" className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
                  <label className="mt-2 block text-[11px] text-[var(--color-copy)]">Plantilla de aviso a la doctora</label>
                  <input key={`doctor-template-${automationSettings.doctor_booking_template}`} defaultValue={automationSettings.doctor_booking_template ?? ""} onBlur={(event) => void patchAutomationSettings({ doctor_booking_template: event.target.value.trim() || null })} placeholder="nueva_cita_doctora" className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
                  <label className="mt-2 block text-[11px] text-[var(--color-copy)]">Plantilla de pago rechazado</label>
                  <input key={`rejected-template-${automationSettings.payment_rejected_template}`} defaultValue={automationSettings.payment_rejected_template ?? ""} onBlur={(event) => void patchAutomationSettings({ payment_rejected_template: event.target.value.trim() || null })} placeholder="comprobante_rechazado" className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
                  <label className="mt-2 block text-[11px] text-[var(--color-copy)]">Minutos de retención del cupo</label>
                  <input type="number" min={10} max={120} value={automationSettings.booking_hold_minutes} onChange={(event) => setAutomationSettings({ ...automationSettings, booking_hold_minutes: Number(event.target.value) })} onBlur={(event) => void patchAutomationSettings({ booking_hold_minutes: Math.max(10, Math.min(120, Number(event.target.value) || 30)) })} className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
                  <label className="mt-3 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={automationSettings.allow_external_grounding} onChange={(event) => void patchAutomationSettings({ allow_external_grounding: event.target.checked })} />
                    Permitir consulta web puntual con Gemini
                  </label>
                  <label className="mt-3 block text-[11px] text-[var(--color-copy)]">Instrucciones extra para Gemini</label>
                  <textarea
                    key={`ai-prompt-${automationSettings.ai_system_prompt ?? ""}`}
                    defaultValue={automationSettings.ai_system_prompt ?? ""}
                    onBlur={(event) => void patchAutomationSettings({ ai_system_prompt: event.target.value.trim() || null })}
                    rows={5}
                    placeholder="Tono, politicas internas o mensajes que la IA debe respetar."
                    className="mt-1 w-full resize-none rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs"
                  />
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <select value={selected.priority} onChange={(event) => void patchConversation({ priority: event.target.value as CrmConversation["priority"] })} className="rounded-xl border border-[var(--color-border)] bg-white px-2 py-2 text-xs"><option value="baja">Prioridad baja</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select>
                <select value={selected.status} onChange={(event) => void patchConversation({ status: event.target.value as CrmConversation["status"] })} className="rounded-xl border border-[var(--color-border)] bg-white px-2 py-2 text-xs"><option value="abierta">Abierta</option><option value="pendiente">Pendiente</option><option value="cerrada">Cerrada</option></select>
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-[var(--color-border)] bg-white/75 px-3 py-2"><p className="text-lg font-semibold">{value}</p><p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-copy)]">{label}</p></div>;
}
