# Source me: `source scripts/dev-env.sh`. Uses the project-local Node from .tools/ (scripts/bootstrap-node.sh)
# and the pnpm version pinned in package.json "packageManager" (Corepack, hash-verified). Nothing global.
_atlas_root="$(cd "$(dirname "${BASH_SOURCE[0]:-${(%):-%x}}")/.." && pwd)"
export PATH="${_atlas_root}/.tools/node/bin:${PATH}"
export COREPACK_HOME="${_atlas_root}/.tools/corepack"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export COREPACK_ENABLE_AUTO_PIN=0
unset _atlas_root
