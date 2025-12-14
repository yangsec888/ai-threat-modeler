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
RUN npm install -g @anthropic-ai/claude-code@2.0.10 && \
    npm ci --only=production && \
    npm cache clean --force

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

