# Closing the Thread of the Threat-Modeling Review Loop

**Status:** Approved for implementation (Act mode) — Feature B → A → C.
**Author:** Feature owners AviD, Petra, izar
**Date:** 2026-08-24

---

## Motivation / context

OWASP community reviewers (AviD, Petra, izar) identified that the tool produces
*artifacts*, not a threat-modeling *process*, and that its value comes from:

1. **Human-in-the-loop review** — an automated scan is only a starting point.
2. **A "did we do a good enough job" cross-check** against an existing model.

Docs (`docs/README.md`, `docs/how-to-use-the-output.md`) have already been
repositioned accordingly. This plan closes the three product gaps so the tool
*actually supports* the workflow the docs now promise:

- **B — Review status:** capture, persist, and export human review decisions per finding.
- **A — Context-quality signal:** warn the user when the context feeding the model is too thin to produce trustworthy output, plus surface ungrounded findings and fix copy.
- **C — Baseline comparison:** compare the generated model against a hand-built/vendor baseline (or another of our jobs) to answer "did we do a good job?"

---

## Feature B — Review status (threats only)

Review status is stored in a separate `threat_reviews` table, so it does not
mutate the immutable generated report. It joins back at read/export time.

### Schema (`backend/src/db/database.ts`)

```sql
CREATE TABLE IF NOT EXISTS threat_reviews (
  job_id     TEXT NOT NULL,
  finding_id TEXT NOT NULL,
  status     TEXT NOT NULL,          -- unreviewed|accepted|mitigated|false_positive|needs_review
  note       TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id, finding_id),
  FOREIGN KEY (job_id) REFERENCES threat_modeling_jobs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_threat_reviews_job ON threat_reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_threat_reviews_job_status ON threat_reviews(job_id, status);
```

- `ON DELETE CASCADE` + an explicit delete in the model must both be present:
  the existing `ThreatModelingJobModel.delete()` is a plain
  `DELETE FROM threat_modeling_jobs` (`threatModelingJob.ts:267`).
- **threats only** — `finding_type` deliberately omitted. Risk status is derived
  from the `related_threats` of each risk (kept simple per decision).

### Model (`backend/src/models/threatReview.ts`)

`ThreatReviewModel` with:
- `upsert(jobId, findingId, status, note?)` — insert or update on `(job_id, finding_id)`.
- `listForJob(jobId)` — all rows for a job, keyed by `finding_id`.
- `deleteForJob(jobId)` — used on job delete.

Also update `ThreatModelingJobModel.delete()` to delete `threat_reviews`
rows (belt-and-suspenders alongside the FK cascade).

### API (`routes/threatModeling.ts`)

- `PATCH /api/threat-modeling/jobs/:id/review`
  - Body `{ findingId, status, note? }`.
  - Auth + **ownership guard** (same as all existing write paths) + status enum validation.
- **Merge** `review_status` (and `review_note`) into each
  `threatModel.threats[i]` and, derived, into each `riskRegistry.risks[i]`
  in the `GET /jobs/:id` response — the **single source of truth** for the
  frontend UI and all export paths (CSV, JSON, Excel, PDF).

### Frontend

- `ReviewStatus` type in `frontend/types/`.
- `api.updateThreatReview(jobId, { findingId, status, note? })`.
- `JobReport.tsx`: per-threat row — a status `<select>` + color-coded badge
  (green = accepted, orange = needs_review, red = false_positive, blue =
  mitigated) with an optional note input. Optimistic update, persisted via
  PATCH, refetch on failure. Risk rows derive a badge from linked threats.

### Exports

- **Backend CSV:** add a `review_status` column (and `review_note`).
- **Backend JSON download:** merge statuses into the report before `res.download`.
- **Frontend Excel/PDF (jsPDF):** consume the merged `review_status` field from
  the API response automatically.

---

## Feature A — Context-quality signal + ungrounded badge + copy

### Context-quality warning

- `frontend/lib/contextQuality.ts`: `summarizeContextQuality(fields)`
  → `'none' | 'thin' | 'ok' | 'rich'` (rich = deployment present AND ≥3
  populated non-trivial fields).
- `ContextFieldsForm.tsx` / `ThreatModeling.tsx`: before Run, if `none` or
  `thin`, show an inline GIGO warning ("results likely weak — see review
  guidance") with a "Run anyway" option.

### Ungrounded badge

- `SourceLocationCell.tsx`: empty `locations` → `⚠ Ungrounded — verify` badge.
- `JobReport.tsx`: threats with no `source_locations` get the same treatment.

### Copy

- `ThreatModeling.tsx` success toast reworded to
  `Scan complete — review the findings, then track fixes.`

### Follow-up (documented, NOT implemented this pass)

- Raise `deploymentContext` cap from 500 → 2000 (touches `CONTEXT_FIELD_CAPS`,
  `mapExtractorResultToDraft`, and the concat cap; out of scope to keep A tight).

---

## Feature C — Baseline comparison ("did we do a good job")

### Comparator (`backend/src/services/reportComparator.ts`, pure)

Tolerant matching engine:

- **Normalize** each finding: lowercased `title` + STRIDE `category`
  (`threat_class` / `type`) + sorted set of `affected_components`.
- **Match tiers:** `exact` (all keys match) | `fuzzy` (degraded match, e.g.
  title + partially overlapping components).
- **Output:** `{ matched[], missed[], extra[], recall, precision }`.

Pure functions = trivially unit-testable.

### API (`routes/threatModeling.ts`)

- `POST /api/threat-modeling/jobs/:id/compare` — body `{ baseline: ThreatModel }`
  (pasted / hand-built / vendor JSON). **UI primary path.**
- `GET /api/threat-modeling/jobs/:id/compare?baselineJobId=<id>` — compare
  against another completed job using the same ownership guard
  (Auditor-sees-all); **API-only in v1**, stateless.

### Frontend

- `frontend/components/CompareBaseline.tsx`: paste JSON → render summary card
  (`matched` / `missed` / `extra` counts, `recall` / `precision`) + three lists
  with source links.
- Types + `api.compareThreatModel(jobId, baseline)`.
- Wire launch button/tab into `JobReport.tsx`.

---

## Test plan (full coverage incl. e2e)

### Backend unit (Jest)
- `threatReview.test.ts` — upsert (insert then update), listForJob, deleteForJob
  (and that job delete cascades/cleans reviews).
- `reportComparator.test.ts` — recall/precision math, empty baseline, exact and
  fuzzy matching.

### Backend route (supertest)
- `threatModeling.test.ts`:
  - `PATCH /jobs/:id/review` — happy path, status enum validation, ownership 403,
    404 for missing job, GET `/jobs/:id` merges `review_status`.
  - Compare endpoints — pasted baseline (matched/missed/extra), `baselineJobId`,
    cross-account 403.
  - CSV includes `review_status` column.

### Frontend unit (Jest/RTL)
- `JobReport.test.tsx` — status select persists via PATCH, optimistic update,
  derived risk badge, ungrounded badge.
- `ContextFieldsForm.test.tsx` — thin/none context shows quality warning.
- `contextQuality.test.ts` — `summarizeContextQuality` buckets.
- `CompareBaseline.test.tsx` — renders summary + lists.

### E2E (Playwright)
Reuse `frontend/e2e/helpers/stubApi.ts` + `frontend/e2e/fixtures/*`:
- `review-status.spec.ts` — stub `PATCH /jobs/:id/review`, assert badge/select
  updates and persists.
- `context-quality.spec.ts` — thin context shows the pre-run warning.
- `compare-baseline.spec.ts` — stub the compare route, assert summary + lists.

---

## Out of scope / follow-ups

- `deploymentContext` cap bump (tracked above).
- Independent review statuses on *risks* (kept simple → threats only).
- Persisting comparison results (stateless v1).
- Prior-job picker UI for C (exposes `baselineJobId` via API only in v1).

---

## Sequencing

1. **B** — schema + model + endpoints + merge + frontend + exports + tests.
2. **A** — context-quality check + warning + ungrounded badge + copy + tests.
3. **C** — comparator + compare endpoint + `CompareBaseline.tsx` + tests.
