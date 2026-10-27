# Architecture & Design Decisions

This document records deviations from the original specification documents and future feature ideas.

## Deviations

1. **Phase 6 (Nearby Devices) deferred**: Per user instruction, Phase 6 (nearby devices via public IP grouping) is skipped for the initial deployment to prioritize core performance, benchmarking, and containerized deployment.
2. **Multi-stage Caddy Dockerfile**: Rather than running separate volume mounts between builder and static host, `apps/web/Dockerfile` uses a multi-stage Docker build copying the built static bundle directly into Caddy's `/srv`, preventing volume synchronization races.
3. **DTLS Fingerprint Mutual Authentication Phrase**: Implemented a 256-word deterministic hash mapper (`packages/protocol/src/securityPhrase.ts`) that hashes the sorted pair of local and remote DTLS certificate fingerprints, allowing users to mutually confirm cryptographic peer identity and rule out signaling MITM tampering.
4. **Fully Automatic Transfer on Code Entry (Zero-Click Approval)**: Per user instruction, transfers now start immediately when the receiver enters the 6-digit key (or opens the deep link). The sender automatically approves the join request, and the receiver automatically accepts the file manifest, eliminating manual confirmation prompts on both sides while preserving cancellation and error controls.
5. **Progressive Web App (PWA) Implementation**: Full PWA capabilities added to `@beamcode/web`, including offline App Shell caching, Web App Manifest (`manifest.webmanifest`), standalone display mode, adaptive/maskable icons, browser install prompt support, and Web Share Target integration (`POST /share-target`) to receive shared files from native mobile OS share sheets directly into the sender queue.
6. **English-Only UI (Multi-Language Selector Removed)**: Per user instruction, the language selector and non-English locale dictionaries have been removed in favor of a clean, dedicated English UI. This streamlines the header navigation, prevents mobile navbar wrapping, and simplifies user interaction.

## Future Ideas

1. **Nearby Devices (Phase 6)**: In-memory network key grouping (`/64` IPv6 or `/32` IPv4) with generated friendly device names for auto-discovery on local networks.
2. **Distributed Signaling with Redis Adapter**: Allow clustering of signaling servers across multiple instances using Redis Pub/Sub for scale.

