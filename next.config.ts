import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Publish only environment identity, never a server credential. Preview must
    // explicitly name its isolated backend before any browser/server client runs.
    NEXT_PUBLIC_DEPLOYMENT_ENV: process.env.VERCEL_ENV ?? "development",
    NEXT_PUBLIC_PREVIEW_SUPABASE_REF: process.env.PREVIEW_SUPABASE_REF ?? "",
  },
  async headers() {
    return [
      {
        source: "/auth/verify",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
