import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Check, ImageUp, RotateCcw, Upload, X } from "lucide-react";

import { getPublicMediaUrl } from "../../services/mediaStorageService";
import { uploadPublicFileToR2 } from "../../services/r2PublicUploadService";
import {
  canOptimizeImage,
  formatFileSize,
  optimizeImageFile,
  type ImageOptimizationResult,
} from "../../utils/imageOptimizer";

type PublicImageUploadProps = {
  label: string;
  value?: string | null;
  folder: string;
  helperText?: string;
  aspectRatio?: number;
  optimize?: boolean;
  onChange: (url: string) => void;
};

function isExternalInstagramCdn(url?: string | null) {
  if (!url) return false;

  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("instagram.") || host.includes("fbcdn.net");
  } catch {
    return false;
  }
}

function toWebpPath(folder: string) {
  return `${folder}/${crypto.randomUUID()}.webp`;
}

function toOriginalPath(folder: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  return `${folder}/${crypto.randomUUID()}.${ext}`;
}

export function PublicImageUpload({
  label,
  value,
  folder,
  helperText,
  aspectRatio,
  optimize = true,
  onChange,
}: PublicImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [summary, setSummary] = useState<ImageOptimizationResult | null>(null);
  const [crop, setCrop] = useState({ positionX: 50, positionY: 50, zoom: 1 });
  const showExternalWarning = isExternalInstagramCdn(value);
  const canUseEditor = Boolean(selectedFile && optimize && canOptimizeImage(selectedFile));
  const resolvedValue = getPublicMediaUrl(value) ?? value ?? "";

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl("");
      return;
    }

    const nextPreview = URL.createObjectURL(selectedFile);
    setPreviewUrl(nextPreview);
    return () => URL.revokeObjectURL(nextPreview);
  }, [selectedFile]);

  const previewStyle = useMemo(
    () => ({
      objectPosition: `${crop.positionX}% ${crop.positionY}%`,
      transform: `scale(${crop.zoom})`,
    }),
    [crop]
  );

  const handleChooseFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setSummary(null);
    setCrop({ positionX: 50, positionY: 50, zoom: 1 });

    if (!file.type.startsWith("image/")) {
      setError("Solo se permiten imagenes.");
      return;
    }

    if (!optimize || !canOptimizeImage(file)) {
      await upload(file, false);
      return;
    }

    setSelectedFile(file);
  };

  const upload = async (file: File, convertToWebp: boolean) => {
    setUploading(true);
    setError("");
    try {
      const path = convertToWebp ? toWebpPath(folder) : toOriginalPath(folder, file);
      const uploaded = await uploadPublicFileToR2(path, file);
      onChange(uploaded.path);
      setSelectedFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  const uploadOptimized = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError("");
    try {
      const optimized = await optimizeImageFile(selectedFile, {
        aspectRatio,
        positionX: crop.positionX,
        positionY: crop.positionY,
        zoom: crop.zoom,
        quality: 0.82,
        maxWidth: aspectRatio && aspectRatio < 1 ? 1200 : 1600,
        maxHeight: aspectRatio && aspectRatio < 1 ? 1800 : 1400,
      });
      setSummary(optimized);
      const uploaded = await uploadPublicFileToR2(toWebpPath(folder), optimized.file);
      onChange(uploaded.path);
      setSelectedFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo optimizar y subir la imagen.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-3">
      <span className="text-sm font-semibold">{label}</span>
      {helperText ? <span className="text-xs leading-6 text-[var(--color-copy)]">{helperText}</span> : null}
      {showExternalWarning ? (
        <span className="text-xs leading-6 text-amber-800">
          Esta imagen viene desde Instagram/Facebook CDN y puede fallar en el navegador interno de Instagram. Lo recomendable es volver a subirla al almacenamiento del sitio.
        </span>
      ) : null}
      {summary ? (
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[rgba(111,122,96,0.12)] px-3 py-1 text-xs font-semibold text-[var(--color-ink)]">
          <Check className="h-3.5 w-3.5" />
          Optimizada: {formatFileSize(summary.originalBytes)} a {formatFileSize(summary.optimizedBytes)}
        </span>
      ) : null}
      {resolvedValue && !showExternalWarning ? <img src={resolvedValue} alt={label} className="h-44 w-full rounded-[18px] object-cover" /> : null}
      {value && showExternalWarning ? (
        <div className="flex h-44 w-full items-center justify-center rounded-[18px] border border-dashed border-amber-300 bg-amber-50 px-4 text-center text-sm text-amber-800">
          La URL actual de Instagram no permite previsualizacion estable. Vuelve a subir la imagen al almacenamiento del sitio.
        </div>
      ) : null}
      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-5 py-3 text-sm font-semibold">
        <ImageUp className="h-4 w-4" />
        {uploading ? "Procesando..." : optimize ? "Elegir y recortar" : "Subir imagen"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => void handleChooseFile(event.target.files?.[0])}
        />
      </label>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}

      {canUseEditor ? (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/45 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
          <div className="w-full max-w-3xl rounded-[28px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Previsualizacion</p>
                <h3 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{label}</h3>
              </div>
              <button onClick={() => setSelectedFile(null)} className="rounded-full border border-[var(--color-border)] p-2" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_260px]">
              <div className="rounded-[24px] border border-[var(--color-border)] bg-white/70 p-3">
                <div
                  className="mx-auto max-h-[62vh] max-w-full overflow-hidden rounded-[18px] bg-[rgba(247,242,236,0.78)]"
                  style={{ aspectRatio: aspectRatio ? String(aspectRatio) : "4 / 3" }}
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Previsualizacion"
                      className="h-full w-full object-cover"
                      style={previewStyle}
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid content-start gap-4">
                <Control label="Zoom">
                  <input
                    type="range"
                    min="1"
                    max="2.4"
                    step="0.05"
                    value={crop.zoom}
                    onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))}
                    className="w-full"
                  />
                </Control>
                <Control label="Mover horizontal">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={crop.positionX}
                    onChange={(event) => setCrop((current) => ({ ...current, positionX: Number(event.target.value) }))}
                    className="w-full"
                  />
                </Control>
                <Control label="Mover vertical">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={crop.positionY}
                    onChange={(event) => setCrop((current) => ({ ...current, positionY: Number(event.target.value) }))}
                    className="w-full"
                  />
                </Control>
                <div className="rounded-[18px] bg-[rgba(247,242,236,0.82)] p-4 text-xs leading-6 text-[var(--color-copy)]">
                  Original: {selectedFile ? formatFileSize(selectedFile.size) : ""}. Al guardar se sube optimizada en WebP.
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void uploadOptimized()}
                    disabled={uploading}
                    className="inline-flex items-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <Upload className="h-4 w-4" />
                    {uploading ? "Subiendo..." : "Optimizar y subir"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrop({ positionX: 50, positionY: 50, zoom: 1 })}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2.5 text-sm font-semibold"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Centrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Control({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-[var(--color-ink)]">{label}</span>
      {children}
    </label>
  );
}
