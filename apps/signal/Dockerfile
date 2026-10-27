# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root manifests and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/protocol ./packages/protocol
COPY apps/signal ./apps/signal

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @beamcode/protocol build:optional || true
RUN pnpm --filter @beamcode/signal build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Run as non-root user node (UID 1000)
USER node

# Copy built artifacts and production dependencies
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/packages/protocol ./packages/protocol
COPY --chown=node:node --from=builder /app/apps/signal/dist ./apps/signal/dist
COPY --chown=node:node --from=builder /app/apps/signal/package.json ./apps/signal/package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/apps/signal/node_modules ./apps/signal/node_modules

EXPOSE 8080

CMD ["node", "apps/signal/dist/server.js"]
