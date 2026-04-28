import { useEffect, useState } from "react";

import { Navigate, useParams } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { getGalleryAlbumBySlug, type GalleryAlbumRow } from "../../services/galleryService";

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

  if (!slug) return <Navigate to="/galeria" replace />;
  if (loading) return <section className="mx-auto max-w-7xl px-6 py-16"><LoadingState /></section>;
  if (error) return <section className="mx-auto max-w-7xl px-6 py-16"><ErrorState /></section>;
  if (!album) return <section className="mx-auto max-w-7xl px-6 py-16"><EmptyState label="No encontramos este álbum." /></section>;

  const images = [album.cover_image ?? "/doctora/dra5.jpg", ...(album.gallery_images?.map((image) => image.image_url) ?? [])];

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:px-8 md:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-accent-strong)]">{album.city} · {album.event_date}</p>
      <h1 className="font-display mt-4 max-w-4xl text-6xl font-semibold leading-[0.9]">{album.title}</h1>
      <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--color-copy)]">{album.description}</p>
      <div className="mt-10 overflow-hidden rounded-[32px] border border-[var(--color-border)] bg-white/60 p-3">
        <Swiper spaceBetween={12} slidesPerView={1.1} breakpoints={{ 768: { slidesPerView: 2.2 } }}>
          {images.map((image) => (
            <SwiperSlide key={image}>
              <img src={image} alt={album.title} className="h-96 w-full rounded-[24px] object-cover" />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image) => (
          <img key={image} src={image} alt={album.title} className="h-72 rounded-[24px] object-cover" />
        ))}
      </div>
    </section>
  );
}
