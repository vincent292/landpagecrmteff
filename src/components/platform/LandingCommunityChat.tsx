import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowUpRight, MessageCircleMore, RotateCcw, Send, Sparkles, X } from "lucide-react";

import {
  getSiteSettings,
  type CommunityChatOption,
  type SiteSettingsRow,
} from "../../services/siteSettingsService";
import { cn } from "../../lib/cn";

type ChatMessage = {
  id: string;
  role: "bot" | "user";
  text: string;
  actionLabel?: string | null;
  actionHref?: string | null;
};

type ChatSettings = Pick<
  SiteSettingsRow,
  | "show_whatsapp_button"
  | "community_chat_enabled"
  | "community_chat_title"
  | "community_chat_welcome"
  | "community_chat_placeholder"
  | "community_chat_fallback_text"
  | "community_chat_fallback_button_text"
  | "community_chat_fallback_url"
  | "community_chat_options"
>;

export function LandingCommunityChat() {
  const [settings, setSettings] = useState<ChatSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getSiteSettings()
      .then((row) =>
        setSettings({
          show_whatsapp_button: row.show_whatsapp_button ?? false,
          community_chat_enabled: row.community_chat_enabled ?? false,
          community_chat_title: row.community_chat_title ?? "Comunidades WhatsApp",
          community_chat_welcome:
            row.community_chat_welcome ??
            "Hola, soy la guia del consultorio. Elige una comunidad o escribe una opcion breve y te comparto el enlace correcto.",
          community_chat_placeholder:
            row.community_chat_placeholder ?? 'Escribe "promociones" o toca una opcion',
          community_chat_fallback_text:
            row.community_chat_fallback_text ??
            "Por ahora solo puedo ayudarte con las opciones visibles. Si deseas atencion personalizada o pedir una cita, usa el siguiente enlace.",
          community_chat_fallback_button_text:
            row.community_chat_fallback_button_text ?? "Pedir cita",
          community_chat_fallback_url: row.community_chat_fallback_url ?? "/reservar-cita",
          community_chat_options: row.community_chat_options ?? [],
        })
      )
      .catch(() => setSettings(null));
  }, []);

  const activeOptions = useMemo(
    () => (settings?.community_chat_options ?? []).filter((option) => option.is_active),
    [settings?.community_chat_options]
  );

  useEffect(() => {
    if (!settings) return;
    setMessages([
      {
        id: "welcome",
        role: "bot",
        text:
          settings.community_chat_welcome ??
          "Hola, soy la guia del consultorio. Elige una comunidad o escribe una opcion breve y te comparto el enlace correcto.",
      },
    ]);
  }, [settings]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  if (!settings?.show_whatsapp_button || !settings?.community_chat_enabled) {
    return null;
  }

  const resetConversation = () => {
    setMessages([
      {
        id: "welcome",
        role: "bot",
        text:
          settings.community_chat_welcome ??
          "Hola, soy la guia del consultorio. Elige una comunidad o escribe una opcion breve y te comparto el enlace correcto.",
      },
    ]);
    setDraft("");
  };

  const handleSend = (rawValue?: string, selectedOption?: CommunityChatOption | null) => {
    const nextValue = (rawValue ?? draft).trim();
    if (!nextValue && !selectedOption) return;

    const matchedOption = selectedOption ?? findCommunityOption(nextValue, activeOptions);
    const fallbackMessage =
      settings.community_chat_fallback_text ??
      "Por ahora solo puedo ayudarte con las opciones visibles. Si deseas atencion personalizada o pedir una cita, usa el siguiente enlace.";
    const fallbackButtonLabel =
      settings.community_chat_fallback_button_text ?? "Pedir cita";
    const fallbackButtonHref = settings.community_chat_fallback_url ?? "/reservar-cita";

    setMessages((current) => [
      ...current,
      {
        id: `user-${crypto.randomUUID()}`,
        role: "user",
        text: selectedOption?.label ?? nextValue,
      },
      {
        id: `bot-${crypto.randomUUID()}`,
        role: "bot",
        text: matchedOption?.reply ?? fallbackMessage,
        actionLabel: matchedOption?.button_text ?? fallbackButtonLabel,
        actionHref: matchedOption?.button_url ?? fallbackButtonHref,
      },
    ]);

    setDraft("");
  };

  return (
    <div className="pointer-events-none fixed bottom-28 right-4 z-[95] flex max-w-[calc(100vw-2rem)] flex-col items-end md:bottom-24 xl:bottom-6 xl:right-6">
      {open ? (
        <div className="pointer-events-auto w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[32px] border border-[rgba(184,138,90,0.24)] bg-[rgba(255,249,244,0.9)] shadow-[0_28px_90px_rgba(62,42,31,0.24)] backdrop-blur-2xl">
          <div className="relative overflow-hidden border-b border-[rgba(184,138,90,0.18)] bg-[linear-gradient(135deg,rgba(255,249,244,0.98),rgba(245,234,222,0.88))] px-5 py-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(184,138,90,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(111,122,96,0.12),transparent_28%)]" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(184,138,90,0.16)] bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Guia de WhatsApp
                </div>
                <h3 className="mt-3 text-lg font-semibold text-[var(--color-ink)]">
                  {settings.community_chat_title ?? "Comunidades WhatsApp"}
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--color-copy)]">
                  Te ayudo a llegar a la comunidad correcta sin salir de la landing.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetConversation}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(184,138,90,0.18)] bg-white/70 text-[var(--color-ink)]"
                  aria-label="Reiniciar chat"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(184,138,90,0.18)] bg-white/70 text-[var(--color-ink)]"
                  aria-label="Cerrar chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(245,237,228,0.78))] px-4 py-4">
            <div
              ref={scrollRef}
              className="max-h-[min(52vh,24rem)] space-y-3 overflow-y-auto pr-1 sm:max-h-[24rem]"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-[24px] px-4 py-3 text-sm leading-7 shadow-[0_12px_30px_rgba(62,42,31,0.08)]",
                      message.role === "user"
                        ? "rounded-br-[10px] bg-[var(--color-mocha)] text-white"
                        : "rounded-bl-[10px] border border-[rgba(184,138,90,0.14)] bg-white/90 text-[var(--color-copy)]"
                    )}
                  >
                    <p>{message.text}</p>
                    {message.role === "bot" && message.actionLabel && message.actionHref ? (
                      <a
                        href={message.actionHref}
                        target={isExternalHref(message.actionHref) ? "_blank" : undefined}
                        rel={isExternalHref(message.actionHref) ? "noreferrer" : undefined}
                        className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-xs font-semibold text-white"
                      >
                        {message.actionLabel}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {activeOptions.length > 0 ? (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                  Opciones sugeridas
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSend(option.label, option)}
                      className="rounded-full border border-[rgba(184,138,90,0.18)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition hover:-translate-y-0.5 hover:bg-white"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleSend();
              }}
              className="mt-4 flex items-end gap-3"
            >
              <label className="flex-1">
                <span className="sr-only">Escribe tu opcion</span>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={2}
                  className="premium-input min-h-[5.1rem] resize-none bg-white/85"
                  placeholder={
                    settings.community_chat_placeholder ??
                    'Escribe "promociones" o toca una opcion'
                  }
                />
              </label>
              <button
                type="submit"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-mocha)] text-white shadow-[0_18px_36px_rgba(62,42,31,0.18)]"
                aria-label="Enviar opcion"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="pointer-events-auto mt-3 inline-flex items-center gap-3 rounded-full border border-[rgba(184,138,90,0.2)] bg-[rgba(255,249,244,0.88)] px-4 py-3 text-left text-[var(--color-ink)] shadow-[0_18px_42px_rgba(62,42,31,0.16)] backdrop-blur-2xl transition hover:-translate-y-1"
        aria-label={open ? "Cerrar chat de comunidades" : "Abrir chat de comunidades"}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(110,74,47)] text-white shadow-[0_14px_30px_rgba(62,42,31,0.18)]">
          <MessageCircleMore className="h-5 w-5" />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block text-sm font-semibold">
            {settings.community_chat_title ?? "Comunidades WhatsApp"}
          </span>
          <span className="block text-xs uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
            Abrir chat guiado
          </span>
        </span>
      </button>
    </div>
  );
}

function findCommunityOption(query: string, options: CommunityChatOption[]) {
  const normalizedQuery = normalizeChatText(query);
  if (!normalizedQuery) return null;

  return (
    options.find((option) => {
      const terms = [option.label, ...option.keywords]
        .map((term) => normalizeChatText(term))
        .filter(Boolean);

      return terms.some(
        (term) =>
          normalizedQuery === term ||
          normalizedQuery.includes(term) ||
          (normalizedQuery.length >= 4 && term.includes(normalizedQuery))
      );
    }) ?? null
  );
}

function normalizeChatText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}
