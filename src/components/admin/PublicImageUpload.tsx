import { useState } from "react";

import { ImageUp } from "lucide-react";

import { uploadPublicFile } from "../../services/storageService";

type PublicImageUploadProps = {
  label: string;
  value?: string | null;
  folder: string;
  helperText?: string;
  onChange: (url: string) => void;
};

const bucket = "public-media";

function isExternalInstagramCdn(url?: string | null) {
  if (!url) return false;

  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("instagram.") || host.includes("fbcdn.net");
  } catch {
    return false;
  }
}

export function PublicImageUpload({ label, value, folder, helperText, onChange }: PublicImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const showExternalWarning = isExternalInstagramCdn(value);

  const upload = async (file?: File) => {
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${folder}/${crypto.randomUUID()}.${ext}`;
      const { publicUrl } = await uploadPublicFile(bucket, path, file);
      onChange(publicUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No se pudo subir la imagen.");
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
      {value ? <img src={value} alt={label} className="h-44 w-full rounded-[18px] object-cover" /> : null}
      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-5 py-3 text-sm font-semibold">
        <ImageUp className="h-4 w-4" />
        {uploading ? "Subiendo..." : "Subir imagen"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => void upload(event.target.files?.[0])}
        />
      </label>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
