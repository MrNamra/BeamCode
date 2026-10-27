export function maskCode(code: string): string {
  if (!code || code.length < 2) return '******';
  return `${code.slice(0, 2)}****`;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, error?: unknown, meta?: Record<string, unknown>): void;
}

export function createLogger(logLevel: string = 'info'): Logger {
  const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[logLevel.toLowerCase()] ?? 1;

  function formatMeta(meta?: Record<string, unknown>): string {
    if (!meta) return '';
    return ' ' + JSON.stringify(meta);
  }

  return {
    info(msg: string, meta?: Record<string, unknown>) {
      if (currentLevel <= 1) {
        console.log(`[INFO] ${msg}${formatMeta(meta)}`);
      }
    },
    warn(msg: string, meta?: Record<string, unknown>) {
      if (currentLevel <= 2) {
        console.warn(`[WARN] ${msg}${formatMeta(meta)}`);
      }
    },
    error(msg: string, error?: unknown, meta?: Record<string, unknown>) {
      if (currentLevel <= 3) {
        const errStr = error instanceof Error ? ` - ${error.message}` : '';
        console.error(`[ERROR] ${msg}${errStr}${formatMeta(meta)}`);
      }
    },
  };
}
