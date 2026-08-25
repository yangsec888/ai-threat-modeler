---
name: release-train
description: Ships AI Threat Modeler to GitHub and Docker end to end — identity checks, pre-flight gate, version bump, changelog, commit, Docker build + verify, tag and push. Use when cutting a release, shipping code, bumping the version, publishing a GitHub Release, or building Docker images.
---

# Release train — AI Threat Modeler

Ordered workflow for shipping this repo. Steps are sequenced so a failure costs
a local check rather than a bad push or a mislabeled release. Do not skip ahead.
This follows the punta-wagyu-ranch release-train framework, adapted for a
self-hosted Next.js + Express app that ships through GitHub and Docker — there
is no Vercel preview/production deploy and no rollback CLI. The closest thing to
"post-deploy verification" is proving the version is consistent and the Docker
build + test suite pass before you push a tag.

```
Release progress:
- [ ] 1. Identity
- [ ] 2. Pre-flight gate
- [ ] 3. Version + changelog
- [ ] 4. Commit
- [ ] 5. Build + verify
- [ ] 6. Tag + push
- [ ] 7. Publish the GitHub Release
```

## 1. Identity

This repo is personal. The work (Capsule) identity must never touch it. The git
identity is per-repo and already set to `Sam Li <yangsec888@gmail.com>` — the
commit author that `git config` reports is what a release commit carries.

```bash
git config user.email    # must be yangsec888@gmail.com
git config user.name     # must be Sam Li
```

If the repo has no local identity, set it locally — never change global git
config:

```bash
git config --local user.name  "Sam Li"
git config --local user.email "yangsec888@gmail.com"
```

GitHub pushes authenticate through `gh auth git-credential`, so the active `gh`
account is the pushing account. It must be `yangsec888`, otherwise `git push`
fails with **"Repository not found"** — GitHub returns 404, not 403, for private
repos the caller cannot see. Do not chase the remote URL; it is a credentials
problem.

```bash
gh auth switch --user yangsec888
```

No need to switch back afterward for this repo. A Cursor hook may block `gh`
from the agent session; if so, ask the user to run that one line.

## 2. Pre-flight gate

Everything below must pass before bumping anything. This is a monorepo: root
`package.json` orchestrates the backend (Express) and frontend (Next.js)
subpackages.

```bash
npm install             # if node_modules are missing/stale
npm run backend:test    # Jest (backend)
npm run frontend:test   # Jest (frontend)
npm run build:all       # tsc + backend build + frontend build
```

There is no ESLint lint gate in this repo (`next lint` has no config and would
ask to bootstrap ESLint interactively), so do not add one mid-release — the Jests
suites on both sides are the required gate.

A green build is not the gate — the unit tests on both sides are. Do not skip
them. The Playwright e2e suite (`cd frontend && npm run e2e`) is heavier and
needs a browser install; it runs in CI and may be run here when browser
infrastructure is available, but the Jest suites are the required gate.

## 3. Version + changelog

The version is duplicated across three files — root, `backend/package.json`,
and `frontend/package.json` — plus `CHANGELOG.md`. Bump **all three** together
to the same value (e.g. `3.2.2` → `3.2.3`). The versions must never drift,
because the release tag and the GitHub Release are derived from them.

```bash
# bump "version" in package.json, backend/package.json, frontend/package.json
```

Add a matching section to `CHANGELOG.md` in Keep a Changelog format
(`### Added` / `### Fixed` / `### Changed` / `### Security`), dated, with a
compare link at the bottom. Prefix a short human summary right under the version
heading, the way this repo already does.

Write entries so a reader who was not present understands the failure, not just
the file that changed. State the symptom, the cause, and the fix. Move any
`[Unreleased]` notes into the new dated section.

## 4. Commit

Sentence case, ending in a period, imperative mood. The body explains *why*.
Match the existing history and the convention of a dedicated release commit plus
ordinary feature/doc commits:

```
docs: add OWASP project application and link it from the docs index.
Release v3.2.3 — short description of what is live.
```

Stage explicitly rather than `git add -A` so incidental working-tree content
(caches, `.next/`, local DBs) is not swept into the release commit. `.env*`
files are gitignored.

## 5. Build + verify

This repo ships to GitHub; the runtime is Docker Compose for operators, not a
hosted deployment this repo controls. Verification replaces a live smoke test by
proving the version is consistent, the Docker build is clean, and the test
suite still passes before you push:

```bash
bash .cursor/skills/scripts/verify-release.sh 3.2.3
```

The script asserts that the version in all three `package.json` files matches
the intended value, that a `v<version>` tag does not already exist, that
`npm run build:all` succeeds, and that the Jest suites on both sides still pass.
It exits non-zero on the first failed assertion.

Optionally, an operator-grade smoke is to confirm `docker-compose build` is clean
for the images this release touches (see `docs/deployment.md`). That is not a
release gate because building the images is local-only and not shipped here, but
a broken Dockerfile is worth catching pre-tag.

## 6. Tag + push

Annotated tag, message describing what is live and what is still missing:

```bash
git tag -a v3.2.3 -m "v3.2.3 — short description"
git push origin main
git push origin v3.2.3
```

A pushed tag is not a release. GitHub's Releases panel only lists tags that have
a Release attached, so stopping here leaves the repo advertising an old version.
Continue to step 7.

## 7. Publish the GitHub Release

Notes come from the `CHANGELOG.md` section written in step 3 — never retype
them, or the two drift. The heading may use the plain `3.2.3` form; pick the
exact heading that exists in the file when writing the awk match:

```bash
awk '/^## \[3\.2\.3\]/{f=1;next} f&&/^## \[/{exit} f' CHANGELOG.md > /tmp/notes.md
gh release create v3.2.3 --verify-tag \
  --title "v3.2.3 — short description" --notes-file /tmp/notes.md
```

`--verify-tag` aborts if the tag was never pushed, which catches a skipped step
6 rather than silently creating the tag from whatever `main` points at.

Backfilling later is the same command with an older tag; releases are ordered by
tag date, so `Latest` still resolves correctly.

## Traps this repo has already hit

**Version lives in three places.** Root, `backend/package.json`, and
`frontend/package.json` all carry the version, and they must move together. If
you bump only the root, the release tag/release will advertise a version the
subpackages do not match. Every prior release line reads "Root, backend, and
frontend package versions bumped to X.Y.Z" — keep that pattern.

**A green build is not the gate.** The Jest suites (backend + frontend) are.
Build errors are caught by `npm run build:all`, but unit tests are what stop a
regression from reaching a tag.

**`gh auth` failing is a credentials problem, not a URL problem.** If `git push`
reports "Repository not found", the active `gh` account is not `yangsec888`.
Fix auth, not the remote. A Cursor hook may block `gh` in the agent session —
ask the user to run `gh auth switch --user yangsec888` (or refresh the token).

**Never commit `.env*` or runtime artifacts.** `.env`/`.env.example`, SQLite
DBs, `.next/`, and `node_modules` are not release content. Stage explicitly.

**This repo has no Vercel and no PyPI.** There is no preview/production deploy
and no rollback CLI; the old punta-wagyu-ranch deploy/verify-and-rollback steps
do not apply. The verify script is the build-stage proof, and for this app the
"deploy" is what operators run (`docker-compose up -d --build`), which cannot be
driven from a release here.
