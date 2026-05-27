import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

import { getMediaKind } from "../../services/mediaStorageService";
import { ImageWithSkeleton } from "./ImageWithSkeleton";

type GalleryCarouselItem = {
  url: string;
  label: string;
};

type GalleryCarouselProps = {
  items: GalleryCarouselItem[];
  className?: string;
  mediaClassName?: string;
};

export function GalleryCarousel({
  items,
  className = "",
  mediaClassName = "h-full w-full object-cover",
}: GalleryCarouselProps) {
  if (items.length === 0) return null;

  if (items.length === 1) {
    const item = items[0];
    const isVideo = getMediaKind(item.url) === "video";

    return isVideo ? (
      <video src={item.url} className={`${mediaClassName} ${className}`} controls muted playsInline preload="metadata" />
    ) : (
      <ImageWithSkeleton src={item.url} alt={item.label} loading="lazy" className={`${mediaClassName} ${className}`} />
    );
  }

  return (
    <div className={className}>
      <Swiper spaceBetween={12}>
        {items.map((item) => {
          const isVideo = getMediaKind(item.url) === "video";

          return (
            <SwiperSlide key={item.url}>
              {isVideo ? (
                <video src={item.url} className={mediaClassName} controls muted playsInline preload="metadata" />
              ) : (
                <ImageWithSkeleton src={item.url} alt={item.label} loading="lazy" className={mediaClassName} />
              )}
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
}
