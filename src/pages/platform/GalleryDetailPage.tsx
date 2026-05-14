import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import "swiper/css";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { ImageWithSkeleton } from "../../components/ui/ImageWithSkeleton";
import { getGalleryAlbumBySlug, type GalleryAlbumRow } from "../../services/galleryService";
import { getMediaKind } from "../../services/mediaStorageService";
import { formatPublicDate, getDisplayCity } from "../../utils/publicContent";

export function GalleryDetailPage() {
  const { slug } = useParams();
  const [album, setAlbum] = useState<GalleryAlbumRow | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getGalleryAlbumBySlug(slug)
      .then((result) => {
        setAlbum(result);
        const firstMedia = result?.video_url ?? result?.cover_image ?? result?.gallery_images?.[0]?.image_url ?? null;
        setSelectedMedia(firstMedia);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (!slug) return <Navigate to="/galeria" replace />;
  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16"><LoadingState /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16"><ErrorState /></section>;
  if (!album) return <section className="mx-auto max-w-7xl px-6 py-16"><EmptyState label="No encontramos este álbum." /></section>;

  const mediaItems = useMemo(() => {
    const items = [
      album.video_url ? { url: album.video_url, label: album.title } : null,
      album.cover_image ? { url: album.cover_image, label: album.title } : null,
      ...(album.gallery_images?.map((image) => ({
        url: image.image_url,
        label: image.caption ?? image.alt_text ?? album.title,
      })) ?? []),
    ].filter(Boolean) as { url: string; label: string }[];

    return Array.from(new Map(items.map((item) => [item.url, item])).values());
  }, [album]);

  const activeMedia = selectedMedia ?? mediaItems[0]?.url ?? null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">
        {album.category ?? "Galeria"} · {getDisplayCity(album.city)} · {formatPublicDate(album.event_date)}
      </p>
      <h1 className="font-display mt-4 max-w-4xl text-5xl font-semibold leading-[0.92] text-[var(--color-ink)] md:text-6xl">
        {album.title}
      </h1>
      <p className="mt-6 max-w-3xl text-base leading-8 text-[var(--color-copy)]">{album.description}</p>
      {album.treatment_name ? (
        <p className="mt-3 text-sm font-medium text-[var(--color-ink)]">Relacionado con: {album.treatment_name}</p>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-white/60 p-3">
          {activeMedia && getMediaKind(activeMedia) === "video" ? (
            <video src={activeMedia} controls className="h-[460px] w-full rounded-[24px] object-cover" />
          ) : (
            <ImageWithSkeleton src={activeMedia ?? "/doctora/dra5.jpg"} alt={album.title} loading="eager" className="h-[460px] w-full rounded-[24px] object-cover" />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {mediaItems.map((item) => {
            const isVideo = getMediaKind(item.url) === "video";

            return (
              <button
                key={item.url}
                type="button"
                onClick={() => setSelectedMedia(item.url)}
                className="overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-white/60 text-left shadow-[0_14px_34px_rgba(62,42,31,0.06)]"
              >
                {isVideo ? (
                  <video src={item.url} className="h-44 w-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  <ImageWithSkeleton src={item.url} alt={item.label} loading="lazy" className="h-44 w-full object-cover" />
                )}
                <div className="p-4 text-sm leading-6 text-[var(--color-copy)]">{item.label}</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
