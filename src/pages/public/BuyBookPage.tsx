import { useEffect, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Navigate, useParams } from "react-router-dom";
import { z } from "zod";

import { LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { attachPaymentReceipt, createBookOrder, uploadPaymentReceipt } from "../../services/bookOrderService";
import { getBookBySlug } from "../../services/bookService";
import { formatMoney } from "../../utils/text";

const schema = z.object({
  full_name: z.string().min(3, "Escribe tu nombre completo"),
  phone: z.string().min(6, "Escribe un celular valido"),
  city: z.string().min(2, "Escribe tu ciudad"),
  email: z.string().email("Correo invalido"),
  receipt: z.instanceof(File, { message: "Sube tu comprobante" }),
});

type Values = z.infer<typeof schema>;

export function BuyBookPage() {
  const { user, profile } = useAuth();
  const { slug = "" } = useParams();
  const [book, setBook] = useState<Awaited<ReturnType<typeof getBookBySlug>> | undefined>(undefined);
  const [message, setMessage] = useState("");
  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: profile?.full_name ?? "",
      phone: profile?.phone ?? "",
      city: profile?.city ?? "",
      email: profile?.email ?? user?.email ?? "",
    },
  });

  useEffect(() => {
    getBookBySlug(slug).then(setBook);
  }, [slug]);

  if (!user) return <Navigate to="/login" replace state={{ from: `/comprar-libro/${slug}` }} />;
  if (book === undefined) return <section className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24"><LoadingState label="Cargando libro..." /></section>;
  if (!book) return <section className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24"><LoadingState label="No encontramos este libro." /></section>;

  const onSubmit = async (values: Values) => {
    const order = await createBookOrder({
      book_id: book.id,
      user_id: user.id,
      full_name: values.full_name,
      email: values.email,
      phone: values.phone,
      city: values.city,
      status: "Pendiente",
    });
    const receiptPath = await uploadPaymentReceipt(values.receipt, order.id);
    await attachPaymentReceipt(order.id, receiptPath);
    setMessage("Recibimos tu comprobante. La administracion verificara tu pago y te enviara un token de descarga cuando sea aprobado.");
  };

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6">
          <img src={book.cover_image ?? "/doctora/dra1.jpg"} alt={book.title} className="h-[28rem] w-full rounded-[24px] object-cover" />
          <h1 className="font-display mt-5 text-4xl font-semibold">{book.title}</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{book.description}</p>
          <p className="mt-5 text-xl font-semibold">{formatMoney(book.price)}</p>
          {book.qr_payment_image ? (
            <div className="mt-6 rounded-[24px] bg-[rgba(247,242,236,0.78)] p-4">
              <p className="text-sm font-semibold">QR de pago</p>
              <img src={book.qr_payment_image} alt="QR de pago" className="mt-3 h-56 w-56 rounded-[20px] object-cover" />
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Confirmar compra</p>
          <h2 className="font-display mt-3 text-4xl font-semibold">Sube tu comprobante de pago</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-copy)]">
            Completa tus datos, realiza el pago con el QR y sube tu comprobante. Validaremos el pedido desde administracion.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Nombre completo" error={errors.full_name?.message}>
              <input {...register("full_name")} className="premium-input mt-2" />
            </Field>
            <Field label="WhatsApp" error={errors.phone?.message}>
              <input {...register("phone")} className="premium-input mt-2" />
            </Field>
            <Field label="Ciudad" error={errors.city?.message}>
              <input {...register("city")} className="premium-input mt-2" />
            </Field>
            <Field label="Correo" error={errors.email?.message}>
              <input {...register("email")} className="premium-input mt-2" />
            </Field>
            <Field label="Comprobante" error={errors.receipt?.message}>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setValue("receipt", file, { shouldValidate: true });
                }}
                className="premium-input mt-2"
              />
            </Field>
          </div>

          {message ? <p className="mt-5 rounded-[20px] bg-[rgba(247,242,236,0.78)] p-4 text-sm leading-7 text-[var(--color-copy)]">{message}</p> : null}

          <button disabled={isSubmitting} className="mt-6 rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
            {isSubmitting ? "Enviando..." : "Enviar comprobante"}
          </button>
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-red-700">{error}</span> : null}
    </label>
  );
}
