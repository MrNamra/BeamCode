# 02 — Architecture

## 1. Big picture

```
 Sender browser                                   Receiver browser
 ┌───────────────┐   WebSocket (signaling only)   ┌───────────────┐
 │ React UI      │◄──────────┐        ┌──────────►│ React UI      │
 │ RTCPeerConn   │           ▼        ▼           │ RTCPeerConn   │
 │ File reader   │     ┌──────────────────┐       │ Disk writer   │
 └──────┬────────┘     │ Signaling server │       └──────┬────────┘
        │              │ (Node, in-memory)│              │
        │              │ code → sockets   │              │
        │              └──────────────────┘              │
        │                                                │
        └─────────── WebRTC DataChannels (DTLS) ─────────┘
              file bytes: LAN direct  /  P2P direct  /  (TURN relay fallback)
```

Three network paths for file bytes, chosen automatically by ICE (highest priority first):

1. **LAN** — host ↔ host candidates (same subnet). No internet traffic.
2. **Direct P2P** — server-reflexive candidates found via STUN, NAT hole punching.
3. **Relay** — TURN candidate. Only if 1 and 2 both fail. Optional infrastructure.

## 2. Components

### 2.1 `apps/web` (static site, can be served by any CDN or Caddy)
- UI (see `06-UI-UX-SPEC.md`).
- `SignalingClient`: WebSocket wrapper with reconnect, heartbeat, typed messages from `packages/protocol`.
- `PeerSession`: owns `RTCPeerConnection`, negotiated data channels, ICE handling, connection-type detection.
- `SenderTransfer`: reads files, frames chunks, applies backpressure, tracks acks.
- `ReceiverTransfer`: reorders chunks, writes to sink, sends acks.
- `Sinks`: `FileSystemAccessSink`, `ServiceWorkerStreamSink`, `MemoryBlobSink`, `ZipSink`.
- Service Worker `sw.js` for streaming downloads.
- Zustand stores: `sessionStore` (role, code, state), `transferStore` (files, progress, speed).

### 2.2 `apps/signal` (Node)
- `GET /healthz`, `GET /api/ice` (ICE servers, ephemeral TURN credentials), `GET /ws` (WebSocket upgrade). **No other routes.**
- `CodeRegistry`: in-memory map with states `ACTIVE → LOCKED → COOLDOWN → free`.
- `RateLimiter`: token bucket per IP for create/join and failed join penalty.
- `Relay`: forwards `signal` messages between the two sockets of a code.
- Optional later: `NearbyRegistry` (Phase 6), `RedisAdapter` (multi-instance).

### 2.3 `packages/protocol`
- zod schemas + TypeScript types for signaling messages and data-channel control messages.
- Constants: code length, TTLs, frame header layout, version numbers.
- Binary frame encode/decode helpers (pure functions, unit-tested).

### 2.4 Optional infra
- **coturn** for TURN (see `08-DEPLOYMENT.md`).
- **Caddy** for TLS and static hosting.

## 3. Repo layout

```
beamcode/
├─ AGENTS.md
├─ README.md
├─ docs/                      # these spec files
├─ package.json               # pnpm workspace root
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ docker-compose.yml
├─ Caddyfile
├─ apps/
│  ├─ web/
│  │  ├─ index.html
│  │  ├─ public/sw.js         # streaming download service worker
│  │  └─ src/
│  │     ├─ main.tsx
│  │     ├─ app/               # routes: Home, Receive(/r/:code)
│  │     ├─ components/        # CodeDisplay, CodeInput, DropZone, FileList, ProgressCard, ConnectionBadge, QrCode
│  │     ├─ core/
│  │     │  ├─ signaling/      # SignalingClient
│  │     │  ├─ rtc/            # PeerSession, iceConfig, connectionType
│  │     │  ├─ transfer/       # SenderTransfer, ReceiverTransfer, framing, backpressure
│  │     │  ├─ sinks/          # fsAccess, swStream, memory, zip
│  │     │  └─ util/           # format, speedMeter, deviceName
│  │     ├─ stores/
│  │     ├─ i18n/              # en.json (+ hi.json, gu.json stubs)
│  │     └─ styles/
│  └─ signal/
│     └─ src/
│        ├─ server.ts
│        ├─ codeRegistry.ts
│        ├─ rateLimiter.ts
│        ├─ relay.ts
│        ├─ ice.ts            # TURN REST credentials
│        └─ config.ts         # env parsing (zod)
├─ packages/
│  └─ protocol/
│     └─ src/{signaling.ts, control.ts, frame.ts, constants.ts, index.ts}
├─ scripts/bench.ts
└─ e2e/                       # Playwright tests
```

## 4. Key flows

### 4.1 Send → Receive (happy path)

1. Sender picks files (kept as `File` objects in memory; nothing uploaded).
2. Sender opens WS → `hello` → `create` → server returns `code`, `expiresAt`.
3. Receiver enters code → `join {code}`.
4. Server sends sender `join-request {receiverId, deviceName}`; sender approves → `join-decision {accept:true}`.
5. Server locks code, tells both sides `join-accepted` with each other's `peerId`.
6. Sender creates `RTCPeerConnection` + negotiated data channels + offer → `signal` → receiver answers. Trickle ICE both ways via `signal`.
7. ICE connects (LAN/direct/relay). Data channels open. WebSocket is no longer needed for data (kept for release / expiry notifications).
8. Control channel: `hello` (capabilities) → `manifest` → receiver `accept` (choices) → `start`.
9. Data flows over N parallel channels with backpressure and acks.
10. Receiver sends `done`; sender sends `release {reason:"completed"}`; server frees the code (cooldown then reuse). Both close the peer connection.

### 4.2 Sender state machine

```
IDLE → FILES_SELECTED → REQUESTING_CODE → CODE_ACTIVE
CODE_ACTIVE → AWAITING_APPROVAL (receiver joined)
AWAITING_APPROVAL → CONNECTING (approved) | CODE_ACTIVE (rejected)
CONNECTING → NEGOTIATING (channels open, waiting for receiver accept)
NEGOTIATING → TRANSFERRING | CANCELLED (receiver declined)
TRANSFERRING → COMPLETED | FAILED | CANCELLED
CODE_ACTIVE → EXPIRED (TTL)
Any → FAILED (WS lost > grace, ICE failed)
Terminal states: COMPLETED, FAILED, CANCELLED, EXPIRED → "Send more" resets to IDLE
```

### 4.3 Receiver state machine

```
IDLE → ENTERING_CODE → JOINING → WAITING_APPROVAL → CONNECTING → REVIEWING_MANIFEST
REVIEWING_MANIFEST → RECEIVING | DECLINED
RECEIVING → COMPLETED | FAILED | CANCELLED
JOINING → ERROR (not found / locked / rate limited / rejected)
```

### 4.4 Server code state machine

```
FREE → ACTIVE (create) → LOCKED (join accepted) → COOLDOWN (release) → FREE
ACTIVE → COOLDOWN (TTL expiry / cancel / sender socket closed)
LOCKED → COOLDOWN (completed / failed / cancelled / idle timeout / either socket closed)
```

## 5. Design decisions

| Decision | Why |
|---|---|
| Native WebRTC, no PeerJS | Control over multiple negotiated data channels, stats, and our own 6-digit code protocol. |
| Own signaling server | PeerJS cloud can't issue 6-digit codes or guarantee expiry semantics. |
| Negotiated data channels (`negotiated:true, id:n`) | No `ondatachannel` race; both sides create the same channels up front. |
| Server stores zero metadata about files | Privacy + makes "no files stored" trivially provable. |
| In-memory registry | Codes live minutes; persistence adds risk and no value. Single instance in v1. |
| ICE policy `all` + optional TURN | Direct paths win automatically; TURN is last resort. |
| Sender approval before connecting | Stops someone who guessed a 6-digit code from silently pulling files. |
| 6-digit code is only a rendezvous key, not a secret | Transfer security relies on approval + DTLS; see security doc. |

## 6. Scaling notes

- v1: one signaling instance. Memory per active code is tiny (a few hundred bytes).
- If horizontal scaling is needed later: shard by `hash(code) % N` at the proxy, or use Redis pub/sub; keep the `CodeRegistry` behind an interface so this is possible.
- Capacity alarm: if active+cooldown codes exceed 50% of 1,000,000, log a warning (and consider 7 digits).
