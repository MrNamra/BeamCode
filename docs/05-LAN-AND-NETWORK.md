# 05 — LAN, Direct P2P, and Relay Behavior

Requirement: if sender and receiver are on the same local network, use the LAN; if not, use peer-to-peer over the internet; only use our servers if unavoidable, and never store files.

## 1. How the choice is made (no custom logic needed)

WebRTC ICE gathers candidates and tests pairs. Candidate types and their default priority:

| Type | Source | Meaning | Priority |
|---|---|---|---|
| `host` | local interfaces | Same LAN / same machine | highest |
| `srflx` | STUN | Public address via NAT, direct internet P2P | middle |
| `prflx` | discovered during checks | Peer-reflexive, direct P2P | middle |
| `relay` | TURN | Via relay server | lowest |

ICE picks the best working pair. So if both devices can reach each other on the LAN, a `host↔host` pair wins and traffic never leaves the LAN. If not, `srflx`/`prflx` direct is used. `relay` happens only if everything else fails.

**Therefore the agent must:**
- Use `iceTransportPolicy: 'all'` (the default). Never set `'relay'`.
- Provide STUN servers (default Google STUN; configurable) and, optionally, TURN servers from `/api/ice`.
- Use trickle ICE and add remote candidates as they arrive.
- Not filter out host candidates.

## 2. Detecting and showing the connection type

After `connectionState === 'connected'`, call `pc.getStats()` and find the selected candidate pair:

```ts
async function detectConnectionType(pc: RTCPeerConnection): Promise<'lan'|'direct'|'relay'|'unknown'> {
  const stats = await pc.getStats();
  let pair: any;
  stats.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
  if (!pair) stats.forEach(r => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
  if (!pair) return 'unknown';
  const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
  if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') return 'relay';
  if (local?.candidateType === 'host' && remote?.candidateType === 'host') return 'lan';
  // same public IP on both sides via srflx (hairpin NAT) also behaves like LAN:
  if (local?.candidateType === 'srflx' && remote?.candidateType === 'srflx' && local.address && local.address === remote.address) return 'lan';
  return 'direct';
}
```

Re-run on `iceconnectionstatechange` and every ~5 s during transfer (the selected pair can change). Show badge **LAN** (green), **Direct** (blue), **Relay** (amber, with tooltip "Sent through a relay, may be slower").

## 3. Known LAN pitfalls and mitigations

| Problem | Cause | Mitigation |
|---|---|---|
| Host candidates look like `abcd-1234.local` | Browsers hide local IPs behind mDNS names | Works if both devices can resolve mDNS on the LAN (most home networks). Don't try to un-hide IPs. |
| LAN pair fails although devices are on same Wi-Fi | AP/client isolation, VLANs, mDNS blocked | ICE falls back to `srflx` (works if router supports NAT hairpinning) then `relay`. Show hint: "Your network may block device-to-device traffic." |
| Both devices on same LAN but connection goes via internet | Hairpin path won out because host candidate check failed | See above; also try gathering with `iceCandidatePoolSize: 2` to speed up. |
| VPN active on one side | Candidates on tunnel interface | Document; badge shows actual type. |
| Windows/Linux Docker or virtual adapters | Extra host candidates | Harmless; ICE picks the working one. |
| IPv6 | Global IPv6 can give direct paths even behind NAT4 | Leave IPv6 candidates enabled. |

## 4. Same-network fast path without a code (Phase 6, optional)

Browsers cannot do UDP broadcast or mDNS service discovery. To offer "Nearby devices" (like AirDrop-style lists) we use the signaling server as a lightweight rendezvous:

- On opt-in (`nearby-enable`), the server groups sockets by **network key** = public IPv4, or IPv6 `/64`. Same key ≈ same LAN or same household/office NAT.
- Server sends `nearby-update {peers:[{peerId, deviceName}]}` to each member whenever membership changes. Nothing is persisted; opt-out or socket close removes the entry.
- Sender taps a nearby device → `nearby-invite {to}`; receiver sees "Brave Otter wants to send you files" → accept/decline → the same `signal` exchange as the code flow (a one-time session code is generated internally and locked immediately; no digits shown).
- Privacy: only display generated device names (e.g. "Brave Otter"), never IP addresses, never file names. Feature is **off by default** and toggled in Settings. Corporate NAT or carrier-grade NAT can group strangers together, so the receiver always has to accept an invite.

Add these message types to `packages/protocol` only when starting Phase 6. They are not part of v1.

## 5. Self-hosted LAN mode (optional but valuable)

For offline/LAN-only use (office, event, classroom with no internet): run the Docker stack on a machine in the LAN, serve over HTTPS with a local certificate (see `08-DEPLOYMENT.md`), set `STUN_URLS=` empty. Host candidates work with no internet; everything stays inside the LAN. Document this as "LAN-only mode" in the README.

## 6. TURN policy

- TURN is **optional infrastructure**. If `TURN_URLS` is unset, `/api/ice` returns STUN only.
- If TURN is configured, it is used by the browser only when ICE selects a relay pair (i.e. direct failed).
- TURN relays DTLS-encrypted packets and stores nothing, but it consumes our bandwidth and caps speed. Protect it with REST-API ephemeral credentials, per-user quotas (`user-quota`, `total-quota`, `max-bps` in coturn), and no open relay to private ranges (`denied-peer-ip`).
- When a relay is in use, show the Relay badge and, if bandwidth-limited, a one-line explanation. Log only a counter of relay sessions (for cost monitoring), no identifiers.
- Failure UX when no TURN: "We couldn't connect directly. This can happen on strict networks. Try another network (e.g. mobile hotspot) or ask the admin to enable relay."

## 7. Troubleshooting helper (nice to have)

A hidden `/debug` page (dev builds only) shows: gathered candidates by type, selected pair, RTT, bytes/s, bufferedAmount per channel, chosen chunk size and channel count. Never ships in production builds.
