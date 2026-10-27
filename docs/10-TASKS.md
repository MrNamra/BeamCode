# 10 — Implementation Plan (tick as you go)

Work strictly in order. Finish a phase (all checks green) before starting the next. After each phase run `pnpm lint && pnpm typecheck && pnpm test`.

## Phase 0 — Scaffold
- [x] pnpm workspace with `apps/web`, `apps/signal`, `packages/protocol`
- [x] `tsconfig.base.json` (strict), ESLint, Prettier, Vitest, Playwright config
- [x] Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `e2e`, `bench`
- [x] GitHub Actions workflow skeleton
- [x] `docs/DECISIONS.md` created (empty template)

**Done when:** `pnpm dev` starts an empty web page and a signal server returning `/healthz`.

## Phase 1 — Protocol package
- [x] zod schemas for all signaling messages (`03-SIGNALING-PROTOCOL.md`)
- [x] zod schemas for control messages (`04-TRANSFER-PROTOCOL.md`)
- [x] Constants (code length, TTLs, max frame, header size)
- [x] `encodeFrame` / `decodeFrame` with tests (offsets > 4 GiB, malformed)

**Done when:** protocol unit tests pass; both apps import types from it.

## Phase 2 — Signaling server
- [x] `config.ts` env parsing with zod and defaults
- [x] Fastify app with `GET /healthz`, `GET /api/ice`, WebSocket `/ws` (only these routes)
- [x] 64 KiB max payload, Origin check, message validation, per-socket message rate limit
- [x] `CodeRegistry` with ACTIVE/LOCKED/COOLDOWN/FREE, injectable RNG and clock
- [x] `create`, `join`, `join-decision`, `signal`, `release`, `ping`
- [x] Rejection counter (3 rejections releases code)
- [x] `RateLimiter` (join, failed join, create, per-IP active codes, WS connections)
- [x] Uniform `CODE_UNAVAILABLE` + small random delay on failures
- [x] TURN REST credentials in `/api/ice` (only if configured)
- [x] Logging rules (masked codes, no SDP/ICE/IP) and Prometheus `/metrics` on internal listener
- [x] Unit + integration tests from `09-TESTING.md` §1–2
- [x] "No storage" static + route tests (`09-TESTING.md` §4.1, 4.2)

**Done when:** integration tests prove full create → join → approve → relay → release → cooldown → re-assign.

## Phase 3 — Web core (no polished UI yet)
- [x] `SignalingClient` (typed, heartbeat, reconnect policy from doc 03 §8)
- [x] `iceConfig` fetch from `/api/ice`
- [x] `PeerSession`: RTCPeerConnection, negotiated `ctrl` + 8 data channels, trickle ICE, `max-bundle`, state events
- [x] `detectConnectionType` + tests with mocked stats
- [x] Control-channel handshake: `hello` → `manifest` → `accept`/`decline` → `start` → `file-end` → `done` / `cancel`
- [x] `SenderTransfer`: 4 MiB read-ahead, chunk framing, channel selection, bufferedAmount backpressure, ack window
- [x] `ReceiverTransfer`: frame validation, reorder buffer, ack scheduling
- [x] Sinks: `FileSystemAccessSink`, `ServiceWorkerStreamSink` + `public/sw.js`, `MemoryBlobSink`, `ZipSink` (store-only)
- [x] Filename/path sanitizer with tests
- [x] Speed meter / ETA
- [x] Wake Lock during transfer
- [x] Dev-only `/debug` page

**Done when:** a Playwright test transfers a 1 GB file between two contexts on localhost with matching SHA-256 using a throwaway test page.

## Phase 4 — UI (per `06-UI-UX-SPEC.md`)
- [x] Design tokens, light/dark theme, header, responsive layout
- [x] DropZone (button, drag & drop, paste, folder), FileList
- [x] CodeDisplay (digits, copy, countdown, QR, link, status, cancel)
- [x] CodeInput (6 boxes, paste, auto-submit) + `/r/:code` deep link
- [x] Sender approval UI; receiver review/accept screen with file selection and ZIP toggle
- [x] ProgressCard with speed/ETA and ConnectionBadge
- [x] All result/error states from §3.7 and browser gating (§8)
- [x] `beforeunload` guard while a code is active/transferring
- [x] i18n dictionary (`en`, stubs for `hi`, `gu`)
- [x] `/privacy` and `/how-it-works` pages
- [x] Accessibility pass (axe, keyboard, aria-live)

**Done when:** all E2E tests in `09-TESTING.md` §3 pass in Chromium and Firefox.

## Phase 5 — Performance & hardening
- [ ] `pnpm bench` implemented; results table in `docs/BENCHMARKS.md`
- [ ] Defaults (channels/chunk/window) set from benchmark data and documented
- [ ] Optional adaptive channel count (start 4, grow/shrink by throughput)
- [ ] Optional end-to-end integrity hash toggle (off by default)
- [ ] Optional verification phrase from DTLS fingerprints
- [ ] Optional resume (receiver sends received ranges; FS Access sink only)
- [ ] Memory test: 5 GB streamed transfer, heap < 200 MB
- [ ] Runtime "no storage" test (`09-TESTING.md` §4.3, 4.4)
- [ ] CSP/headers verified with a scanner; `pnpm audit` clean

**Done when:** benchmark and memory targets in `09-TESTING.md` §5 are met or documented with reasons.

## Phase 6 — Nearby devices (optional, behind flag `NEARBY_ENABLED`)
- [ ] Protocol messages `nearby-enable/disable/update/invite/accept`
- [ ] Network key grouping (IPv4 public IP, IPv6 /64), in-memory only
- [ ] UI list of nearby devices with generated names; invite → receiver accept flow
- [ ] Tests, privacy copy update

## Phase 7 — Deploy
- [ ] Dockerfiles (non-root, read-only FS, no volumes for signal)
- [ ] `docker-compose.yml`, `Caddyfile`, optional coturn config
- [ ] LAN-only mode docs verified with `mkcert`
- [ ] README quick start and "limitations" section verified
- [ ] Final manual checklist (`09-TESTING.md` §6)

## Final acceptance
- [ ] All items in `01-PRD.md` §5 (AC-1…AC-10) pass
- [ ] Every checkbox above ticked
- [ ] `docs/DECISIONS.md` lists any deviations from these docs
