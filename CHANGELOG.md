# Changelog

All notable changes to AI Threat Modeler will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.7.1] - 2026-05-22

### Added
- **Dedicated report page at `/reports/[jobId]`.** Clicking **Preview** on a completed job now opens the threat model in a new browser tab with the full viewport (`max-w-7xl`), matching the sast-ai-app pattern. The page loads the job via `GET /api/threat-modeling/jobs/:id`, shows explicit states for loading, not found, forbidden, error, and jobs that are not yet `completed`, and sets `document.title` from the project name.
- **`frontend/app/reports/[jobId]/page.tsx`** — `AuthGuard` + `Suspense` shell, header with logo, **Back** (`router.back()` when `history.length > 1`, else link to `/`), and **Download JSON**. Renders `<JobContextCard>` and `<JobReport>` below the title.
- **`frontend/components/JobReport.tsx`** — extracted three-tab report UI (DFD / Threat Model / Risk Registry) with local `dfdCanvasRef`, PDF/Excel export, and threat-by-component filter from the DFD.
- **`frontend/components/JobContextCard.tsx`** — extracted "Context used" card (six `contextFields` or legacy `context` string).
- **`frontend/components/JobsList.tsx`** — extracted jobs list rows and action buttons (`Preview`, Download JSON, Delete).
- **`frontend/lib/api.ts`** — `getThreatModelingJob` now returns `{ job, notFound, forbidden, error }` instead of throwing on 404/401/403, so the report page can render targeted empty states.
- **Tests:**
  - **Jest** — `frontend/__tests__/app/reports.test.tsx` (9), `JobReport.test.tsx` (9), `JobContextCard.test.tsx` (4), `JobsList.test.tsx` (5). Frontend Jest **126 → 153**.
  - **Playwright** — `frontend/e2e/job-report-page.spec.ts` (7): new-tab Preview, direct navigation, pending job, 404, document title, back navigation, tab switching. `dfd-tab.spec.ts` and `dfd-export.spec.ts` migrated to `openReportPage()` (direct `/reports/:id` navigation). E2e **19 → 26**. API stubs in `stubApi.ts` now register on the **browser context** so new tabs receive the same mocks.

### Changed
- **`frontend/components/ThreatModeling.tsx`** — removed inline report preview (~350 lines): `selectedJob`, `handleViewReport`, PDF/Excel handlers, and preview cards. **Preview** calls `window.open('/reports/' + id, '_blank', 'noopener,noreferrer')`. Job polling uses the new `getThreatModelingJob` result shape.
- **Root** package version **1.7.1**, **frontend** package version **1.7.1**.

## [1.7.0] - 2026-05-22

### Added
- **Two-step threat modeling with deployment context.** Upload or GitHub import is now a staging flow: the repository is captured, `appsec-agent`'s `context_extractor` role auto-drafts five context fields (project summary, security context, deployment context, developer context, suggested exclusions) plus a free-form "additional notes" field. The user reviews/edits all six fields, hits **Run threat model**, and the backend concatenates the populated fields with stable labels and passes them to `agent-run -r threat_modeler` via `-c <text>`. Empty fields are skipped, total length is capped at 8 000 chars, and the `-c` flag is omitted entirely when every field is blank so the threat modeler still runs without context.
- **Staging API:** `POST /api/threat-modeling/stage` (multipart upload → ZIP extract), `POST /api/github/stage` (async zipball download + extract), `GET /api/threat-modeling/stage/:id` (poll status: `pending → extracting → ready | failed`), `DELETE /api/threat-modeling/stage/:id` (cancel; sweeps temp dirs), `POST /api/threat-modeling/stage/:id/run` (consume staging → create job).
- **`backend/src/services/contextExtractorRunner.ts`** — orchestrates the `context_extractor` agent invocation. Spawns `agent-run` with a per-invocation `mkdtempSync('ctx-extract-')` directory as `cwd`, writes a structured `ExtractionContext` JSON (repo metadata, language counts, tree summary, manifests, READMEs, Dockerfiles, CI configs, etc. — capped at 5 MB total), runs the agent with a 120 s timeout via `awaitAgentChildExit`, then maps snake_case agent output into camelCase draft fields with per-field length caps. Failures are recorded on the staging row so the UI can show a manual-fallback banner. Always cleans up the temp dir.
- **`backend/src/services/extractionContextBuilder.ts`** — builds the JSON input the extractor agent reads. Filters to security-relevant files (manifests, Dockerfiles, CI configs, `helm/`, `terraform/`, `kustomize/`, `.cursor/rules/`, etc.), respects `node_modules` / `.git` / `vendor` skips, hard-caps depth and total bytes.
- **`backend/src/services/contextConcatenator.ts`** — joins populated `ContextFields` with stable `Project: …`, `Security: …`, `Deployment: …`, `Developer guidance: …`, `Excluded paths: …`, `Additional notes: …` labels in a fixed order, hard-caps the result at 8 000 chars, appends `[truncated]` when overflowing.
- **`backend/src/services/agentRunPath.ts`** — extracted shared `findAgentRunPath()` so the threat modeler runner and the extractor runner agree on agent-run's location (no more duplicated `require.resolve` logic).
- **`backend/src/services/zipExtract.ts`** — extracted streaming ZIP extraction (yauzl) so both the legacy threat-modeling code path and the new staging flow share one implementation; isolates the threat-modeling routes from circular imports with the staging route.
- **`backend/src/utils/awaitAgentChildExit.ts`** — promoted from inline helper to a shared util so both the threat modeler and the new context extractor get the same v1.6.4 "exit-as-truth + post-exit grace timer" guarantee against the Claude Code grandchild-pipes hang.
- **`backend/src/services/stagingOrchestrator.ts`** — drives the GitHub stage flow asynchronously: download zipball → write to disk → extract → mark `extracting` → invoke extractor → mark `ready`/`failed`.
- **`backend/src/types/contextFields.ts`** — typed `ContextFields` shape with per-field length caps, snake↔camel mapping for extractor output, JSON serialization helpers, and `listPopulatedContextFieldNames()` for the UI's "fields used" badge on the job detail view.
- **`backend/src/models/threatModelingStaging.ts`** — staging row model with `pending | extracting | ready | failed | consumed | cancelled | expired` lifecycle. Default TTL is 30 minutes; `deleteStale()` only sweeps non-terminal rows, never `consumed`.
- **DB schema (idempotent migrations):**
  - new `threat_modeling_stagings` table (with `user_id` and `status` indexes);
  - new columns on `threat_modeling_jobs`: `context TEXT`, `context_fields TEXT` (JSON), `extracted_dir TEXT`, `uploaded_zip_path TEXT` so jobs born from staging keep a record of which fields were sent and which extracted dir they reused.
- **Frontend:**
  - `frontend/hooks/useThreatModelingStaging.ts` — single source of truth for staging state on the client (`startUpload` / `startGitHub` / `cancel` / `run` / `reset`, polls every 1.5 s, surfaces `idle | uploading | extracting | ready | running | failed | expired`, treats backend `404` as session expiry rather than a hard error).
  - `frontend/components/ContextFieldsForm.tsx` — six-field editor with per-field counters, character caps, "Couldn't auto-generate context — fill in any combination of fields below, or leave them all blank to run without context" yellow fallback banner on `status === 'failed'`, and a `Run threat model` / `Cancel` button row.
  - `frontend/components/ThreatModeling.tsx` — Upload tab now renders the staging form when a directory is selected and `Analyze repository` was clicked.
  - `frontend/components/GitHubImport.tsx` — same two-step flow for the GitHub tab; `Analyze repository` triggers the async stage, polling the GET endpoint until ready/failed.
- **Tests:**
  - **Backend regression — `backend/src/__tests__/services/contextExtractorRunner.test.ts`** (3 tests): pins the **exact CLI argument shape** of the spawned `agent-run` (`cwd`, relative filenames, `-m haiku`) so the v1.6.7-era e2e blind spot can never re-open. See _Fixed_ below.
  - **Backend unit — `backend/src/__tests__/services/contextConcatenator.test.ts`**: empty input → empty output, fixed label order, 8 000-char cap with `[truncated]` marker.
  - **Backend unit — `backend/src/__tests__/types/contextFields.test.ts`**: snake↔camel mapping, per-field caps, strict vs. lenient parsing.
  - **Frontend Playwright — three new staging specs:**
    - `frontend/e2e/upload-context.spec.ts` — analyze → edit → run happy path.
    - `frontend/e2e/staging-failure.spec.ts` — agent-run fails → yellow fallback → manual run still works.
    - `frontend/e2e/staging-expired.spec.ts` — backend returns `404` mid-poll → "Session expired" banner → reset path returns user to the URL input.
  - `frontend/e2e/helpers/stubApi.ts` gains `stubGithubApis()` and a richer `stubStagingApi({ stagingId, finalStatus, githubJob })` so all four GitHub/staging specs share one set of mocks (no duplicated `page.route` blocks). Existing `frontend/e2e/github-import.spec.ts` rewritten to use the two-step flow.
- **OpenAPI:** all four staging endpoints + `ContextFields`, `ContextFieldsDraft`, and `ThreatModelingStaging` schemas added to `backend/openapi.yaml`; legacy `POST /api/threat-modeling` and `POST /api/github/import` documented as `410 Gone` with the migration pointer.
- **Plan doc:** `docs/add-deployment-context-field-plan.md` — design rationale, alternatives considered (single-call vs. two-step, extractor model choice, mutex vs. cwd-isolation), and why six fields with these specific caps and labels.

### Changed
- **Breaking — legacy job-creation endpoints removed.** `POST /api/threat-modeling` and `POST /api/github/import` now return **`410 Gone`** with a JSON body pointing callers at the new staging routes. Frontend `api.threatModeling()` and `api.importFromGitHub()` are deleted; both upload and GitHub UIs call the staging flow exclusively. Route tests in `backend/src/__tests__/routes/threatModeling.test.ts` and `backend/src/__tests__/routes/github.test.ts` are updated accordingly.
- **`backend/src/routes/threatModeling.ts`** — `processThreatModelingJob` accepts an optional staged `extractedDir` so it skips re-extraction when the staging row already produced one, and only adds `-c <text>` to the agent-run argv when the concatenated context is non-empty (so empty-context jobs still work).
- **`backend/src/init/stuckJobWatchdog.ts`** — extended to GC stale staging rows (`pending`/`extracting`/`ready`/`failed` past TTL) in addition to stuck threat-modeling jobs. Consumed/cancelled rows are never touched.
- **`backend/src/db/database.ts`** — adds `ThreatModelingStaging`, `StagingStatus`, and `ContextFields` exports; idempotent column adders for the new `threat_modeling_jobs` columns.
- **Tests:** backend Jest count **199 → 208** (+3 `contextExtractorRunner` regression tests, +5 `threatModelingStaging.deleteStale` regression tests, +1 net from `contextConcatenator`/`contextFields` minus a couple of legacy route tests removed alongside the deleted endpoints). Frontend Jest unchanged at 126; Playwright e2e **16 → 19** (+3 staging specs).
- **Root** package version **1.7.0**, **backend** package version **1.5.0**, **frontend** package version **1.7.0**.

### Fixed
- **`context_extractor` runs were failing 100 % of the time on the first real Analyze click — the agent rejected our CLI args.** The first end-to-end attempt against a live backend produced `Error: Invalid output file path: extraction-output.json. Output file path must be relative to the current working directory and cannot contain directory traversal sequences.` from `appsec-agent`'s validator, after which the staging row flipped to `failed` and the UI showed the yellow fallback banner on every Analyze. Root cause: `runContextExtractor` was spawning `agent-run` with `cwd: process.cwd()` (the backend project root) but passing **absolute** `--extract-context` and `-o` paths under `os.tmpdir()/ctx-extract-…/`. `agent-run` requires both arguments to be relative to its own cwd. Fix: spawn the child with `cwd: tempDir` and pass bare filenames `extraction-context.json` / `extraction-output.json`. The temp dir lifecycle, JSON read-back, and cleanup are unchanged. Pinned by the new `contextExtractorRunner` regression tests, which assert `cwd.startsWith(os.tmpdir())`, that both filenames are bare relative names (no separator, no `..`, not absolute), and that the input JSON is written into the same dir before spawn.
- **`context_extractor` was running on Opus, ~30× more expensive than necessary.** `agent-run`'s `-m/--model` defaults to `opus`, and the runner wasn't passing `-m` — so every Analyze click was billing Opus for what is a single-turn, tools-disabled, schema-constrained JSON transform on text input. Now passes `-m haiku` explicitly. Quality is unchanged for this role (no tool use, `maxTurns: 1`, `outputFormat: { type: 'json_schema', schema: CONTEXT_EXTRACTION_SCHEMA }` in `appsec-agent/src/agent_options.ts:getContextExtractorOptions`); cost drops dramatically and the interactive Analyze spinner is noticeably shorter. The choice is locked into the `contextExtractorRunner` regression test (`expect(args[args.indexOf('-m') + 1]).toBe('haiku')`) so a future refactor can't silently regress it.
- **e2e blind spot called out.** The Playwright specs intercept `**/api/threat-modeling/stage*` at the network layer (`page.route(...)`), so the Express staging routes — and the spawned `agent-run` child — never run during e2e. The two bugs above could not have been caught at that level. The new `contextExtractorRunner` unit test mocks only `child_process.spawn` and exercises the runner against the real `fs` (the spawn mock writes a real output file in the runner's actual `mkdtempSync` directory), which is the right granularity for catching `agent-run` CLI-contract regressions without standing up a live API.
- **Staging GC was sweeping fresh `ready` rows after ~2 minutes (lexical date comparison bug).** Local repro on a real GitHub stage of `octocat/Hello-World`: row created at 12:40:23, extractor exited cleanly at 12:40:59 (`contextExtractor.ready`), watchdog GC at 12:42:27 logged `🩺 Staging GC: expired staging fa7bb3b8 (was ready)` — only ~2 minutes after creation, far short of the 30-minute TTL — and the user's `POST /stage/:id/run` two minutes later returned `404` with the UI showing **"Session expired — please re-import the repository."** Root cause: `ThreatModelingStagingModel.deleteStale()` used `created_at < ?` against a JS-supplied `Date.toISOString()` cutoff, but `created_at` is filled by SQLite's `CURRENT_TIMESTAMP`, which uses a *space* separator (`'2026-05-22 16:40:23'`) while `toISOString()` uses a `T` (`'2026-05-22T16:12:27.123Z'`). SQLite compared them as raw strings; at byte index 10, space (ASCII 32) is less than `T` (84), so a fresh row's `created_at` lexically compared *less than* a 30-min-ago cutoff and the watchdog fired on every tick. Fix: wrap both sides in SQLite's `datetime(...)` (`datetime(expires_at) < datetime('now') OR datetime(created_at) < datetime(?)`) so the comparison is by datetime, not bytes. Pinned by 5 new regression tests in `backend/src/__tests__/models/threatModelingStaging.test.ts`: a fresh `ready` row inside the TTL is **not** swept (even with a 1ms threshold — the smoking-gun assertion that would have failed under the old logic), past `expires_at` *is* swept, past `created_at` *is* swept, and terminal rows (`consumed`, `cancelled`, `expired`) are never touched even when forced into the past.

## [1.6.7] - 2026-05-22

### Fixed
- **`Invalid or expired token` Console Error overlay on every page load when a stale JWT is in `localStorage`.** Next.js 15.5's new dev-mode "Console Error" overlay was surfacing the expired-token failure thrown by `AuthProvider.checkAuth → api.getCurrentUser` as a red error toast on every cold load of the app, even though the `try/catch` was already clearing the token and falling through to the login screen. Symptom: noisy red `Invalid or expired token` dialog in dev whenever the persisted token had expired since the last session (i.e. the **expected** logged-out boot state for a returning user). Root cause: `getCurrentUser` was treating 401/403 as a thrown error, and `AuthContext` was logging the catch via `console.error`, which Next 15.5's overlay always promotes.

### Changed
- **`frontend/lib/api.ts`** (`getCurrentUser`): 401/403 responses now branch *before* the `!response.ok` throw — `handleAuthError(response)` still clears the stale token from `localStorage`, but the function returns `null` instead of throwing. Genuine non-auth failures (5xx, malformed responses, etc.) still throw as before.
- **`frontend/contexts/AuthContext.tsx`** (`AuthProvider.checkAuth`): short-circuits with an early `return` when no token is present (avoids a needless `/auth/me` round-trip on first-ever visits), handles the new `null` return quietly by leaving `user` as `null`, and only reaches the `console.error` branch on truly unexpected failures (network down, backend 5xx) — which is the only case the dev overlay should ever fire on.
- **`frontend/__tests__/lib/api.test.ts`**: the `should remove token on 401 error` test is renamed to `should remove token and return null on 401 error` and now asserts both the `localStorage.removeItem('auth_token')` side-effect *and* `result === null` (previously asserted a rejected `'Unauthorized'` throw). All 24 affected unit tests in `api.test.ts` + `AuthContext.test.tsx` pass.
- **Root** package version **1.6.7**, **frontend** package version **1.6.2**.

## [1.6.6] - 2026-05-09

### Added
- **Project version on the login page.** The login screen now renders a small `Version X.Y.Z` line under the login card so operators can confirm at a glance which build of the app a given environment is on (matters when triaging stuck-job / hang reports against the v1.6.3 → v1.6.5 fix train). The string comes from the **root** `package.json` rather than the frontend's own version, which is the canonical project version called out in every release entry of this changelog.

### Changed
- **`frontend/next.config.js`**: new `resolveAppVersion()` helper reads `../package.json` at config-load time and exposes the result to the browser bundle as `NEXT_PUBLIC_APP_VERSION` via the `env` block. Falls back to the frontend's own `package.json` version, then to the literal string `'unknown'`, so a missing/unreadable root manifest can never crash the build. The root `package.json` itself is **not** imported into the client bundle (would otherwise leak `dependencies` / `scripts` / `description` into shipped JS).
- **`frontend/components/Login.tsx`**: reads `process.env.NEXT_PUBLIC_APP_VERSION` once at module scope into `APP_VERSION` and renders `Version {APP_VERSION}` in a muted-foreground `<p data-testid="app-version">` underneath the login `Card`. The element is gated on `APP_VERSION` being truthy so an empty value renders nothing rather than a stray `Version `.
- **Root** package version **1.6.6**, **frontend** package version **1.6.1**.

## [1.6.5] - 2026-05-09

### Added
- **Stuck-job watchdog** (`backend/src/init/stuckJobWatchdog.ts`). A periodic sweep (default every 5 min) that finds rows still in `status='processing'` past a threshold (default 60 min) and resolves them deterministically rather than letting them sit in the UI forever:
  - If `work_dir/<jobId>/threat_model_report.json` exists and parses as JSON with the required `threat_model_report` root key, the row is auto-recovered: the report is copied into `threat-modeling-reports/<jobId>/`, status flips to `completed`, and `error_message` is annotated with a "Watchdog auto-recovery" explanation pointing the operator at the underlying handoff bug.
  - Otherwise the row is auto-failed with a `Watchdog auto-fail` message that tells the user to re-import.
  - Per-row exceptions and DB query failures never abort the sweep — the watchdog keeps running across server uptime.
  - Configurable via `STUCK_JOB_WATCHDOG_INTERVAL_MS` and `STUCK_JOB_WATCHDOG_THRESHOLD_MIN` env vars; the timer is `unref()`ed so it never blocks shutdown; disabled in `NODE_ENV=test`.
  - This is the runtime guard for the class of bugs unit tests can't enumerate (v1.6.3 size-cap hang, v1.6.4 close-event hang, and any future "stuck in processing" variant we haven't anticipated). The salvage we did manually for job `941dd823-…` is now automatic.
- **Real-spawn unit test** (`backend/src/__tests__/routes/awaitAgentChildExit.realSpawn.test.ts`). Two tests that use real `child_process.spawn` of a `process.execPath -e '<script>'` rather than mocking `child_process` at the module boundary:
  - **Adversarial path**: the script forks a *detached* grandchild that inherits stdout/stderr and lingers for 1500 ms, then exits the immediate parent after 50 ms — the exact production failure mode (Claude Code helper holding the agent's stdio FDs open). With pre-v1.6.4 code this hangs ≥1500 ms; the v1.6.4 helper must resolve via the post-exit grace timer in <1400 ms with `forced: true`.
  - **Happy path**: a real child that exits cleanly, asserting `forced: false` and `<500 ms` settle time.
  - This is the first test in the repo that exercises Node's actual stdio/SIGCHLD machinery — every other test mocks `spawn` at the boundary, which is precisely how the v1.6.3 / v1.6.4 hangs slipped past CI.

### Changed
- **`backend/src/index.ts`**: `startStuckJobWatchdog()` is started after `app.listen()` alongside the existing orphaned-uploads cleanup interval.
- **Tests**: backend Jest count **189 → 199** (+8 watchdog unit tests, +2 real-spawn tests). All 18 backend test suites green.
- **Root** package version **1.6.5**, **backend** package version **1.4.5**.

## [1.6.4] - 2026-05-09

### Fixed
- **GitHub-imported threat modeling jobs hang in `processing` even after the agent finishes and writes a complete report.** Diagnosed from a real stuck job (`941dd823-…`, importing `yangsec888/ai-threat-modeler@main`) that sat in `processing` for >25 minutes despite `work_dir/<jobId>/threat_model_report.json` being a valid 70 KB JSON written ~17 minutes earlier. Root cause: `processThreatModelingJob` awaited `child.on('close', …)`. Node's `'close'` event waits for ALL stdio FDs to drain. When `appsec-agent` forks a grandchild (the Claude Code helper) that inherits stdout/stderr and exits in a way that doesn't release the pipes promptly, `'close'` never fires and the parent's promise hangs forever — the post-agent code (chdir restore, mutex release, report-discovery, `updateReports` → `status='completed'`) is never reached. The spawn-await pattern is now extracted into a new exported helper `awaitAgentChildExit` that uses `'exit'` as the truth source (fires on immediate-child termination regardless of stdio state) with a 10-second grace window for `'close'` to deliver tail output, then forcibly destroys stdout/stderr and resolves with `forced: true` so the job can never hang. Confirmed via 6 new unit tests covering happy path, hang path (with and without non-zero exit code), error path, signal path, and close-before-exit ordering.
- **Resolve-exactly-once settlement guard.** Previously the spawn promise listened only to `'close'` and `'error'`. The new helper listens to `'exit'`, `'close'`, AND `'error'`, and a `settled` flag plus `clearTimeout(postExitTimer)` guarantees the outer promise resolves/rejects exactly once even when `'close'` arrives after the grace window has already finalized via `'exit'`.
- **Salvaged the production-stuck job in the local DB.** `941dd823-7c88-41d9-b501-726abbbef70e` was force-completed: the agent's `threat_model_report.json` was copied from `work_dir/` to `threat-modeling-reports/<jobId>/`, the `report_path` / `data_flow_diagram_path` / `threat_model_path` / `risk_registry_path` columns were pointed at it, `status` set to `completed`, and `error_message` annotated with the recovery context.

### Changed
- **`backend/src/routes/threatModeling.ts`**: spawn-await pattern moved out of an inline `new Promise(...)` into a new exported helper `awaitAgentChildExit(child, jobId, { graceMs })`. The helper returns `{ exitCode, signal, forced }` so callers can record telemetry on whether `'close'` fired naturally or had to be forced. Existing cancellation listener (`SIGTERM` then `SIGKILL` after 5s) is preserved and properly removed in a `finally` block to avoid abort-listener leaks.
- **Tests**: backend Jest count **183 → 189** (+6 helper unit tests). All 16 backend test suites green.
- **Root** package version **1.6.4**, **backend** package version **1.4.4**.

## [1.6.3] - 2026-05-09

### Fixed
- **GitHub import jobs hang in `pending` forever when the zipball exceeds the size cap.** When the streaming download tripped the configured size cap, `streamBodyToDiskWithCap`'s predecessor called `writeStream.destroy()` and then awaited `writeStream.end(callback)` in a `finally` block. Node's writable streams **do not invoke the `end()` callback on a destroyed stream**, so the await suspended forever — the throw never reached the outer `catch`, the job was never marked `failed`, no error message was written, and the polling UI showed `Pending` indefinitely. The download path is rewritten to wait for the `'close'` event (which fires for both clean `end()` and `destroy()` paths), so any size-cap, network, or write error now propagates to the existing failure path within milliseconds. Confirmed via a new Jest regression test (`downloadAndProcessGitHubRepo size-cap path`) that race-fails a 5s timeout if the bug regresses.
- **Size-cap error message now tells the user how to fix it.** Instead of `"Repository archive exceeds 50 MB limit"`, the failed job's `error_message` (and the agent log line) now reads `"Repository archive (<N> MB) exceeds the configured size cap (50 MB). Raise the cap in Settings → GitHub → Max archive size (MB) and re-import."`. The same wording is used for both the upfront `Content-Length` short-circuit and the streaming overflow.
- **PAT survives the `api.github.com` → `codeload.github.com` redirect** for private-repo imports. `fetch`'s default `redirect: 'follow'` strips the `Authorization` header on cross-origin redirects (per spec), which would 401 a private-repo zipball download. The new `fetchGitHubZipball` follows the 302 manually and re-attaches the Bearer token only when the redirect target is still on a `*.github.com` host; for off-domain signed URLs (e.g. `objects.githubusercontent.com`) the Authorization header is dropped so the URL's own short-lived token isn't shadowed.

### Changed
- **`backend/src/routes/github.ts`**: `downloadAndProcessGitHubRepo` is now exported (previously module-private) so the regression test can drive it directly without going through the fire-and-forget `POST /api/github/import` path. Streaming-with-size-cap is extracted into `streamBodyToDiskWithCap`, and zipball fetching is extracted into `fetchGitHubZipball` for the manual-redirect path. No public route shape changes.
- **Tests**: backend Jest count **182 → 183** (+1 size-cap regression). All 15 backend test suites green.
- **Root** package version **1.6.3**, **backend** package version **1.4.3**.

## [1.6.2] - 2026-05-09

### Fixed
- **Chat panel "Invalid API key" despite a valid DB-stored key**: `backend/src/routes/chat.ts` was reading the Anthropic key out of the database and passing it to `agent-run` via the `-k` flag, but the Claude Agent SDK underneath ignores that flag and reads `ANTHROPIC_API_KEY` directly from the spawned process's environment (the same env-inheritance issue tracked as `anthropics/claude-code#4383`). With nothing in env, the SDK fell through to whatever was inherited from the parent `node` process and reported `Invalid API key · Fix external API key` even though the configured key was correct. Mirrored the existing fix in `routes/threatModeling.ts`: `createChatSession()` now sets `env.ANTHROPIC_API_KEY = anthropicConfig.apiKey` before `spawn()`. The `-k` flag is kept as a redundancy for non-SDK code paths in `agent-run`. Existing chat sessions cached in `chatSessions` from before the fix must be ended (`/end` or the End Session button) so a new child process spawns with the corrected env
- **Root** package version **1.6.2**, **backend** package version **1.4.2**

## [1.6.1] - 2026-05-09

### Fixed
- **Chat panel `agent-run script not found`**: `backend/src/routes/chat.ts` was looking for the `appsec-agent` CLI under `appsec-agent/bin/agent-run.js`, but the published `appsec-agent@2.1.7+` package declares its bin at `./dist/bin/agent-run.js` (the same location `threatModeling.ts` was already searching). Mirrored the same path list `routes/threatModeling.ts` uses — `node_modules/appsec-agent/dist/bin/agent-run.js` first, sibling-checkout `dist/bin/` variants next, legacy `bin/` paths kept as fallbacks — so the chat tab now finds the CLI in both the Docker image (npm package) and a local `file:` link to a sibling `appsec-agent` checkout. Threat-modeling jobs were unaffected
- **Root** package version **1.6.1**, **backend** package version **1.4.1**

## [1.6.0] - 2026-05-09

### Added
- **GitHub-source threat modeling**: a new "Import from GitHub" tab in the Threat Modeling UI. Users paste a GitHub URL (`https://github.com/owner/repo`), pick a branch / tag / commit, and the backend downloads the GitHub zipball, extracts it, and runs the existing analysis pipeline — no local checkout required. The job list now shows GitHub-sourced jobs with a clickable repo link, a `Branch:` / `Tag:` / `Commit:` ref badge, and a GitHub source pill
- **Per-user GitHub Personal Access Token (PAT) management** under **Settings → GitHub**. Set, replace (ON CONFLICT upsert), or remove the PAT; "Test connection" validates against `GET /user` and surfaces the resolved login + scopes. PATs are AES-256-GCM encrypted at rest using the install's encryption key, are never returned through any API, and are validated against GitHub before being persisted. `last_used_at` is reset to `NULL` on replace
- **Backend GitHub routes** (`backend/src/routes/github.ts`):
  - `GET/POST/DELETE /api/github/token` and `POST /api/github/token/validate`
  - `POST /api/github/check-repo` — repo metadata, branches, and tags (best-effort with or without PAT)
  - `POST /api/github/import` — creates a `threat_modeling_jobs` row with `source_type='github'`, streams the zipball to disk while enforcing the size cap, then hands off to `processThreatModelingJob`
  - Friendly GitHub error mapping (401/403/404/rate limit -> 401/403/429), stripped from a leaking-credentials shape
  - Strict input validation (`gitRefType` allow-list, `gitRef` shell-metacharacter guard, `repoUrl` parse)
  - Audit logs on token set/delete/validate and import start/failure
- **Schema**: `github_tokens` table; `threat_modeling_jobs` columns `source_type`, `source_url`, `git_ref`, `git_ref_type`; `settings` columns `github_max_archive_size_mb`, `encryption_kdf_version`, `anthropic_api_key_legacy_bak`
- **Test coverage**: 59 new backend Jest tests (URL parser, token model, github routes, KDF migration, encryption hardening, JWT fail-closed, settings new shape) and new frontend Jest + Playwright suites (`GitHubImport.test.tsx`, `Settings.test.tsx`, `ThreatModelingTabs.test.tsx`, `e2e/github-import.spec.ts`, `e2e/github-token.spec.ts`)

### Security
- **SEC-003 — `JWT_SECRET` fails closed in production**: `backend/src/middleware/auth.ts` now refuses to boot when `NODE_ENV=production` and `JWT_SECRET` is unset. Dev/test still falls back to a non-secret default. `docker-compose.yml` declares `JWT_SECRET=${JWT_SECRET:?…}` so missing-env errors surface at compose time, not at first request
- **SEC-004 — PBKDF2 iteration count bumped to 310,000** (OWASP 2023). Existing 100k-iteration ciphertext is migrated transparently on next boot via `runEncryptionKdfMigration`, which decrypts under the legacy KDF, re-encrypts under the new KDF, preserves the legacy ciphertext in `settings.anthropic_api_key_legacy_bak` for recovery, and bumps `encryption_kdf_version` from 1 → 2 only after every row succeeds. Idempotent on re-run
- **SEC-009 — encryption key is never exposed via the API**:
  - `GET /api/settings` now returns `encryption_key_configured: boolean` instead of the raw key
  - `PUT /api/settings` rejects any payload containing `encryption_key` (rotation moves to the dedicated regenerate endpoint, which is server-controlled)
  - `SettingsModel.getEncryptionKey()` is added as the only internal accessor for code that needs to encrypt/decrypt
- **`Settings` UI** drops the editable encryption-key input and shows an "Encryption: configured" badge instead. Token plaintext is never persisted in `github_tokens` (verified by a model-level test that asserts the at-rest column never contains `ghp_`)
- **GitHub import safety**: archive size cap (default 50 MB, configurable), streaming download with hard byte ceiling for chunked-encoding responses, and best-effort cleanup of `uploads/github_*.zip` and `extracted-*` dirs on failure

### Changed
- `ThreatModelingJobModel.create()` now accepts an optional `sourceMeta` argument; the existing upload route call is unchanged (defaults to `source_type='upload'`)
- `routes/threatModeling.ts` exports `extractZip` and `processThreatModelingJob` so the GitHub route can reuse the same pipeline (and same cleanup semantics) as ZIP uploads
- **Frontend type**: `ThreatModelingJob` gains `sourceType`, `sourceUrl`, `gitRef`, `gitRefType`
- **`docker-compose.yml`**: backend container now passes `JWT_SECRET` from the host environment via `${JWT_SECRET}`. Originally I gated this with `${JWT_SECRET:?…}` so an unset secret would fail the compose parse, but that breaks `docker-compose down`/`ps`/`logs` too — the fail-closed behavior now lives entirely in `backend/src/middleware/auth.ts` (which throws on boot in production), so non-`up` compose subcommands keep working when the variable is unset
- **`.env.example`** added with `JWT_SECRET` instructions and the recommended `openssl rand -hex 32` generator
- **Root** package version **1.6.0**, **frontend** package version **1.6.0**, **backend** package version **1.4.0**

## [1.4.2] - 2026-05-09

### Changed
- **`docker-compose.yml` host-portable `user:`**: Replaced the hardcoded macOS-specific `user: "502:502"` on both `backend` and `frontend` with `user: "${UID:-502}:${GID:-502}"`. The default reproduces the previous behavior, and on any other host (Linux CI, teammate workstations, prod) you can now run `UID=$(id -u) GID=$(id -g) docker-compose up -d --build` so the container user owns the bind-mounted `./backend/{data,uploads,work_dir,threat-modeling-reports,logs}` directories instead of crashing on the first write
- **`docker-compose.yml` parameterized `NEXT_PUBLIC_API_URL`**: Promoted both the frontend `build.args` value and the runtime `environment` value to `${NEXT_PUBLIC_API_URL:-http://localhost:3001/api}`. Default still bakes `http://localhost:3001/api` into the Next.js image, but the URL can now be overridden at build time for non-localhost deployments without editing the compose file. Without this, the `NEXT_PUBLIC_*` inlining at build time meant the image only worked when the browser opened the app at `localhost`
- **Frontend Next.js bump**: `next` `^15.5.10` → `^15.5.18` (caret bump pulled in via `npm audit fix`), with associated lockfile updates resolving advisories in transitive deps (`axios`, `brace-expansion`, `dompurify`, `flatted`, `follow-redirects`, `jspdf`, `picomatch`)
- **Root** package version **1.4.2**, **frontend** package version **1.4.1**, **backend** package version **1.2.4**

## [1.4.1] - 2026-04-18

### Fixed
- **Backend hardened against `@anthropic-ai/claude-agent-sdk` libc bug**: `appsec-agent` bumped from `^1.6.0` to `^2.1.7`, the only release that pins `@anthropic-ai/claude-agent-sdk` to exact `0.2.112` (the last pure-JavaScript release). Starting at `0.2.114`, the SDK ships per-platform native binaries whose resolver (`lJ()` in `sdk.mjs`) picks the `-musl` variant before the glibc one with no libc detection — on Debian-based images this fails at spawn time with a misleading `Claude Code native binary not found` error. Pre-2.1.7 `appsec-agent` releases (including the whole 1.x line) used `^0.2.74`, whose caret range included the buggy versions
- **Dockerfile runtime-stage sanity check**: fails the build if a future transitive bump or lockfile regen silently pulls the SDK onto a native-binary release (>= 0.2.114). Asserts SDK is installed, `cli.js` is present, and no `claude-agent-sdk-<platform>` native variant dirs exist under `node_modules`. Catches regressions at build time instead of at the next prod spawn

### Changed
- **Backend SDK consolidation**: dropped dead direct `@anthropic-ai/claude-agent-sdk: ^0.2.39` dependency from `backend/package.json`. The backend never imports the SDK programmatically (it only spawns `appsec-agent`'s CLI as a child process), so the direct declaration was both unused and a drift hazard that let the backend lockfile resolve a different SDK version than `appsec-agent` had pinned. `appsec-agent@2.1.7` is now the single source of truth for the SDK pin across the stack
- **Backend Dockerfile**: removed dead `RUN npm install -g @anthropic-ai/claude-code@2.0.10`. Nothing in the backend invokes the `claude` binary on `PATH` or sets `options.pathToClaudeCodeExecutable`; `appsec-agent` uses the SDK's bundled `cli.js`. The global install was dead weight on every image rebuild
- **Root** package version **1.4.1**, **backend** package version **1.2.3**

## [1.4.0] - 2026-04-17

### Added
- **DFD “Wide view”** toolbar action: hides left rail, right details panel, and nodes/flows tables, then fits the diagram for maximum canvas space
- **Desktop “Details” toggle** for the context panel (alongside **Rail** for the legend rail)
- **Jest**: `useToast` queue cap tests; `DfdToolbar` tests for Wide view and Details controls

### Changed
- **Threat modeling layout**: main column uses full width (`max-w-none`) with responsive horizontal padding for wider DFD/report preview
- **DFD canvas**: taller viewport (`min(80vh, 720px)`), higher React Flow `maxZoom` (4), slightly narrower side columns on large screens
- **Toasts**: anchored **bottom-right**, compact sizing, `break-words`, scrollable stack (`max-h-[50vh]`), and at most **four** messages retained (oldest dropped)
- **Playwright**: optional `PLAYWRIGHT_BASE_URL` to run E2E against an existing dev server without starting `dev:e2e`
- **Root** and **frontend** package versions **1.4.0**

## [1.3.0] - 2026-04-17

### Added
- **React Flow DFD canvas**: Interactive threat-aware diagram with pan/zoom, minimap, node search, type/severity filters, trust-boundary grouping, and a right-hand context panel for nodes/edges
- **Export actions**: PNG and SVG download from the canvas, plus Copy Mermaid (string only; Mermaid runtime removed)
- **Vector DFD in PDF**: DFD PDF export embeds the diagram as vector SVG (html-to-image → svg2pdf.js) when the DFD tab is active
- **Playwright E2E** (`frontend/e2e/`) for DFD flows; scripts `e2e`, `e2e:ui`, `e2e:install`
- **Tests**: Jest coverage for `dfdToReactFlow`, ELK `layoutDfd`, `dfdToMermaid`, `dfdDecorations`, and RTL tests for DFD toolbar/legend/context panel
- **Backend contract tests** for structured `GET /api/threat-modeling/jobs/:id` payloads and null-safe parsing when report JSON is missing or invalid
- **OpenAPI**: Schemas for `DataFlowDiagram`, `ThreatModel`, `RiskRegistry`, etc., and updated job-detail response (removed stale `*Content` string fields)

### Changed
- **Threat Modeling UI**: Mermaid diagram component removed in favor of `@xyflow/react` + `elkjs` auto-layout
- **Frontend** package version **1.3.0**

### Removed
- **mermaid** npm dependency and `MermaidDiagram.tsx` (Mermaid graph rendering)

## [1.2.3] - 2026-02-28

### Changed
- **Root appsec-agent dependency**: Bumped from ^0.3.7 to ^2.1.6 to align with backend

## [1.2.2] - 2026-02-28

### Added
- **Structured JSON threat model output**: Threat modeler now produces a single structured JSON report with predefined schema, replacing 3 separate unstructured markdown files
- **Mermaid DFD rendering**: Data Flow Diagrams rendered as interactive Mermaid flowcharts generated deterministically from structured node/flow/boundary data
- **PDF export**: Export Data Flow Diagram and Threat Model reports as vector-quality PDFs using jspdf + svg2pdf.js + jspdf-autotable
- **Structured report preview**: Threat Model and Risk Registry displayed as sortable tables with severity badges, STRIDE category tags, and cross-references
- **Frontend types**: New `types/threatModel.ts` with TypeScript interfaces matching the JSON schema
- **MermaidDiagram component**: Reusable client-side Mermaid SVG rendering component
- **Server-side CSV export**: Backend endpoint for Risk Registry CSV export from structured data

### Changed
- **appsec-agent upgraded to v1.6.0**: Threat modeler uses Claude Agent SDK `outputFormat` with JSON schema enforcement (backward compatible via `output_format` flag)
- **Backend report handling**: Single JSON report file collected and parsed; API returns structured sections instead of raw text
- **Risk Registry Excel export**: Rewritten to map directly from typed JSON arrays to CSV rows (no markdown parsing)
- **Download endpoint**: Simplified to `format=json|csv` (replaces `type=data_flow_diagram|threat_model|risk_registry|all`)
- **agent-run path resolution**: Fixed to find `dist/bin/agent-run.js` in published npm packages

### Removed
- **riskRegistryParser.ts**: Removed the 250-line fragile markdown parser (replaced by structured JSON data)
- **Plain text report rendering**: Removed `<pre>` tag display of raw markdown reports

## [1.2.1] - 2026-02-28

### Added
- **build:all** script: Root script to build root, backend, and frontend in one command
- **README demo**: Inline demo video via GitHub asset URL (playable in README)

### Changed
- **Frontend security upgrade**: Next.js 14.2.35 → 15.5.10, React 18 → 19 (addresses RSC DoS and Image Optimizer DoS advisories)
- **lucide-react**: 0.303.0 → 0.468.0 for React 19 compatibility
- **eslint-config-next** and **@types/react** / **@types/react-dom** aligned with Next 15 and React 19

## [1.2.0] - 2026-02-11

### Changed
- **Frontend dependencies updated** to latest safe versions:
  - Next.js: 14.0.4 → 14.2.35
  - React: 18.2.0 → 18.3.1
  - React-DOM: 18.2.0 → 18.3.1
  - eslint-config-next: 14.0.4 → 14.2.35
  - @types/react: 18.2.45 → 18.3.18
  - @types/react-dom: 18.2.18 → 18.3.5

### Fixed
- **Report path resolver**: Fixed reports not loading in dev mode when created in Docker
  - Added `resolveReportPath()` helper for cross-environment compatibility
  - Automatically resolves Docker paths (`/app/...`) to local paths

## [1.1.0] - 2025-12-14

### Added
- **File-based logging**: Backend now writes structured JSON logs to `backend/logs/` using Winston
  - Daily log rotation with 14-day retention for app logs, 30-day for error logs
  - Separate error log files (`error-YYYY-MM-DD.log`)
  - HTTP request logging via Morgan middleware
- **Chat persistence**: Chat conversations now persist in localStorage
  - Messages restored when navigating back to chat
  - Responses saved immediately (survives page navigation during API calls)
- **SETUP.md**: Comprehensive setup guide with installation, configuration, and troubleshooting
- **CHANGELOG.md**: This file to track project changes

### Changed
- **Renamed project**: "Threat Model AI" → "AI Threat Modeler" globally across all files
- **Report path resolver**: Reports now work in both dev and Docker environments
  - Resolves absolute Docker paths (`/app/...`) to local paths in dev mode
  - Handles relative and absolute paths seamlessly

### Fixed
- **Docker volume permissions**: Fixed EACCES errors for logs, data, uploads directories
- **Chat session loss**: Fixed issue where navigating away lost the last API response
- **Dockerfile**: Added `logs` directory creation for containerized deployments

### Removed
- **Unused frontend/logs directory**: Removed as frontend runs in browser (no file logging)

## [1.0.0] - 2025-12-13

### Added
- Initial release of AI Threat Modeler
- **Threat Modeling**: Upload ZIP files or provide Git URLs for AI-powered security analysis
- **Chat Interface**: Interactive chat with Claude for security questions
- **User Management**: Role-based access control (Admin, Operator, Auditor)
- **Report Generation**: Data flow diagrams, threat models, and risk registries
- **Settings Panel**: Configure Anthropic API credentials with encrypted storage
- **Docker Support**: Production-ready Docker Compose deployment
- **API Documentation**: OpenAPI/Swagger documentation at `/api-docs`
