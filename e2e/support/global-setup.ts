// Starts the E2E stack before the suite and stops it afterwards (Playwright globalSetup with teardown).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { API_BASE_URL } from "./config";
import { Stack } from "./stack";

/** The production build under test must call the stack's API proxy (`pnpm e2e:build`). */
function assertE2eBuild(): void {
  const chunks = ".next/static/chunks";
  if (!existsSync(chunks)) throw new Error("no production build: run `pnpm e2e:build` first");
  const files = readdirSync(chunks, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".js"));
  if (!files.some((f) => readFileSync(join(chunks, f), "utf8").includes(API_BASE_URL))) {
    throw new Error(`the build in .next does not call ${API_BASE_URL}: run \`pnpm e2e:build\` first`);
  }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  assertE2eBuild();
  if (!existsSync("build/specs/contracts/openapi/atlas-api.yaml")) {
    throw new Error("pinned contract not extracted: run `pnpm specs` first");
  }
  const stack = new Stack();
  try {
    await stack.start();
  } catch (error) {
    await stack.stop();
    throw error;
  }
  return async () => {
    const summary = await stack.stop();
    console.log(`[e2e-stack] stopped: ${JSON.stringify(summary)}`);
    if (!summary.api_shutdown_complete) throw new Error("an API process did not shut down cleanly");
    if (!summary.worker_stopped_gracefully)
      throw new Error("the worker did not stop gracefully (worker_stopped)");
  };
}
