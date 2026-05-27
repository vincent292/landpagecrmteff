import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { BeforeAfterSlider } from "../../components/ui/BeforeAfterSlider";
import { GalleryCarousel } from "../../components/ui/GalleryCarousel";
import { ImageWithSkeleton } from "../../components/ui/ImageWithSkeleton";
import { getGalleryAlbumBySlug, getGalleryMediaItems, type GalleryAlbumRow } from "../../services/galleryService";
import { getMediaKind } from "../../services/mediaStorageService";
import { formatPublicDate, getDisplayCity } from "../../utils/publicContent";

type DetailMediaItem = {
  url: string;
  label: string;
  mediaType: string;
};

function getComparisonStageLabel(index: number) {
  return index === 0 ? "Antes" : "Despues";
}

function getComparisonCardTitle(index: number, item: DetailMediaItem) {
  const stage = getComparisonStageLabel(index);
  const normalized = item.label.trim();
  if (!normalized) return stage;
  if (normalized.toLowerCase() === stage.toLowerCase()) return stage;
  return normalized;
}

function getComparisonCardDescription(index: number, item: DetailMediaItem, album: GalleryAlbumRow) {
  const stage = getComparisonStageLabel(index);
  const normalized = item.label.trim();
  if (normalized && normalized.toLowerCase() !== stage.toLowerCase()) {
    return normalized;
  }

  if (album.treatment_name?.trim()) {
    return `${stage} del proceso relacionado con ${album.treatment_name}.`;
  }

  return `${stage} de la comparacion autorizada publicada en esta galeria.`;
}

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

  const mediaItems: DetailMediaItem[] = album
    ? getGalleryMediaItems(album).map((item) => ({
        url: item.image_url,
        label: item.caption ?? item.alt_text ?? album.title,
        mediaType: item.media_type ?? "image",
      }))
    : [];
  const comparisonItems = mediaItems.filter((item) => item.mediaType !== "video").slice(0, 2);
  const isComparison = album?.display_mode === "comparison" && comparisonItems.length >= 2;

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

      {isComparison ? (
        <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="rounded-[34px] border border-[var(--color-border)] bg-white/68 p-4 shadow-[0_26px_70px_rgba(62,42,31,0.08)] md:p-5">
            <BeforeAfterSlider
              beforeSrc={comparisonItems[0].url}
              afterSrc={comparisonItems[1].url}
              beforeLabel={getComparisonStageLabel(0)}
              afterLabel={getComparisonStageLabel(1)}
              className="aspect-[16/11] w-full rounded-[26px]"
            />
            <div className="mt-5 flex flex-col gap-3 rounded-[24px] bg-[rgba(247,242,236,0.78)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                  Comparacion interactiva
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-copy)]">
                  Mueve la barra central para revelar el cambio entre ambas etapas y comparar el resultado de forma natural.
                </p>
              </div>
              <div className="flex gap-2">
                <span className="rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-mocha)]">
                  {getComparisonStageLabel(0)}
                </span>
                <span className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                  {getComparisonStageLabel(1)}
                </span>
              </div>
            </div>
          </div>

          <aside className="rounded-[34px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.84)] p-6 shadow-[0_22px_60px_rgba(62,42,31,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
              Resumen del caso
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--color-copy)]">
              {album.description || "Comparacion publica autorizada para mostrar el contraste visual entre dos momentos del proceso."}
            </p>

            <div className="mt-6 grid gap-3">
              <InfoCard label="Categoria" value={album.category ?? "Galeria"} />
              <InfoCard label="Ciudad" value={getDisplayCity(album.city)} />
              <InfoCard label="Fecha" value={formatPublicDate(album.event_date)} />
              {album.treatment_name ? <InfoCard label="Tratamiento" value={album.treatment_name} /> : null}
            </div>
          </aside>

          <div className="xl:col-span-2">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">
                Tomas individuales
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-[var(--color-ink)]">Cada etapa por separado</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-copy)]">
                Debajo puedes revisar cada imagen sin la superposicion del deslizador para observar mejor los detalles de ambos momentos.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {comparisonItems.map((item, index) => (
                <article
                  key={item.url}
                  className="overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/65 shadow-[0_16px_46px_rgba(62,42,31,0.08)]"
                >
                  <ImageWithSkeleton
                    src={item.url}
                    alt={getComparisonCardTitle(index, item)}
                    loading="lazy"
                    className="aspect-[4/5] w-full object-cover"
                  />
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">
                      {getComparisonStageLabel(index)}
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">
                      {getComparisonCardTitle(index, item)}
                    </h3>
                    <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">
                      {getComparisonCardDescription(index, item, album)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-6 max-w-3xl text-base leading-8 text-[var(--color-copy)]">{album.description}</p>
          {album.treatment_name ? (
            <p className="mt-3 text-sm font-medium text-[var(--color-ink)]">Relacionado con: {album.treatment_name}</p>
          ) : null}

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-white/60 p-3">
              {mediaItems.length > 0 ? (
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
              {mediaItems.map((item) => {
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
                    <div className="p-4 text-sm leading-6 text-[var(--color-copy)]">{item.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[rgba(198,162,123,0.16)] bg-white/75 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}
