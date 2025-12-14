FROM node:20-alpine

# Create app user with ID 502
RUN addgroup -g 502 app && \
    adduser -u 502 -G app -D -h /home/app app

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build Next.js application
ARG NEXT_PUBLIC_API_URL
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://localhost:3001}

RUN npm run build

# Set ownership and switch to app user
RUN chown -R app:app /app
USER app

EXPOSE 3000

CMD ["npm", "start"]

