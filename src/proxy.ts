import { NextResponse, type NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { STATIC_SECURITY_HEADERS, buildCsp, newNonce } from "@/lib/security/headers";

/** Per-request CSP nonce and security headers for every page (ATLAS-001 FR-57). */
export function proxy(request: NextRequest): NextResponse {
  const nonce = newNonce();
  const csp = buildCsp({
    nonce,
    apiOrigin: new URL(getEnv().apiBaseUrl).origin,
    development: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const [name, value] of STATIC_SECURITY_HEADERS) response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
