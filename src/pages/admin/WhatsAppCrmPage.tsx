/* eslint-disable react-hooks/set-state-in-effect -- Effect callbacks hydrate and subscribe to external Supabase state. */
import {
  Bot,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  Clock3,
  CreditCard,
  ExternalLink,
  MessageCircle,
  PanelRightOpen,
  RefreshCw,
  Search,
  Send,
  Settings,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { boliviaCities } from "../../data/cities";
import { buildCanonicalUrl } from "../../lib/siteUrl";
import {
  getCrmConversations,
  getCrmBookingSession,
  getCrmBotLearningEvents,
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
  type CrmBotLearningEvent,
  type CrmConversation,
  type CrmLeadStage,
  type CrmMessage,
  type CrmReservation,
  type CrmSettings,
} from "../../services/crmService";
import { getReservationReceiptUrl } from "../../services/reservationService";
import { getSiteSettings } from "../../services/siteSettingsService";

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

function sortMessages(rows: CrmMessage[]) {
  return [...rows].sort((left, right) => new Date(left.occurred_at).getTime() - new Date(right.occurred_at).getTime());
}

function upsertMessage(rows: CrmMessage[], message: CrmMessage) {
  const index = rows.findIndex((row) => row.id === message.id);
  if (index === -1) return sortMessages([...rows, message]);
  const copy = [...rows];
  copy[index] = { ...copy[index], ...message };
  return sortMessages(copy);
}

export function WhatsAppCrmPage() {
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [reservations, setReservations] = useState<CrmReservation[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todas" | "no_leidas" | "humano">("todas");
  const [cityFilter, setCityFilter] = useState("Todas");
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
  const [learningEvents, setLearningEvents] = useState<CrmBotLearningEvent[]>([]);
  const [automationSettings, setAutomationSettings] = useState<CrmSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [showInbox, setShowInbox] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const messageScrollerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  const loadConversations = useCallback(async () => {
    const rows = await getCrmConversations();
    setConversations(rows);
    setSelectedId((current) => {
      if (current) return current;
      const compactScreen = typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches;
      return compactScreen ? null : rows[0]?.id ?? null;
    });
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const rows = await getCrmMessages(conversationId);
    setMessages(rows);
  }, []);

  const loadBooking = useCallback(async (conversationId: string) => {
    setBooking(await getCrmBookingSession(conversationId));
  }, []);

  const loadLearningEvents = useCallback(async () => {
    setLearningEvents(await getCrmBotLearningEvents());
  }, []);

  useEffect(() => {
    void Promise.all([loadConversations(), getCrmReservationOptions(), getSiteSettings(), getCrmSettings(), getCrmBotLearningEvents()])
      .then(([, reservationRows, settings, crmSettings, learningRows]) => {
        setReservations(reservationRows);
        setPaymentQrUrl(settings.payment_qr_image ?? settings.appointment_qr_payment_image ?? null);
        setAutomationSettings(crmSettings);
        setLearningEvents(learningRows);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo cargar el CRM."))
      .finally(() => setLoading(false));
  }, [loadConversations, loadLearningEvents]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void Promise.all([loadMessages(selectedId), loadBooking(selectedId), markCrmConversationRead(selectedId)])
      .then(() => setConversations((rows) => rows.map((row) => row.id === selectedId ? { ...row, unread_count: 0 } : row)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "No se pudo abrir la conversación."));
  }, [loadBooking, loadMessages, selectedId]);

  useEffect(() => subscribeToCrm(selectedId, {
    onConversationChange: () => {
      void loadConversations();
    },
    onMessageChange: (payload) => {
      if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
        setMessages((rows) => upsertMessage(rows, payload.new as CrmMessage));
        if (payload.new.direction === "inbound" && selectedId) {
          void markCrmConversationRead(selectedId);
          setConversations((rows) => rows.map((row) => row.id === selectedId ? { ...row, unread_count: 0 } : row));
        }
      } else if (payload.eventType === "DELETE") {
        setMessages((rows) => rows.filter((row) => row.id !== payload.old.id));
      } else if (selectedId) {
        void loadMessages(selectedId);
      }
    },
    onBookingChange: () => {
      void loadConversations();
      if (selectedId) void loadBooking(selectedId);
    },
    onLearningChange: () => {
      void loadLearningEvents();
    },
  }), [loadBooking, loadConversations, loadLearningEvents, loadMessages, selectedId]);

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

  useEffect(() => {
    const scroller = messageScrollerRef.current;
    if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "auto" });
  }, [messages, selectedId]);

  useEffect(() => {
    setContactOpen(false);
    setShowInbox(false);
  }, [selectedId]);

  const cityOptions = useMemo(() => {
    const savedCities = conversations
      .map((conversation) => conversation.crm_contacts.city)
      .filter((city): city is string => Boolean(city?.trim()));
    const extraCities = savedCities.filter((city) => !boliviaCities.includes(city));
    return [...boliviaCities, ...Array.from(new Set(extraCities)).sort((left, right) => left.localeCompare(right, "es"))];
  }, [conversations]);

  const visibleConversations = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter === "no_leidas" && conversation.unread_count === 0) return false;
      if (filter === "humano" && !conversation.needs_human) return false;
      const city = conversation.crm_contacts.city?.trim() || "Sin ciudad";
      if (cityFilter !== "Todas" && city !== cityFilter) return false;
      if (!normalized) return true;
      return [conversationName(conversation), conversation.crm_contacts.phone, conversation.crm_contacts.city, conversation.last_message_preview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [cityFilter, conversations, filter, query]);

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
      await sendCrmMessage({ conversationId: selected.id, templateName: templateName.trim(), languageCode: automationSettings?.template_language ?? "es" });
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

      <section className="grid min-h-[calc(100dvh-9rem)] overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/65 shadow-[0_22px_70px_rgba(62,42,31,0.08)] xl:h-[calc(100dvh-10rem)] xl:max-h-[920px] xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <aside className={`${selected && !showInbox ? "hidden xl:flex" : "flex"} min-h-0 flex-col border-b border-[var(--color-border)] bg-[#fbf7f2]/75 xl:border-b-0 xl:border-r`}>
          <div className="border-b border-[var(--color-border)] p-4">
            <label className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-white/80 px-3 py-2">
              <Search className="h-4 w-4 text-[var(--color-copy)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre o teléfono" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-white/80 px-3 py-2 text-xs font-semibold outline-none">
              <option value="Todas">Todas las ciudades</option>
              <option value="Sin ciudad">Sin ciudad</option>
              {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
            <div className="mt-3 flex gap-2 text-[11px] font-semibold">
              {([['todas', 'Todas'], ['no_leidas', 'No leídas'], ['humano', 'Humano']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-full px-3 py-1.5 ${filter === value ? "bg-[var(--color-mocha)] text-white" : "border border-[var(--color-border)] bg-white/70"}`}>{label}</button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? <p className="p-4 text-sm text-[var(--color-copy)]">Cargando conversaciones…</p> : null}
            {!loading && visibleConversations.length === 0 ? <p className="p-5 text-center text-sm text-[var(--color-copy)]">Aún no hay conversaciones para este filtro.</p> : null}
            {visibleConversations.map((conversation) => (
              <button key={conversation.id} type="button" onClick={() => { setSelectedId(conversation.id); setShowInbox(false); }} className={`mb-1 w-full rounded-2xl border p-3 text-left transition ${selectedId === conversation.id ? "border-[var(--color-mocha)] bg-white shadow-sm" : "border-transparent hover:bg-white/70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold">
                      {conversation.needs_human ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" title="Necesita respuesta de una persona" /> : null}
                      <span className="truncate">{conversationName(conversation)}</span>
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--color-copy)]">{conversation.last_message_preview || "Conversación nueva"}</p>
                  </div>
                  {conversation.unread_count ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{conversation.unread_count}</span> : null}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--color-copy)]">
                  <span className="capitalize">{conversation.crm_contacts.lead_stage}</span>
                  <span className="truncate">{conversation.crm_contacts.city || formatTime(conversation.last_message_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <div className={`${selected && !showInbox ? "flex" : "hidden xl:flex"} min-h-[calc(100dvh-9rem)] min-w-0 flex-col xl:min-h-0`}>
          {selected ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-white/80 p-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-2">
                  <button type="button" onClick={() => setShowInbox(true)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-white xl:hidden" aria-label="Volver a conversaciones">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{conversationName(selected)}</p>
                    <p className="truncate text-xs text-[var(--color-copy)]">+{selected.crm_contacts.phone} · {windowOpen ? "24 h activa" : "requiere plantilla"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={() => setContactOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold" title="Contacto">
                    <PanelRightOpen className="h-4 w-4" /> Contacto
                  </button>
                  <button type="button" onClick={() => void patchConversation({ ai_enabled: !selected.ai_enabled })} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${selected.ai_enabled ? "bg-violet-100 text-violet-800" : "bg-stone-100 text-stone-600"}`}>
                    <Bot className="h-4 w-4" /> {selected.ai_enabled ? "IA responde" : "IA pausada"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void patchConversation(selected.needs_human ? { needs_human: false } : { needs_human: true, ai_enabled: false })}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${selected.needs_human ? "bg-amber-100 text-amber-900" : "border border-[var(--color-border)] bg-white"}`}
                  >
                    <UserRoundCheck className="h-4 w-4" /> {selected.needs_human ? "Necesita persona" : "Tomar chat"}
                  </button>
                </div>
              </header>

              <div ref={messageScrollerRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,#f8f3ed,#fffaf5)] p-4 sm:p-6">
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
                    <p className="flex items-center gap-2 text-xs font-semibold text-amber-800"><Clock3 className="h-4 w-4" /> Este contacto no escribió en las últimas 24 h. Para iniciar de nuevo, WhatsApp exige una plantilla aprobada.</p>
                    <div className="mt-2 flex gap-2">
                      <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Nombre exacto de la plantilla" className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs outline-none" />
                      <button type="button" onClick={() => void handleTemplateSend()} disabled={sending || !templateName.trim()} className="rounded-full bg-amber-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Enviar plantilla</button>
                    </div>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} rows={2} disabled={!windowOpen || sending} placeholder={windowOpen ? "Escribe una respuesta…" : "Primero envía una plantilla aprobada"} className="min-h-[48px] flex-1 resize-none rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none disabled:bg-stone-100" />
                  <button type="button" onClick={() => void handleSend()} disabled={!windowOpen || sending || !draft.trim()} className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-mocha)] text-white disabled:opacity-40" aria-label="Enviar"><Send className="h-5 w-5" /></button>
                </div>
              </footer>
            </>
          ) : <div className="grid flex-1 place-items-center p-8 text-center text-[var(--color-copy)]"><div><MessageCircle className="mx-auto h-10 w-10" /><p className="mt-3">Selecciona una conversación.</p></div></div>}
        </div>

        {selected && contactOpen ? (
          <button type="button" aria-label="Cerrar contacto" onClick={() => setContactOpen(false)} className="fixed inset-0 z-50 bg-[rgba(35,23,16,0.34)]" />
        ) : null}

        <aside className={`fixed inset-y-0 right-0 z-[60] w-[min(92vw,390px)] overflow-y-auto border-l border-[var(--color-border)] bg-[#fffaf5] p-5 shadow-[-24px_0_70px_rgba(62,42,31,0.22)] transition-transform duration-300 ${selected && contactOpen ? "translate-x-0" : "translate-x-full"}`}>
          {selected ? (
            <div className="grid gap-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Contacto</p>
                  <button type="button" onClick={() => setContactOpen(false)} className="rounded-full border border-[var(--color-border)] bg-white p-2" aria-label="Cerrar contacto">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <input key={`${selected.crm_contacts.id}-name`} defaultValue={selected.crm_contacts.full_name ?? ""} onBlur={(event) => void patchContact({ full_name: event.target.value.trim() || null })} placeholder="Nombre" className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm" />
                <input key={`${selected.crm_contacts.id}-email`} defaultValue={selected.crm_contacts.email ?? ""} onBlur={(event) => void patchContact({ email: event.target.value.trim() || null })} placeholder="Correo" className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm" />
                <select value={selected.crm_contacts.city ?? ""} onChange={(event) => void patchContact({ city: event.target.value || null })} className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm">
                  <option value="">Sin ciudad</option>
                  {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
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
                <button type="button" onClick={() => setSettingsOpen(true)} className="flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-xs font-semibold">
                  <Settings className="h-4 w-4" /> Configuración
                </button>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <select value={selected.priority} onChange={(event) => void patchConversation({ priority: event.target.value as CrmConversation["priority"] })} className="rounded-xl border border-[var(--color-border)] bg-white px-2 py-2 text-xs"><option value="baja">Prioridad baja</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select>
                <select value={selected.status} onChange={(event) => void patchConversation({ status: event.target.value as CrmConversation["status"] })} className="rounded-xl border border-[var(--color-border)] bg-white px-2 py-2 text-xs"><option value="abierta">Abierta</option><option value="pendiente">Pendiente</option><option value="cerrada">Cerrada</option></select>
              </div>
            </div>
          ) : null}
        </aside>
      </section>

      {automationSettings && settingsOpen ? (
        <CrmSettingsDialog
          settings={automationSettings}
          learningEvents={learningEvents}
          onClose={() => setSettingsOpen(false)}
          onPatch={patchAutomationSettings}
          onLocalChange={setAutomationSettings}
        />
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-[var(--color-border)] bg-white/75 px-3 py-2"><p className="text-lg font-semibold">{value}</p><p className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-copy)]">{label}</p></div>;
}

function learningEventLabel(type: string) {
  if (type === "booking_step_recovery") return "Dato corregido en reserva";
  if (type === "booking_handoff") return "Derivado a administración";
  if (type === "booking_info_interruption") return "Pregunta durante reserva";
  if (type === "doctor_clarification") return "Consulta por doctora";
  if (type === "doctor_catalog_missing") return "Falta catálogo de doctora";
  if (type === "ai_fallback") return "Fallback de IA";
  if (type === "human_reply_example") return "Ejemplo humano";
  return "Aprendizaje del bot";
}

function CrmSettingsDialog({
  settings,
  learningEvents,
  onClose,
  onPatch,
  onLocalChange,
}: {
  settings: CrmSettings;
  learningEvents: CrmBotLearningEvent[];
  onClose: () => void;
  onPatch: (values: Partial<CrmSettings>) => Promise<void>;
  onLocalChange: (settings: CrmSettings) => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" aria-label="Cerrar configuración" onClick={onClose} className="absolute inset-0 cursor-default bg-[rgba(35,23,16,0.46)]" />
      <div role="dialog" aria-modal="true" aria-label="Configuración del CRM" className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-[var(--color-border)] bg-[#fffdf9] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">Configuración del CRM</p>
            <p className="mt-1 text-sm text-[var(--color-copy)]">Automatización, avisos y plantillas de WhatsApp.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-[var(--color-border)] bg-white p-2" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 pt-4">
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">
            <span>IA global</span>
            <input type="checkbox" checked={settings.ai_enabled} onChange={(event) => void onPatch({ ai_enabled: event.target.checked })} />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold text-[var(--color-copy)]">URL de reserva
              <input key={`booking-url-${settings.booking_url}`} defaultValue={settings.booking_url} onBlur={(event) => void onPatch({ booking_url: event.target.value.trim() || "/reservar-cita" })} className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
            </label>
            <label className="block text-[11px] font-semibold text-[var(--color-copy)]">URL pública del sitio
              <input key={`crm-site-url-${settings.site_url}`} defaultValue={settings.site_url} onBlur={(event) => void onPatch({ site_url: event.target.value.trim().replace(/\/$/, "") || "https://www.draballesteros.com" })} placeholder="https://www.draballesteros.com" className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
            </label>
          </div>

          <label className="block text-[11px] font-semibold text-[var(--color-copy)]">WhatsApp(s) que revisan comprobantes
            <input key={`admin-reviewers-${settings.admin_notification_whatsapps.join(",")}`} defaultValue={settings.admin_notification_whatsapps.join(", ")} onBlur={(event) => void onPatch({ admin_notification_whatsapps: event.target.value.split(/[;,\n]/).map((value) => value.replace(/\D/g, "")).filter(Boolean) })} placeholder="5917XXXXXXX, 5916XXXXXXX" className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold text-[var(--color-copy)]">Minutos de retención del cupo
              <input type="number" min={10} max={120} value={settings.booking_hold_minutes} onChange={(event) => onLocalChange({ ...settings, booking_hold_minutes: Number(event.target.value) })} onBlur={(event) => void onPatch({ booking_hold_minutes: Math.max(10, Math.min(120, Number(event.target.value) || 30)) })} className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold">
              <input type="checkbox" checked={settings.allow_external_grounding} onChange={(event) => void onPatch({ allow_external_grounding: event.target.checked })} />
              Gemini con consulta web
            </label>
          </div>

          <label className="block text-[11px] font-semibold text-[var(--color-copy)]">Instrucciones extra para Gemini
            <textarea
              key={`ai-prompt-${settings.ai_system_prompt ?? ""}`}
              defaultValue={settings.ai_system_prompt ?? ""}
              onBlur={(event) => void onPatch({ ai_system_prompt: event.target.value.trim() || null })}
              rows={4}
              placeholder="Tono, políticas internas o mensajes que la IA debe respetar."
              className="mt-1 w-full resize-none rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs"
            />
          </label>

          <details className="rounded-2xl border border-[var(--color-border)] bg-white px-3 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--color-ink)]">Aprendizaje supervisado</summary>
            <div className="mt-3 grid gap-2 text-xs">
              {learningEvents.length ? learningEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-[var(--color-border)] bg-[#fbf7f2] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{learningEventLabel(event.event_type)}</p>
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-[var(--color-copy)]">{event.status}</span>
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--color-copy)]">{formatTime(event.created_at)} · {event.crm_contacts?.full_name || event.crm_contacts?.phone || "Contacto WhatsApp"}</p>
                  {event.user_text ? <p className="mt-2 line-clamp-2 text-[var(--color-ink)]">Cliente: {event.user_text}</p> : null}
                  {event.bot_response ? <p className="mt-1 line-clamp-2 text-[var(--color-copy)]">Bot: {event.bot_response}</p> : null}
                </div>
              )) : (
                <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[#fbf7f2] p-3 text-[var(--color-copy)]">Todavía no hay casos registrados.</p>
              )}
            </div>
          </details>

          <details className="rounded-2xl border border-[var(--color-border)] bg-white px-3 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--color-ink)]">Plantillas Meta</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TemplateNameField label="Confirmación al paciente" value={settings.patient_confirmation_template} placeholder="cita_confirmada" onSave={(value) => onPatch({ patient_confirmation_template: value })} />
              <TemplateNameField label="Aviso a la doctora" value={settings.doctor_booking_template} placeholder="nueva_cita_doctora" onSave={(value) => onPatch({ doctor_booking_template: value })} />
              <TemplateNameField label="Pago rechazado" value={settings.payment_rejected_template} placeholder="comprobante_rechazado" onSave={(value) => onPatch({ payment_rejected_template: value })} />
              <TemplateNameField label="Comprobante al equipo" value={settings.admin_receipt_review_template} placeholder="revisar_comprobante" onSave={(value) => onPatch({ admin_receipt_review_template: value })} />
              <TemplateNameField label="Reprogramación paciente" value={settings.patient_reschedule_template} placeholder="cita_reprogramacion" onSave={(value) => onPatch({ patient_reschedule_template: value })} />
              <TemplateNameField label="Doctora no disponible" value={settings.admin_doctor_unavailable_template} placeholder="reprogramar_cita" onSave={(value) => onPatch({ admin_doctor_unavailable_template: value })} />
              <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--color-copy)] sm:col-span-2">
                <input type="checkbox" checked={settings.doctor_booking_template_document_header} onChange={(event) => void onPatch({ doctor_booking_template_document_header: event.target.checked })} />
                La plantilla de doctora tiene encabezado Documento
              </label>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function TemplateNameField({ label, value, placeholder, onSave }: { label: string; value: string | null; placeholder: string; onSave: (value: string | null) => Promise<void> }) {
  return (
    <label className="block text-[11px] font-semibold text-[var(--color-copy)]">{label}
      <input key={`${label}-${value ?? ""}`} defaultValue={value ?? ""} onBlur={(event) => void onSave(event.target.value.trim() || null)} placeholder={placeholder} className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs" />
    </label>
  );
}
