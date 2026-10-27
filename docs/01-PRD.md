# 01 — Product Requirements (PRD)

## 1. Goal

Let anyone send files of any size from one device to another, with nothing to install and no account, using a short 6-digit code. Files travel device-to-device. Our server only introduces the two devices.

## 2. Users and scenarios

| Scenario | Expected path |
|---|---|
| Phone → laptop in the same room on the same Wi-Fi | LAN direct, fastest |
| Laptop in India → laptop in another city/country | Internet P2P direct (NAT traversal via STUN) |
| One side behind strict firewall / symmetric NAT | TURN relay if configured, else clear error |
| Send to someone using a link or QR | Same as code flow, code is in the URL |

## 3. Functional requirements

### FR-1 Send
- FR-1.1 Select files via button, drag & drop, or paste. Folder selection supported (preserves relative paths).
- FR-1.2 Show file list with name, size, remove button, total size.
- FR-1.3 Press **Send** → request a code. Show the **6-digit code** big, with copy button, share link, and QR code.
- FR-1.4 Show countdown to expiry (default 10:00).
- FR-1.5 Show waiting → receiver requested → connecting → transferring → done states.
- FR-1.6 Sender must approve a receiver before connection (shows receiver's generated device name). Approval can be turned off in settings for trusted use ("auto-accept").
- FR-1.7 Sender can cancel at any time. Cancelling releases the code immediately.
- FR-1.8 Warn the sender not to close the tab until finished (`beforeunload` while a code is active).

### FR-2 Receive
- FR-2.1 Enter 6 digits (six boxes, numeric keyboard on mobile, paste support, auto-submit on 6th digit) or open link `/r/123456` / scan QR.
- FR-2.2 After sender approves, show the incoming file list (names, sizes, total) and let the receiver accept or decline, and choose which files to take.
- FR-2.3 Save: stream directly to disk (File System Access API) when available, else Service Worker streaming download, else in-memory fallback with a size warning.
- FR-2.4 Show progress, speed (MB/s), ETA, and connection type badge: **LAN**, **Direct**, or **Relay**.
- FR-2.5 Multiple files: choose "save each file" or "download as one ZIP" (streamed, never built in memory).

### FR-3 Code lifecycle
- FR-3.1 Code is exactly 6 digits (000000–999999, leading zeros allowed, displayed as `123 456`).
- FR-3.2 Unique among currently active codes.
- FR-3.3 A code **expires** when: transfer completes, transfer fails, sender cancels, sender disconnects, receiver declined and sender chose to stop, or TTL elapses (default 10 min while waiting).
- FR-3.4 Once a receiver is accepted, the code is **locked** (no other receiver can join) until release.
- FR-3.5 After release the code goes through a short **cooldown** (default 45 s) and then returns to the pool and can be issued to a different sender.
- FR-3.6 Typing an expired/unknown/locked code gives a clear, friendly error (without revealing which of the three, to avoid code probing — see security doc; show "Code not found or no longer available").

### FR-4 Network behavior
- FR-4.1 Same LAN → traffic stays on the LAN automatically (ICE host candidates). UI shows **LAN**.
- FR-4.2 Different networks → direct P2P using STUN. UI shows **Direct**.
- FR-4.3 Direct impossible → TURN relay if configured. UI shows **Relay** and a note that speed may be lower. If TURN is not configured, show "Couldn't connect directly" with troubleshooting hints.
- FR-4.4 Never route file data through the app server. Only signaling goes there.

### FR-5 Speed
- FR-5.1 Use multiple parallel data channels, backpressure, large reads, and streaming writes as defined in `04-TRANSFER-PROTOCOL.md`.
- FR-5.2 UI thread stays responsive (60 fps progress UI) during multi-GB transfers.
- FR-5.3 A benchmark script reports MB/s for LAN-like (localhost) and throttled conditions.

### FR-6 Optional (Phase 5–6)
- FR-6.1 "Nearby devices" list for devices on the same public IP (opt-in), so LAN users can send without typing a code.
- FR-6.2 Resume interrupted transfer (receiver asks for missing byte ranges).
- FR-6.3 Optional integrity check (hash) toggle.

## 4. Non-functional requirements

| Area | Requirement |
|---|---|
| Privacy | Server holds no files, no file names, no persistent data. Logs are minimal and anonymized. |
| Security | See `07-SECURITY-PRIVACY.md`. Rate-limited code joins, sender approval, DTLS encryption, strict CSP. |
| Browsers | Latest 2 versions of Chrome, Edge, Firefox, Safari (desktop + iOS 16+), Chrome Android. Show an "unsupported browser" screen otherwise. |
| Size | No app-imposed file size limit. Limits come from browser/disk only. |
| Availability | Single small VPS (1 vCPU / 1 GB) must handle thousands of idle WebSockets. |
| i18n | Strings in a dictionary file; English first, structure ready for Hindi and Gujarati. |
| Accessibility | WCAG AA, keyboard support, screen-reader announcements for state changes. |
| Mobile | Fully responsive; works one-handed; large tap targets. |

## 5. Acceptance criteria (must be verified)

- [ ] AC-1: Two browsers on localhost transfer a 1 GB file; SHA-256 of received file equals the original.
- [ ] AC-2: The code shown is 6 digits; entering it on the second browser connects after sender approval.
- [ ] AC-3: After a completed transfer, the same code is rejected for a new joiner (not found), and after cooldown a new sender can receive that exact code (unit-test with injected RNG).
- [ ] AC-4: Cancelling on sender or disconnecting the sender tab releases the code within 5 s.
- [ ] AC-5: Code expires at TTL if nobody joins; UI shows expired state and offers "Get new code".
- [ ] AC-6: Server process writes no files during a transfer (see no-storage test) and has no endpoint that accepts file bodies.
- [ ] AC-7: Connection badge shows LAN on localhost/same-subnet pair and Relay when forced through TURN in test.
- [ ] AC-8: A 5 GB transfer does not grow receiver memory beyond ~200 MB in Chrome with File System Access API.
- [ ] AC-9: Wrong-code brute force is throttled: more than 10 join attempts/min from one IP get `RATE_LIMITED`.
- [ ] AC-10: UI works at 360 px width and at 1440 px width; dark mode works.

## 6. Out of scope (v1)

User accounts, cloud storage, file history, chat, mobile native apps, desktop apps, file previews, ad monetization.
