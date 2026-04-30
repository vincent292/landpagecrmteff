import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getMyPrescriptions } from "../../services/prescriptionService";

export function PatientPrescriptionsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getMyPrescriptions>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyPrescriptions(user.id)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState label="Cargando recetas..." />;
  if (error) return <ErrorState label="No pudimos cargar tus recetas." />;
  if (items.length === 0) return <EmptyState label="Todavía no tienes recetas visibles." />;

  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
          <h2 className="text-lg font-semibold">{item.title}</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[var(--color-copy)]">{item.prescription_text}</p>
          {item.indications ? <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]"><strong>Indicaciones:</strong> {item.indications}</p> : null}
        </div>
      ))}
    </div>
  );
}
