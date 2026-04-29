import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getActiveBooks, type BookRow } from "../../services/bookService";
import { formatMoney } from "../../utils/text";
import { SectionHeading } from "../ui/SectionHeading";
import { SectionReveal } from "../ui/SectionReveal";

export function BooksPreviewSection() {
  const [books, setBooks] = useState<BookRow[]>([]);

  useEffect(() => {
    getActiveBooks().then((rows) => setBooks(rows.slice(0, 3))).catch(() => setBooks([]));
  }, []);

  return (
    <SectionReveal id="libros" className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
      <SectionHeading
        eyebrow="Libros"
        title="Recursos digitales curados con el mismo criterio de la consulta."
        description="Material pensado para pacientes y estudiantes: claro, elegante y protegido con acceso privado."
        align="center"
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {books.map((book) => (
          <article key={book.id} className="rounded-[28px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.7)] p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
            <img src={book.cover_image ?? "/doctora/dra1.jpg"} alt={book.title} className="h-80 w-full rounded-[22px] object-cover" />
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{book.author}</p>
            <h3 className="mt-2 text-2xl font-semibold">{book.title}</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{book.description}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <span className="text-lg font-semibold">{formatMoney(book.price)}</span>
              <Link to={`/libros/${book.slug}`} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                Ver libro
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <Link to="/libros" className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
          Ver biblioteca completa
        </Link>
      </div>
    </SectionReveal>
  );
}
