# 07 — Security & Privacy

## 1. Principles

1. Files are end-to-end between the two browsers; our server can't read them.
2. The server holds the minimum possible: in-memory code → socket mapping for minutes.
3. A 6-digit code is **a rendezvous key, not a secret**. Security must not depend on it staying secret.

## 2. Threat model

| Threat | Mitigation |
|---|---|
| Someone guesses a live code (1 in 1,000,000 per try, with many live codes the odds rise) | Per-IP rate limits, failed-join penalties, uniform error, **sender approval of every receiver**, 10-min TTL, single receiver per code |
| Someone watches the screen / hears the code | Sender sees the receiver's device name and must approve; code locks after approval |
| Malicious signaling server swaps SDP fingerprints (MITM) | Optional verification phrase (Phase 5): derive 3–4 words from the DTLS fingerprints, both sides display, users compare. Document as an advanced option. For self-hosted use the operator is trusted. |
| Eavesdropping on network | WebRTC data channels are always encrypted with DTLS (SCTP over DTLS). TURN only sees ciphertext. |
| Malicious file names / paths (path traversal) | Sanitize `name` and `relPath` on receiver, strip `..`, absolute paths, drive letters, control characters; length caps; ZIP writer uses sanitized paths |
| Malicious files (malware) | We don't scan; show "Only accept files from people you trust" on the review screen. Never auto-open files. |
| Memory exhaustion on receiver | Window-based flow control, bounded reorder buffer, streaming sinks |
| Memory/CPU exhaustion on server | 64 KiB frame cap, per-socket message rate limit, connection caps per IP, max active codes |
| DoS by creating many codes | Per-IP limits (5 active, 10/min), global cap, cooldown |
| Malformed protocol messages | zod validation on every message; close on repeated violations |
| XSS | Strict CSP (below), no `dangerouslySetInnerHTML`, escape file names, no third-party scripts |
| Clickjacking | `frame-ancestors 'none'` |
| Abuse as a malware distribution tool | Sender must be online and each receiver is approved by a human; no hosting, no public links to files. Add a "Report abuse" mailto in the footer. |
| TURN abuse (open relay) | REST ephemeral credentials, quotas, deny private ranges, rate-limit `/api/ice` |
| Fingerprinting/tracking | No analytics, no cookies, no localStorage of identifiers except theme/language preference |

## 3. Rules that must be enforced in code

- Sender approval is **on by default**. "Auto-accept" is a visible, explicit setting and applies only to the current session.
- Server never forwards `signal` messages unless both sockets are bound to the same `LOCKED` code (or an accepted nearby invite).
- `peerId`s are random 128-bit values generated server-side per connection; never reuse.
- Constant-ish response timing and identical `CODE_UNAVAILABLE` for all failure reasons.
- WebSocket `Origin` check: only `PUBLIC_ORIGIN` (and `localhost` in dev).
- Do not accept signaling messages for codes the socket doesn't own.

## 4. HTTP security headers (served with the web app, by Caddy or the signal server)

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; connect-src 'self' wss://<host> https://<host>; worker-src 'self';
  frame-ancestors 'none'; base-uri 'none'; form-action 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
```

(Adjust `connect-src` for STUN/TURN if needed; STUN/TURN use UDP/TCP not fetch, so usually unaffected. If the Service Worker streaming path requires a specific route for downloads, scope it narrowly, e.g. `/sw-download/*`.)

## 5. Privacy statement (put on `/privacy`)

- Files are never uploaded to or stored on our servers.
- Our server temporarily remembers a 6-digit code and which two browsers are connecting, in memory, for the duration of the transfer or at most a few minutes.
- We do not see file names, sizes, or contents.
- Technical data (IP address) is used for rate limiting and to open the direct connection; it is not stored long-term.
- If a relay is used, it forwards encrypted data without storing it.
- No cookies, no ads, no analytics.

## 6. Dependency & supply chain hygiene

- Lockfile committed; `pnpm audit` in CI; Renovate/Dependabot enabled.
- Keep dependencies minimal on the signaling server (fastify, ws, zod).
- Docker images run as non-root, read-only root filesystem, no volumes for the signal service (reinforces "nothing stored").
