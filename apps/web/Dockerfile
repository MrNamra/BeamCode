# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy repo files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/protocol ./packages/protocol
COPY apps/web ./apps/web

# Install dependencies and build
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @beamcode/protocol build:optional || true
RUN pnpm --filter @beamcode/web build

# Production static serving with Caddy
FROM caddy:2-alpine AS runner

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/web/dist /srv

EXPOSE 80 443
