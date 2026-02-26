#!/usr/bin/env bash
set -euo pipefail

readonly DEFAULT_UPSTREAM_DIR="upstream/utaformatix"
readonly DEFAULT_REPO_URL="https://github.com/sdercolin/utaformatix3.git"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/sync-upstream-utaformatix3.sh <ref> [repo_url] [upstream_dir]

Examples:
  ./scripts/sync-upstream-utaformatix3.sh v1.9.0
  ./scripts/sync-upstream-utaformatix3.sh f3c83354f57894492410bbc5ba03f7e97169c92c
  ./scripts/sync-upstream-utaformatix3.sh main https://github.com/sdercolin/utaformatix3.git upstream/utaformatix
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

readonly REF="$1"
readonly REPO_URL="${2:-$DEFAULT_REPO_URL}"
readonly UPSTREAM_DIR="${3:-$DEFAULT_UPSTREAM_DIR}"
readonly PARENT_DIR="$(dirname "$UPSTREAM_DIR")"

if [[ ! -d .git ]]; then
  echo "Error: run this script from the repository root."
  exit 1
fi

mkdir -p "$PARENT_DIR"

if git config -f .gitmodules --get-regexp "submodule\\..*\\.path" 2>/dev/null | awk '{print $2}' | grep -Fxq "$UPSTREAM_DIR"; then
  git submodule set-url "$UPSTREAM_DIR" "$REPO_URL"
  git submodule update --init "$UPSTREAM_DIR"
else
  if [[ -e "$UPSTREAM_DIR" ]]; then
    echo "Error: $UPSTREAM_DIR exists but is not configured as a submodule."
    echo "       Move/remove it, then rerun this script."
    exit 1
  fi
  git submodule add "$REPO_URL" "$UPSTREAM_DIR"
fi

git -C "$UPSTREAM_DIR" fetch --tags --force origin

if ! git -C "$UPSTREAM_DIR" rev-parse --verify --quiet "$REF^{commit}" >/dev/null; then
  # Try explicit fetch for non-tag refs or raw SHAs.
  git -C "$UPSTREAM_DIR" fetch --force origin "$REF" || true
fi

if ! git -C "$UPSTREAM_DIR" rev-parse --verify --quiet "$REF^{commit}" >/dev/null; then
  echo "Error: ref '$REF' was not found in $REPO_URL."
  exit 1
fi

readonly RESOLVED_COMMIT="$(git -C "$UPSTREAM_DIR" rev-parse "$REF^{commit}")"
git -C "$UPSTREAM_DIR" checkout --detach "$RESOLVED_COMMIT"

echo "Upstream synced:"
echo "  path: $UPSTREAM_DIR"
echo "  repo: $REPO_URL"
echo "  ref:  $REF"
echo "  sha:  $RESOLVED_COMMIT"
echo
echo "Next:"
echo "  git add .gitmodules $UPSTREAM_DIR"
echo "  git commit -m \"chore: sync upstream to $RESOLVED_COMMIT\""
