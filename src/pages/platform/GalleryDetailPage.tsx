import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { BeforeAfterSlider } from "../../components/ui/BeforeAfterSlider";
import { GalleryCarousel } from "../../components/ui/GalleryCarousel";
import { ImageWithSkeleton } from "../../components/ui/ImageWithSkeleton";
import { getGalleryAlbumBySlug, getGalleryMediaItems, type GalleryAlbumRow } from "../../services/galleryService";
import { getMediaKind } from "../../services/mediaStorageService";
import { formatPublicDate, getDisplayCity } from "../../utils/publicContent";

export function GalleryDetailPage() {
  const { slug } = useParams();
  const [album, setAlbum] = useState<GalleryAlbumRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getGalleryAlbumBySlug(slug)
      .then(setAlbum)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const mediaItems = album
    ? getGalleryMediaItems(album).map((item) => ({
        url: item.image_url,
        label: item.caption ?? item.alt_text ?? album.title,
        mediaType: item.media_type ?? "image",
      }))
    : [];
  const comparisonItems = mediaItems.filter((item) => item.mediaType !== "video").slice(0, 2);

  if (!slug) return <Navigate to="/galeria" replace />;
  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16"><LoadingState /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16"><ErrorState /></section>;
  if (!album) return <section className="mx-auto max-w-7xl px-6 py-16"><EmptyState label="No encontramos este album." /></section>;

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
          {album.display_mode === "comparison" && comparisonItems.length >= 2 ? (
            <BeforeAfterSlider
              beforeSrc={comparisonItems[0].url}
              afterSrc={comparisonItems[1].url}
              beforeLabel={comparisonItems[0].label || "Antes"}
              afterLabel={comparisonItems[1].label || "Despues"}
              className="h-[460px] w-full rounded-[24px]"
            />
          ) : mediaItems.length > 0 ? (
            <GalleryCarousel
              items={mediaItems.map((item) => ({ url: item.url, label: item.label }))}
              className="h-[460px] w-full rounded-[24px]"
              mediaClassName="h-[460px] w-full rounded-[24px] object-cover"
            />
          ) : (
            <ImageWithSkeleton src={album.cover_image ?? "/doctora/dra5.jpg"} alt={album.title} loading="eager" className="h-[460px] w-full rounded-[24px] object-cover" />
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {(album.display_mode === "comparison" ? comparisonItems : mediaItems).map((item, index) => {
            const isVideo = getMediaKind(item.url) === "video";

            return (
              <div
                key={item.url}
                className="overflow-hidden rounded-[26px] border border-[var(--color-border)] bg-white/60 text-left shadow-[0_14px_34px_rgba(62,42,31,0.06)]"
              >
                {isVideo ? (
                  <video src={item.url} className="h-44 w-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  <ImageWithSkeleton src={item.url} alt={item.label} loading="lazy" className="h-44 w-full object-cover" />
                )}
                <div className="p-4 text-sm leading-6 text-[var(--color-copy)]">
                  {album.display_mode === "comparison" ? `${index === 0 ? "Antes" : "Despues"} · ` : ""}
                  {item.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
