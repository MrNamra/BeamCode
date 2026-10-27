import {
  FRAME_HEADER_SIZE,
  FRAME_VERSION,
  FRAME_KIND_DATA,
} from './constants.js';

export interface FrameHeader {
  version?: number;
  kind?: number;
  fileIndex: number;
  seq: number;
  offset: number | bigint;
}

export interface DecodedFrame {
  header: {
    version: number;
    kind: number;
    fileIndex: number;
    seq: number;
    offset: number;
    offsetBig: bigint;
  };
  payload: Uint8Array;
}

/**
 * Encodes a binary frame header and payload into a Uint8Array.
 * Total size = 16 bytes header + payload.byteLength.
 * Little-endian format.
 */
export function encodeFrame(header: FrameHeader, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(FRAME_HEADER_SIZE + payload.byteLength);
  encodeFrameInto(header, payload, frame, 0);
  return frame;
}

/**
 * Encodes a frame directly into a pre-allocated target buffer to avoid extra allocations.
 */
export function encodeFrameInto(
  header: FrameHeader,
  payload: Uint8Array,
  target: Uint8Array,
  targetOffset = 0
): void {
  const version = header.version ?? FRAME_VERSION;
  const kind = header.kind ?? FRAME_KIND_DATA;

  if (target.byteLength - targetOffset < FRAME_HEADER_SIZE + payload.byteLength) {
    throw new RangeError('Target buffer is too small to encode frame');
  }

  const view = new DataView(target.buffer, target.byteOffset + targetOffset, FRAME_HEADER_SIZE);

  view.setUint8(0, version);
  view.setUint8(1, kind);
  view.setUint16(2, header.fileIndex, true);
  view.setUint32(4, header.seq, true);

  const bigOffset = typeof header.offset === 'bigint' ? header.offset : BigInt(header.offset);
  if (bigOffset < 0n) {
    throw new RangeError('Frame offset must be non-negative');
  }

  const offsetLo = Number(bigOffset & 0xffffffffn);
  const offsetHi = Number((bigOffset >> 32n) & 0xffffffffn);

  view.setUint32(8, offsetLo, true);
  view.setUint32(12, offsetHi, true);

  if (payload.byteLength > 0) {
    target.set(payload, targetOffset + FRAME_HEADER_SIZE);
  }
}

/**
 * Decodes a binary frame from an ArrayBuffer or ArrayBufferView.
 * Returns decoded header (with offset both as Number and BigInt) and payload slice.
 */
export function decodeFrame(buffer: ArrayBuffer | ArrayBufferView): DecodedFrame {
  const byteOffset = 'byteOffset' in buffer ? buffer.byteOffset : 0;
  const byteLength = buffer.byteLength;
  const rawBuffer = 'buffer' in buffer ? buffer.buffer : buffer;

  if (byteLength < FRAME_HEADER_SIZE) {
    throw new Error(`Frame too short: header requires ${FRAME_HEADER_SIZE} bytes, got ${byteLength}`);
  }

  const view = new DataView(rawBuffer, byteOffset, FRAME_HEADER_SIZE);

  const version = view.getUint8(0);
  if (version !== FRAME_VERSION) {
    throw new Error(`Unsupported frame version: ${version}`);
  }

  const kind = view.getUint8(1);
  if (kind !== FRAME_KIND_DATA) {
    throw new Error(`Unsupported frame kind: ${kind}`);
  }

  const fileIndex = view.getUint16(2, true);
  const seq = view.getUint32(4, true);
  const offsetLo = view.getUint32(8, true);
  const offsetHi = view.getUint32(12, true);

  const offsetBig = (BigInt(offsetHi) << 32n) | BigInt(offsetLo);
  const offset = Number(offsetBig);

  // Zero-copy view of the payload
  const payload = new Uint8Array(
    rawBuffer,
    byteOffset + FRAME_HEADER_SIZE,
    byteLength - FRAME_HEADER_SIZE
  );

  return {
    header: {
      version,
      kind,
      fileIndex,
      seq,
      offset,
      offsetBig,
    },
    payload,
  };
}
