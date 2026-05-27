import { useMemo, useState } from "react";

import { ArrowDown, ArrowUp, Film, ImagePlus, Trash2 } from "lucide-react";

import { getPublicMediaUrl } from "../../services/mediaStorageService";
import { uploadPublicFileToR2 } from "../../services/r2PublicUploadService";
import type { GalleryDisplayMode, GalleryMediaRow } from "../../services/galleryService";

type GalleryMediaEditorProps = {
  mode: GalleryDisplayMode;
  baseFolder: string;
  items: GalleryMediaRow[];
  onChange: (items: GalleryMediaRow[]) => void;
};

function buildUploadPath(baseFolder: string, file: File) {
  const extension = file.name.split(".").pop() || (file.type.startsWith("video/") ? "mp4" : "jpg");
  const folder = baseFolder.replace(/^\/+|\/+$/g, "");
  return `${folder}/${crypto.randomUUID()}.${extension}`;
}

function normalizeOrder(items: GalleryMediaRow[]) {
  return items.map((item, index) => ({ ...item, display_order: index }));
}

export function GalleryMediaEditor({
  mode,
  baseFolder,
  items,
  onChange,
}: GalleryMediaEditorProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const orderedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)
      ),
    [items]
  );

  const updateItems = (next: GalleryMediaRow[]) => {
    onChange(normalizeOrder(next));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");

    try {
      const uploadedItems: GalleryMediaRow[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await uploadPublicFileToR2(buildUploadPath(baseFolder, file), file);
        uploadedItems.push({
          image_url: uploaded.path,
          media_type: file.type.startsWith("video/") ? "video" : "image",
          caption: "",
          alt_text: "",
          display_order: orderedItems.length + uploadedItems.length,
        });
      }

      if (mode === "comparison") {
        const comparisonItems = [...orderedItems, ...uploadedItems.filter((item) => item.media_type !== "video")].slice(0, 2);
        updateItems(
          comparisonItems.map((item, index) => ({
            ...item,
            caption: item.caption || (index === 0 ? "Antes" : "Despues"),
          }))
        );
      } else {
        updateItems([...orderedItems, ...uploadedItems]);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No pudimos subir el archivo.");
    } finally {
      setUploading(false);
    }
  };

  const replaceComparisonSlot = async (slotIndex: number, file?: File) => {
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      const uploaded = await uploadPublicFileToR2(buildUploadPath(baseFolder, file), file);
      const next = [...orderedItems];
      next[slotIndex] = {
        image_url: uploaded.path,
        media_type: "image",
        caption: next[slotIndex]?.caption || (slotIndex === 0 ? "Antes" : "Despues"),
        alt_text: next[slotIndex]?.alt_text || "",
        display_order: slotIndex,
      };
      updateItems(next.filter(Boolean));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No pudimos subir la imagen de comparacion.");
    } finally {
      setUploading(false);
    }
  };

  const updateItem = (index: number, patch: Partial<GalleryMediaRow>) => {
    const next = orderedItems.map((item, currentIndex) =>
      currentIndex === index ? { ...item, ...patch } : item
    );
    updateItems(next);
  };

  const removeItem = (index: number) => {
    updateItems(orderedItems.filter((_, currentIndex) => currentIndex !== index));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= orderedItems.length) return;

    const next = [...orderedItems];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateItems(next);
  };

  if (mode === "comparison") {
    const comparisonSlots = [orderedItems[0] ?? null, orderedItems[1] ?? null];

    return (
      <section className="mt-8 rounded-[24px] border border-[var(--color-border)] bg-white/65 p-4 md:p-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Comparacion antes y despues</p>
          <p className="text-xs leading-6 text-[var(--color-copy)]">
            Sube dos imagenes publicas. La landing mostrara un deslizador central para revelar la segunda foto.
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {comparisonSlots.map((item, index) => (
            <div key={`comparison-slot-${index}`} className="rounded-[22px] border border-[rgba(198,162,123,0.18)] bg-[rgba(247,242,236,0.72)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent-strong)]">
                {index === 0 ? "Antes" : "Despues"}
              </p>
              <div className="mt-3 overflow-hidden rounded-[18px] bg-white/70">
                {item?.image_url ? (
                  <img
                    src={getPublicMediaUrl(item.image_url) ?? item.image_url}
                    alt={item.caption ?? (index === 0 ? "Antes" : "Despues")}
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-56 items-center justify-center text-sm text-[var(--color-copy)]">
                    Aun no hay imagen.
                  </div>
                )}
              </div>

              <label className="mt-4 inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-semibold">
                <ImagePlus className="h-4 w-4" />
                {uploading ? "Subiendo..." : item ? "Reemplazar imagen" : "Subir imagen"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={uploading}
                  onChange={(event) => void replaceComparisonSlot(index, event.target.files?.[0])}
                />
              </label>

              <label className="mt-4 grid gap-2">
                <span className="text-sm font-semibold">Etiqueta visible</span>
                <input
                  value={item?.caption ?? (index === 0 ? "Antes" : "Despues")}
                  onChange={(event) => updateItem(index, { caption: event.target.value })}
                  className="premium-input"
                />
              </label>
              <label className="mt-4 grid gap-2">
                <span className="text-sm font-semibold">Texto alternativo</span>
                <input
                  value={item?.alt_text ?? ""}
                  onChange={(event) => updateItem(index, { alt_text: event.target.value })}
                  className="premium-input"
                />
              </label>
            </div>
          ))}
        </div>

        {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-[24px] border border-[var(--color-border)] bg-white/65 p-4 md:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">Carrusel publico</p>
          <p className="mt-1 text-xs leading-6 text-[var(--color-copy)]">
            Sube varias imagenes o videos. En la landing y la galeria se mostraran como carrusel.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2.5 text-sm font-semibold text-white">
          <ImagePlus className="h-4 w-4" />
          {uploading ? "Subiendo..." : "Agregar media"}
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => void uploadFiles(event.target.files)}
          />
        </label>
      </div>

      <div className="mt-5 grid gap-4">
        {orderedItems.map((item, index) => {
          const previewUrl = getPublicMediaUrl(item.image_url) ?? item.image_url;
          const isVideo = item.media_type === "video";

          return (
            <div key={`${item.image_url}-${index}`} className="rounded-[20px] border border-[rgba(198,162,123,0.18)] bg-[rgba(247,242,236,0.72)] p-4">
              <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)_auto]">
                <div className="overflow-hidden rounded-[18px] bg-white/70">
                  {isVideo ? (
                    <video src={previewUrl} className="h-40 w-full object-cover" muted playsInline preload="metadata" />
                  ) : (
                    <img src={previewUrl} alt={item.caption ?? "Imagen de galeria"} className="h-40 w-full object-cover" />
                  )}
                </div>

                <div className="grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">Caption</span>
                    <input
                      value={item.caption ?? ""}
                      onChange={(event) => updateItem(index, { caption: event.target.value })}
                      className="premium-input"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold">Texto alternativo</span>
                    <input
                      value={item.alt_text ?? ""}
                      onChange={(event) => updateItem(index, { alt_text: event.target.value })}
                      className="premium-input"
                    />
                  </label>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
                    {isVideo ? <Film className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
                    {isVideo ? "Video" : "Imagen"}
                  </div>
                </div>

                <div className="flex gap-2 lg:flex-col">
                  <button
                    type="button"
                    onClick={() => moveItem(index, -1)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-white"
                    title="Mover arriba"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(index, 1)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] bg-white"
                    title="Mover abajo"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-red-200 bg-white text-red-700"
                    title="Quitar media"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {orderedItems.length === 0 ? (
        <div className="mt-5 rounded-[20px] border border-dashed border-[var(--color-border)] bg-white/60 p-5 text-sm text-[var(--color-copy)]">
          Todavia no hay archivos en este carrusel.
        </div>
      ) : null}
      {error ? <p className="mt-4 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}
