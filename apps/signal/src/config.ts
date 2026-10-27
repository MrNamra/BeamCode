import { z } from 'zod';
import {
  DEFAULT_CODE_TTL_SECONDS,
  DEFAULT_CODE_COOLDOWN_SECONDS,
  DEFAULT_LOCKED_IDLE_TIMEOUT_SECONDS,
  MAX_ACTIVE_CODES,
  RATE_LIMITS,
} from '@beamcode/protocol';

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8080),
  PUBLIC_ORIGIN: z.string().optional(),
  TRUST_PROXY: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default(true),
  CODE_TTL_SECONDS: z.coerce.number().default(DEFAULT_CODE_TTL_SECONDS),
  CODE_COOLDOWN_SECONDS: z.coerce.number().default(DEFAULT_CODE_COOLDOWN_SECONDS),
  LOCKED_IDLE_TIMEOUT_SECONDS: z.coerce.number().default(DEFAULT_LOCKED_IDLE_TIMEOUT_SECONDS),
  MAX_ACTIVE_CODES: z.coerce.number().default(MAX_ACTIVE_CODES),
  RATE_JOIN_PER_MIN: z.coerce.number().default(RATE_LIMITS.JOIN_PER_MIN),
  RATE_CREATE_PER_MIN: z.coerce.number().default(RATE_LIMITS.CREATE_PER_MIN),
  MAX_CODES_PER_IP: z.coerce.number().default(RATE_LIMITS.MAX_ACTIVE_CODES_PER_IP),
  MAX_WS_PER_IP: z.coerce.number().default(RATE_LIMITS.MAX_WS_PER_IP),
  MAX_MSGS_PER_10S: z.coerce.number().default(RATE_LIMITS.MAX_MSGS_PER_10S),
  STUN_URLS: z
    .string()
    .default('stun:stun.l.google.com:19302')
    .transform((val) => (val ? val.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  TURN_URLS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  TURN_STATIC_AUTH_SECRET: z.string().optional(),
  TURN_CREDENTIAL_TTL_SECONDS: z.coerce.number().default(3600),
  NEARBY_ENABLED: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default(false),
  LOG_LEVEL: z.string().default('info'),
  METRICS_PORT: z.coerce.number().default(9090),
  ENABLE_METRICS_SERVER: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default(false),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errorDetails}`);
  }
  return parsed.data;
}
