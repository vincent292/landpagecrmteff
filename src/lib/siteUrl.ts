const fallbackSiteUrl = "https://draestefanyballesteros.com";

function normalizeSiteUrl(value?: string | null) {
  const candidate = (value ?? "").trim();
  if (!candidate) return fallbackSiteUrl;
  return candidate.replace(/\/+$/, "");
}

export const siteUrl = normalizeSiteUrl(import.meta.env.VITE_SITE_URL);

export function buildCanonicalUrl(path = "/") {
  return new URL(path, `${siteUrl}/`).toString();
}
