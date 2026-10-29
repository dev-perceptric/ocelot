import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { SITEMAP_PARTS } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/employer", "/admin", "/auth", "/api", "/login"] },
    sitemap: Array.from({ length: SITEMAP_PARTS }, (_, i) => `${SITE_URL}/sitemap/${i}.xml`),
  };
}
