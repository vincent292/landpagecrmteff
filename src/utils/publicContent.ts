const cityAliases: Record<string, string> = {
  "cochabamba": "Cochabamba",
  "cohcabamba": "Cochabamba",
  "cbba": "Cochabamba",
  "la paz": "La Paz",
  "lapaz": "La Paz",
  "santa cruz": "Santa Cruz",
  "santacruz": "Santa Cruz",
  "sucre": "Sucre",
  "tarija": "Tarija",
  "oruro": "Oruro",
  "potosi": "Potosi",
  "potosí": "Potosi",
  "beni": "Beni",
  "trinidad": "Beni",
  "pando": "Pando",
  "cobija": "Pando",
};

const agendaTypeAliases: Record<string, string> = {
  "procedimiento": "Procedimiento",
  "procedimientos": "Procedimiento",
  "valoracion": "Valoracion",
  "valoracion medica": "Valoracion",
  "valoración": "Valoracion",
  "valoraciones": "Valoracion",
  "cirugia": "Cirugia",
  "cirugía": "Cirugia",
  "cirugias": "Cirugia",
  "cirugías": "Cirugia",
  "presentacion": "Presentacion",
  "presentación": "Presentacion",
  "jornada": "Jornada",
  "curso": "Academy",
  "academy": "Academy",
  "consulta": "Consulta",
  "promocion": "Promoción",
  "promoción": "Promoción",
  "evento": "Evento",
};

export const publicBoliviaCities = [
  "Cochabamba",
  "La Paz",
  "Santa Cruz",
  "Sucre",
  "Tarija",
  "Oruro",
  "Potosi",
  "Beni",
  "Pando",
] as const;

export const publicAgendaTypes = [
  "Procedimiento",
  "Valoracion",
  "Cirugia",
  "Presentacion",
  "Jornada",
  "Academy",
  "Consulta",
] as const;

export function normalizeCity(value?: string | null) {
  if (!value) return null;
  const cleaned = value.trim().toLowerCase();
  return cityAliases[cleaned] ?? toTitleCase(value);
}

export function getDisplayCity(value?: string | null, fallback = "Cochabamba") {
  return normalizeCity(value) ?? fallback;
}

export function getPublicCityOptions(values: Array<string | null | undefined>) {
  const unique = new Set<string>();

  values.forEach((value) => {
    const normalized = normalizeCity(value);
    if (normalized && publicBoliviaCities.includes(normalized as (typeof publicBoliviaCities)[number])) {
      unique.add(normalized);
    }
  });

  return [...unique];
}

export function normalizeAgendaType(value?: string | null) {
  if (!value) return "Evento";
  const cleaned = value.trim().toLowerCase();
  return agendaTypeAliases[cleaned] ?? toTitleCase(value);
}

export function matchesAgendaType(rawValue: string | null | undefined, selectedType: string) {
  if (selectedType === "Todos") return true;
  return normalizeAgendaType(rawValue) === selectedType;
}

export function formatPublicDate(value?: string | null) {
  if (!value) return "Fecha por confirmar";
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatPublicTime(value?: string | null) {
  if (!value) return "Hora por confirmar";

  const [hours = "0", minutes = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date.toLocaleTimeString("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeLine(date?: string | null, time?: string | null) {
  return `${formatPublicDate(date)}${time ? ` · ${formatPublicTime(time)}` : ""}`;
}

export function getMapEmbedUrl(maybeEmbed?: string | null, mapsUrl?: string | null) {
  const embed = maybeEmbed?.trim();

  if (embed) {
    const iframeMatch = embed.match(/src=["']([^"']+)["']/i);
    if (iframeMatch?.[1]) return iframeMatch[1];
    if (embed.startsWith("http")) return embed;
  }

  if (mapsUrl?.includes("google.com/maps/embed")) {
    return mapsUrl;
  }

  return "https://www.google.com/maps?q=Cochabamba%2C%20Bolivia&z=13&output=embed";
}

export function toTitleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function getInitials(value?: string | null) {
  if (!value) return "DE";
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

export function isCurrentPromotion(endDate?: string | null) {
  if (!endDate) return true;
  return new Date(`${endDate}T23:59:59`).getTime() >= Date.now();
}
