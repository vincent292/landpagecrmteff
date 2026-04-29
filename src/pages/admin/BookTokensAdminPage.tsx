import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import {
  deactivateToken,
  getAllTokensAdmin,
  updateBookToken,
  type BookTokenRow,
} from "../../services/bookTokenService";

export function BookTokensAdminPage() {
  const [rows, setRows] = useState<BookTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setRows(await getAllTokensAdmin());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-8">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Tokens</p>
        <h1 className="font-display mt-3 text-5xl font-semibold">Control de accesos de descarga</h1>
      </section>

      {loading && <LoadingState label="Cargando tokens..." />}
      {error && <ErrorState label="No pudimos cargar los tokens." />}
      {!loading && !error && rows.length === 0 && <EmptyState label="Todavia no hay tokens creados." />}

      {!loading && !error && rows.length > 0 && (
        <div className="grid gap-4">
          {rows.map((row) => (
            <div key={row.id} className="rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-semibold">{row.books?.title ?? "Libro"}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--color-copy)]">{row.token}</p>
                  <p className="mt-2 text-sm text-[var(--color-copy)]">
                    Usos {row.used_count}/{row.max_uses} · {row.is_active ? "Activo" : "Inactivo"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="number"
                    defaultValue={row.max_uses}
                    onBlur={(event) => void updateBookToken(row.id, { max_uses: Number(event.target.value) }).then(load)}
                    className="premium-input w-28"
                  />
                  <input
                    type="datetime-local"
                    defaultValue={row.expires_at?.slice(0, 16) ?? ""}
                    onBlur={(event) => void updateBookToken(row.id, { expires_at: event.target.value || null }).then(load)}
                    className="premium-input"
                  />
                  <button onClick={() => void navigator.clipboard.writeText(row.token)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    Copiar token
                  </button>
                  <button onClick={() => void updateBookToken(row.id, { is_active: !row.is_active }).then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    {row.is_active ? "Desactivar" : "Activar"}
                  </button>
                  <button onClick={() => void deactivateToken(row.id).then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                    Revocar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
