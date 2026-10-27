# 09 — Testing & Benchmarks

## 1. Unit tests (Vitest)

**packages/protocol**
- Frame encode/decode round trip; offsets > 4 GiB; wrong version; truncated header.
- zod schemas accept valid messages and reject malformed/extra-large ones.

**apps/signal**
- `CodeRegistry`: unique 6-digit codes; collision retry with injected RNG; ACTIVE→LOCKED→COOLDOWN→FREE transitions with fake timers; cooldown blocks join; re-assignment of the exact same code after cooldown (**AC-3**); TTL expiry (**AC-5**); sender socket close releases within 5 s (**AC-4**).
- `RateLimiter`: 10 joins/min then `RATE_LIMITED` (**AC-9**); failed-join penalty; per-IP active code cap.
- Relay: `signal` rejected if sockets aren't bound to the same locked code.
- `ice.ts`: TURN credential HMAC matches the coturn algorithm; TURN omitted when not configured.

**apps/web**
- Filename sanitizer: `../../etc/passwd`, `C:\x`, long names, control chars, reserved Windows names.
- Reorder buffer: out-of-order sequences, bounded memory, wrap-around of `seq`.
- Speed meter and ETA math.
- Connection-type classifier with mocked `getStats` reports (host/host → lan, srflx → direct, relay → relay).
- CodeInput: paste, backspace, auto-submit.

## 2. Integration tests

- Start the real signal server on a random port. Two fake WebSocket clients run a full create → join → approve → signal relay → release flow.
- Negative paths: wrong code, locked code, reject ×3, sender disconnects mid-lock, oversized frame closes socket, unknown message type.

## 3. End-to-end (Playwright, two browser contexts)

Run against `pnpm dev` or the built stack.

| Test | Steps / assertion |
|---|---|
| Happy path small file | Sender selects file → code visible (6 digits) → receiver joins → sender approves → receiver accepts → file saved; hash equals (**AC-2**) |
| Large file | Generate 1 GB sparse/random file in test setup; transfer; compare SHA-256 (**AC-1**); assert Chromium JS heap stays low (**AC-8** with FS Access mocked via download event in tests, or run the SW stream path) |
| Multi-file / folder | 3 files + nested folder; receive as ZIP and as individual files; verify structure |
| Cancel | Sender cancels mid-transfer → receiver sees cancelled; code rejected for new joiner |
| Decline | Receiver declines manifest → both reset; code released |
| Expiry | Set `CODE_TTL_SECONDS=3` in test env; wait; UI shows expired; join fails |
| Re-assignment | After completed transfer + cooldown (set 2 s), request a new code with injected RNG → gets the same code |
| Wrong code | 11 bad attempts → `RATE_LIMITED` message visible (**AC-9**) |
| Connection badge | localhost pair → `LAN` badge (**AC-7**) |
| Relay path | Launch Chromium with a TURN-only ICE config (`iceTransportPolicy` forced via test hook) against a local coturn container → `Relay` badge |
| Browsers | Run the happy-path test in Chromium and Firefox; WebKit smoke test if available |
| Responsive | Screenshots at 360 px and 1440 px; light and dark (**AC-10**) |
| A11y | `@axe-core/playwright` on Home, Code, Receive, Progress states; zero serious violations |

## 4. "No storage" verification (**AC-6**) — mandatory

1. **Static check:** a test greps `apps/signal/src` for forbidden imports/patterns: `multipart`, `fs.write*`, `createWriteStream`, `@fastify/multipart`, `formidable`, `busboy`, any S3/object-storage SDK. Test fails if found (allowlist only for reading config files).
2. **Route check:** enumerate the server's routes; assert only `GET /healthz`, `GET /api/ice`, `GET /ws` (and `/metrics` on the internal listener). Any `POST/PUT/PATCH` fails the test. Body parsing for non-JSON content types is disabled.
3. **Runtime check:** run a full 500 MB transfer through the E2E harness while monitoring the signal process: disk writes (via `/proc/<pid>/io` `write_bytes` delta on Linux CI, or `strace -f -e trace=write,openat` filtered to non-socket FDs) stay near zero (< 1 MB, logs only), and process RSS stays below e.g. 100 MB.
4. **Protocol check:** assert a WebSocket frame > 64 KiB closes the connection with 1009.

## 5. Benchmark (`pnpm bench`)

`scripts/bench.ts` launches headless Chromium with two pages (sender/receiver), a local signal server, and transfers a generated file (default 2 GB, configurable) in a matrix:

| Variable | Values |
|---|---|
| Channels | 1, 2, 4, 8 |
| Chunk size | 16, 32, 64, 128, 256 KiB |
| Window | 8, 16, 32, 64 MiB |
| Network shaping (optional, via `tc netem` / Chromium CDP `Network.emulateNetworkConditions` doesn't apply to WebRTC, so use `tc` in a Linux container) | none / 50 ms RTT / 100 Mbps / 2% loss |

Output: table of MB/s (mean of 3 runs), CPU %, peak JS heap, selected pair type. Save to `docs/BENCHMARKS.md`. Choose defaults (channels, chunk, window) from the best stable results and document why. Re-run after any transfer-code change.

**Targets (goals to measure, not promises):**
- Localhost loopback: ≥ 300 MB/s in Chromium (shows the code path isn't the bottleneck).
- Gigabit LAN: ≥ 80% of line rate when hardware allows.
- Internet: ≥ 85% of min(sender upload, receiver download) on stable links.
- Receiver heap growth during a 5 GB streamed transfer: < 200 MB.

## 6. Manual test checklist (before release)

- [ ] Phone ↔ laptop on same Wi-Fi shows **LAN**, fast
- [ ] Phone on mobile data ↔ laptop on home Wi-Fi shows **Direct** (or **Relay** if TURN needed)
- [ ] Safari iOS receiving a multi-hundred-MB file via SW stream
- [ ] Firefox receiving 2 GB
- [ ] Close sender tab mid-transfer → receiver shows failure; code free after cooldown
- [ ] Airplane-mode toggle mid-transfer → clear failure message
- [ ] Code typed with spaces, pasted, from QR link `/r/123456`
- [ ] Dark mode, 360 px width, keyboard-only flow, screen reader pass
- [ ] Server restart during transfer: data keeps flowing; UI doesn't lie
