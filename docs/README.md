# Documentation

Guides for using and running AI Threat Modeler. Start with the [main README](../README.md) for the overview.

## For everyone

| Guide | What it covers |
|-------|----------------|
| [Getting Started](./getting-started.md) | Empty machine → your first threat model report |
| [Importing from GitHub](./github-import.md) | Public and private repos, branches, and limits |
| [Settings Reference](./settings.md) | Every setting, and how to tune cost and depth |
| [Troubleshooting](./troubleshooting.md) | Symptoms grouped by where you see them |
| [Features](./features.md) | Full capability list and project structure |

## For operators and developers

| Guide | What it covers |
|-------|----------------|
| [Deployment](./deployment.md) | Running with Docker Compose in production |
| [SETUP.md](../SETUP.md) | Local development without Docker |
| [CHANGELOG.md](../CHANGELOG.md) | Release history |
| [`backend/openapi.yaml`](../backend/openapi.yaml) | REST API spec (served live at `http://localhost:3001/api-docs`) |

## Design notes

Deeper design and refactoring notes live alongside this folder:

- [`add-deployment-context-field-plan.md`](./add-deployment-context-field-plan.md)
- [`threat-model-json-schema-refactoring.md`](./threat-model-json-schema-refactoring.md)

## Project governance

- [`owasp-project-application.md`](./owasp-project-application.md) | OWASP New Project Request application (PPS-153)
