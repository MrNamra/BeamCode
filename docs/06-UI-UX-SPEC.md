# 06 — UI / UX Spec

**Style target:** clean, airy, two-card "Send | Receive" home screen with a big 6-digit key and a countdown, in the spirit of Send Anywhere. Original branding and assets only — do not copy their logo, wording, icons, or illustrations. Working brand name: **BeamCode** (placeholder wordmark in text, no logo file needed).

## 1. Design tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F3F6FB` | `#0F141B` |
| `--surface` | `#FFFFFF` | `#18202B` |
| `--border` | `#E2E8F0` | `#2A3646` |
| `--text` | `#0F172A` | `#E6EDF5` |
| `--muted` | `#64748B` | `#94A3B8` |
| `--primary` | `#2563EB` | `#4C8DFF` |
| `--primary-contrast` | `#FFFFFF` | `#0B1220` |
| `--success` | `#16A34A` | `#34D399` |
| `--warning` | `#D97706` | `#FBBF24` |
| `--danger` | `#DC2626` | `#F87171` |

- Font: system UI stack (`Inter` self-hosted optional). Code digits: `ui-monospace, "JetBrains Mono"` self-hosted, tabular numbers.
- Radius 16 px for cards, 12 px for buttons/inputs. Soft shadow `0 8px 30px rgba(15,23,42,.08)`.
- Spacing scale 4/8/12/16/24/32/48. Max content width 960 px, centered.
- Respect `prefers-color-scheme` and `prefers-reduced-motion`. Theme toggle in header.

## 2. Layout

### Header
Wordmark "BeamCode" (left) · links: How it works, Privacy (center/right) · theme toggle · language select (right). Height 64 px, sticky, blurred background.

### Home (desktop ≥ 900 px): two equal cards side by side
```
┌──────────────────────────┐  ┌──────────────────────────┐
│  SEND                    │  │  RECEIVE                 │
│  ┌────────────────────┐  │  │  Enter 6-digit key       │
│  │   ＋  Select files  │  │  │  [_][_][_][_][_][_]      │
│  │  or drop them here │  │  │                          │
│  └────────────────────┘  │  │  [      Receive      ]   │
└──────────────────────────┘  └──────────────────────────┘
        Trust strip: "Files go straight from device to device. Nothing is stored on our servers."
```
Mobile (< 900 px): tabs **Send | Receive** at top, one card visible at a time. Deep link `/r/123456` opens Receive tab prefilled and auto-joins.

## 3. Components and states

### 3.1 DropZone (Send card, idle)
- Large dashed area, central `+` button "Select files", secondary link "Select folder".
- Drag-over state: highlighted border + "Drop to add".
- Accepts paste of files.

### 3.2 FileList (after selecting)
- Rows: icon by type, name (truncate middle), size, remove (×). Footer: "N files · 1.2 GB" and "Add more".
- **Send** primary button (disabled if empty). Show a soft warning if total > 2 GB on mobile browsers that can't stream (receiver side matters, so wording is neutral).

### 3.3 CodeDisplay (Send card after pressing Send)
- Label "Your key".
- Giant digits `482 019` in monospace, ~56–72 px, letter-spacing generous. Copy button (with toast "Copied"). Digits are selectable.
- Countdown ring or bar with `09:42` and "Key expires in…". Turns warning color under 60 s.
- QR code (encodes `https://<host>/r/482019`), 160 px, with "Scan to receive".
- "Copy link" button.
- Status line (aria-live): "Waiting for receiver…" → "Brave Otter wants to receive" with **Accept / Decline** buttons → "Connecting…" → "Sending…".
- **Cancel** button (secondary).
- Footer note: "Keep this tab open until the transfer finishes."

### 3.4 CodeInput (Receive card)
- Six single-digit boxes (or one input with six slots). `inputmode="numeric"`, `autocomplete="one-time-code"`.
- Paste "482019" or "482 019" fills all boxes. Backspace moves left. Auto-submit when 6 digits entered. **Receive** button as explicit alternative.
- Errors under the boxes (aria-live): "Key not found or no longer available." / "Too many attempts. Try again in 40 s."

### 3.5 Receiver review screen
- "Brave Otter is sending you N files (size)". File list with checkboxes (all checked).
- Options: "Save as ZIP" toggle (shown if > 1 file). Destination note: "Files stream straight to your device" with "Choose folder" when supported.
- Buttons: **Accept** (primary), **Decline**.

### 3.6 ProgressCard (both sides)
- Overall progress bar with %, bytes done / total, **speed** `85.3 MB/s`, **ETA** `00:42`.
- Per-file mini rows with state icons (queued, active, done).
- **ConnectionBadge**: `LAN` (green), `Direct` (blue), `Relay` (amber). Tooltip explains each.
- Buttons: Cancel.

### 3.7 Result states (full card replacement)
| State | Visual | Copy | Actions |
|---|---|---|---|
| Completed (sender) | green check | "Sent! Your key has expired." | Send more |
| Completed (receiver) | green check | "Received N files." | Receive another |
| Expired | clock icon | "This key expired." | Get a new key |
| Declined/rejected | neutral icon | "The other side declined." | Try again |
| Failed / connection lost | red icon | "Connection lost. Start again." + reason | Try again |
| Can't connect | amber icon | Troubleshooting list (same Wi-Fi? try hotspot? relay disabled) | Try again |
| Unsupported browser | info | "Please use a recent Chrome, Edge, Firefox or Safari." | — |

## 4. Motion & feedback
- 150–200 ms ease-out transitions; digits animate in on code reveal. No motion if `prefers-reduced-motion`.
- Toasts for copy, errors that don't replace the card.
- Progress updates throttled (≤ 10 Hz). No layout shift while numbers change (tabular numerals, fixed-width containers).

## 5. Content / microcopy
Short, friendly, no jargon. Examples: "Select files", "Your key", "Receive", "Waiting for receiver…", "Nothing is stored on our servers", "Files go straight from device to device". Keep all strings in `i18n/en.json`; create `hi.json` and `gu.json` stubs with the same keys.

## 6. Accessibility
- Full keyboard flow; visible focus rings; logical tab order.
- Status changes announced via `aria-live="polite"`; errors `role="alert"`.
- Code digits readable by screen readers as separate digits ("4 8 2 0 1 9").
- Contrast ≥ 4.5:1; touch targets ≥ 44 px.
- QR code has text alternative (the code itself).

## 7. Routes
- `/` Home (Send/Receive)
- `/r/:code` Receive prefilled
- `/privacy`, `/how-it-works` (static pages, short)
- `/debug` (dev only)

## 8. Browser/feature gating UI
On load, detect `RTCPeerConnection`, `WebSocket`, `File`, `ReadableStream`. Detect optional: `showSaveFilePicker`, Service Worker, Wake Lock. Show a subtle note on the receive screen indicating the save method ("Direct to disk" vs "Download stream" vs "Memory — large files may fail").
