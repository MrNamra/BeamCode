import { z } from 'zod';
import { PROTOCOL_VERSION } from './constants.js';

export const ManifestFileItemSchema = z.object({
  index: z.number().int().nonnegative(),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  mime: z.string(),
  relPath: z.string(),
  sha256: z.string().length(64).optional(),
});
export type ManifestFileItem = z.infer<typeof ManifestFileItemSchema>;

export const ControlHelloSchema = z.object({
  t: z.literal('hello'),
  v: z.literal(PROTOCOL_VERSION),
  caps: z.object({
    maxMessageSize: z.number().int().positive(),
    fsAccess: z.boolean(),
    swStream: z.boolean(),
    maxChannels: z.number().int().positive(),
  }),
});

export const ControlManifestSchema = z.object({
  t: z.literal('manifest'),
  transferId: z.string().min(1),
  totalSize: z.number().int().nonnegative(),
  files: z.array(ManifestFileItemSchema),
});

export const ControlAcceptSchema = z.object({
  t: z.literal('accept'),
  transferId: z.string().min(1),
  files: z.array(z.number().int().nonnegative()),
  sink: z.enum(['fs', 'sw', 'memory']),
  zip: z.boolean(),
  channels: z.number().int().positive(),
  chunkSize: z.number().int().positive(),
  windowBytes: z.number().int().positive(),
  verifyIntegrity: z.boolean().optional(),
});

export const ControlDeclineSchema = z.object({
  t: z.literal('decline'),
  transferId: z.string().min(1),
});

export const ControlStartSchema = z.object({
  t: z.literal('start'),
  transferId: z.string().min(1),
});

export const ControlFileEndSchema = z.object({
  t: z.literal('file-end'),
  index: z.number().int().nonnegative(),
  sha256: z.string().length(64).optional(),
});

export const ControlAckSchema = z.object({
  t: z.literal('ack'),
  bytes: z.number().int().nonnegative(),
});

export const ControlDoneSchema = z.object({
  t: z.literal('done'),
  ok: z.boolean(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().length(64).optional(),
});

export const ControlCancelSchema = z.object({
  t: z.literal('cancel'),
  by: z.enum(['sender', 'receiver']),
  reason: z.string().optional(),
});

export const ControlResumeSchema = z.object({
  t: z.literal('resume'),
  transferId: z.string().min(1),
  ranges: z.array(
    z.object({
      fileIndex: z.number().int().nonnegative(),
      receivedBytes: z.number().int().nonnegative(),
    })
  ),
});

export const ControlPingSchema = z.object({
  t: z.literal('ping'),
});

export const ControlPongSchema = z.object({
  t: z.literal('pong'),
});

export const ControlMessageSchema = z.discriminatedUnion('t', [
  ControlHelloSchema,
  ControlManifestSchema,
  ControlAcceptSchema,
  ControlDeclineSchema,
  ControlStartSchema,
  ControlFileEndSchema,
  ControlAckSchema,
  ControlDoneSchema,
  ControlCancelSchema,
  ControlResumeSchema,
  ControlPingSchema,
  ControlPongSchema,
]);
export type ControlMessage = z.infer<typeof ControlMessageSchema>;

export function parseControlMessage(data: unknown): ControlMessage {
  return ControlMessageSchema.parse(data);
}

export function safeParseControlMessage(data: unknown) {
  return ControlMessageSchema.safeParse(data);
}
