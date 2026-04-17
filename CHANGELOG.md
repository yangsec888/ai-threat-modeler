# Changelog

All notable changes to AI Threat Modeler will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
