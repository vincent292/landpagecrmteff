import { useEffect, useState } from "react";

import type { FieldValues, UseFormReturn } from "react-hook-form";

import { readWorkspaceState, removeWorkspaceState, writeWorkspaceState } from "../lib/workspaceState";

type Options<TFormValues extends FieldValues> = {
  ttlMs?: number;
  enabled?: boolean;
  isEmpty?: (value: Partial<TFormValues>) => boolean;
};

export function useFormDraft<TFormValues extends FieldValues>(
  form: UseFormReturn<TFormValues>,
  key: string,
  options: Options<TFormValues> = {}
) {
  const { ttlMs, enabled = true, isEmpty } = options;
  const [hasDraft, setHasDraft] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const stored = readWorkspaceState<Partial<TFormValues>>(key);
    if (stored) {
      form.reset({
        ...form.getValues(),
        ...stored,
      });
      setHasDraft(true);
      return;
    }

    setHasDraft(false);
  }, [enabled, form, key]);

  useEffect(() => {
    if (!enabled) return;

    const subscription = form.watch((value) => {
      const nextValue = value as Partial<TFormValues>;
      if (isEmpty?.(nextValue)) {
        removeWorkspaceState(key);
        setHasDraft(false);
        return;
      }

      writeWorkspaceState(key, nextValue, ttlMs);
      setHasDraft(true);
    });

    return () => subscription.unsubscribe();
  }, [enabled, form, isEmpty, key, ttlMs]);

  const clearDraft = () => {
    removeWorkspaceState(key);
    setHasDraft(false);
  };

  return { hasDraft, clearDraft };
}
