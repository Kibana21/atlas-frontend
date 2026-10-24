// `pnpm specs` (ATLAS-001 FR-51): validate specs.lock and extract contracts/ and design/ from atlas-specs
// AT THE PINNED SHA (git archive) into build/specs/. Never reads a moving branch or the working tree.
// SPECS_DIR (default ../atlas-specs) must be a clone that contains the pinned commit and its tags.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "specs");

export function readLock(text) {
  const fields = {};
  for (const line of text.split("\n")) {
    const m = /^([a-z_]+):\s*"?([^"#]*?)"?\s*$/.exec(line);
    if (m) fields[m[1]] = m[2];
  }
  if (!/^[0-9a-f]{40}$/.test(fields.specs_commit ?? "")) {
    throw new Error(
      `specs.lock: specs_commit must be a full 40-character SHA, got "${fields.specs_commit ?? ""}"`,
    );
  }
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/.test(fields.contract_version ?? "")) {
    throw new Error(`specs.lock: contract_version is not a version: "${fields.contract_version ?? ""}"`);
  }
  return fields;
}

function git(specsDir, ...args) {
  return execFileSync("git", ["-C", specsDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main() {
  const lock = readLock(readFileSync(join(ROOT, "specs.lock"), "utf8"));
  const specsDir = resolve(ROOT, process.env.SPECS_DIR ?? "../atlas-specs");
  const sha = lock.specs_commit;
  try {
    git(specsDir, "cat-file", "-e", `${sha}^{commit}`);
  } catch {
    throw new Error(`specs.lock: commit ${sha} not found in ${process.env.SPECS_DIR ?? "../atlas-specs"}`);
  }
  const tags = git(specsDir, "tag", "--points-at", sha).split("\n").filter(Boolean);
  const release = `contract-v${lock.contract_version}`;
  if (!tags.includes(release)) {
    throw new Error(
      `specs.lock: ${sha.slice(0, 12)} does not carry the release tag ${release} (tags: ${tags.join(", ") || "none"})`,
    );
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const archive = execFileSync("git", ["-C", specsDir, "archive", sha, "contracts", "design"]);
  execFileSync("tar", ["-x", "-C", OUT], { input: archive });
  const contract = readFileSync(join(OUT, "contracts", "openapi", "atlas-api.yaml"), "utf8");
  const version = /^info:\n(?:[ ].*\n)*?[ ]{2}version:\s*([^\s]+)/m.exec(contract)?.[1];
  if (version !== lock.contract_version) {
    throw new Error(
      `contract info.version ${version} != specs.lock contract_version ${lock.contract_version}`,
    );
  }
  console.log(`OK: specs.lock pins ${sha} (${release}); extracted contracts/ and design/ to build/specs`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`SPECS_LOCK_INVALID: ${error.message}`);
    process.exit(1);
  }
}
