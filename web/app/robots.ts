import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard", "/profile", "/settings", "/invoice/", "/statement", "/activity", "/tasks", "/goals", "/chat"] } };
}
