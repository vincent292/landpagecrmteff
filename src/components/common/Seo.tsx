import { useEffect } from "react";

import { buildCanonicalUrl } from "../../lib/siteUrl";

type SeoProps = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  keywords?: string[];
  type?: "website" | "article";
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
};

const defaultKeywords = [
  "Dra. Estefany Ballesteros",
  "medicina estetica",
  "medicina estetica ortomolecular",
  "tratamientos esteticos",
  "agenda estetica",
  "galeria antes y despues",
  "cursos estetica Bolivia",
  "Cochabamba",
  "Bolivia",
];

export function Seo({ title, description, path = "/", image = "/doctora/dra1.jpg", keywords = [], type = "website", jsonLd }: SeoProps) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const canonicalUrl = buildCanonicalUrl(path);
    const imageUrl = new URL(image, canonicalUrl).toString();
    const mergedKeywords = [...new Set([...defaultKeywords, ...keywords])];

    document.title = title;
    document.documentElement.lang = "es";

    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", "index,follow,max-image-preview:large");
    upsertMeta("property", "og:locale", "es_BO");
    upsertMeta("property", "og:type", type);
    upsertMeta("property", "og:site_name", "Dra. Estefany Ballesteros");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonicalUrl);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:image:alt", title);
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", imageUrl);
    upsertLink("canonical", canonicalUrl);

    const payload = Array.isArray(jsonLd)
      ? jsonLd
      : jsonLd
        ? [jsonLd]
        : [
            {
              "@context": "https://schema.org",
              "@type": "MedicalBusiness",
              name: "Dra. Estefany Ballesteros",
              url: canonicalUrl,
              image: imageUrl,
              description,
              areaServed: "Bolivia",
              medicalSpecialty: "Aesthetic Medicine",
              keywords: mergedKeywords,
            },
          ];

    upsertJsonLd(payload);
  }, [description, image, jsonLd, keywords, path, title, type]);

  return null;
}

function upsertMeta(attribute: "name" | "property", key: string, value: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", value);
}

function upsertLink(rel: string, href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", rel);
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

function upsertJsonLd(payload: Array<Record<string, unknown>>) {
  const id = "app-seo-jsonld";
  let script = document.head.querySelector<HTMLScriptElement>(`script#${id}`);
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(payload.length === 1 ? payload[0] : payload);
}
