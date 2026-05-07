import { useEffect, useState, type ImgHTMLAttributes } from "react";

import { ScrollTrigger } from "gsap/ScrollTrigger";

import { cn } from "../../lib/cn";

type ImageWithSkeletonProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
  fallbackSrc?: string;
};

export function ImageWithSkeleton({
  className = "",
  wrapperClassName = "",
  fallbackSrc,
  onLoad,
  onError,
  src,
  ...props
}: ImageWithSkeletonProps) {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setLoaded(false);
    setCurrentSrc(src);
  }, [src]);

  return (
    <div className={cn("relative min-w-0 max-w-full overflow-hidden bg-[rgba(247,242,236,0.72)]", wrapperClassName)}>
      {!loaded && <div className="skeleton-shimmer absolute inset-0 z-0" />}
      <img
        className={cn("relative z-10 block h-full w-full max-w-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0", className)}
        loading="lazy"
        decoding="async"
        src={currentSrc}
        onLoad={(event) => {
          setLoaded(true);
          requestAnimationFrame(() => ScrollTrigger.refresh());
          onLoad?.(event);
        }}
        onError={(event) => {
          if (fallbackSrc && currentSrc !== fallbackSrc) {
            setCurrentSrc(fallbackSrc);
            return;
          }
          setLoaded(true);
          onError?.(event);
        }}
        {...props}
      />
    </div>
  );
}
