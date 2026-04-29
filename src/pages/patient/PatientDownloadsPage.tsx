import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { downloadBookWithToken, getMyTokens, type BookTokenRow } from "../../services/bookTokenService";

export function PatientDownloadsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<BookTokenRow[]>([]);
  const [manualToken, setManualToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    if (!user) return;
    setLoading(true);
    getMyTokens(user.id)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [user]);

  const handleDownload = async (token: string) => {
    try {
      const result = await downloadBookWithToken(token);
      setMessage(`Descarga lista para ${result.title}.`);
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
      load();
    } catch (downloadError) {
      const text = downloadError instanceof Error ? downloadError.message : "No se pudo descargar el libro.";
      setMessage(text);
    }
  };

  if (loading) return <LoadingState label="Cargando tus tokens..." />;
  if (error) return <ErrorState label="No pudimos cargar tus descargas." />;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-6">
        <h1 className="font-display text-5xl font-semibold">Descargas privadas</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
          Tus libros se habilitan cuando administracion aprueba el pedido y genera un token activo.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            value={manualToken}
            onChange={(event) => setManualToken(event.target.value)}
            placeholder="Ingresa un token manual"
            className="premium-input"
          />
          <button onClick={() => void handleDownload(manualToken)} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            Descargar con token
          </button>
        </div>
        {message ? <p className="mt-4 text-sm text-[var(--color-mocha)]">{message}</p> : null}
      </section>

      {items.length === 0 ? (
        <EmptyState label="Aun no tienes tokens activos de descarga." />
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{item.books?.title ?? "Libro"}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--color-copy)]">{item.token}</p>
                </div>
                <button onClick={() => void handleDownload(item.token)} className="rounded-full bg-[var(--color-mocha)] px-5 py-2.5 text-sm font-semibold text-white">
                  Descargar
                </button>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                Usos: {item.used_count}/{item.max_uses} {item.expires_at ? `· Expira ${item.expires_at}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
