import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { InfoRequestModal } from "../../components/platform/InfoRequestModal";
import { ContentCover } from "../../components/ui/ContentCover";
import { useAuth } from "../../hooks/useAuth";
import { getBookBySlug, type BookRow } from "../../services/bookService";
import { downloadBookWithToken } from "../../services/bookTokenService";
import { formatMoney } from "../../utils/text";

export function BookDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [book, setBook] = useState<BookRow | null>(null);
  const [token, setToken] = useState("");
  const [tokenMessage, setTokenMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

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
        <ContentCover src={book.cover_image} alt={book.title} label="Libro" wrapperClassName="w-full rounded-[30px] shadow-[0_24px_70px_rgba(62,42,31,0.16)]" />
        <div className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">{book.author}</p>
          <h1 className="font-display mt-3 text-5xl font-semibold text-[var(--color-ink)] md:text-6xl">{book.title}</h1>
          <p className="mt-6 text-base leading-8 text-[var(--color-copy)]">{book.description}</p>
          <div className="mt-8 rounded-[24px] bg-[rgba(247,242,236,0.78)] p-5 text-sm leading-7 text-[var(--color-copy)]">
            <p>Incluye material digital privado y descarga temporal protegida mediante token verificado.</p>
            <p className="mt-3">Pasos para comprar:</p>
            <ol className="mt-2 list-decimal space-y-2 pl-5">
              <li>Ingresa a tu cuenta o crea una cuenta nueva.</li>
              <li>Completa el formulario de compra y sube tu comprobante.</li>
              <li>Cuando el pago sea validado, recibirás el token de descarga.</li>
            </ol>
          </div>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-2xl font-semibold">{formatMoney(book.price)}</span>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowInfoModal(true)}
                className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold"
              >
                Pedir información
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    navigate("/login", { state: { from: `/comprar-libro/${book.slug}` } });
                    return;
                  }
                  navigate(`/comprar-libro/${book.slug}`);
                }}
                className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white"
              >
                Comprar libro
              </button>
            </div>
          </div>
          {!user ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              Inicia sesión para guardar este libro en tu perfil y acceder a tus descargas cuando lo necesites.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-6">
          <h2 className="text-2xl font-semibold text-[var(--color-ink)]">¿Qué incluye?</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            Acceso al material digital, validación mediante compra verificada y disponibilidad posterior en tu panel cuando el pedido haya sido aprobado.
          </p>
          {book.public_info ? (
            <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
              {book.public_info}
            </p>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-6">
          <h2 className="text-2xl font-semibold text-[var(--color-ink)]">¿Ya compraste este libro?</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            Ingresa tu token para validar la descarga del archivo con una URL firmada temporal.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <input
              value={token}
              onChange={(event) => setToken(event.target.value.toUpperCase())}
              placeholder="Ingresa tu token"
              className="premium-input"
            />
            <button
              type="button"
              onClick={() => void handleTokenDownload(token, setTokenMessage)}
              className="rounded-full bg-[var(--color-caramel)] px-6 py-3 text-sm font-semibold text-white"
            >
              Descargar
            </button>
          </div>
          {tokenMessage ? <p className="mt-3 text-sm text-[var(--color-mocha)]">{tokenMessage}</p> : null}
          <div className="mt-5">
            <Link to="/mi-panel/descargas" className="text-sm font-semibold text-[var(--color-mocha)]">
              Ir a mis descargas
            </Link>
          </div>
        </div>
      </div>
      <InfoRequestModal
        open={showInfoModal}
        interest={book.title}
        interestId={book.id}
        interestType="Libro"
        whatsappTemplate={book.whatsapp_prefill_message ?? null}
        contentPrice={book.price ?? null}
        onClose={() => setShowInfoModal(false)}
      />
    </section>
  );
}

async function handleTokenDownload(token: string, setMessage: (message: string) => void) {
  if (!token.trim()) {
    setMessage("Ingresa un token válido.");
    return;
  }
  try {
    const result = await downloadBookWithToken(token.trim());
    setMessage(`Descarga lista para ${result.title}.`);
    window.open(result.signedUrl, "_blank", "noopener,noreferrer");
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Token inválido o agotado.");
  }
}
