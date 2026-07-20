import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Served behind the backend's public tunnel under /liff (see main.ts's
  // http-proxy-middleware) — a free tunnel account only gets one stable
  // public hostname, so this app and the backend share it via path prefix
  // instead of each getting its own tunnel.
  basePath: "/liff",
  // Next dev mode blocks requests to its own dev resources (HMR socket,
  // and this breaks chunk loading badly enough to prevent the whole app
  // from hydrating) when the Origin isn't localhost — required since we're
  // accessed through a public tunnel hostname instead. Update this if the
  // tunnel hostname changes (ephemeral on the free tier).
  allowedDevOrigins: ["facial-thee-penetration-unknown.trycloudflare.com"],
};

export default nextConfig;
