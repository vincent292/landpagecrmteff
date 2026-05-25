type StoredEnvelope<T> = {
  expiresAt: number | null;
  value: T;
};

const PREFIX = "tefpage:workspace:";

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function toKey(key: string) {
  return `${PREFIX}${key}`;
}

export function readWorkspaceState<T>(key: string): T | null {
  const storage = getStorage();
  if (!storage) return null;

  const raw = storage.getItem(toKey(key));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredEnvelope<T>;
    if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
      storage.removeItem(toKey(key));
      return null;
    }
    return parsed.value;
  } catch {
    storage.removeItem(toKey(key));
    return null;
  }
}

export function writeWorkspaceState<T>(key: string, value: T, ttlMs?: number) {
  const storage = getStorage();
  if (!storage) return;

  const envelope: StoredEnvelope<T> = {
    value,
    expiresAt: ttlMs ? Date.now() + ttlMs : null,
  };

  storage.setItem(toKey(key), JSON.stringify(envelope));
}

export function removeWorkspaceState(key: string) {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(toKey(key));
}

export function clearWorkspaceState() {
  const storage = getStorage();
  if (!storage) return;

  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}
