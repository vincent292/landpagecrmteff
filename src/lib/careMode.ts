export const careModeOptions = [
  { value: "presencial", label: "Presencial" },
  { value: "virtual", label: "Virtual" },
  { value: "ambas", label: "Presencial y virtual" },
] as const;

export type AvailabilityCareMode = (typeof careModeOptions)[number]["value"];
export type ReservationCareMode = Exclude<AvailabilityCareMode, "ambas">;

const availabilityCareModeSet = new Set<AvailabilityCareMode>(careModeOptions.map((option) => option.value));
const reservationCareModeSet = new Set<ReservationCareMode>(["presencial", "virtual"]);

export function normalizeAvailabilityCareMode(value?: string | null): AvailabilityCareMode {
  if (value && availabilityCareModeSet.has(value as AvailabilityCareMode)) {
    return value as AvailabilityCareMode;
  }
  return "presencial";
}

export function normalizeReservationCareMode(
  value?: string | null,
  fallback: ReservationCareMode = "presencial"
): ReservationCareMode {
  if (value && reservationCareModeSet.has(value as ReservationCareMode)) {
    return value as ReservationCareMode;
  }
  return fallback;
}

export function getCareModeLabel(value?: string | null) {
  return careModeOptions.find((option) => option.value === value)?.label ?? "Presencial";
}

export function getAllowedReservationModes(value?: string | null): ReservationCareMode[] {
  const mode = normalizeAvailabilityCareMode(value);
  if (mode === "ambas") return ["presencial", "virtual"];
  return [mode];
}
