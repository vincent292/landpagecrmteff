import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import {
  createBook,
  deleteBook,
  getBookById,
  getBooksAdmin,
  updateBook,
  uploadBookCover,
  uploadBookFile,
  uploadBookQr,
  type BookRow,
} from "../../services/bookService";
import { formatMoney, slugify } from "../../utils/text";

export function BooksAdminPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isForm = location.pathname.includes("/nuevo") || location.pathname.includes("/editar");
  const [rows, setRows] = useState<BookRow[]>([]);
  const [current, setCurrent] = useState<BookRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    author: "",
    description: "",
    cover_image: "",
    file_path: "",
    price: 0,
    qr_payment_image: "",
    download_token_mode: "single_use",
    default_token_max_uses: 1,
    is_active: true,
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [bookFile, setBookFile] = useState<File | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([getBooksAdmin(), id ? getBookById(id) : Promise.resolve(null)])
      .then(([books, selected]) => {
        setRows(books);
        setCurrent(selected);
        if (selected) {
          setForm({
            title: selected.title ?? "",
            slug: selected.slug ?? "",
            author: selected.author ?? "",
            description: selected.description ?? "",
            cover_image: selected.cover_image ?? "",
            file_path: selected.file_path ?? "",
            price: selected.price ?? 0,
            qr_payment_image: selected.qr_payment_image ?? "",
            download_token_mode: selected.download_token_mode ?? "single_use",
            default_token_max_uses: selected.default_token_max_uses ?? 1,
            is_active: selected.is_active ?? true,
          });
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const submit = async () => {
    let coverImage = form.cover_image;
    let filePath = form.file_path;
    let qrImage = form.qr_payment_image;

    if (coverFile) {
      const uploaded = await uploadBookCover(coverFile);
      coverImage = uploaded.publicUrl;
    }
    if (bookFile) {
      filePath = await uploadBookFile(bookFile);
    }
    if (qrFile) {
      const uploadedQr = await uploadBookQr(qrFile);
      qrImage = uploadedQr.publicUrl;
    }

    const payload = {
      ...form,
      cover_image: coverImage,
      file_path: filePath,
      qr_payment_image: qrImage,
    };

    if (current) {
      await updateBook(current.id, payload);
    } else {
      await createBook(payload);
    }
    navigate("/panel/libros");
  };

  if (loading) return <LoadingState label="Cargando libros..." />;
  if (error) return <ErrorState label="No pudimos cargar este modulo." />;

  if (!isForm) {
    return (
      <div className="space-y-8">
        <section className="flex flex-col gap-4 rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Libros</p>
            <h1 className="font-display mt-3 text-5xl font-semibold">Catalogo y activos digitales</h1>
          </div>
          <Link to="/panel/libros/nuevo" className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            Nuevo libro
          </Link>
        </section>

        {rows.length === 0 ? (
          <EmptyState label="Todavia no hay libros creados." />
        ) : (
          <div className="grid gap-4">
            {rows.map((book) => (
              <div key={book.id} className="rounded-[26px] border border-[var(--color-border)] bg-white/75 p-5">
                <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">{book.author}</p>
                    <h2 className="mt-2 text-2xl font-semibold">{book.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{formatMoney(book.price)} · {book.is_active ? "Activo" : "Inactivo"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to={`/panel/libros/${book.id}/editar`} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Editar
                    </Link>
                    <button onClick={() => void deleteBook(book.id).then(load)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                      Eliminar
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

  return (
    <div className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">{current ? "Editar libro" : "Nuevo libro"}</p>
      <h1 className="font-display mt-3 text-5xl font-semibold">{current ? current.title : "Crear libro digital"}</h1>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Field label="Titulo"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value, slug: current ? form.slug : slugify(event.target.value) })} className="premium-input mt-2" /></Field>
        <Field label="Slug"><input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} className="premium-input mt-2" /></Field>
        <Field label="Autor"><input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} className="premium-input mt-2" /></Field>
        <Field label="Precio"><input type="number" value={String(form.price)} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} className="premium-input mt-2" /></Field>
        <Field label="Modo de token">
          <select value={form.download_token_mode} onChange={(event) => setForm({ ...form, download_token_mode: event.target.value })} className="premium-input mt-2">
            <option value="single_use">single_use</option>
            <option value="multiple_use">multiple_use</option>
          </select>
        </Field>
        <Field label="Maximo de usos"><input type="number" value={String(form.default_token_max_uses)} onChange={(event) => setForm({ ...form, default_token_max_uses: Number(event.target.value) })} className="premium-input mt-2" /></Field>
        <Field label="Portada"><input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} className="premium-input mt-2" /></Field>
        <Field label="Archivo del libro"><input type="file" accept=".pdf,.epub" onChange={(event) => setBookFile(event.target.files?.[0] ?? null)} className="premium-input mt-2" /></Field>
        <Field label="QR de pago"><input type="file" accept="image/*" onChange={(event) => setQrFile(event.target.files?.[0] ?? null)} className="premium-input mt-2" /></Field>
        <label className="flex items-center gap-3 pt-7">
          <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
          <span className="text-sm font-semibold">Libro activo</span>
        </label>
        <Field label="Descripcion" className="md:col-span-2">
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="premium-input mt-2 min-h-28" />
        </Field>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => void submit()} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
          Guardar libro
        </button>
        <Link to="/panel/libros" className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">
          Volver
        </Link>
      </div>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={className}>
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
