import type { MetadataRoute } from "next";

const SITE_URL = "https://reserve-frontend-aizhcwfypa-an.a.run.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
