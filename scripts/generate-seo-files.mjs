import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());
const publicDir = path.join(projectRoot, "public");
const fallbackSiteUrl = "https://www.draballesteros.com";
const envFiles = [".env.production.local", ".env.production", ".env.local", ".env"];

function readEnvValue(key) {
  for (const filename of envFiles) {
    const filePath = path.join(projectRoot, filename);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) continue;
      const envKey = line.slice(0, separatorIndex).trim();
      if (envKey !== key) continue;
      return line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return undefined;
}

function normalizeSiteUrl(value) {
  const candidate = (value ?? process.env.VITE_SITE_URL ?? fallbackSiteUrl).trim();
  return candidate.replace(/\/+$/, "");
}

const siteUrl = normalizeSiteUrl(readEnvValue("VITE_SITE_URL"));
const today = new Date().toISOString().slice(0, 10);
const routes = [
  "/",
  "/tratamientos",
  "/promociones",
  "/cursos",
  "/libros",
  "/reservar-cita",
  "/agenda",
  "/galeria",
  "/doctoras",
  "/contacto",
];

const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`;

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) => `  <url>
    <loc>${new URL(route, `${siteUrl}/`).toString()}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route === "/" ? "weekly" : "monthly"}</changefreq>
    <priority>${route === "/" ? "1.0" : "0.8"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, "robots.txt"), robotsTxt, "utf8");
fs.writeFileSync(path.join(publicDir, "sitemap.xml"), sitemapXml, "utf8");

console.log(`SEO files generated for ${siteUrl}`);
