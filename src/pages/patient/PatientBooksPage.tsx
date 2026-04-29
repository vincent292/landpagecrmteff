import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getMyBookOrders } from "../../services/bookOrderService";
import { formatDate } from "../../utils/text";

export function PatientBooksPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getMyBookOrders>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyBookOrders(user.id)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState label="Cargando tus pedidos..." />;
  if (error) return <ErrorState label="No pudimos cargar tus pedidos de libros." />;
  if (items.length === 0) return <EmptyState label="Todavia no tienes compras registradas." />;

  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{item.books?.title ?? "Libro"}</h2>
            <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
              {item.status}
            </span>
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
            Compra registrada el {formatDate(item.created_at)}.
          </p>
          {item.admin_notes ? <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{item.admin_notes}</p> : null}
        </div>
      ))}
    </div>
  );
}
