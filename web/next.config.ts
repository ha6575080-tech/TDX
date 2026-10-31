import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://vercel.live; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vercel.live; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; media-src 'self' blob: https://*.supabase.co; worker-src 'self' blob:; frame-src https://vercel.live; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" },
      ],
    }];
  },
};

export default nextConfig;
