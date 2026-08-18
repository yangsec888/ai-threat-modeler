# Troubleshooting

Symptoms are grouped by where you see them. **Backend logs are the first place to look:**

```bash
docker-compose logs -f backend
```

Job-specific detail also lands under `./backend/logs/` and in each job's `error_message` on the dashboard.

## App won't start or login fails

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Backend container exits immediately | Missing `JWT_SECRET` in production | Add `JWT_SECRET=$(openssl rand -hex 32)` to `.env`, then `docker-compose up -d --build` |
| Browser shows connection error / blank page | Containers not running or wrong port | Run `docker-compose ps`; confirm frontend on **3000** and backend on **3001** |
| Login returns network error | Frontend can't reach API | If you changed ports, update `NEXT_PUBLIC_API_URL` in `docker-compose.yml` and rebuild the frontend image |

## Settings and API keys

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| "Agent provider not configured" on job start | No API key saved | **Settings → LLM Provider** → paste key → **Save Configuration** |
| Key validation fails on save | Wrong key, base URL, or provider mismatch | Confirm you're on the right provider (Claude, OpenAI, or Moonshot); check base URL; use the **Test** button |
| OpenAI selected but jobs fail | Codex provider not available in the image | Use Claude (default), or ensure the backend image includes the `codex` CLI (see `backend/Dockerfile`) |
| Moonshot selected but jobs fail | Missing/invalid Moonshot key or base URL | Confirm the Moonshot API key is saved and **Test** passes; default base URL is `https://api.moonshot.ai/v1`. Requires `appsec-agent@3.8.0`+ in the backend image |

## Staging and context extraction

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Yellow **"Couldn't auto-generate context"** banner | Extractor timed out, hit size limits, or an upstream API error | **Normal to continue** — edit the six fields manually or leave them blank and click **Run threat model** |
| **Analyze repository** never finishes | Staging expired (30 min) or extractor error | Cancel, start again; check backend logs for the specific extractor message |
| Staging disappeared | 30-minute garbage collection or **Cancel** | Re-upload or re-import and run **Analyze** again |

## Threat modeling jobs

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Job **failed** with token / max-turns message | Repo too large for current turn budget | **Settings → Threat Modeler Max Turns** — try 150–200 (max 500); add **Suggested exclusions** to skip vendor/test trees |
| Job **failed** with output token error | Response too large for model | Raise **Claude Code Max Output Tokens** in Settings (e.g. 64k) |
| Job stuck in **processing** for a long time | Large repo or slow API; agent still running | Wait; the watchdog may recover partial output. If truly stuck, cancel and retry with fewer turns or a smaller scope |
| Job **completed** but fewer threats than expected | **Adversarial second pass** dropped ungrounded threats (default on) | Expected — review threats with **Location** evidence; disable the adversary pass in Settings for an unfiltered pass |
| **Location** column shows **—** for most threats | Agent couldn't anchor code with Read/Grep | Increase max turns; use GitHub import for deep links; locations are best-effort, not guaranteed on every threat |

## GitHub import

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| **Look up** fails on a public repo | Transient GitHub error or bad URL | Use `https://github.com/owner/repo` format and retry. Public repos do **not** need a PAT |
| **Look up** fails on a private repo | Missing or invalid PAT | **Settings → GitHub** — add a PAT with `repo` scope, then **Test** |
| Download / import fails with size error | Archive over the limit | Raise **GitHub Import Limits** in Settings or analyze a smaller branch |
| Default branch missing from dropdown | GitHub lists at most 100 branch names | Type the branch name manually (see [GitHub import](./github-import.md)) |

## Reports and exports

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| **Preview** / report page empty or "not ready" | Job still running or failed | Wait for **completed** status; open the job row and read `error_message` |
| **View on GitHub** link missing | Job was a ZIP upload, not a GitHub import | Deep links are GitHub-only; ZIP jobs still show `file:line` text and snippets |
| CSV **source_locations** empty for a risk | Risk has no locations and no grounded related threats | Expected when related threats also lack locations; check the Threat Model tab for threat-level locations |

## Still stuck?

1. Reproduce once with `docker-compose logs -f backend` running in another terminal.
2. Note the **job id**, status, and any `error_message` on the dashboard.
3. Check [SETUP.md](../SETUP.md) for non-Docker dev setup issues, or [CHANGELOG.md](../CHANGELOG.md) if you recently upgraded.
