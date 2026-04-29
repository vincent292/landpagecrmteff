import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { getMyPostCares } from "../../services/postCareService";

export function PatientCaresPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Awaited<ReturnType<typeof getMyPostCares>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyPostCares(user.id)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) return <LoadingState label="Cargando cuidados..." />;
  if (error) return <ErrorState label="No pudimos cargar tus cuidados." />;
  if (items.length === 0) return <EmptyState label="Aun no tienes cuidados postratamiento visibles." />;

  return (
    <div className="grid gap-4">
      {items.map((item) => (
        <div key={item.id} className="rounded-[24px] border border-[var(--color-border)] bg-white/75 p-5">
          <h2 className="text-lg font-semibold">{item.title}</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{item.care_instructions}</p>
          {item.warning_signs ? <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]"><strong>Signos de alarma:</strong> {item.warning_signs}</p> : null}
          {item.next_steps ? <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]"><strong>Proximos pasos:</strong> {item.next_steps}</p> : null}
        </div>
      ))}
    </div>
  );
}
