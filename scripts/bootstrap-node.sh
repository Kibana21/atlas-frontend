#!/usr/bin/env bash
# Install the exact Node.js version from .nvmrc into the project-local, git-ignored .tools/ directory
# (ATLAS-001 P-04). Never touches a global Node installation. The archive is verified against the
# official SHASUMS256.txt before it is unpacked. Re-running with the version present is a no-op.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="v$(tr -d '[:space:]' < "$ROOT/.nvmrc")"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLATFORM=darwin-arm64 ;;
  Darwin-x86_64) PLATFORM=darwin-x64 ;;
  Linux-x86_64) PLATFORM=linux-x64 ;;
  Linux-aarch64) PLATFORM=linux-arm64 ;;
  *) echo "unsupported platform $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
DIR="$ROOT/.tools/node-${VERSION}-${PLATFORM}"
if [ -x "$DIR/bin/node" ]; then
  ln -sfn "$(basename "$DIR")" "$ROOT/.tools/node"
  echo "node ${VERSION} already installed in .tools/"; exit 0
fi
FILE="node-${VERSION}-${PLATFORM}.tar.gz"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$FILE" "https://nodejs.org/dist/${VERSION}/${FILE}"
curl -fsSL -o "$TMP/SHASUMS256.txt" "https://nodejs.org/dist/${VERSION}/SHASUMS256.txt"
(cd "$TMP" && grep " ${FILE}\$" SHASUMS256.txt | shasum -a 256 -c -)
mkdir -p "$ROOT/.tools"
tar -xzf "$TMP/$FILE" -C "$ROOT/.tools"
ln -sfn "$(basename "$DIR")" "$ROOT/.tools/node"
echo "installed node ${VERSION} into .tools/ (checksum verified)"
