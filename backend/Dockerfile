FROM node:20-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 make g++ git bash ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app user with ID 502
RUN groupadd -g 502 app && \
    useradd -u 502 -g 502 -m -s /bin/bash app

# Set working directory
WORKDIR /app

# Install dependencies as root
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Sanity check the Claude Agent SDK + appsec-agent install.
#
# appsec-agent@3.0.1+ pins @anthropic-ai/claude-agent-sdk to a native-binary
# release (0.2.141+). The SDK ships per-platform optional packages; this image
# is Debian bookworm (glibc), so we require the linux-x64 or linux-arm64 variant
# and its bundled `claude` binary — not the obsolete pure-JS cli.js layout from
# pre-0.2.114 releases.
RUN SDK_PKG="/app/node_modules/@anthropic-ai/claude-agent-sdk/package.json" && \
    test -f "$SDK_PKG" || { echo "[sanity] @anthropic-ai/claude-agent-sdk not installed"; exit 1; } && \
    SDK_VER=$(node -p "require('$SDK_PKG').version") && \
    test -f /app/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs || { \
      echo "[sanity] sdk.mjs missing in claude-agent-sdk $SDK_VER"; exit 1; \
    } && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      NATIVE_PKG="@anthropic-ai/claude-agent-sdk-linux-x64"; \
      NATIVE_DIR="/app/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
      NATIVE_PKG="@anthropic-ai/claude-agent-sdk-linux-arm64"; \
      NATIVE_DIR="/app/node_modules/@anthropic-ai/claude-agent-sdk-linux-arm64"; \
    else \
      echo "[sanity] unsupported container arch: $ARCH"; exit 1; \
    fi && \
    test -f "$NATIVE_DIR/claude" || { \
      echo "[sanity] $NATIVE_PKG claude binary missing — optional native package may not have installed"; exit 1; \
    } && \
    test -x "$NATIVE_DIR/claude" || { \
      echo "[sanity] $NATIVE_DIR/claude is not executable"; exit 1; \
    } && \
    AGENT_RUN="/app/node_modules/appsec-agent/dist/bin/agent-run.js" && \
    test -f "$AGENT_RUN" || { \
      echo "[sanity] appsec-agent agent-run missing at $AGENT_RUN"; exit 1; \
    } && \
    echo "[sanity] claude-agent-sdk $SDK_VER with $NATIVE_PKG claude binary; appsec-agent agent-run present"

# Sanity check @openai/codex-sdk + platform codex CLI (required for --provider codex).
RUN CODEX_JS=$(node -p "require.resolve('@openai/codex/bin/codex.js')" 2>/dev/null || echo "") && \
    if [ -z "$CODEX_JS" ]; then \
      CODEX_JS=$(node -p "require.resolve('@openai/codex/bin/codex.js', { paths: ['/app/node_modules/appsec-agent'] })" 2>/dev/null || echo ""); \
    fi && \
    test -n "$CODEX_JS" || { echo "[sanity] @openai/codex bin/codex.js not resolvable"; exit 1; } && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      CODEX_NATIVE_PKG="@openai/codex-linux-x64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
      CODEX_NATIVE_PKG="@openai/codex-linux-arm64"; \
    else \
      echo "[sanity] unsupported container arch for codex: $ARCH"; exit 1; \
    fi && \
    CODEX_NATIVE_DIR=$(dirname "$(dirname "$CODEX_JS")")/node_modules/$CODEX_NATIVE_PKG && \
    if [ ! -d "$CODEX_NATIVE_DIR" ]; then \
      CODEX_NATIVE_DIR="/app/node_modules/$CODEX_NATIVE_PKG"; \
    fi && \
    if [ ! -d "$CODEX_NATIVE_DIR" ]; then \
      CODEX_NATIVE_DIR="/app/node_modules/appsec-agent/node_modules/$CODEX_NATIVE_PKG"; \
    fi && \
    test -d "$CODEX_NATIVE_DIR/vendor" || test -f "$CODEX_JS" || { \
      echo "[sanity] $CODEX_NATIVE_PKG vendor or codex.js missing"; exit 1; \
    } && \
    echo "[sanity] @openai/codex resolved at $CODEX_JS; $CODEX_NATIVE_PKG present"

# Build application
COPY tsconfig.json ./
COPY src ./src
COPY openapi.yaml ./
RUN npm install typescript @types/node --save-dev && \
    npm run build && \
    npm uninstall typescript @types/node

# Create directories and set ownership
RUN mkdir -p data uploads work_dir threat-modeling-reports logs /home/app/.cache /home/app/.claude && \
    chown -R app:app /app /home/app

# Switch to app user
USER app

# Environment variables
ENV NODE_ENV=production \
    PORT=3001 \
    HOME=/home/app \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]

