import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getActiveBooks, type BookRow } from "../../services/bookService";
import { downloadBookWithToken } from "../../services/bookTokenService";
import { formatMoney } from "../../utils/text";

export function BooksPage() {
  const [items, setItems] = useState<BookRow[]>([]);
  const [token, setToken] = useState("");
  const [tokenMessage, setTokenMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getActiveBooks()
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Libros</p>
      <h1 className="font-display mt-3 text-5xl font-semibold md:text-6xl">Biblioteca digital para pacientes y estudiantes</h1>
      <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
        Materiales cuidados con la misma sensibilidad de la clinica: utiles, claros y listos para comprar desde tu cuenta.
      </p>

      <div className="mt-8 rounded-[30px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <p className="text-sm font-semibold text-[var(--color-ink)]">¿Ya tienes un token de descarga?</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={token}
            onChange={(event) => setToken(event.target.value.toUpperCase())}
            placeholder="Ingresa tu token"
            className="premium-input"
          />
          <button
            onClick={() => void handleTokenDownload(token, setTokenMessage)}
            className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white"
          >
            Descargar libro
          </button>
        </div>
        {tokenMessage ? <p className="mt-3 text-sm text-[var(--color-mocha)]">{tokenMessage}</p> : null}
      </div>

      <div className="mt-10">
        {loading && <LoadingState label="Cargando libros..." />}
        {error && <ErrorState label="No pudimos cargar los libros." />}
        {!loading && !error && items.length === 0 && <EmptyState label="Todavia no hay libros activos." />}
        {!loading && !error && items.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {items.map((book) => (
              <article key={book.id} className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
                <img src={book.cover_image ?? "/doctora/dra1.jpg"} alt={book.title} className="h-80 w-full rounded-[22px] object-cover" />
                <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{book.author}</p>
                <h2 className="mt-2 text-2xl font-semibold">{book.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{book.description}</p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-lg font-semibold text-[var(--color-ink)]">{formatMoney(book.price)}</span>
                  <div className="flex gap-2">
                    <Link to={`/libros/${book.slug}`} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Ver libro
                    </Link>
                    <Link to={`/comprar-libro/${book.slug}`} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
                      Comprar
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

async function handleTokenDownload(token: string, setMessage: (message: string) => void) {
  if (!token.trim()) {
    setMessage("Ingresa un token valido.");
    return;
  }
  try {
    const result = await downloadBookWithToken(token.trim());
    setMessage(`Descarga lista para ${result.title}.`);
    window.open(result.signedUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Token invalido o agotado.");
  }
}
