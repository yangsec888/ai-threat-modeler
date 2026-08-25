# AI Threat Modeler

**Point it at a codebase. Get a code-grounded threat model back — ready to review, challenge, and act on. The parts the code can't see — the business context and the architecture behind it — are where you and your architects come in.**

Upload a ZIP or import a GitHub repo, and AI Threat Modeler produces a [STRIDE](https://en.wikipedia.org/wiki/STRIDE_model)-flavored **threat-model artifact**: a data-flow diagram, candidate threats, and a risk registry — with **links to the exact source files and line numbers** whenever the AI agent can ground them in real code. An optional adversarial pass drops findings with no code evidence.

Built for AppSec teams who want a **code-review scanner that speaks threat-modeling vocabulary** and stays traceable to actual code.

## What this is (and isn't)

Be clear about what you're getting, because the distinction matters:

- **This is an AI-assisted code-review / threat-discovery scanner.** It turns a codebase into a *starting catalog* of DFD + STRIDE findings + risks, each anchored to a real `file:line`.
- **This is grounded in code.** Our working principle is short and concrete: **identify the threat, ground the truth in code, then act on it.** Every finding is anchored to a real `file:line`, and claims without code evidence are dropped. The result is concrete, reviewable input your team can act on — the code is the source of truth, and your team brings the judgment to act on it.

The value you get out is proportional to what you put in (**garbage in, garbage out**) and to how seriously your team **acts on the findings** — verifying the diagram, triangulating claims against the code, and adding the business/design context that lives outside the codebase. See **[How to use the output](./docs/how-to-use-the-output.md)** for the full workflow, and how to use it as a *did-we-do-a-good-enough-job* check against an existing hand-built threat model.

## 📹 Demo

![Demo video](https://github.com/user-attachments/assets/0b263eb0-945c-43d8-b540-2a7340c7c8d2)

Or [watch on the file page](https://github.com/yangsec888/ai-threat-modeler/blob/main/demo.mp4).

## Try it in 3 steps

You'll need **Docker** and an API key for one of the supported providers — **Anthropic (Claude)**, **OpenAI**, or **DeepInfra** to run **open-weight models** (Kimi, GLM, DeepSeek).

1. **Set up your environment.** Copy the env file and add a random `JWT_SECRET`:

   ```bash
   cp .env.example .env
   echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
   ```

2. **Build and start:**

   ```bash
   docker-compose up -d --build
   ```

3. **Open http://localhost:3000**, log in with `admin` / `admin`, add your API key in **Settings**, and submit a repo.

👉 **New here? Follow the [Getting Started guide](./docs/getting-started.md)** for the full walkthrough with screenshots-worth of detail.

## What you get

After a job completes, open the report — a set of **artifacts for your review**, not a final verdict:

| Tab | Contents |
|-----|----------|
| **Data Flow Diagram** | Interactive diagram with trust boundaries; click a node to see related candidate threats and source files. **Verify this against your real architecture first** — findings built on a wrong diagram are suspect. |
| **Threat Model** | Candidate STRIDE threats with severity, mitigation, and **Location** (file:line, snippet, GitHub link when imported from GitHub). Treat each as a *hypothesis to verify in code*, not a conclusion. |
| **Risk Registry** | Risks cross-linked to threats, with remediation plans — raw material for your team's decisions and tracked remediation. |

Export to **PDF**, **CSV** (Excel-friendly), or **JSON**, so you can pull the findings into your issue tracker and threat modeling practice of record.

## How it works

Every job runs a short **stage → run** flow so the AI understands your deployment, not just your code:

1. **Analyze** — the app auto-fills six editable context fields (project summary, security context, deployment context, developer guidance, suggested exclusions, and notes). **This is your highest-leverage input** — edit it with real deployment and business context; the artifact only comes back as good as what you put in.
2. **Run** — the agent produces the full STRIDE artifact, and it shows live status on the dashboard. Then **your team reviews** it (see [How to use the output](./docs/how-to-use-the-output.md)).

## Model providers

Bring your own key for whichever provider fits your budget and compliance needs — pick the provider and model in **Settings**:

- **Anthropic (Claude)** and **OpenAI** — hosted frontier models.
- **DeepInfra — open-weight models.** Run the **Kimi**, **GLM**, and **DeepSeek** families behind an OpenAI-compatible API on a HIPAA- and SOC 2-certified inference cloud. The model picker lists each option with its per-million-token price and context window, and per-job cost is reported exactly. Open-weight models can be dramatically cheaper — a typical job on DeepSeek V4 Flash costs cents, not dollars.

You can also tune `reasoning_effort` and toggle the adversarial second pass per instance. See the [Settings Reference](./docs/settings.md).

## Documentation

| Guide | For |
|-------|-----|
| [Getting Started](./docs/getting-started.md) | First-time users — from install to first report |
| [Importing from GitHub](./docs/github-import.md) | Public and private repos, branches, limits |
| [Settings Reference](./docs/settings.md) | Tuning cost, depth, and providers |
| [Troubleshooting](./docs/troubleshooting.md) | When something goes wrong |
| [Features](./docs/features.md) | Full capability list |
| [Deployment](./docs/deployment.md) | Running with Docker Compose in production |
| [SETUP.md](./SETUP.md) | Local development without Docker |
| [CHANGELOG.md](./CHANGELOG.md) | Release history |

Full docs index: [`docs/`](./docs/README.md). Interactive API spec: **http://localhost:3001/api-docs** (when the backend is running).

## Contributing / development

```bash
npm test                                             # backend + frontend unit tests
cd frontend && npm run e2e:install && npm run e2e    # Playwright end-to-end tests
```

See [SETUP.md](./SETUP.md) for the full dev environment (Node 18+, without Docker).
