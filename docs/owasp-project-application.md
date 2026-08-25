# OWASP Project Application — AI Threat Modeler

This document captures the OWASP **New Project Request** application for the AI Threat Modeler. It is the single, copy-paste-ready record of the submission, grounded in the actual repository so OWASP reviews the real project.

- **Service desk ticket:** PPS-153 (submitted in the OWASP ServiceNow / service desk system)
- **Supersedes:** PPS-35 (earlier submission under the name "AppSec Agent" with Apache-2.0; should be closed/withdrawn)

---

## Application fields

### Project Name
```
AI Threat Modeler
```

### Project Category
```
Tool Project
```

### Project Classification
```
Builder
```

### Open Source License
```
MIT License
```

### Leader Names
```
Sam Li
```

### GitHub User Names
```
yangsec888
```

### OWASP Email Address
```
yang.li@owasp.org
```

### OWASP Membership
```
Yes
```

> All leaders must be OWASP members. Aim to meet OWASP's **2–5 official leaders** requirement — currently a single leader; add co-leaders before/at review time.

---

## Problem space

### Problem statement
> Traditional application security analysis remains manual, expert-dependent, and disconnected:
> - **Manual threat modeling** requires deep security expertise and typically produces a static document that quickly goes stale relative to the codebase it describes
> - **Secure code review** doesn't scale — experts must read entire codebases hunting for vulnerabilities, with no shared, reviewable artifact to accumulate from
> - **Findings are disconnected from code** — threat models and risks are rarely linked to the exact lines of code they describe, so they're hard to verify, trust, or act on
> - **Tool fragmentation** — DFDs, STRIDE analysis, risk registries, and code pointers live in separate tools, creating workflow friction

### Innovation
> - **Code-grounded STRIDE**: Every finding — threat, risk, and DFD node — is anchored to real `file:line` locations with snippets and GitHub links. Unlike diagram-driven models (e.g., OWASP Threat Dragon), this grounds the model in the actual source, making it traceable and current
> - **Automated pipeline**: A staged agent flow (context extraction → threat modeling → optional adversarial verification) reduces manual effort and removes the need for command-line expertise
> - **Evidence discipline**: An adversarial "second pass" drops threats that lack code evidence, keeping output defensible rather than a pile of generic findings
> - **Manageable, transparent cost**: Bring-your-own keys for Anthropic, OpenAI, or open-weight models (DeepInfra: Kimi/GLM/DeepSeek), with per-job cost reported exactly
> - **Production-ready**: Secure multi-user web app (JWT auth, role-based access, encrypted keys) deployable via Docker Compose — not just a CLI/library

---

## What is the purpose of this project?

**AI Threat Modeler** is a self-hosted web application that turns a codebase into a **code-grounded threat model** — a living, reviewable artifact instead of a static document. Point it at a GitHub repo or upload a ZIP, and it produces a STRIDE-flavored model made up of three linked artifacts:

- **Data Flow Diagram** — an interactive diagram (React Flow) with trust boundaries, search, and severity filters; click a node to see the candidate threats and source files tied to it. This is intended to be **verified against your real architecture first**, since findings built on a wrong diagram are suspect.
- **Threat Model** — a catalog of candidate STRIDE threats with severity, mitigation, and a **Location** (`file:line`, snippet, and GitHub link whenever the agent can ground it in real code). Each is treated as a *hypothesis to verify in code*, not a conclusion.
- **Risk Registry** — risks cross-linked to threats with remediation plans, ready for your team's decisions and tracked remediation.

Each threat-model job runs a short **stage → run** flow: the app first auto-fills editable context fields (project summary, security context, deployment context, developer guidance, suggested exclusions, and notes) so the AI understands your *deployment*, not just your code; then the agent produces the full artifact. An optional **adversarial second pass** drops findings that have no code evidence, keeping the output defensible.

The platform is built for AppSec teams who want **threat modeling grounded in the actual code** — traceable, reviewable, and always current. Beyond threat modeling it unifies related workflows (AI-assisted code review and security consultation) in one secure interface, and it exports to **PDF, CSV, and JSON** so findings can be pulled into issue trackers and a practice of record. It is built on the `appsec-agent` library and ships as a production-ready, multi-user web app (JWT auth, role-based access, encrypted API keys, SQLite storage) deployable with Docker Compose.

---

## Project roadmap — first year as an OWASP project

### Phase 1 — Foundation (already shipped, will be transferred & stabilized)
- Complete the **Incubator onboarding**: transfer the repo into the `github.com/OWASP` organization, finalize the MIT license + DCO contributor process, and stand up the `www-project-ai-threat-modeler` page on owasp.org within the first 30 days
- Freeze a documented **1.0 release** to serve as the stable baseline for the OWASP project
- Publish contribution guidelines (CONTRIBUTING, security policy, code-of-conduct adherence) so external contributors can join cleanly

### Phase 2 — Accuracy & evidence (months 3–6)
- Harden the **adversarial verification pass** to further cut false positives and strengthen code-grounded evidence on every finding
- Add fine-grained **per-stage cost and depth controls** (model choice, reasoning effort) across Anthropic, OpenAI, and open-weight DeepInfra providers — with exact per-job cost reporting
- Improve **threat-mitigation and remediation-plan** quality, and cross-link risks to threats more tightly
- Grow an initial **community**: OWASP Slack channel (`#project-ai-threat-modeler`), issue/PR triage, and a feedback loop from early adopters

### Phase 3 — Team adoption (months 6–9)
- Add **templating and organization-level workflows** so teams can standardize their threat-modeling practice across projects
- Build **integration hooks** into common issue trackers to push validated findings into tracked remediation
- Prepare **OSSF Best Practices** self-certification and gather usage evidence (GitHub/DockerHub stats) needed for promotion

### Phase 4 — Promotion readiness (months 9–12)
- Deliver a stable **1.x lifecycle** with at least one major release and regular minor/patch releases
- Participate in community programs (e.g., GSoC, OWASP Project Summit) to grow contributors
- Based on maturity (age, releases, documentation, support, usage), **request promotion from Incubator to Lab** through the official Project Promotion process

---

## Anything else?

**Source availability.** The project is already public and open source:
- Application: **`github.com/yangsec888/ai-threat-modeler`** (this project)
- Underlying library: **`yangsec888/appsec-agent`**, published to npm as **`appsec-agent`**

**Relationship to `appsec-agent`.** AI Threat Modeler is built on top of the `appsec-agent` library (a TypeScript package providing AI agents for AppSec tasks, built on frontier and open-weight models). This project is the user-facing application; `appsec-agent` is its reusable engine.

**License & contribution.** The project is licensed under the **MIT License** (OSI-approved, matching OWASP code-project requirements). Per OWASP policy, we will adopt the **DCO** contributor agreement going forward.

**Post-approval transfer plan.** On approval, the repository will be transferred into the `github.com/OWASP` organization (or a dedicated OWASP-created org), the `www-project-ai-threat-modeler` website page will be created within the 30-day window, and project activity/release info will be kept up to date on owasp.org.

**Model providers.** Bring-your-own-key support for **Anthropic (Claude)**, **OpenAI**, and open-weight models via **DeepInfra** (Kimi, GLM, DeepSeek) — giving teams cost and compliance flexibility.

**Leadership.** Currently led by **Sam Li** (yangsec888). One or more additional co-leaders will be added to meet OWASP's 2–5 leader requirement.

---

## Policy acknowledgment

**Project Policy & Procedures**
```
Yes, I will abide by OWASP procedures and policies
```

---

## Post-approval 30-day checklist (reference)

- [ ] Transfer the repo into the `github.com/OWASP` organization
- [ ] Create the `www-project-ai-threat-modeler` page on owasp.org within 30 days of GitHub access
- [ ] Log into the `@owasp.org` email account (yang.li@owasp.org)
- [ ] Set up the DCO contributor agreement
- [ ] Add co-leaders to meet the 2–5 leader requirement
- [ ] Keep project activity and release info updated on owasp.org

---

## Related documentation

- [`./getting-started.md`](./getting-started.md) — install and first report
- [`./features.md`](./features.md) — full capability list
- [`./how-to-use-the-output.md`](./how-to-use-the-output.md) — working with the threat-model artifact
- [`./deployment.md`](./deployment.md) — running with Docker Compose in production
- [`../README.md`](../README.md) — project overview
