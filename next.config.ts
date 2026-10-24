import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import type { NextConfig } from "next";

import { readEnv } from "./src/lib/env";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security/headers";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Pages get the CSP nonce and these headers from src/proxy.ts; static assets get the static set here.
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS.map(([key, value]) => ({ key, value })) }];
  },
};

export default function nextConfig(phase: string): NextConfig {
  // Fail fast on invalid public configuration when it is read: dev start and production build (FR-53).
  // A built server needs no env: NEXT_PUBLIC_* values are compiled into the bundle.
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) readEnv(process.env);
  return config;
}
