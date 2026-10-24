// Contract conformance of real API responses (ATLAS-001 AC-03/AC-08, owner CP7 §2). The schemas come only
// from the released contract extracted by `pnpm specs` at the pinned SHA (build/specs): the OpenAPI document
// and the JSON Schema files. Nothing here restates a schema.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import { parse } from "yaml";

const SPECS = resolve("build/specs/contracts");
const OPENAPI_ID = "urn:atlas:openapi";

interface OpenApi {
  paths: Record<string, Record<string, { operationId: string; responses: Record<string, ResponseSpec> }>>;
  components: { headers: Record<string, { schema: { pattern: string } }> };
}

interface ResponseSpec {
  headers?: Record<string, { $ref: string }>;
  content?: Record<string, { schema: { $ref: string } }>;
}

/** Component name in the OpenAPI document -> JSON Schema file of the same payload. */
const JSON_SCHEMA_FILES: Record<string, string> = {
  HealthLive: "health-live.v1.json",
  HealthReady: "health-ready.v1.json",
  BuildInfo: "build-info.v1.json",
  ErrorEnvelope: "error.v1.json",
};

export interface ObservedResponse {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly requestCorrelationId: string | undefined;
  readonly body: string;
}

export class Contract {
  readonly #doc: OpenApi;
  readonly #ajv = new Ajv2020({ strict: false, allErrors: true });
  readonly #validators = new Map<string, ValidateFunction>();
  readonly correlationPattern: RegExp;

  constructor() {
    this.#doc = parse(readFileSync(resolve(SPECS, "openapi/atlas-api.yaml"), "utf8")) as OpenApi;
    this.#ajv.addSchema({ $id: OPENAPI_ID, components: this.#doc.components });
    for (const file of Object.values(JSON_SCHEMA_FILES)) {
      this.#ajv.addSchema(JSON.parse(readFileSync(resolve(SPECS, "schemas", file), "utf8")) as object);
    }
    const header = this.#doc.components.headers["X-Correlation-ID"];
    if (!header) throw new Error("contract has no X-Correlation-ID header component");
    this.correlationPattern = new RegExp(header.schema.pattern);
  }

  get operations(): string[] {
    return Object.values(this.#doc.paths).flatMap((methods) =>
      Object.values(methods).map((op) => op.operationId),
    );
  }

  #validator(ref: string): ValidateFunction {
    let validate = this.#validators.get(ref);
    if (!validate) {
      validate = this.#ajv.compile({ $ref: ref });
      this.#validators.set(ref, validate);
    }
    return validate;
  }

  /** Every problem with one observed response; an empty list means it conforms. */
  check(response: ObservedResponse): string[] {
    const path = new URL(response.url).pathname;
    const where = `${response.method} ${path} -> ${response.status}`;
    const operation = this.#doc.paths[path]?.[response.method.toLowerCase()];
    if (!operation) return [`${where}: operation not in the contract`];
    const spec = operation.responses[String(response.status)];
    if (!spec) return [`${where}: status not declared for ${operation.operationId}`];
    const problems: string[] = [];
    const contentType = response.headers["content-type"] ?? "";
    if (!contentType.startsWith("application/json")) problems.push(`${where}: content-type ${contentType}`);
    const cid = response.headers["x-correlation-id"] ?? "";
    if (!this.correlationPattern.test(cid)) problems.push(`${where}: X-Correlation-ID "${cid}" invalid`);
    if (response.requestCorrelationId && this.correlationPattern.test(response.requestCorrelationId)) {
      if (cid !== response.requestCorrelationId)
        problems.push(`${where}: valid inbound correlation ID not echoed`);
    }
    const ref = spec.content?.["application/json"]?.schema.$ref;
    if (!ref) return [...problems, `${where}: contract declares no JSON body`];
    let body: unknown;
    try {
      body = JSON.parse(response.body);
    } catch {
      return [...problems, `${where}: body is not JSON`];
    }
    const component = ref.replace("#/components/schemas/", "");
    const checks: Array<[string, ValidateFunction]> = [
      [`OpenAPI ${component}`, this.#validator(`${OPENAPI_ID}${ref}`)],
    ];
    const file = JSON_SCHEMA_FILES[component];
    if (file) {
      const id = (JSON.parse(readFileSync(resolve(SPECS, "schemas", file), "utf8")) as { $id: string }).$id;
      checks.push([file, this.#validator(id)]);
    } else {
      problems.push(`${where}: no JSON Schema file mapped for ${component}`);
    }
    for (const [name, validate] of checks) {
      if (!validate(body)) problems.push(`${where}: ${name}: ${this.#ajv.errorsText(validate.errors)}`);
    }
    if (component === "ErrorEnvelope") {
      const errorCid = (body as { error?: { correlation_id?: unknown } }).error?.correlation_id;
      if (errorCid !== cid) problems.push(`${where}: error.correlation_id differs from the header`);
    }
    return problems;
  }
}
