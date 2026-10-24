import type { NextConfig } from "next";

import { readEnv } from "./src/lib/env";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security/headers";

// Fail fast at build and dev start if the public configuration is invalid (FR-53).
readEnv(process.env);

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Pages get the CSP nonce and these headers from src/proxy.ts; static assets get the static set here.
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS.map(([key, value]) => ({ key, value })) }];
  },
};

export default config;
