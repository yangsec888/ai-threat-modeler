# Settings Reference

All settings live under **Settings** (admin only). Credentials are stored **encrypted** in the local SQLite database — no API keys in environment variables for normal operation.

## Settings at a glance

| Setting | Default | When to change it |
|---------|---------|-------------------|
| **LLM Provider** | Claude | Switch to OpenAI (Codex) or Moonshot (Kimi) if you prefer those models. |
| **Claude / OpenAI / Moonshot API key** | — | Required before any agent job. Use **Test** to validate. |
| **Claude Code Max Output Tokens** | 32,000 | Raise if responses hit token limits (e.g. 64k). Claude provider only. |
| **Threat Modeler Max Turns** | 100 | Raise for large repos that need more code grounding (max 500). |
| **Adversarial second pass** | On | Turn off for faster, cheaper single-pass runs. |
| **GitHub PAT** | — | Only needed for **private** repo import. |
| **GitHub Import Limits** | 50 MB | Raise to allow larger repo archives. |

## LLM provider and keys

- **Claude (default)** — paste your Anthropic API key. The model dropdown loads available models once a valid key is saved.
- **OpenAI (Codex)** — switch the provider, paste an OpenAI key, and pick a model.
- **Moonshot (Kimi)** — switch the provider, paste a Moonshot API key, and pick a Kimi model. The default base URL is `https://api.moonshot.ai/v1` and the default model is `kimi-k2.6`. Moonshot exposes an OpenAI-compatible API, so **Test** and the model dropdown work the same way as the OpenAI provider.
- Use the **Test** button next to a key to confirm it authenticates before saving.

Only the currently selected provider's settings are shown, to keep the screen simple.

### A note on Moonshot cost reporting

For the Moonshot provider, the per-job cost shown in the dashboard is an **estimate** computed from a static per-model rate table in `appsec-agent` (Moonshot's API does not return billed cost). Treat it as an approximation, not an invoice.

## Tuning for large repositories

Two settings control cost and depth on big codebases:

- **Threat Modeler Max Turns** (default 100) — how much Read/Grep the agent may do to anchor threats to real code. Raise to 150–200 for large repos; the max is 500.
- **Adversarial second pass** (default on) — runs a second filter pass that drops threats without code evidence. It roughly doubles agent cost. Turn it off for a single, unfiltered, cheaper pass.

Combining a higher turn budget with **Suggested exclusions** (to skip vendor/test trees) usually gives the best signal per dollar.

## A note on output tokens

**Claude Code Max Output Tokens** caps the size of a single model response on the Claude provider. If jobs fail with an output-token error, raise this value. It does not apply to the OpenAI/codex provider, so the field is hidden when OpenAI is selected.
