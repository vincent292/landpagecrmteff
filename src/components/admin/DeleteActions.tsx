import { RotateCcw, Trash2, XCircle } from "lucide-react";

import type { UserRole } from "../../types/platform";
import { canHardDelete, isSoftDeleted, type DeletionMetadata } from "../../services/adminDeletionService";

export function DeleteActions({
  role,
  row,
  onSoftDelete,
  onRestore,
  onHardDelete,
  compact = false,
}: {
  role: UserRole;
  row?: DeletionMetadata | null;
  onSoftDelete: () => void;
  onRestore?: () => void;
  onHardDelete?: () => void;
  compact?: boolean;
}) {
  const deleted = isSoftDeleted(row);

  if (deleted) {
    return (
      <div className="flex flex-wrap gap-2">
        {onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            className={`rounded-full border border-[var(--color-border)] ${compact ? "p-2" : "px-4 py-2 text-sm font-semibold"}`}
            aria-label="Recuperar registro"
            title="Recuperar"
          >
            {compact ? <RotateCcw className="h-4 w-4" /> : "Recuperar"}
          </button>
        ) : null}
        {canHardDelete(role) && onHardDelete ? (
          <button
            type="button"
            onClick={onHardDelete}
            className={`rounded-full border border-red-200 text-red-700 ${compact ? "p-2" : "px-4 py-2 text-sm font-semibold"}`}
            aria-label="Borrar definitivamente"
            title="Borrar definitivamente"
          >
            {compact ? <XCircle className="h-4 w-4" /> : "Borrar definitivo"}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onSoftDelete}
        className={`rounded-full border border-[var(--color-border)] ${compact ? "p-2" : "px-4 py-2 text-sm font-semibold"}`}
        aria-label="Borrar de la vista"
        title="Borrar"
      >
        {compact ? <Trash2 className="h-4 w-4" /> : "Borrar"}
      </button>
      {canHardDelete(role) && onHardDelete ? (
        <button
          type="button"
          onClick={onHardDelete}
          className={`rounded-full border border-red-200 text-red-700 ${compact ? "p-2" : "px-4 py-2 text-sm font-semibold"}`}
          aria-label="Borrar definitivamente"
          title="Borrar definitivamente"
        >
          {compact ? <XCircle className="h-4 w-4" /> : "Borrar definitivo"}
        </button>
      ) : null}
    </div>
  );
}

export function DeletedStatusNote({ row }: { row?: DeletionMetadata | null }) {
  if (!isSoftDeleted(row)) return null;

  const actor = row?.deleted_by_name || row?.deleted_by_email || "usuario del panel";
  const role = row?.deleted_by_role ? ` · ${row.deleted_by_role}` : "";
  const date = row?.deleted_at ? new Date(row.deleted_at).toLocaleString("es-BO") : "";

  return (
    <p className="mt-2 text-xs font-semibold text-amber-700">
      Borrado de la vista por {actor}{role}{date ? ` · ${date}` : ""}. Superadmin puede recuperarlo.
    </p>
  );
}
