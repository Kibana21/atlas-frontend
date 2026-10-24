// `pnpm check:generated` (ATLAS-001 FR-51, AC-03 h): regenerate into a temporary directory and fail if the
// committed generated files differ (a hand edit, or a contract/token change without `pnpm gen`).
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generate as generateApi } from "./gen-api.mjs";
import { generate as generateTokens } from "./gen-tokens.mjs";

const tmp = mkdtempSync(join(tmpdir(), "atlas-gen-"));
try {
  const targets = [
    ["src/generated/api/schema.d.ts", join(tmp, "schema.d.ts"), generateApi],
    ["src/styles/tokens.generated.css", join(tmp, "tokens.generated.css"), generateTokens],
  ];
  let drift = false;
  for (const [committed, fresh, gen] of targets) {
    await gen(fresh);
    let current = "";
    try {
      current = readFileSync(committed, "utf8");
    } catch {
      current = "";
    }
    if (current !== readFileSync(fresh, "utf8")) {
      console.error(
        `GENERATED_DRIFT: ${committed} differs from regeneration (run \`pnpm gen\`; never hand-edit)`,
      );
      drift = true;
    } else {
      console.log(`OK: ${committed} matches regeneration`);
    }
  }
  if (drift) process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
