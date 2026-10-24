import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import { resetEnvForTests } from "@/lib/env";

beforeEach(() => {
  process.env.NEXT_PUBLIC_ATLAS_API_BASE_URL = "http://127.0.0.1:8100";
  process.env.NEXT_PUBLIC_ATLAS_FRONTEND_SHA = "unknown";
  resetEnvForTests();
});

afterEach(() => {
  cleanup();
});
