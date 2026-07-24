import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only set in the production Docker build (see Dockerfile) — proxied
  // behind the backend's public domain under /admin (see main.ts), the same
  // way apps/liff-app is served under /liff. Left unset for local dev so
  // `npm run dev:web-admin` keeps working at the bare http://localhost:3000
  // root, same as always.
  basePath: process.env.NEXT_BASE_PATH || undefined,
};

export default nextConfig;
