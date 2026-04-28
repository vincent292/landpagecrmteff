import { useEffect, useState } from "react";

import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getGalleryAlbums, type GalleryAlbumRow } from "../../services/galleryService";
import { PageIntro } from "./TreatmentsPage";

export function GalleryPage() {
  const [albums, setAlbums] = useState<GalleryAlbumRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getGalleryAlbums()
      .then(setAlbums)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <PageIntro eyebrow="Galería" title="Book visual de jornadas, cursos y experiencias de la doctora." />
      <div className="mt-12">
        {loading && <LoadingState />}
        {error && <ErrorState />}
        {!loading && !error && albums.length === 0 && <EmptyState />}
        <div className="grid gap-6 md:grid-cols-2">
          {albums.map((album) => (
            <Link key={album.id} to={`/galeria/${album.slug}`} className="group overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/60">
              <img src={album.cover_image ?? "/doctora/dra5.jpg"} alt={album.title} className="h-80 w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">{album.city} · {album.event_date}</p>
                <h2 className="mt-3 text-2xl font-semibold">{album.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{album.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
