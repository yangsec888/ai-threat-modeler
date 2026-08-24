# Security Policy

AI Threat Modeler is a self-hosted threat-modeling tool that holds LLM provider
credentials (Anthropic, OpenAI, DeepInfra) and, in production, user accounts.
This policy describes which versions receive security fixes and how to report a
vulnerability privately.

## Reporting a vulnerability

Please **do not open a public issue** for a security vulnerability. The issue
tracker posts everything publicly before a fix ships, which puts users of older
versions at risk.

Use the **private** reporting channels:

- **GitHub private vulnerability reporting** (preferred): the repository enables
  GitHub's private vulnerability reporting — go to
  <https://github.com/yangsec888/ai-threat-modeler/security/advisories> and
  click **Report a vulnerability**. Reports there are visible only to the
  maintainers until you choose to publish them.
- **Email**: if the above is unavailable, email the maintainer at
  `security@ai-threat-modeler.example` with the subject prefix `[SECURITY]`.

### What to include

To help us triage quickly, please include:

1. The affected component (backend API, frontend dashboard, docker-compose,
   agent invocation, report parser/export, auth, etc.).
2. Steps to reproduce, or a minimal proof of concept.
3. The impact and any conditions that limit exploitability.
4. If applicable, the exact version/commit you tested against.

Reports are acknowledged within **3 business days** and we work toward a fix and
a coordinated release. We keep you in the loop on the fix timeline, and will
credit you (with your consent) for the finding.

## Supported versions

Security fixes are backported to the latest release series only. If you are
running an older version, upgrade to the most recent release to receive fixes.

| Version | Supported          |
| ------- | ------------------ |
| 3.2.x   | ✅                 |
| < 3.2   | ❌                  |

## Disclosure policy

We follow a coordinated-disclosure model. Once a fix is released, we will
publish the details in the release notes and, when the reporter consents and
the impact warrants it, as a GitHub security advisory. We aim for reporters to
see the advisory at or before the public release so they can prepare.

## Security hardening notes

The following are enforced by default and documented in the README:

- The backend binds to **loopback (`127.0.0.1`)** by default (`HOST`); the
  docker-compose published ports are likewise bound to `127.0.0.1` unless
  explicitly overridden for remote access.
- The default `admin` account is gated: the dashboard is locked behind a
  mandatory password-change screen until the default password is replaced.
- LLM provider API keys are passed to the agent process via environment
  variables, never on the command line.
- Report artifacts carry a self-describing **model regime** in their metadata
  (provider, model, reasoning effort, and whether the adversarial review pass
  ran), so a report can be read for what it is.
