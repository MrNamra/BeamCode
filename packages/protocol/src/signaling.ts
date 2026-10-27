import { z } from 'zod';
import { CODE_REGEX, PROTOCOL_VERSION } from './constants.js';

export const ErrorCodeSchema = z.enum([
  'BAD_MESSAGE',
  'CODE_UNAVAILABLE',
  'RATE_LIMITED',
  'SERVER_BUSY',
  'NOT_ALLOWED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const IceCandidateInitSchema = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});
export type IceCandidateInit = z.infer<typeof IceCandidateInitSchema>;

export const SignalDataSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('offer'),
    sdp: z.string(),
  }),
  z.object({
    kind: z.literal('answer'),
    sdp: z.string(),
  }),
  z.object({
    kind: z.literal('ice'),
    candidate: IceCandidateInitSchema.nullable(),
  }),
]);
export type SignalData = z.infer<typeof SignalDataSchema>;

// Client -> Server schemas
export const ClientHelloSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('hello'),
  clientVersion: z.string().min(1),
});

export const ClientCreateSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('create'),
});

export const ClientJoinSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('join'),
  code: z.string().regex(CODE_REGEX, 'Code must be exactly 6 digits'),
});

export const ClientJoinDecisionSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('join-decision'),
  receiverId: z.string().min(1),
  accept: z.boolean(),
});

export const ClientSignalSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('signal'),
  to: z.string().min(1),
  data: SignalDataSchema,
});

export const ClientReleaseSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('release'),
  reason: z.enum(['completed', 'cancelled', 'failed']),
});

export const ClientPingSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('ping'),
});

export const ClientMessageSchema = z.discriminatedUnion('t', [
  ClientHelloSchema,
  ClientCreateSchema,
  ClientJoinSchema,
  ClientJoinDecisionSchema,
  ClientSignalSchema,
  ClientReleaseSchema,
  ClientPingSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server -> Client schemas
export const ServerWelcomeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('welcome'),
  peerId: z.string().min(1),
  deviceName: z.string().min(1),
});

export const ServerCodeCreatedSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('code-created'),
  code: z.string().regex(CODE_REGEX),
  expiresAt: z.number().int().positive(),
});

export const ServerJoinRequestSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('join-request'),
  receiverId: z.string().min(1),
  deviceName: z.string().min(1),
});

export const ServerJoinPendingSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('join-pending'),
});

export const ServerJoinAcceptedSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('join-accepted'),
  peerId: z.string().min(1),
});

export const ServerJoinRejectedSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('join-rejected'),
});

export const ServerSignalSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('signal'),
  from: z.string().min(1),
  data: SignalDataSchema,
});

export const ServerCodeReleasedSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('code-released'),
  reason: z.enum(['completed', 'cancelled', 'failed', 'expired', 'peer-left', 'idle']),
});

export const ServerErrorSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('error'),
  code: ErrorCodeSchema,
  message: z.string(),
  retryAfterMs: z.number().int().nonnegative().optional(),
});

export const ServerPongSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  t: z.literal('pong'),
});

export const ServerMessageSchema = z.discriminatedUnion('t', [
  ServerWelcomeSchema,
  ServerCodeCreatedSchema,
  ServerJoinRequestSchema,
  ServerJoinPendingSchema,
  ServerJoinAcceptedSchema,
  ServerJoinRejectedSchema,
  ServerSignalSchema,
  ServerCodeReleasedSchema,
  ServerErrorSchema,
  ServerPongSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function parseClientMessage(data: unknown): ClientMessage {
  return ClientMessageSchema.parse(data);
}

export function safeParseClientMessage(data: unknown) {
  return ClientMessageSchema.safeParse(data);
}

export function parseServerMessage(data: unknown): ServerMessage {
  return ServerMessageSchema.parse(data);
}

export function safeParseServerMessage(data: unknown) {
  return ServerMessageSchema.safeParse(data);
}
