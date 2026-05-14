export type ImageOptimizationResult = {
  file: File;
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  converted: boolean;
};

export type ImageCropSettings = {
  aspectRatio?: number;
  positionX?: number;
  positionY?: number;
  zoom?: number;
};

export type ImageOptimizationOptions = ImageCropSettings & {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputName?: string;
  preserveOriginal?: boolean;
};

const webpMime = "image/webp";

export function canOptimizeImage(file: File) {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") &&
    file.type !== "image/svg+xml" &&
    file.type !== "image/gif" &&
    !lowerName.endsWith(".svg") &&
    !lowerName.endsWith(".gif")
  );
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function optimizeImageFile(
  file: File,
  options: ImageOptimizationOptions = {}
): Promise<ImageOptimizationResult> {
  if (options.preserveOriginal || !canOptimizeImage(file)) {
    return {
      file,
      originalBytes: file.size,
      optimizedBytes: file.size,
      width: 0,
      height: 0,
      converted: false,
    };
  }

  const image = await loadImage(file);
  const quality = options.quality ?? 0.82;
  const maxWidth = options.maxWidth ?? 1600;
  const maxHeight = options.maxHeight ?? 2000;
  const crop = getCropRect(image.width, image.height, options);
  const target = getTargetSize(crop.width, crop.height, maxWidth, maxHeight);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("No pudimos preparar la imagen.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    target.width,
    target.height
  );

  const blob = await canvasToBlob(canvas, webpMime, quality);
  const finalBlob = blob.size < file.size ? blob : file;
  const outputName = options.outputName ?? file.name.replace(/\.[^.]+$/, "");
  const optimizedFile =
    finalBlob instanceof File
      ? finalBlob
      : new File([finalBlob], `${outputName}.webp`, { type: webpMime });

  return {
    file: optimizedFile,
    originalBytes: file.size,
    optimizedBytes: optimizedFile.size,
    width: target.width,
    height: target.height,
    converted: optimizedFile !== file,
  };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No pudimos leer la imagen."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No pudimos optimizar la imagen."));
          return;
        }
        resolve(blob);
      },
      mime,
      quality
    );
  });
}

function getTargetSize(width: number, height: number, maxWidth: number, maxHeight: number) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function getCropRect(
  imageWidth: number,
  imageHeight: number,
  settings: ImageCropSettings
) {
  const aspectRatio = settings.aspectRatio;
  const zoom = Math.max(1, settings.zoom ?? 1);
  const positionX = clamp(settings.positionX ?? 50, 0, 100) / 100;
  const positionY = clamp(settings.positionY ?? 50, 0, 100) / 100;

  if (!aspectRatio) {
    const width = imageWidth / zoom;
    const height = imageHeight / zoom;
    return {
      x: (imageWidth - width) * positionX,
      y: (imageHeight - height) * positionY,
      width,
      height,
    };
  }

  const imageRatio = imageWidth / imageHeight;
  let cropWidth = imageWidth;
  let cropHeight = imageHeight;

  if (imageRatio > aspectRatio) {
    cropWidth = imageHeight * aspectRatio;
  } else {
    cropHeight = imageWidth / aspectRatio;
  }

  cropWidth /= zoom;
  cropHeight /= zoom;

  return {
    x: (imageWidth - cropWidth) * positionX,
    y: (imageHeight - cropHeight) * positionY,
    width: cropWidth,
    height: cropHeight,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
