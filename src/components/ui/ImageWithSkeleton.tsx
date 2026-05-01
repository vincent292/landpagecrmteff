import { useState, type ImgHTMLAttributes } from "react";

import { ScrollTrigger } from "gsap/ScrollTrigger";

import { cn } from "../../lib/cn";

type ImageWithSkeletonProps = ImgHTMLAttributes<HTMLImageElement> & {
  wrapperClassName?: string;
};

export function ImageWithSkeleton({ className = "", wrapperClassName = "", onLoad, onError, ...props }: ImageWithSkeletonProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={cn("relative min-w-0 max-w-full overflow-hidden bg-[rgba(247,242,236,0.72)]", wrapperClassName)}>
      {!loaded && <div className="skeleton-shimmer absolute inset-0 z-0" />}
      <img
        className={cn("relative z-10 block h-full w-full max-w-full object-cover transition-opacity duration-500", loaded ? "opacity-100" : "opacity-0", className)}
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          setLoaded(true);
          requestAnimationFrame(() => ScrollTrigger.refresh());
          onLoad?.(event);
        }}
        onError={(event) => {
          setLoaded(true);
          onError?.(event);
        }}
        {...props}
      />
    </div>
  );
}
