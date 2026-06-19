import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { Seo } from "../../components/common/Seo";
import { BeforeAfterSlider } from "../../components/ui/BeforeAfterSlider";
import { GalleryCarousel } from "../../components/ui/GalleryCarousel";
import { ImageWithSkeleton } from "../../components/ui/ImageWithSkeleton";
import { boliviaCities } from "../../data/cities";
import { getGalleryAlbums, getGalleryMediaItems, type GalleryAlbumRow } from "../../services/galleryService";
import { getMediaKind } from "../../services/mediaStorageService";
import { formatPublicDate, getDisplayCity } from "../../utils/publicContent";
import { PageIntro } from "./TreatmentsPage";

const galleryCategories = ["Todas", "Eventos", "Tratamientos", "Cursos", "Testimonios", "Antes y después autorizados", "Videos"];

export function GalleryPage() {
  const [albums, setAlbums] = useState<GalleryAlbumRow[]>([]);
  const [category, setCategory] = useState("Todas");
  const [city, setCity] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getGalleryAlbums()
      .then(setAlbums)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredAlbums = useMemo(
    () =>
      albums.filter((album) => {
        const cityOk = city === "Todas" || getDisplayCity(album.city) === city;
        const albumCategory = album.category ?? (album.video_url ? "Videos" : "Eventos");
        const categoryOk = category === "Todas" || albumCategory === category;
        return cityOk && categoryOk;
      }),
    [albums, category, city]
  );

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <Seo
        title="Galería estética y antes y después | Dra. Estefany Ballesteros"
        description="Explora la galería pública con jornadas, tratamientos, cursos, videos y comparaciones antes y después autorizadas."
        path="/galeria"
        image="/doctora/dra5.jpg"
        keywords={["galería estética", "antes y después autorizados", "casos estéticos Bolivia"]}
      />
      <PageIntro
        eyebrow="Galería"
        title="Contenido público organizado por categorías, ciudades y material autorizado."
        text="La galería distingue jornadas, cursos, tratamientos y comparaciones autorizadas para la parte pública del sitio."
      />

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="premium-input sm:max-w-xs">
          {galleryCategories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select value={city} onChange={(event) => setCity(event.target.value)} className="premium-input sm:max-w-xs">
          <option>Todas</option>
          {boliviaCities.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      <div className="mt-12">
        {loading ? <LoadingState label="Cargando galería..." /> : null}
        {error ? <ErrorState label="No pudimos cargar la galería pública." /> : null}
        {!loading && !error && filteredAlbums.length === 0 ? (
          <EmptyState label="Todavía no hay álbumes públicos para estos filtros." />
        ) : null}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredAlbums.map((album) => {
            const previewMedia = album.video_url ?? album.cover_image;
            const isVideo = getMediaKind(previewMedia) === "video";
            const mediaItems = getGalleryMediaItems(album);
            const comparisonItems = mediaItems.filter((item) => item.media_type !== "video").slice(0, 2);

            return (
              <article key={album.id} className="group overflow-hidden rounded-[30px] border border-[var(--color-border)] bg-white/60 shadow-[0_18px_48px_rgba(110,74,47,0.08)]">
                {album.display_mode === "comparison" && comparisonItems.length >= 2 ? (
                  <BeforeAfterSlider
                    beforeSrc={comparisonItems[0].image_url}
                    afterSrc={comparisonItems[1].image_url}
                    beforeLabel={comparisonItems[0].caption ?? "Antes"}
                    afterLabel={comparisonItems[1].caption ?? "Después"}
                    className="h-80 w-full"
                    imageClassName="transition duration-700 group-hover:scale-[1.02]"
                  />
                ) : mediaItems.length > 0 ? (
                  <GalleryCarousel
                    items={mediaItems.map((item) => ({
                      url: item.image_url,
                      label: item.caption ?? item.alt_text ?? album.title,
                    }))}
                    className="h-80 w-full"
                    mediaClassName="h-80 w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                  />
                ) : isVideo && previewMedia ? (
                  <video src={previewMedia} className="h-80 w-full object-cover transition duration-700 group-hover:scale-[1.02]" muted playsInline preload="metadata" />
                ) : (
                  <ImageWithSkeleton
                    src={album.cover_image ?? "/doctora/dra5.jpg"}
                    alt={album.title}
                    loading="lazy"
                    className="h-80 w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                  />
                )}
                <div className="p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
                    {album.category ?? (album.video_url ? "Videos" : "Eventos")} · {getDisplayCity(album.city)}
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-[var(--color-ink)]">{album.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-[var(--color-copy)]">{album.description}</p>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--color-copy)]">
                    <span>{formatPublicDate(album.event_date)}</span>
                    {album.treatment_name ? <span>{album.treatment_name}</span> : null}
                  </div>
                  <div className="mt-5">
                    <Link to={`/galeria/${album.slug}`} className="inline-flex rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white">
                      Ver detalle
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
