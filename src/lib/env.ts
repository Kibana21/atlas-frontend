/**
 * Public runtime configuration (ATLAS-001 FR-53). Validated at dev start and build (next.config.ts) and
 * on first use. Only NEXT_PUBLIC_* values are read: they are public by definition and must never carry
 * credentials. The API base URL is consumed only by src/lib/api/transport.ts.
 */

export interface AtlasEnv {
  /** Absolute http(s) origin (+ optional path) of the Atlas API, without a trailing slash. */
  readonly apiBaseUrl: string;
  /** Commit SHA of this frontend build, or "unknown" in local development. */
  readonly frontendSha: string;
}

export class EnvError extends Error {
  override readonly name = "EnvError";
}

type Source = Readonly<Record<string, string | undefined>>;

export function readEnv(source: Source): AtlasEnv {
  const problems: string[] = [];
  const rawBase = source.NEXT_PUBLIC_ATLAS_API_BASE_URL?.trim();
  let apiBaseUrl = "";
  if (!rawBase) {
    problems.push("NEXT_PUBLIC_ATLAS_API_BASE_URL is required (e.g. http://127.0.0.1:8100)");
  } else {
    let url: URL | null = null;
    try {
      url = new URL(rawBase);
    } catch {
      problems.push(`NEXT_PUBLIC_ATLAS_API_BASE_URL is not an absolute URL: "${rawBase}"`);
    }
    if (url) {
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        problems.push("NEXT_PUBLIC_ATLAS_API_BASE_URL must use http or https");
      }
      if (url.username || url.password) {
        problems.push("NEXT_PUBLIC_ATLAS_API_BASE_URL must not contain credentials");
      }
      if (url.search || url.hash) {
        problems.push("NEXT_PUBLIC_ATLAS_API_BASE_URL must not contain a query or fragment");
      }
      apiBaseUrl = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
    }
  }
  const frontendSha = source.NEXT_PUBLIC_ATLAS_FRONTEND_SHA?.trim() || "unknown";
  if (frontendSha !== "unknown" && !/^[0-9a-f]{40}$/.test(frontendSha)) {
    problems.push('NEXT_PUBLIC_ATLAS_FRONTEND_SHA must be a full 40-character commit SHA or "unknown"');
  }
  if (problems.length > 0) {
    throw new EnvError(`Invalid Atlas frontend configuration:\n- ${problems.join("\n- ")}`);
  }
  return { apiBaseUrl, frontendSha };
}

let cached: AtlasEnv | undefined;

/** The validated configuration. Literal `process.env.NEXT_PUBLIC_*` references let Next inline them. */
export function getEnv(): AtlasEnv {
  cached ??= readEnv({
    NEXT_PUBLIC_ATLAS_API_BASE_URL: process.env.NEXT_PUBLIC_ATLAS_API_BASE_URL,
    NEXT_PUBLIC_ATLAS_FRONTEND_SHA: process.env.NEXT_PUBLIC_ATLAS_FRONTEND_SHA,
  });
  return cached;
}

/** Test hook: forget the cached configuration. */
export function resetEnvForTests(): void {
  cached = undefined;
}
