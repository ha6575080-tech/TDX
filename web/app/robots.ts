import type { MetadataRoute } from "next";
import { PUBLIC_SIGNUP_ENABLED } from "@/lib/pilot-mode";
export default function robots(): MetadataRoute.Robots {
  if (!PUBLIC_SIGNUP_ENABLED) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard", "/profile", "/settings", "/invoice/", "/statement", "/activity", "/tasks", "/goals", "/chat"] } };
}
