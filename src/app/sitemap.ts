import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/about", "/help", "/contact", "/privacy", "/terms", "/login", "/signup"].map((p) => ({
    url: `${publicEnv.siteUrl}${p}`,
    changeFrequency: p === "" ? "weekly" : "monthly",
    priority: p === "" ? 1 : 0.5,
  }));
}
