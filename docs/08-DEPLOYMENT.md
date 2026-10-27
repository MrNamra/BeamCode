# 08 — Deployment & Configuration

## 1. Services

| Service | Required | Purpose | Notes |
|---|---|---|---|
| `web` (static files) | yes | The React app | Served by Caddy; any CDN works |
| `signal` | yes | WebSocket signaling + `/api/ice` | Tiny; 1 vCPU / 512 MB is enough for thousands of idle sockets |
| `caddy` | yes (prod) | TLS, static hosting, reverse proxy to `signal` | Automatic HTTPS |
| `coturn` | **optional** | TURN relay fallback | Only if you accept relay bandwidth cost |

**HTTPS is mandatory in production**: Service Worker streaming and the File System Access API need a secure context. `localhost` is treated as secure for development.

## 2. Environment variables (signal service)

| Var | Default | Description |
|---|---|---|
| `PORT` | `8080` |    |
| `PUBLIC_ORIGIN` | — (required in prod) | e.g. `https://share.example.com` (WS origin check) |
| `TRUST_PROXY` | `true` behind Caddy | Honor `X-Forwarded-For` |
| `CODE_TTL_SECONDS` | `600` | Waiting-code lifetime |
| `CODE_COOLDOWN_SECONDS` | `45` | Delay before a released code can be re-issued |
| `LOCKED_IDLE_TIMEOUT_SECONDS` | `60` | Locked code with no data-channel open → release |
| `MAX_ACTIVE_CODES` | `500000` | Global safety cap |
| `RATE_JOIN_PER_MIN` | `10` | Join attempts per IP |
| `RATE_CREATE_PER_MIN` | `10` | Create requests per IP |
| `MAX_CODES_PER_IP` | `5` | Simultaneous active codes per IP |
| `STUN_URLS` | `stun:stun.l.google.com:19302` | Comma-separated; empty for LAN-only mode |
| `TURN_URLS` | *(empty = TURN disabled)* | e.g. `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp` |
| `TURN_STATIC_AUTH_SECRET` | — | Shared secret with coturn (REST credentials) |
| `TURN_CREDENTIAL_TTL_SECONDS` | `3600` | Ephemeral credential lifetime |
| `NEARBY_ENABLED` | `false` | Phase 6 feature flag |
| `LOG_LEVEL` | `info` | |

Web build-time vars (Vite): `VITE_SIGNAL_URL` (defaults to same origin `/ws`), `VITE_APP_NAME`.

Validate all env vars with zod at startup; fail fast with a clear message.

## 3. Docker Compose (reference)

```yaml
services:
  signal:
    build: ./apps/signal
    environment:
      PORT: 8080
      PUBLIC_ORIGIN: https://share.example.com
      TRUST_PROXY: "true"
      STUN_URLS: stun:stun.l.google.com:19302
      # TURN_URLS: turn:turn.example.com:3478?transport=udp
      # TURN_STATIC_AUTH_SECRET: ${TURN_SECRET}
    read_only: true
    user: "1000:1000"
    restart: unless-stopped
    # no volumes on purpose: nothing is stored

  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./apps/web/dist:/srv:ro
      - caddy_data:/data
    depends_on: [signal]
    restart: unless-stopped

  # Optional TURN (host networking is simplest for UDP relay ports)
  # coturn:
  #   image: coturn/coturn
  #   network_mode: host
  #   volumes: ["./turnserver.conf:/etc/coturn/turnserver.conf:ro"]

volumes:
  caddy_data:
```

## 4. Caddyfile (reference)

```
share.example.com {
  encode zstd gzip
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss://share.example.com; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  }
  handle /ws        { reverse_proxy signal:8080 }
  handle /api/*     { reverse_proxy signal:8080 }
  handle /healthz   { reverse_proxy signal:8080 }
  handle {
    root * /srv
    try_files {path} /index.html
    file_server
  }
}
```

Service worker file must be served from the app origin with `Service-Worker-Allowed` if scoped differently; keep it at `/sw.js`.

## 5. Optional coturn config (reference)

```
listen-port=3478
tls-listen-port=5349
realm=share.example.com
use-auth-secret
static-auth-secret=<TURN_STATIC_AUTH_SECRET>
fingerprint
no-cli
no-tcp-relay        # remove if you need TCP relay
min-port=49160
max-port=49200
total-quota=100
user-quota=12
max-bps=20000000    # bytes/sec per allocation; tune to your bandwidth budget
# Block relaying into private networks
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
cert=/etc/ssl/turn.crt
pkey=/etc/ssl/turn.key
```

Open firewall: UDP/TCP 3478, TCP 5349, UDP relay range (49160–49200).

## 6. LAN-only / offline mode

1. Run the stack on a LAN machine (Raspberry Pi, mini PC, laptop).
2. Create a locally trusted certificate (`mkcert`) for the machine's hostname/IP, or use Caddy's internal CA (`tls internal`) and install the root cert on client devices.
3. Set `STUN_URLS=` (empty) and leave TURN disabled.
4. Users open `https://beam.local` (or the IP). Devices on the same LAN connect via host candidates. No internet needed.

## 7. Operations

- Health: `GET /healthz` → `200 {"ok":true,"activeCodes":N}` (no sensitive data).
- Metrics: `/metrics` (Prometheus) bound to an internal-only listener.
- Zero-downtime deploys are not required: restart drops in-memory codes; clients show "Connection lost" and users retry. Active data channels continue even if signaling restarts (only the final `release` is lost).
- Back-ups: none needed (nothing stored). 
- Cost: signaling is negligible. Only TURN (if enabled) scales with relayed traffic.

## 8. CI/CD (GitHub Actions)

Jobs: install → lint → typecheck → unit tests → build → Playwright E2E (headless Chromium + Firefox) → docker build. Cache pnpm store. Fail on `pnpm audit --audit-level=high`.
