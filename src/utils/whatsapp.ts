export function normalizePhoneForWhatsApp(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

export function buildWhatsAppHref(phone?: string | null, message?: string | null) {
  const cleanedPhone = normalizePhoneForWhatsApp(phone);
  if (!cleanedPhone) return null;

  const text = (message ?? "").trim();
  return text
    ? `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${cleanedPhone}`;
}

export function renderWhatsAppTemplate(
  template: string | null | undefined,
  replacements: Record<string, string | number | null | undefined>
) {
  const source = (template ?? "").trim();
  if (!source) return "";

  return Object.entries(replacements).reduce((message, [key, value]) => {
    const safeValue = value == null ? "" : String(value);
    return message.replaceAll(`{{${key}}}`, safeValue);
  }, source);
}
