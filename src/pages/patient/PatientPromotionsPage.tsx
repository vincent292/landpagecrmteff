import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import {
  getMyPromotionOrders,
  getPromotionOrderItems,
  getPromotionOrderReceiptUrl,
  type PromotionOrderRow,
} from "../../services/promotionOrderService";
import { formatDate, formatMoney } from "../../utils/text";

export function PatientPromotionsPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<PromotionOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = async () => {
    if (!user) return;
    const rows = await getMyPromotionOrders(user.id);
    setOrders(rows);
  };

  useEffect(() => {
    if (!user) return;
    void load()
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  const openReceipt = async (path?: string | null) => {
    const url = await getPromotionOrderReceiptUrl(path);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) return <LoadingState label="Cargando tus promociones..." />;
  if (error) return <ErrorState label="No pudimos cargar tus promociones reservadas." />;
  if (orders.length === 0) return <EmptyState label="Todavia no tienes promociones reservadas." />;

  return (
    <div className="grid gap-4">
      {orders.map((order) => {
        const items = getPromotionOrderItems(order);

        return (
          <div key={order.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
                  Promocion reservada
                </p>
                <h2 className="mt-2 text-lg font-semibold">{order.promotions?.title ?? "Promocion"}</h2>
                <p className="mt-1 text-sm text-[var(--color-copy)]">{items.length} opcion(es)</p>
              </div>
              <span className="rounded-full bg-[rgba(216,194,174,0.26)] px-3 py-1 text-xs font-semibold text-[var(--color-mocha)]">
                {order.status}
              </span>
            </div>

            <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
              Total {formatMoney(order.total_amount)} · Pagaste {formatMoney(order.amount_paid ?? 0)} · Pendiente {formatMoney(order.amount_pending ?? order.total_amount)}
              <br />
              Modalidad: {order.payment_mode === "anticipo" ? `Anticipo ${order.payment_percent}%` : "Pago completo"}
              <br />
              Creado {formatDate(order.created_at)} {order.promotions?.city ? `· ${order.promotions.city}` : ""}
            </p>

            <div className="mt-4 grid gap-2">
              {items.map((item) => (
                <div key={item.id} className="rounded-[18px] bg-[rgba(247,242,236,0.78)] px-4 py-3 text-sm">
                  <p className="font-semibold text-[var(--color-ink)]">{item.title_snapshot}</p>
                  <p className="mt-1 text-[var(--color-copy)]">{formatMoney(item.unit_price)} · cantidad {item.quantity}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {order.payment_receipt_path ? (
                <button onClick={() => void openReceipt(order.payment_receipt_path)} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                  Ver comprobante
                </button>
              ) : null}
              {order.promotions?.slug ? (
                <Link to={`/promociones/${order.promotions.slug}`} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                  Ver promocion
                </Link>
              ) : null}
            </div>

            {order.admin_notes ? (
              <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                Administracion: {order.admin_notes}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
