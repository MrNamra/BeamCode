# AGENTS.md — Instructions for the coding agent

You are building **BeamCode**, a peer-to-peer browser file sharing app with 6-digit codes. Read `README.md` first, then every file in `docs/` in numeric order **before writing code**. The docs are the source of truth. If something is ambiguous or contradictory, stop and ask the user instead of guessing.

## Hard constraints (never violate)

1. **File bytes never touch our server.** No upload endpoint, no multipart parsing, no file relay over WebSocket, no temp files, no object storage. WebSocket max message size on the signaling server is 64 KiB so relaying files over it is impossible by design.
2. **The server never learns file names, sizes, or contents.** The file manifest is exchanged only over the WebRTC data channel.
3. **Server state is in-memory only** (code → sender/receiver sockets, timestamps). No database for transfers. Nothing is persisted to disk. Logs must not contain file metadata or full codes (log first 2 digits + `****`).
4. **Direct connection first.** ICE policy is `all`. Never force relay. TURN is optional and used by the browser only when direct paths fail.
5. **Codes**: exactly 6 digits, unique among active codes, released when the transfer completes / fails / is cancelled / expires / sender disconnects, and re-assignable after a short cooldown (see `03-SIGNALING-PROTOCOL.md`).
6. **Receiver never buffers whole files in memory** when a streaming path is available (File System Access API or Service Worker stream). See `04-TRANSFER-PROTOCOL.md`.
7. **Do not copy Send Anywhere's logo, copy text, or illustrations.** Original look only.
8. **No third-party analytics, trackers, or fonts loaded from CDNs.** Self-host everything.

## Tech stack (fixed — do not swap without asking)

- Monorepo with **pnpm workspaces**: `apps/web`, `apps/signal`, `packages/protocol`.
- TypeScript `strict: true` everywhere. Node 22 LTS or newer.
- Web: Vite + React + Tailwind + Zustand. Native `RTCPeerConnection` (no PeerJS, no simple-peer).
- Signal server: Fastify + `ws` + `zod`.
- Tests: Vitest (unit/integration), Playwright (E2E, two browser contexts).
- Use the latest stable versions available at implementation time; pin them in the lockfile.

## Workflow

1. Work through `docs/10-TASKS.md` **in order**, one phase at a time. Tick checkboxes as you finish tasks.
2. After each phase: run `pnpm lint && pnpm typecheck && pnpm test`. Fix everything before moving on.
3. Keep protocol types in `packages/protocol` and import them in both apps. Never duplicate message shapes.
4. Small commits with clear messages (`feat(signal): lock code on join accept`).
5. If you must deviate from a doc, write the reason in `docs/DECISIONS.md` (create it) and tell the user.
6. Do not add features that are not in the docs. Put ideas in `docs/DECISIONS.md` under "Future".

## Code standards

- No `any`. No unchecked `as` casts on network input — validate with zod.
- Every WebSocket / data channel message is validated on receipt.
- Handle every failure state in the UI (expired, rejected, peer left, network lost, disk full, user cancelled, unsupported browser).
- Never block the main thread with large loops; reading files is async and sliced.
- Accessibility: keyboard navigable, visible focus, `aria-live` for status changes, color contrast AA.
- Keep comments for *why*, not *what*.

## Commands the repo must provide

```
pnpm dev        # web + signal in watch mode
pnpm build      # production build of everything
pnpm lint
pnpm typecheck
pnpm test       # vitest
pnpm e2e        # playwright
pnpm bench      # throughput benchmark (see docs/09-TESTING.md)
```

## Definition of done (whole project)

- All checkboxes in `docs/10-TASKS.md` ticked.
- All acceptance criteria in `docs/01-PRD.md` pass, verified by tests or a documented manual check.
- "No storage" test in `docs/09-TESTING.md` passes.
- `docker compose up` brings up a working stack with TLS (local cert is fine).
- README quick start is accurate.
