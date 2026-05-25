import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ArrowRight, Download, Info } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { ContentCover } from "../../components/ui/ContentCover";
import { getActiveBooks, type BookRow } from "../../services/bookService";
import { downloadBookWithToken } from "../../services/bookTokenService";
import { formatMoney } from "../../utils/text";

export function BooksPage() {
  const [items, setItems] = useState<BookRow[]>([]);
  const [interest, setInterest] = useState<BookRow | null>(null);
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
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Libros</p>
          <h1 className="font-display mt-3 max-w-4xl text-5xl font-semibold text-[var(--color-ink)] md:text-6xl">
            Biblioteca digital para pacientes, colegas y estudiantes
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-[var(--color-copy)] md:text-base">
            Una seleccion privada de libros digitales con compra verificada, token de descarga y acceso posterior desde tu panel cuando el pago haya sido aprobado.
          </p>
        </div>

        <aside className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(216,194,174,0.24)] text-[var(--color-mocha)]">
            <Download className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-[var(--color-ink)]">Ya compraste un libro</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
            Ingresa tu token para descargar tu archivo sin exponer el libro en una URL publica.
          </p>
          <div className="mt-4 grid gap-3">
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
              Descargar con token
            </button>
          </div>
          {tokenMessage ? <p className="mt-3 text-sm text-[var(--color-mocha)]">{tokenMessage}</p> : null}
        </aside>
      </div>

      <div className="mt-12">
        {loading ? <LoadingState label="Cargando libros..." /> : null}
        {error ? <ErrorState label="No pudimos cargar los libros." /> : null}
        {!loading && !error && items.length === 0 ? <EmptyState label="Todavia no hay libros activos." /> : null}
        {!loading && !error && items.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {items.map((book) => (
              <article key={book.id} className="grid min-h-full grid-rows-[auto_1fr] overflow-hidden rounded-[28px] border border-[var(--color-border)] bg-white/75 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
                <ContentCover src={book.cover_image} alt={book.title} label="Libro" wrapperClassName="aspect-[4/5] w-full rounded-none" />

                <div className="grid gap-4 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{book.author}</p>
                      <h2 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{book.title}</h2>
                    </div>
                    <span className="shrink-0 text-base font-semibold text-[var(--color-ink)]">{formatMoney(book.price)}</span>
                  </div>

                  <p className="text-sm leading-7 text-[var(--color-copy)]">
                    {book.description}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-3">
                    <Link
                      to={`/libros/${book.slug}`}
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-2.5 text-sm font-semibold text-white"
                    >
                      Ver detalle
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                      to={`/comprar-libro/${book.slug}`}
                      className="rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink)]"
                    >
                      Comprar
                    </Link>
                    <button
                      type="button"
                      onClick={() => setInterest(book)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-ink)]"
                      aria-label={`Pedir informacion sobre ${book.title}`}
                      title="Pedir informacion"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <InfoRequestModal
        open={Boolean(interest)}
        interest={interest?.title ?? ""}
        interestId={interest?.id}
        interestType="Libro"
        whatsappTemplate={interest?.whatsapp_prefill_message ?? null}
        contentPrice={interest?.price ?? null}
        onClose={() => setInterest(null)}
      />
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
