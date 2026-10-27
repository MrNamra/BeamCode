# BeamCode — Peer-to-Peer File Sharing with 6-Digit Codes

> Working name. Rename freely. This is a spec pack: hand the whole folder to a coding agent (Claude Code, Cursor, Codex, Copilot, etc.) and tell it to start with `AGENTS.md`.

## What we are building

A browser-based file sharing app where:

1. **Sender** picks files, gets a **unique 6-digit code** (plus QR code and link).
2. **Receiver** types the code (or opens the link / scans the QR) and the files go **directly from sender's browser to receiver's browser** using WebRTC.
3. The code **expires when the transfer completes** (or is cancelled / fails / times out) and **can be re-assigned** to someone else afterwards.
4. If both devices are on the **same LAN**, traffic stays on the LAN (no internet round trip). Otherwise it goes **direct peer-to-peer** over the internet. A relay (TURN) is used **only if direct connection is impossible**, and it is optional.
5. **No file is ever stored on our server.** The server only does tiny signaling (code lookup + connection handshake). File bytes never touch it.
6. Goal: **transfer at the maximum speed the network and browsers allow.**

References:
- Architecture inspiration: [kern/filepizza](https://github.com/kern/filepizza) (WebRTC, no intermediary storage, streaming downloads via Service Worker).
- UI inspiration: Send Anywhere (two-card Send / Receive layout, big 6-digit key, countdown). Build an **original** look. Do **not** copy their logo, text, illustrations or assets.

## Important honest notes (read before promising things to users)

- **"No server at all" is not possible for browsers.** Two browsers cannot find each other without a rendezvous point. We need one small signaling server (WebSocket) that maps `code → sender` and relays handshake messages. It stores nothing but in-memory code state, for minutes. It never sees file names or file bytes.
- **TURN relay is a fallback only.** Roughly 10–20% of real-world network pairs (symmetric NAT, strict corporate firewalls) cannot connect directly. For them, an optional TURN server relays encrypted bytes (still no storage, but it uses your bandwidth and is slower). If you don't configure TURN, those pairs simply get an error message.
- **Sender must keep the tab open** until the transfer finishes (same as FilePizza).
- **Speed is "as fast as possible", not guaranteed.** Browser WebRTC data channels usually come close to link speed on LAN with the tuning in `04-TRANSFER-PROTOCOL.md`, but the real ceiling depends on CPU, Wi-Fi, disk, and browser. We measure it (see `09-TESTING.md`) instead of promising a number.
- **LAN detection is automatic via WebRTC ICE** (host candidates). Browsers cannot do raw UDP broadcast or mDNS service discovery, so "nearby devices" uses same-public-IP grouping on the signaling server (optional, Phase 6). See `05-LAN-AND-NETWORK.md`.
- **HTTPS is required** in production (Service Worker + File System Access API need a secure context). LAN self-hosting needs a local certificate. See `08-DEPLOYMENT.md`.

## Document index (read in this order)

| File | Purpose |
|---|---|
| `AGENTS.md` | Rules and workflow for the coding agent (copy as `CLAUDE.md` / `.cursorrules` if your tool needs that name) |
| `docs/01-PRD.md` | Product requirements, user stories, acceptance criteria |
| `docs/02-ARCHITECTURE.md` | Components, tech stack, repo layout, data flow, state machines |
| `docs/03-SIGNALING-PROTOCOL.md` | WebSocket message spec, code lifecycle, server rules |
| `docs/04-TRANSFER-PROTOCOL.md` | WebRTC data channel protocol, speed tuning, streaming to disk |
| `docs/05-LAN-AND-NETWORK.md` | LAN vs P2P vs relay behavior, ICE config, nearby devices |
| `docs/06-UI-UX-SPEC.md` | Screens, components, states, visual style |
| `docs/07-SECURITY-PRIVACY.md` | Threat model, rate limits, encryption, privacy rules |
| `docs/08-DEPLOYMENT.md` | Docker, Caddy, coturn, env vars, LAN self-hosting |
| `docs/09-TESTING.md` | Unit, integration, E2E, benchmark, "no storage" tests |
| `docs/10-TASKS.md` | Phased implementation checklist with acceptance criteria |

## Quick start (local development)

```bash
pnpm install
pnpm dev          # web on :5173, signaling on :8080
pnpm test         # unit + integration (75+ tests)
pnpm e2e          # Playwright two-browser transfer tests
pnpm bench        # throughput benchmark matrix
docker compose up # production-ready container stack
```

## Production & Self-Hosted Deployment (Docker Compose)

BeamCode provides a minimal, secure container stack using Docker Compose and Caddy:

1. **Start the stack**:
   ```bash
   docker compose up -d
   ```
2. **Access the application**:
   - Web application: `http://localhost` (or configured `PUBLIC_HOST`)
   - WebSocket signaling: `ws://localhost:8080/ws` (proxied via Caddy at `/ws`)
   - Health check: `http://localhost/healthz`

### Security Hardening
- **Non-root user**: Signaling runs as user `1000:1000`.
- **Read-only filesystem**: Signaling container runs with `read_only: true`.
- **Zero storage**: No volumes or databases are mounted for signaling. Nothing is written to disk.
- **Strict Content Security Policy & Headers**: Automatic HTTPS, strict CSP, `frame-ancestors 'none'`, and nosniff headers.

## LAN-Only / Air-Gapped Mode (with `mkcert`)

BeamCode can operate completely offline without internet connectivity on a local Wi-Fi or LAN network:

1. **Generate local trusted certificates**:
   ```bash
   mkcert -install
   mkcert beam.local 192.168.1.100 localhost
   ```
2. **Configure Caddy or local TLS**:
   Mount the generated certificates into Caddy or use Caddy's built-in internal CA:
   ```caddy
   beam.local {
     tls internal
     ...
   }
   ```
3. **Disable external STUN/TURN**:
   In `apps/signal`:
   ```bash
   STUN_URLS=""
   TURN_URLS=""
   ```
4. **Connect devices**:
   Open `https://beam.local` on phones, tablets, and laptops. WebRTC automatically selects `host` ICE candidates and streams directly across your local network at wire speeds without internet access.

## Limitations

- **Sender tab must stay open**: Because files stream directly from the sender's device, closing the tab terminates the active transfer.
- **Symmetric NAT / Strict Firewalls**: Without TURN relay configured, networks behind symmetric NATs or restrictive enterprise firewalls may fail to establish a direct P2P link. An optional coturn service is provided in `turnserver.conf`.
- **Mobile background tabs**: Certain mobile browsers throttle WebSockets and WebRTC when tabs are placed in the background. BeamCode requests a Screen Wake Lock during active transfers to prevent premature display sleep.

## Tech stack summary

- **Web:** Vite + React + TypeScript (strict) + Tailwind CSS v4, native `RTCPeerConnection` (no PeerJS), Service Worker streaming download, File System Access API.
- **Signaling server:** Node.js 22 LTS + Fastify + `ws` + `zod`, in-memory state only.
- **Shared:** `packages/protocol` with zod schemas and types used across all packages.
- **Infra:** Docker Compose, Caddy (automatic TLS), optional coturn (TURN).
