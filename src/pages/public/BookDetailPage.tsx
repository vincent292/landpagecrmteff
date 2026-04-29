import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getBookBySlug, type BookRow } from "../../services/bookService";
import { formatMoney } from "../../utils/text";

export function BookDetailPage() {
  const { slug = "" } = useParams();
  const [book, setBook] = useState<BookRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getBookBySlug(slug)
      .then(setBook)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24"><LoadingState label="Cargando libro..." /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24"><ErrorState label="No pudimos cargar este libro." /></section>;
  if (!book) return <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24"><EmptyState label="No encontramos este libro." /></section>;

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <img src={book.cover_image ?? "/doctora/dra1.jpg"} alt={book.title} className="w-full rounded-[30px] object-cover shadow-[0_24px_70px_rgba(62,42,31,0.16)]" />
        <div className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">{book.author}</p>
          <h1 className="font-display mt-3 text-5xl font-semibold md:text-6xl">{book.title}</h1>
          <p className="mt-6 text-base leading-8 text-[var(--color-copy)]">{book.description}</p>
          <div className="mt-8 rounded-[24px] bg-[rgba(247,242,236,0.78)] p-5">
            <p className="text-sm leading-7 text-[var(--color-copy)]">
              Incluye material digital privado, acceso mediante token y descarga temporal protegida.
            </p>
          </div>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-2xl font-semibold">{formatMoney(book.price)}</span>
            <Link to={`/comprar-libro/${book.slug}`} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
              Comprar libro
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
