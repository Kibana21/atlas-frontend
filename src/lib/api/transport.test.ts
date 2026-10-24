import { CORRELATION_PATTERN } from "./correlation";
import { AtlasApiError, isErrorEnvelope } from "./errors";
import { createTransport } from "./transport";

type Handler = (request: Request) => Response | Promise<Response>;

function harness(handler: Handler) {
  const requests: Request[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    return handler(request);
  }) as typeof fetch;
  return { transport: createTransport("http://127.0.0.1:8100", fetchImpl), requests };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

async function failure(promise: Promise<unknown>): Promise<AtlasApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AtlasApiError);
    return error as AtlasApiError;
  }
  throw new Error("expected an AtlasApiError");
}

describe("transport", () => {
  it("uses the configured base URL, sends a correlation ID and returns typed data", async () => {
    const { transport, requests } = harness(() =>
      json({ status: "ok" }, 200, { "x-correlation-id": "req_server0001" }),
    );
    const result = await transport.getHealthLive();
    expect(requests[0]?.url).toBe("http://127.0.0.1:8100/api/v1/health/live");
    expect(requests[0]?.headers.get("x-correlation-id")).toMatch(CORRELATION_PATTERN);
    expect(requests[0]?.headers.get("x-correlation-id")).toMatch(/^web_[0-9a-f]{32}$/);
    expect(result).toEqual({ data: { status: "ok" }, status: 200, correlationId: "req_server0001" });
  });

  it("falls back to the sent correlation ID when the echo is missing or invalid", async () => {
    const { transport, requests } = harness(() =>
      json({ status: "ok" }, 200, { "x-correlation-id": "bad id" }),
    );
    const result = await transport.getHealthLive();
    expect(result.correlationId).toBe(requests[0]?.headers.get("x-correlation-id"));
  });

  it("maps the error envelope to AtlasApiError with its code, details and correlation ID", async () => {
    const envelope = {
      error: {
        code: "DEPENDENCY_UNAVAILABLE",
        message: "A required dependency is unavailable.",
        correlation_id: "req_abcdef12",
        details: { failed_check: "redis" },
        recoverable: true,
      },
    };
    const { transport } = harness(() => json(envelope, 503, { "x-correlation-id": "req_abcdef12" }));
    const error = await failure(transport.getHealthReady());
    expect(error).toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      status: 503,
      correlationId: "req_abcdef12",
      details: { failed_check: "redis" },
      recoverable: true,
    });
  });

  it.each([
    [
      "non-JSON error page",
      () => new Response("<h1>Bad gateway</h1>", { status: 502, headers: { "content-type": "text/html" } }),
      502,
    ],
    [
      "malformed JSON",
      () => new Response("{not json", { status: 200, headers: { "content-type": "application/json" } }),
      200,
    ],
    ["JSON error without an envelope", () => json({ detail: "nope" }, 500), 500],
    ["success without a JSON content type", () => new Response('{"status":"ok"}', { status: 200 }), 200],
  ])("maps a %s to UNEXPECTED_RESPONSE", async (_, respond, status) => {
    const { transport } = harness(respond);
    const error = await failure(transport.getDiagnosticsBuild());
    expect(error.code).toBe("UNEXPECTED_RESPONSE");
    expect(error.status).toBe(status);
    expect(error.message).not.toContain("<h1>");
  });

  it("maps a network failure to NETWORK_UNAVAILABLE with the sent correlation ID", async () => {
    const { transport, requests } = harness(() => {
      throw new TypeError("Failed to fetch");
    });
    const error = await failure(transport.getHealthLive());
    expect(error).toMatchObject({ code: "NETWORK_UNAVAILABLE", status: null, recoverable: true });
    expect(error.correlationId).toBe(requests[0]?.headers.get("x-correlation-id"));
  });

  it("recognises only complete envelopes", () => {
    expect(isErrorEnvelope(null)).toBe(false);
    expect(isErrorEnvelope({ error: null })).toBe(false);
    expect(
      isErrorEnvelope({ error: { code: "X", message: "m", correlation_id: "c", recoverable: true } }),
    ).toBe(false);
  });

  it("defaults to the configured base URL", async () => {
    const calls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(input instanceof Request ? input.url : String(input));
      return json({ status: "ok" });
    }) as typeof fetch;
    try {
      await createTransport().getHealthLive();
    } finally {
      globalThis.fetch = original;
    }
    expect(calls).toEqual(["http://127.0.0.1:8100/api/v1/health/live"]);
  });
});
