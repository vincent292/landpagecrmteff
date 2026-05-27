import { useEffect, useState, type ImgHTMLAttributes } from "react";

import { getPublicMediaUrl } from "../../services/mediaStorageService";
import { ImageWithSkeleton } from "./ImageWithSkeleton";

type ContentCoverProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  wrapperClassName?: string;
  label?: string;
  src?: string | null;
};

type StorageRef = {
  bucket: string;
  path: string;
};

function getStorageRef(value?: string | null): StorageRef | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const publicMarker = "/storage/v1/object/public/";
    const signMarker = "/storage/v1/object/sign/";
    const matchedMarker = url.pathname.includes(publicMarker)
      ? publicMarker
      : url.pathname.includes(signMarker)
        ? signMarker
        : null;

    if (!matchedMarker) return null;

    const afterMarker = url.pathname.split(matchedMarker)[1] ?? "";
    const [bucket, ...rest] = afterMarker.split("/");
    const path = rest.join("/");

    if (!bucket || !path) return null;

    return { bucket, path: decodeURIComponent(path) };
  } catch {
    return null;
  }
}

export function ContentCover({
  src,
  alt = "Imagen del contenido",
  className = "",
  wrapperClassName = "",
  label = "Imagen del contenido",
  ...props
}: ContentCoverProps) {
  const [hasError, setHasError] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);
  const [signedAttempted, setSignedAttempted] = useState(false);

  useEffect(() => {
    setHasError(false);
    setSignedAttempted(false);

    const storageRef = getStorageRef(src);
    if (storageRef) {
      setResolvedSrc(getPublicMediaUrl(storageRef.path) ?? src ?? undefined);
      return;
    }

    setResolvedSrc(getPublicMediaUrl(src) ?? src ?? undefined);
  }, [src]);

  if (!src || hasError) {
    return (
      <div
        className={`relative flex min-w-0 max-w-full items-center justify-center overflow-hidden bg-[linear-gradient(135deg,rgba(255,249,244,0.96),rgba(239,229,218,0.94))] ${wrapperClassName}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(255,255,255,0.72),transparent_28%),radial-gradient(circle_at_78%_20%,rgba(198,162,123,0.18),transparent_26%),radial-gradient(circle_at_52%_78%,rgba(111,122,96,0.12),transparent_30%)]" />
        <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
          <div className="rounded-[28px] border border-[var(--color-border)] bg-white/70 p-4 shadow-[0_14px_34px_rgba(110,74,47,0.08)]">
            <img
              src="/doctora/logodra.svg"
              alt="Logo de la doctora"
              className="h-16 w-16 object-contain opacity-90"
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">
            {label}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ImageWithSkeleton
      src={resolvedSrc}
      alt={alt}
      wrapperClassName={wrapperClassName}
      className={className}
      onError={() => {
        if (signedAttempted) return;
        setSignedAttempted(true);
        setHasError(true);
      }}
      {...props}
    />
  );
}
