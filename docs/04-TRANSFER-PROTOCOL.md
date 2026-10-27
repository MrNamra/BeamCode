# 04 — Transfer Protocol & Speed Tuning

This file defines how bytes move once the WebRTC connection is up. Goal: **saturate the available path** (LAN or internet) without blowing up memory.

## 1. Channels

Both sides create the same channels immediately (negotiated, so no `ondatachannel` handshake):

```ts
const ctrl = pc.createDataChannel('ctrl', { negotiated: true, id: 0, ordered: true });
const data = Array.from({ length: MAX_CHANNELS /* 8 */ }, (_, i) =>
  pc.createDataChannel(`data-${i}`, { negotiated: true, id: i + 1, ordered: true }));
data.forEach(c => { c.binaryType = 'arraybuffer'; c.bufferedAmountLowThreshold = 1 * 1024 * 1024; });
```

- `ctrl`: JSON control messages (below).
- `data-0..7`: binary file chunks. The receiver's `accept` message chooses how many to use (default **4** on LAN, **3** on direct/relay; tune with the benchmark; adaptive tuning allowed).
- Use `bundlePolicy: 'max-bundle'`. All channels share one SCTP association over one DTLS/ICE transport.
- Why multiple channels: a single SCTP stream can be limited by per-stream scheduling and by single-thread processing; parallel streams usually improve throughput, especially on high-bandwidth or high-latency links.

## 2. Control messages (JSON on `ctrl`)

Defined in `packages/protocol/src/control.ts` with zod.

```ts
{ t:"hello",    v:1, caps:{ maxMessageSize:number, fsAccess:boolean, swStream:boolean, maxChannels:number } }
{ t:"manifest", transferId:string, totalSize:number,
  files:[{ index:number, name:string, size:number, mime:string, relPath:string }] }
{ t:"accept",   transferId:string, files:number[],           // chosen file indices
  sink:"fs"|"sw"|"memory", zip:boolean,
  channels:number, chunkSize:number, windowBytes:number }
{ t:"decline",  transferId:string }
{ t:"start",    transferId:string }
{ t:"file-end", index:number }                                // sender: all bytes of this file sent
{ t:"ack",      bytes:number }                                // receiver: cumulative bytes durably written (every ~250 ms or 4 MiB)
{ t:"done",     ok:boolean, bytes:number }                    // receiver: finished
{ t:"cancel",   by:"sender"|"receiver", reason?:string }
{ t:"ping" } / { t:"pong" }
```

Sequence: both send `hello` → sender sends `manifest` → receiver shows review UI → `accept` or `decline` → sender sends `start` → data → `file-end` per file → receiver `done`.

Sanitize `name` and `relPath` on the receiver: strip path separators that escape the target folder (`..`, leading `/`, drive letters), limit length, replace characters illegal on the OS. Never trust sender-provided paths.

## 3. Binary data frame (on data channels)

Little-endian. Header 16 bytes, then payload.

| Offset | Size | Field |
|---|---|---|
| 0 | u8 | `version` (=1) |
| 1 | u8 | `kind` (=1 DATA) |
| 2 | u16 | `fileIndex` |
| 4 | u32 | `seq` (global chunk sequence, wraps at 2³²; receiver treats as modular) |
| 8 | u32 | `offsetLo` |
| 12 | u32 | `offsetHi` (file byte offset = hi·2³² + lo) |
| 16 | n | payload, `n = message.byteLength − 16` |

Provide `encodeFrame` / `decodeFrame` in `packages/protocol` with unit tests (round-trip, offsets > 4 GiB, malformed length).

## 4. Chunk size

- Query `pc.sctp.maxMessageSize` on both sides; effective max = `min(local, remote)`.
- Clamp chunk payload to `[16 KiB, 256 KiB]`. **Default 64 KiB**. Fall back to 16 KiB if either side reports a small max or is an older Safari. Make the default configurable and benchmark 16/32/64/128/256 KiB.
- Large messages reduce per-message overhead; very large messages hurt interleaving. 64 KiB is the sane default.

## 5. Sender algorithm

```
read blocks of 4 MiB with file.slice(o, o+4MiB).arrayBuffer()   // async, off the hot path; prefetch next block while sending current
split each block into chunk-size payloads
for each chunk:
   pick channel = least-buffered open data channel among the first N
   if ch.bufferedAmount > HIGH_WATER (4 MiB): await 'bufferedamountlow' on that channel (or pick another)
   if (bytesSent - bytesAcked) > windowBytes: await ack   // receiver-side flow control
   build frame (header + payload) → ch.send(frame)
```

- `windowBytes` default **32 MiB** (LAN) / **16 MiB** (WAN): caps in-flight data so a slow disk on the receiver cannot make memory explode.
- Never `send()` in a tight loop without checking `bufferedAmount` (the browser would queue unbounded data).
- Reuse buffers where possible; avoid creating many small objects per chunk. Header write uses a `DataView` on the frame buffer; payload is copied once with `set()`.
- Keep reading/sending in small async steps so the main thread stays responsive. If profiling shows UI jank, move the read→frame→send loop into a Web Worker (RTCDataChannel is transferable only in some browsers, so keep this as an optional optimization behind a feature check).
- Don't compute per-chunk hashes on the hot path. DTLS/SCTP already guarantee integrity in transit. Optional end-to-end hash is a settings toggle (Phase 5).
- Pause nothing on tab blur: warn users that some mobile browsers suspend background tabs; use the Screen Wake Lock API (`navigator.wakeLock`) during transfer where supported.

## 6. Receiver algorithm

```
on data message (any channel):
   decode header; validate fileIndex ∈ accepted set, length ≤ chunkSize+16, offset within declared file size
   sink.write(fileIndex, offset, payload)   // ordering depends on sink (below)
   bytesWritten += payload.length
every 250 ms or 4 MiB: send {t:"ack", bytes: bytesWrittenDurably}
on all declared bytes received and 'file-end' for each: close sinks, send {t:"done", ok:true}
```

### Sinks (choose best available, in order)

| Sink | Where | Write order | Notes |
|---|---|---|---|
| `FileSystemAccessSink` | Chrome/Edge desktop & Android Chrome (`showSaveFilePicker` / `showDirectoryPicker`) | **Random access** via `createWritable()` + `write({type:'write', position, data})` | Best: true streaming to disk, no memory growth. Call picker from a user gesture (the Accept click). |
| `ServiceWorkerStreamSink` | Firefox, Safari (desktop/iOS), others | **In order only** | Page posts chunks to `sw.js` over a `MessageChannel`; SW returns a `Response` with a `ReadableStream` and `Content-Disposition: attachment`. Needs a reorder buffer. |
| `MemoryBlobSink` | last resort | any | Collect parts in an array → `Blob`. Show a warning above ~1 GB (mobile) / ~2 GB (desktop) and refuse above a configurable cap. |
| `ZipSink` | when `zip:true` | in order per file | Use a streaming zip writer (e.g. `client-zip`, store-only/no compression for speed) piped into one of the sinks above. |

**Reorder buffer (for in-order sinks):** keep a `Map<seq, chunk>`; write consecutive `seq` values; bound total buffered bytes to `windowBytes`. Because the sender round-robins over ordered channels and limits in-flight data by `windowBytes`, skew is bounded.

Backpressure to the disk: if the sink's write queue is long, delay sending `ack` — this automatically throttles the sender through the window.

## 7. Multi-file handling

- Files are sent sequentially in `fileIndex` order, but chunks from consecutive files may be in flight together. For ZIP/in-order sinks, finish a file before starting the next to keep it simple.
- Folder structure comes from `relPath` (from `webkitRelativePath` / directory handle). With FS Access + `showDirectoryPicker`, recreate the folder tree; otherwise offer ZIP.
- Zero-byte files: send `file-end` only, receiver creates empty file.

## 8. Progress, speed, ETA

- Sender progress = `bytesAcked / totalSize` (what the receiver actually wrote), so both sides agree.
- Speed = exponential moving average over 1 s windows. ETA = remaining / speed. Display `MB/s` (decimal, 1 MB = 1,000,000 bytes) and also allow Mbps toggle.
- Update UI at most every 100–200 ms (use `requestAnimationFrame` batching), never per chunk.

## 9. Errors and cancel

- `cancel` from either side → close channels, release code, show state. Partial files: FS Access sink aborts the writable (`abort()`) and deletes the partial file when possible; SW stream sink aborts the stream.
- Channel `close`/`error` mid-transfer → `FAILED` with a clear message ("Connection lost. Ask the sender to start again."). Resume is Phase 5 (receiver reports ranges received, sender re-sends missing ones; requires FS Access random writes).
- Disk full / write error → `cancel {by:"receiver", reason:"disk-error"}`.

## 10. Speed checklist for the agent

- [ ] Multiple parallel data channels (default 4, tunable)
- [ ] Chunk size negotiated from `maxMessageSize`, default 64 KiB
- [ ] Backpressure with `bufferedAmountLowThreshold` + window acks
- [ ] 4 MiB read-ahead; no whole-file reads into memory
- [ ] Streaming write to disk; no Blob accumulation when avoidable
- [ ] UI updates throttled; no per-chunk React renders
- [ ] `max-bundle`, no unnecessary STUN/TURN delay: `iceCandidatePoolSize: 2`, trickle ICE
- [ ] Prefer direct path: never force relay; TURN only as ICE candidate
- [ ] Benchmark script and a table of results committed to `docs/BENCHMARKS.md`
- [ ] Wake Lock during transfer

Realistic expectations to put in the docs: on a good LAN (wired gigabit / strong Wi-Fi 6) browsers commonly reach a large fraction of link speed; over the internet the ceiling is the slower of sender-upload and receiver-download; via TURN it is limited by the relay's bandwidth. Report measured numbers; do not promise.
