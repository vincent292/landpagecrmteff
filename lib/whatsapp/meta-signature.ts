import { createHmac, timingSafeEqual } from "node:crypto";

type SignatureVerificationResult =
  | { configured: false; valid: false; reason: "missing_app_secret" }
  | { configured: true; valid: false; reason: "missing_signature" | "invalid_format" | "invalid_signature" }
  | { configured: true; valid: true; reason: "valid" };

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (!appSecret) {
    return { configured: false, valid: false, reason: "missing_app_secret" } satisfies SignatureVerificationResult;
  }

  if (!signatureHeader) {
    return { configured: true, valid: false, reason: "missing_signature" } satisfies SignatureVerificationResult;
  }

  const [algorithm, signature] = signatureHeader.split("=");

  if (algorithm !== "sha256" || !signature) {
    return { configured: true, valid: false, reason: "invalid_format" } satisfies SignatureVerificationResult;
  }

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(signature, "hex");

  if (expectedBuffer.length !== signatureBuffer.length) {
    return { configured: true, valid: false, reason: "invalid_signature" } satisfies SignatureVerificationResult;
  }

  if (!timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return { configured: true, valid: false, reason: "invalid_signature" } satisfies SignatureVerificationResult;
  }

  return { configured: true, valid: true, reason: "valid" } satisfies SignatureVerificationResult;
}
