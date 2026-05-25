import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import { readWorkspaceState, removeWorkspaceState, writeWorkspaceState } from "../lib/workspaceState";

type Options<T> = {
  ttlMs?: number;
  enabled?: boolean;
  isEmpty?: (value: T) => boolean;
};

export function useWorkspaceState<T>(
  key: string,
  initialValue: T | (() => T),
  options: Options<T> = {}
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { ttlMs, enabled = true, isEmpty } = options;
  const resolveInitialValue = () => (typeof initialValue === "function" ? (initialValue as () => T)() : initialValue);

  const [state, setState] = useState<T>(() => {
    if (!enabled) return resolveInitialValue();
    return readWorkspaceState<T>(key) ?? resolveInitialValue();
  });

  useEffect(() => {
    if (!enabled) return;
    const stored = readWorkspaceState<T>(key);
    if (stored !== null) {
      setState(stored);
      return;
    }
    setState(resolveInitialValue());
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled) return;

    if (isEmpty?.(state)) {
      removeWorkspaceState(key);
      return;
    }

    writeWorkspaceState(key, state, ttlMs);
  }, [enabled, isEmpty, key, state, ttlMs]);

  const clear = () => {
    removeWorkspaceState(key);
    setState(resolveInitialValue());
  };

  return [state, setState, clear];
}
