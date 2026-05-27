import { getPublicMediaUrl } from "./mediaStorageService";
import { uploadPublicFileToR2 } from "./r2PublicUploadService";
import {
  deleteObjectFromR2,
  getPrivateSignedUrlFromR2,
  uploadPrivateFileToR2,
} from "./r2PrivateStorageService";

const publicBuckets = new Set(["public-media", "public-gallery", "book-covers-public"]);
const privateBuckets = new Set([
  "payment-receipts-private",
  "patient-photos-private",
  "book-files-private",
  "medical-files-private",
]);

function isPublicBucket(bucket: string) {
  return publicBuckets.has(bucket);
}

function isPrivateBucket(bucket: string) {
  return privateBuckets.has(bucket);
}

export async function uploadPrivateFile(bucket: string, path: string, file: File) {
  if (!isPrivateBucket(bucket)) {
    throw new Error(`Bucket privado no soportado: ${bucket}`);
  }

  const { key } = await uploadPrivateFileToR2(bucket, path, file);
  return key;
}

export async function uploadPublicFile(bucket: string, path: string, file: File) {
  if (!isPublicBucket(bucket)) {
    throw new Error(`Bucket publico no soportado: ${bucket}`);
  }

  return uploadPublicFileToR2(path, file);
}

export async function uploadPublicFileWithFallback(
  buckets: string[],
  path: string,
  file: File
) {
  let lastError: unknown = null;

  for (const bucket of buckets) {
    if (!isPublicBucket(bucket)) continue;
    try {
      const uploaded = await uploadPublicFile(bucket, path, file);
      return { bucket, ...uploaded };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("No se pudo subir la imagen al almacenamiento público.");
}

export async function getSignedUrl(bucket: string, path: string, expiresIn = 60 * 10) {
  if (isPublicBucket(bucket)) {
    return getPublicMediaUrl(path) ?? path;
  }

  if (!isPrivateBucket(bucket)) {
    throw new Error(`Bucket privado no soportado: ${bucket}`);
  }

  const { signedUrl } = await getPrivateSignedUrlFromR2(bucket, path, expiresIn);
  return signedUrl;
}

export async function deleteFile(bucket: string, path: string) {
  if (!isPublicBucket(bucket) && !isPrivateBucket(bucket)) {
    throw new Error(`Bucket no soportado: ${bucket}`);
  }

  await deleteObjectFromR2(bucket, path);
}

export async function uploadImage(bucket: string, path: string, file: File) {
  const { path: uploadedPath } = await uploadPublicFile(bucket, path, file);
  return uploadedPath;
}
