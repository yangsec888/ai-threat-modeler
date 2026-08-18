# Deployment (Docker Compose)

This guide is for operators running AI Threat Modeler with Docker Compose. For local, non-Docker development, see [SETUP.md](../SETUP.md).

## Services

| Service  | URL                     |
|----------|-------------------------|
| Frontend | http://localhost:3000   |
| Backend  | http://localhost:3001   |

## Start, rebuild, stop

```bash
docker-compose up -d --build          # build and start everything
docker-compose logs -f backend        # tail backend logs
docker-compose up -d --build backend  # rebuild a single service
docker-compose down                   # stop
docker-compose down -v                # stop and remove volumes (deletes data)
```

## Required configuration

Create `.env` before the first production start:

```bash
cp .env.example .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
```

> The backend **refuses to start** with `NODE_ENV=production` unless `JWT_SECRET` is set. Store it in `.env` or your secret manager.

## Persisted volumes

State survives container restarts through these host-mounted volumes:

- `./backend/data` — SQLite database
- `./backend/threat-modeling-reports` — generated reports
- `./backend/uploads` — uploaded archives
- `./backend/work_dir` — transient job working directory
- `./backend/logs` — job logs

Removing volumes (`docker-compose down -v`) deletes all of the above, including your users and API keys.

## Custom ports or API URL

Edit `docker-compose.yml`:

- change the `ports` mappings, and
- update the `NEXT_PUBLIC_API_URL` build arg so the frontend points at the right backend, then rebuild the frontend image.

## Bundled agent runtime

The backend image bundles **`appsec-agent@3.8.0`**, which pulls in:

- the **Claude Agent SDK** with native `claude` binaries (default provider),
- the **`codex` CLI** for the OpenAI provider, and
- the **`openai` SDK** used by the Moonshot (Kimi) provider. Moonshot runs against an OpenAI-compatible HTTP API and needs no platform-specific binary, so there is no extra native-binary check for it in `backend/Dockerfile`.

Upgrading `appsec-agent` is a matter of bumping the version in `backend/package.json` and rebuilding the backend image.
