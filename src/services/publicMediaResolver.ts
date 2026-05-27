import { getPublicMediaUrl } from "./mediaStorageService";

export function resolvePublicMediaValue(value?: string | null) {
  return getPublicMediaUrl(value) ?? value ?? null;
}

export function resolvePublicMediaFields<T extends Record<string, unknown>>(
  row: T,
  fields: Array<keyof T>
) {
  const next = { ...row } as T;

  fields.forEach((field) => {
    const value = next[field];
    if (typeof value === "string" || value === null || value === undefined) {
      (next as Record<string, unknown>)[String(field)] = resolvePublicMediaValue(
        value as string | null | undefined
      );
    }
  });

  return next;
}
