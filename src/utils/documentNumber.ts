export function normalizeDocumentNumber(value?: string | null) {
  return (value ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase().trim();
}
