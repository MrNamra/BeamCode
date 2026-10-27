export const PROTOCOL_VERSION = 1;

// Signaling and code constants
export const CODE_LENGTH = 6;
export const CODE_REGEX = /^\d{6}$/;

export const DEFAULT_CODE_TTL_SECONDS = 600; // 10 minutes
export const DEFAULT_CODE_COOLDOWN_SECONDS = 45;
export const DEFAULT_LOCKED_IDLE_TIMEOUT_SECONDS = 60;
export const MAX_ACTIVE_CODES = 500_000;

export const MAX_WS_FRAME_SIZE = 64 * 1024; // 64 KiB
export const WS_KEEPALIVE_INTERVAL_MS = 20_000; // 20 s
export const MAX_REJECTIONS = 3;

// Transfer and data channel constants
export const MAX_CHANNELS = 8;
export const DEFAULT_PARALLEL_CHANNELS_LAN = 4;
export const DEFAULT_PARALLEL_CHANNELS_WAN = 3;

export const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KiB
export const MIN_CHUNK_SIZE = 16 * 1024; // 16 KiB
export const MAX_CHUNK_SIZE = 256 * 1024; // 256 KiB

export const DEFAULT_WINDOW_BYTES_LAN = 32 * 1024 * 1024; // 32 MiB
export const DEFAULT_WINDOW_BYTES_WAN = 16 * 1024 * 1024; // 16 MiB

export const READ_BLOCK_SIZE = 4 * 1024 * 1024; // 4 MiB read-ahead
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 1 * 1024 * 1024; // 1 MiB
export const HIGH_WATER_MARK = 4 * 1024 * 1024; // 4 MiB

export const ACK_INTERVAL_MS = 250;
export const ACK_INTERVAL_BYTES = 4 * 1024 * 1024; // 4 MiB

// Binary frame constants
export const FRAME_HEADER_SIZE = 16;
export const FRAME_VERSION = 1;
export const FRAME_KIND_DATA = 1;

// Rate limits
export const RATE_LIMITS = {
  JOIN_PER_MIN: 10,
  FAILED_JOIN_BLOCK_THRESHOLD: 5,
  FAILED_JOIN_BLOCK_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  FAILED_JOIN_BLOCK_DURATION_MS: 10 * 60 * 1000, // 10 minutes
  CREATE_PER_MIN: 10,
  MAX_ACTIVE_CODES_PER_IP: 5,
  MAX_WS_PER_IP: 20,
  MAX_MSGS_PER_10S: 30,
} as const;
