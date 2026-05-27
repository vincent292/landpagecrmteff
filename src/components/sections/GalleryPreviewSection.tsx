import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getGalleryAlbums, getGalleryMediaItems, type GalleryAlbumRow } from "../../services/galleryService";
import { getMediaKind } from "../../services/mediaStorageService";
import { formatPublicDate, getDisplayCity } from "../../utils/publicContent";
import { BeforeAfterSlider } from "../ui/BeforeAfterSlider";
import { GalleryCarousel } from "../ui/GalleryCarousel";
import { ImageWithSkeleton } from "../ui/ImageWithSkeleton";
import { SectionHeading } from "../ui/SectionHeading";
import { SectionReveal } from "../ui/SectionReveal";

export function GalleryPreviewSection() {
  const [albums, setAlbums] = useState<GalleryAlbumRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getGalleryAlbums()
      .then((rows) => setAlbums(rows.slice(0, 3)))
      .finally(() => setLoaded(true));
  }, []);

  if (loaded && albums.length === 0) return null;

  return (
    <SectionReveal id="galeria-destacada" className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-28">
      <SectionHeading
        eyebrow="Galeria"
        title="Momentos compartidos de jornadas, cursos y resultados autorizados."
        description="La galeria publica se organiza desde el panel para mostrar carruseles y comparaciones autorizadas."
        align="center"
      />

      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {albums.map((album) => {
          const previewMedia = album.video_url ?? album.cover_image;
          const isVideo = getMediaKind(previewMedia) === "video";
          const mediaItems = getGalleryMediaItems(album);
          const comparisonItems = mediaItems.filter((item) => item.media_type !== "video").slice(0, 2);

          return (
            <article
              key={album.id}
              data-reveal
              className="group overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.76)] shadow-[0_18px_50px_rgba(62,42,31,0.08)]"
            >
              {album.display_mode === "comparison" && comparisonItems.length >= 2 ? (
                <BeforeAfterSlider
                  beforeSrc={comparisonItems[0].image_url}
                  afterSrc={comparisonItems[1].image_url}
                  beforeLabel={comparisonItems[0].caption ?? "Antes"}
                  afterLabel={comparisonItems[1].caption ?? "Despues"}
                  className="h-72 w-full"
                  imageClassName="transition duration-700 group-hover:scale-[1.02]"
                />
              ) : mediaItems.length > 0 ? (
                <GalleryCarousel
                  items={mediaItems.map((item) => ({
                    url: item.image_url,
                    label: item.caption ?? item.alt_text ?? album.title,
                  }))}
                  className="h-72 w-full"
                  mediaClassName="h-72 w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                />
              ) : isVideo && previewMedia ? (
                <video
                  src={previewMedia}
                  className="h-72 w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <ImageWithSkeleton
                  src={album.cover_image ?? "/doctora/dra5.jpg"}
                  alt={album.title}
                  loading="lazy"
                  className="h-72 w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                />
              )}
              <div className="p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">
                  {album.category ?? "Galeria"} · {getDisplayCity(album.city)} · {formatPublicDate(album.event_date)}
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">{album.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{album.description}</p>
                <div className="mt-4">
                  <Link to={`/galeria/${album.slug}`} className="inline-flex rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
                    Abrir
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-10 flex justify-center">
        <Link data-reveal to="/galeria" className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white">
          Ver mas
        </Link>
      </div>
    </SectionReveal>
  );
}
