/**
 * Security headers and Content Security Policy (ATLAS-001 FR-57). The CSP uses a per-request nonce with
 * 'strict-dynamic' for scripts: no 'unsafe-eval' and no 'unsafe-inline' scripts in production. Development
 * adds only what Next.js needs for hot reload ('unsafe-eval', websocket), never in a production build.
 */

export interface CspOptions {
  readonly nonce: string;
  /** Origin of the Atlas API (connect-src). */
  readonly apiOrigin: string;
  readonly development: boolean;
}

export function buildCsp({ nonce, apiOrigin, development }: CspOptions): string {
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(development ? ["'unsafe-eval'"] : []),
  ];
  const connect = ["'self'", apiOrigin, ...(development ? ["ws:"] : [])];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": script,
    "style-src": ["'self'", `'nonce-${nonce}'`],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": connect,
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** Headers for every response (pages via src/proxy.ts; static files via next.config.ts). */
export const STATIC_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "no-referrer"],
  ["X-Frame-Options", "DENY"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
];

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
