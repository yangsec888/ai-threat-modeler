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

# Sanity check the Claude Agent SDK install.
#
# backend/package.json declares @anthropic-ai/claude-agent-sdk at ^0.2.39.
# The lockfile currently resolves a pre-native-split release that ships a
# pure-JS `cli.js` and spawns it via node. Starting at 0.2.114, the SDK
# moved to per-platform native binaries whose resolver (`lJ()` in sdk.mjs)
# picks the musl variant before the glibc one with no libc detection — on
# Debian-based images (this one) this fails at spawn time with a misleading
# "Claude Code native binary not found" error.
#
# This step fails the build if a future transitive bump or lockfile regen
# silently pulls the SDK onto a native-binary release, so the regression is
# caught at build time instead of at the next prod spawn.
RUN SDK_PKG=$(find /app/node_modules -type f -path '*@anthropic-ai/claude-agent-sdk/package.json' | head -1) && \
    test -n "$SDK_PKG" || { echo "[sanity] @anthropic-ai/claude-agent-sdk not installed"; exit 1; } && \
    SDK_DIR=$(dirname "$SDK_PKG") && \
    SDK_VER=$(node -p "require('$SDK_PKG').version") && \
    test -f "$SDK_DIR/cli.js" || { \
      echo "[sanity] $SDK_DIR/cli.js missing — SDK may have moved to a native-binary release"; exit 1; \
    } && \
    NATIVE=$(find /app/node_modules -type d -name 'claude-agent-sdk-*') && \
    if [ -n "$NATIVE" ]; then \
      echo "[sanity] unexpected native SDK variant(s) found:"; echo "$NATIVE"; \
      echo "[sanity] claude-agent-sdk drifted onto native-binary release — pin to a pre-0.2.114 pure-JS version before shipping"; \
      exit 1; \
    fi && \
    echo "[sanity] claude-agent-sdk at $SDK_VER (pure-JS at $SDK_DIR)"

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

