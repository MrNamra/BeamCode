# 03 — Signaling Protocol & Code Lifecycle

Transport: WebSocket at `/ws`, JSON text frames, UTF-8. Max frame size **64 KiB** (server enforces; larger frames close the socket with 1009). Every message has `v` (protocol version, currently `1`) and `t` (type). All messages are validated with zod on both sides; unknown or malformed messages → `error {code:"BAD_MESSAGE"}`.

The signaling server **never** receives file names, sizes, or bytes. It only relays SDP/ICE blobs.

## 1. Client → Server messages

```ts
// Sent once after socket opens
{ v:1, t:"hello", clientVersion:string }

// Sender asks for a code
{ v:1, t:"create" }

// Receiver joins with a code
{ v:1, t:"join", code:string /* /^\d{6}$/ */ }

// Sender answers a join request
{ v:1, t:"join-decision", receiverId:string, accept:boolean }

// Relay a WebRTC handshake message to the other peer
{ v:1, t:"signal", to:string, data:
    | { kind:"offer",  sdp:string }
    | { kind:"answer", sdp:string }
    | { kind:"ice",    candidate:RTCIceCandidateInit | null } }

// Sender (or either peer) frees the code
{ v:1, t:"release", reason:"completed"|"cancelled"|"failed" }

// Keepalive (every 20 s)
{ v:1, t:"ping" }
```

## 2. Server → Client messages

```ts
{ v:1, t:"welcome", peerId:string, deviceName:string }          // reply to hello; deviceName e.g. "Brave Otter"
{ v:1, t:"code-created", code:string, expiresAt:number }         // epoch ms
{ v:1, t:"join-request", receiverId:string, deviceName:string }  // to sender
{ v:1, t:"join-pending" }                                        // to receiver, waiting for approval
{ v:1, t:"join-accepted", peerId:string }                        // to both; peerId = the other side
{ v:1, t:"join-rejected" }                                       // to receiver
{ v:1, t:"signal", from:string, data:... }                       // relayed
{ v:1, t:"code-released", reason:"completed"|"cancelled"|"failed"|"expired"|"peer-left"|"idle" }
{ v:1, t:"error", code:ErrorCode, message:string, retryAfterMs?:number }
{ v:1, t:"pong" }
```

`ErrorCode`: `BAD_MESSAGE`, `CODE_UNAVAILABLE` (covers not found, expired, locked, cooldown — one code on purpose), `RATE_LIMITED`, `SERVER_BUSY`, `NOT_ALLOWED`, `INTERNAL`.

## 3. Code generation

- Use `crypto.randomInt(0, 1_000_000)` on the server, zero-pad to 6 digits.
- Retry until the candidate is not in the registry (`ACTIVE`, `LOCKED`, or `COOLDOWN`). Max 50 tries, then `SERVER_BUSY`.
- The RNG is injectable so tests can force collisions and re-assignment.
- Codes are generated **only** by the server. Clients never choose codes.

## 4. Code lifecycle

| State | Entered when | Leaves when |
|---|---|---|
| `ACTIVE` | `create` succeeds | receiver join approved → `LOCKED`; TTL (default 600 s) → `COOLDOWN`; sender `release` / socket close → `COOLDOWN` |
| `LOCKED` | sender approves a join | `release` (completed/failed/cancelled) → `COOLDOWN`; either socket closes → `COOLDOWN`; **idle timeout** with no signaling or progress heartbeat for 60 s *before* the data channels open → `COOLDOWN` |
| `COOLDOWN` | any release | after `CODE_COOLDOWN_SECONDS` (default 45) → removed (code is free and can be re-assigned) |
| (free) | | |

Notes:
- While `LOCKED` and transferring, the TTL no longer applies (a 50 GB transfer can take longer than 10 min). Instead, liveness is the sender's WebSocket staying connected (ping/pong). If the sender's socket dies, the transfer is considered failed.
- During `COOLDOWN`, `join` returns `CODE_UNAVAILABLE`. The cooldown prevents a person typing a stale code from reaching a brand-new, unrelated sender.
- `release` by the *receiver* is allowed only to leave: it releases the code with reason `cancelled`.
- When a `LOCKED` code is released, the server sends `code-released` to both sockets so both UIs can finish.
- Receiver rejected by sender → `join-rejected`, code returns to `ACTIVE` (same code, same TTL remaining) so the real receiver can still join. Count rejections; after 3 rejections, release the code (`cancelled`) to stop harassment.

## 5. Rate limiting & abuse controls (enforced server-side)

Key = client IP (respect `X-Forwarded-For` only when `TRUST_PROXY=true`; IPv6 grouped by /64).

| Action | Limit | On violation |
|---|---|---|
| `join` attempts | 10 / minute / IP | `RATE_LIMITED` with `retryAfterMs` |
| Failed joins | 5 in 10 min | block joins from that IP for 10 min |
| `create` | 10 / minute / IP, and max 5 simultaneously active codes / IP | `RATE_LIMITED` |
| WebSocket connections | 20 / IP | close with 1013 |
| Message rate | 30 msgs / 10 s / socket | close with 1008 |
| Global active+cooldown codes | `MAX_ACTIVE_CODES` (default 500,000) | `SERVER_BUSY` |

All responses for "wrong, expired, locked, cooldown" are the same `CODE_UNAVAILABLE` so attackers cannot probe which codes are live. Add small random delay (50–150 ms) to failed joins.

## 6. `GET /api/ice`

Returns the ICE server list for `RTCPeerConnection`. Rate-limited. Response:

```json
{
  "iceServers": [
    { "urls": ["stun:stun.l.google.com:19302"] },
    { "urls": ["turn:turn.example.com:3478?transport=udp", "turns:turn.example.com:5349?transport=tcp"],
      "username": "1730000000:peer", "credential": "<hmac>" }
  ],
  "ttl": 3600
}
```

- TURN entries appear **only if** `TURN_URLS` and `TURN_STATIC_AUTH_SECRET` are configured.
- Credentials follow the coturn REST-API scheme: `username = <expiryUnix>:<random>`, `credential = base64(HMAC-SHA1(secret, username))`. Short TTL (default 1 h).
- STUN list is configurable via `STUN_URLS`.

## 7. Server logging rules

- Log: connection counts, code create/release counts, rate limit hits, errors.
- Never log: full codes (use `12****`), SDP, ICE candidates, IP addresses beyond a salted hash rotated daily (or no IPs at all), file anything.
- Metrics (Prometheus text at `/metrics`, bound to localhost/internal only): active codes, locked codes, cooldown codes, ws connections, join failures, rate-limit hits.

## 8. Reconnection behavior (client)

- If the WebSocket drops while `CODE_ACTIVE` and before a receiver is accepted: auto-reconnect with exponential backoff (max 3 tries). The server cannot resume the old code across sockets in v1, so if reconnect succeeds the sender gets a **new code** and the UI says so.
- If the WebSocket drops during `TRANSFERRING` and the data channels are healthy: the transfer continues; the client reconnects in the background just to deliver `release` at the end. If reconnect fails, the server will have moved the code to cooldown, which is fine.
