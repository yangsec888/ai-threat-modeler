# What this is (and isn't): using the output in a real threat modeling process

This is an **AI-assisted code-review / threat-discovery scanner** that generates a batch of *artifacts* — a data-flow diagram, STRIDE-flavored findings, a source-anchored risk registry, and a JSON export. Its job is to help you **identify the threat, ground the truth in code rather than in human discussion, and then act on it.**

We're explicit about that because it keeps the tool honest. We are not bound to any one doctrine — including the Threat Modeling Manifesto's framing of threat modeling as a *people-first activity* whose value comes from **dialog and varied viewpoints**. Dialog has its place, but it doesn't make a threat true; the code does. So our working principle is short and concrete: **identify the threat, ground the truth in code instead of human discussion, then act on it.** Every finding is anchored to a real `file:line`, the **adversarial second pass** drops claims that have no code evidence, and what survives is input your team is expected to **act on** — not a discussion topic.

> **The honest one-line position:** think of this as **SAST-with-narrative** — a code review that speaks in threat-modeling vocabulary (STRIDE categories, trust boundaries, severity) and links every finding to the exact `file:line` it's grounded in. Where the code is silent, so are we.

## Where the output fits

Four questions worth asking of any threat model map neatly onto what this tool hands you (a useful checklist, not an obligation):

| Question | What this tool produces |
|---|---|
| *What are we working on?* | An extracted **deployment & project context** (the six editable fields) and a **data-flow diagram** with trust boundaries — a visual capture of what the system is and how data moves through it. |
| *What can go wrong?* | A **STRIDE-flavored findings list**, each with severity, mitigation, and a real **`file:line`** source reference. This is your candidate list of *what can go wrong* — to be argued, prioritized, and extended by people. |
| *What are we going to do about it?* | The proposed **mitigations** and the **risk registry** (cross-linked to findings) become the raw material your team turns into decisions, owners, and tracked remediation. |
| *Did we do a good enough job?* | A great follow-up (iz2r's suggestion): point the tool at a system that already has a **hand-built threat model** and compare — check whether the tool *missed* real threats (false negatives) and whether its *grounded* findings hold up. That is a direct, concrete *did-we-do-a-good-enough-job* check. |

## The human-in-the-loop review workflow

The tool's value depends on people doing the parts a scanner can't. A disciplined loop looks like this:

1. **Feed it good context.** Garbage in, garbage out. The six context fields (project summary, security context, deployment context, developer guidance, suggested exclusions, free-form notes) are the highest-leverage inputs you have. Spend real time on them — especially *deployment context* (what's reachable, what's behind a boundary, data classification) — because the model can only see what you tell it plus the code itself. The quality of what comes back tracks the quality of what you put in.
2. **Review the diagram first.** Before trusting any finding, sanity-check the **data-flow diagram** and trust boundaries against your actual architecture. If the diagram is wrong, the findings built on it are suspect. Fix the representation, then re-run.
3. **Triangulate the findings.** Treat every STRIDE finding as a *hypothesis to verify, not a verdict*. Read the linked `file:line` yourself (or have a pair reviewer do it) before accepting, dismissing, or elevating a finding. Severity is model-judgment; your team owns the real priority.
4. **Add what the scanner can't see.** People bring business context, known incidents, compliance obligations, and design intent that no static scan of the code contains. The artifact is a starting catalog, not the whole picture.
5. **Turn decisions into tracked remediation.** Move accepted risks/mitigations into your normal issue tracker with owners and due dates. Identifying the threat and grounding it in code is only half the job — the value materializes when your team **acts** and the output changes what you actually do.

## When to run it

- **Continuous, not just annual.** Because it runs on cheap open-weight models (Kimi/GLM/DeepSeek via DeepInfra) with reported exact per-job cost, it's practical to run on *every release* or on every meaningful diff — giving you a fresh "what can go wrong" catalog each cycle instead of a once-a-year snapshot.
- **When a human threat model already exists**, use it as a *did-we-do-a-good-enough-job* cross-check (see above).
- **Before a design review**, to seed the conversation with a first-pass diagram and candidate risks so the meeting is spent debating, not discovering.

## What this tool is NOT

- It is **not a substitute for your team's judgment.** The output is an evidence-grounded starting catalog; deciding what's acceptable, what's urgent, and what to build is still your call (OWASP's [Threat Modeling](https://owasp.org/www-community/Threat_Modeling_Process) material is a useful practical reference for that work).
- It is **not a correctness guarantee.** An LLM can hallucinate, misread a codebase, or miss a systemic issue. The **adversarial second pass** filters out ungrounded findings, but no static/LLM pass replaces human verification.
- It is **not a full check-the-box compliance artifact** on its own — it generates raw material your team elevates into a maintained, living threat model.

## Related

- [Features](./features.md) — what the tool actually does, end to end.
- [Getting Started](./getting-started.md) — the run + review flow in practice.
