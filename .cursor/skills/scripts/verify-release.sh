#!/usr/bin/env bash
# Pre-release smoke check for AI Threat Modeler. Exits non-zero on the first
# failed assertion. Think of it as the build + verify stage of the release
# train, replacing the punta-wagyu-ranch post-deploy smoke test: this repo ships
# to GitHub and is run by operators via Docker Compose, so the thing to prove is
# that the version is consistent across the monorepo and the build + tests pass
# before you push a tag.
#
#   bash .cursor/skills/scripts/verify-release.sh [expected-version]
#
# Without [expected-version], asserts only that the three package.json versions
# agree and that build + unit tests pass. With it, additionally asserts the
# intended version and that no `v<version>` tag exists yet.
set -uo pipefail
# Anchor to the git repo root so every relative path below is correct no matter
# where the script is invoked from. The script lives at .cursor/skills/scripts/,
# three levels down, so a naive `cd ../..` would land in `.cursor`, not the root.
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "verify-release: not inside a git repo — aborting." >&2
  exit 1
}

EXPECTED="${1:-}"
FAILED=0

pass() { printf "  ok    %s\n" "$1"; }
fail() { printf "  FAIL  %s\n" "$1"; FAILED=1; }

echo "Verifying AI Threat Modeler release in $PWD"

# 1. Version is consistent across root, backend, and frontend, and matches the
#    intended bump (if given).
echo
echo "version:"
ROOT_VERSION=$(node -e "console.log(require('$PWD/package.json').version)")
BACKEND_VERSION=$(node -e "console.log(require('$PWD/backend/package.json').version)")
FRONTEND_VERSION=$(node -e "console.log(require('$PWD/frontend/package.json').version)")
pass "root=$ROOT_VERSION backend=$BACKEND_VERSION frontend=$FRONTEND_VERSION"
[ "$ROOT_VERSION" = "$BACKEND_VERSION" ] && pass "root and backend agree" \
                                          || fail "root ($ROOT_VERSION) != backend ($BACKEND_VERSION)"
[ "$ROOT_VERSION" = "$FRONTEND_VERSION" ] && pass "root and frontend agree" \
                                          || fail "root ($ROOT_VERSION) != frontend ($FRONTEND_VERSION)"
if [ -n "$EXPECTED" ]; then
  [ "$ROOT_VERSION" = "$EXPECTED" ] && pass "matches expected $EXPECTED" \
                                   || fail "expected version $EXPECTED, got '$ROOT_VERSION'"
fi

# 2. A tag for this version does not already exist (avoid re-tagging / a
#    misleading `--verify-tag` at release time).
echo
echo "tag clash:"
if [ -n "$EXPECTED" ] && git rev-parse -q --verify "refs/tags/v$EXPECTED" >/dev/null 2>&1; then
  fail "tag v$EXPECTED already exists — refusing to re-release"
else
  pass "no existing v$EXPECTED tag"
fi

# 3. Build everything (tsc + backend build + frontend build).
echo
echo "build:"
if npm run build:all >/dev/null 2>&1; then
  pass "build:all succeeded"
else
  fail "build:all failed (run without redirect to see output)"
fi

# 4. Jest suites on both sides (the gate).
echo
echo "tests:"
if npm run backend:test >/dev/null 2>&1; then
  pass "backend tests pass"
else
  fail "backend tests failed (run without redirect to see output)"
fi
if npm run frontend:test >/dev/null 2>&1; then
  pass "frontend tests pass"
else
  fail "frontend tests failed (run without redirect to see output)"
fi

echo
if [ "$FAILED" -eq 0 ]; then
  echo "All checks passed — safe to tag and push."
else
  echo "One or more checks FAILED."
fi
exit "$FAILED"
