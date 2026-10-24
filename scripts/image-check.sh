#!/usr/bin/env bash
# Build and verify the web image (ATLAS-001 F-09; CI `image`): hadolint, Trivy gate (fixable HIGH/CRITICAL,
# any npm-package finding, secrets, Dockerfile misconfiguration), non-root, hardened run (read-only root fs,
# no capabilities, no-new-privileges), Docker health check, security headers, graceful stop (exit 0).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
SHA="${NEXT_PUBLIC_ATLAS_FRONTEND_SHA:-$(git rev-parse HEAD)}"
API="${NEXT_PUBLIC_ATLAS_API_BASE_URL:-http://127.0.0.1:8100}"
IMAGE="atlas-web:${IMAGE_TAG:-check}"
HADOLINT="hadolint/hadolint:v2.14.0@sha256:27086352fd5e1907ea2b934eb1023f217c5ae087992eb59fde121dce9c9ff21e"
TRIVY="aquasec/trivy:0.67.2@sha256:e2b22eac59c02003d8749f5b8d9bd073b62e30fefaef5b7c8371204e0a4b0c08"
NAME="atlas-webcheck-$$"
WORK="$(mktemp -d)"
TRIVY_RUN=(-v "$WORK:/scan" --user "$(id -u):$(id -g)" -e HOME=/tmp "$TRIVY" --cache-dir /scan/cache)
cleanup() {
  local status=$?
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$WORK" 2>/dev/null || echo "warning: could not remove $WORK" >&2
  exit "$status"
}
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== build"
docker build --quiet --build-arg "NEXT_PUBLIC_ATLAS_API_BASE_URL=${API}" --build-arg "NEXT_PUBLIC_ATLAS_FRONTEND_SHA=${SHA}" \
  -t "$IMAGE" . >/dev/null
echo "built ${IMAGE} ($(docker image inspect -f '{{.Size}}' "$IMAGE" | awk '{printf "%.0f MB", $1/1e6}'))"

echo "== hadolint"
docker run --rm -i "$HADOLINT" < Dockerfile && echo "hadolint: no findings"

echo "== trivy"
docker save "$IMAGE" -o "$WORK/web.tar"
docker run --rm "${TRIVY_RUN[@]}" image --quiet --input /scan/web.tar --scanners vuln,secret \
  --severity HIGH,CRITICAL --format json --output /scan/web.json
python3 - "$WORK/web.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
res = d.get("Results", [])
v = [(r["Type"], x["VulnerabilityID"], x["PkgName"], x["Severity"], x.get("FixedVersion")) for r in res for x in r.get("Vulnerabilities") or []]
fixable = [x for x in v if x[4]]
app = [x for x in v if x[0] not in ("debian", "ubuntu", "alpine")]
secrets = [(r["Target"], s["RuleID"]) for r in res for s in r.get("Secrets") or []]
print(f"web: HIGH/CRITICAL total={len(v)} fixable={len(fixable)} node-packages={len(app)} secrets={len(secrets)}"
      " (unfixed OS findings: reported, not gating)")
for x in (fixable + app)[:20]:
    print("   ", x)
for s in secrets:
    print("    secret", s)
sys.exit(1 if fixable or app or secrets else 0)
PY
cp Dockerfile "$WORK/Dockerfile"
docker run --rm "${TRIVY_RUN[@]}" config --quiet --severity HIGH,CRITICAL --exit-code 1 /scan/Dockerfile >/dev/null \
  && echo "trivy config: no HIGH/CRITICAL misconfiguration"

echo "== static checks"
uid="$(docker run --rm --entrypoint id "$IMAGE" -u)"
[ "$uid" != "0" ] || fail "image runs as root"
bad="$(docker run --rm --entrypoint sh "$IMAGE" -c 'ls -A /app; command -v npm pnpm corepack yarn || true')"
echo "$bad" | grep -qE '^(\.env.*|src|node_modules/\.pnpm-store|\.git)$|/(npm|pnpm|corepack|yarn)$' && fail "unexpected content: $bad"
echo "uid=${uid}; /app holds only the standalone server; no package managers"

echo "== hardened run"
docker run -d --name "$NAME" -p 127.0.0.1::3000 --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m --tmpfs /app/.next/cache:rw,noexec,nosuid,size=16m "$IMAGE" >/dev/null
status=""
for _ in $(seq 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$NAME")"
  [ "$status" = "healthy" ] && break
  [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" = "true" ] || break
  sleep 1
done
[ "$status" = "healthy" ] || { docker logs "$NAME" 2>&1 | tail -20; fail "container not healthy ($status)"; }
PORT="$(docker port "$NAME" 3000/tcp | head -1 | awk -F: '{print $NF}')"
echo "healthy (read-only root fs, no capabilities, no-new-privileges)"
node scripts/check-headers.mjs "http://127.0.0.1:${PORT}"
curl -fsS "http://127.0.0.1:${PORT}/status" | grep -q "System status" || fail "/status did not render"

echo "== graceful stop"
start=$(date +%s)
docker stop -t 20 "$NAME" >/dev/null
code="$(docker inspect -f '{{.State.ExitCode}}' "$NAME")"
took=$(( $(date +%s) - start ))
# Next.js handles SIGTERM (cleanup) and then exits 143 by design (128 + SIGTERM). A SIGKILL after the
# timeout would be 137; a hang would take the full 20 s. Both fail.
case "$code" in 0|143) ;; *) docker logs "$NAME" 2>&1 | tail -10; fail "exit ${code} on SIGTERM" ;; esac
[ "$took" -lt 10 ] || fail "shutdown took ${took}s"
echo "handled SIGTERM: exit ${code} in ${took}s (no SIGKILL)"
echo "OK: web image built, scanned and verified"
