# Changelog

All notable changes to AI Threat Modeler will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
