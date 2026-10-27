import crypto from 'node:crypto';
import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { WebSocket, RawData } from 'ws';
import {
  MAX_WS_FRAME_SIZE,
  PROTOCOL_VERSION,
  parseClientMessage,
  ServerMessage,
} from '@beamcode/protocol';
import { Config, loadConfig } from './config.js';
import { CodeRegistry, CodeReleaseReason } from './codeRegistry.js';
import { RateLimiter, normalizeIp } from './rateLimiter.js';
import { getIceConfig } from './ice.js';
import { generateDeviceName } from './utils/deviceName.js';
import { createLogger, maskCode, Logger } from './utils/logger.js';
import { Metrics } from './metrics.js';

export interface PeerSocketState {
  peerId: string;
  deviceName: string;
  ip: string;
  socket: WebSocket;
  isAlive: boolean;
}

export interface ServerInstance {
  app: FastifyInstance;
  codeRegistry: CodeRegistry;
  rateLimiter: RateLimiter;
  metrics: Metrics;
  config: Config;
  close: () => Promise<void>;
}

export async function createSignalServer(
  customConfig?: Partial<Config>,
  injected?: {
    codeRegistry?: CodeRegistry;
    rateLimiter?: RateLimiter;
    logger?: Logger;
  }
): Promise<ServerInstance> {
  const config: Config = { ...loadConfig({}), ...customConfig };
  const logger = injected?.logger ?? createLogger(config.LOG_LEVEL);
  const metrics = new Metrics();

  // Active sockets map: peerId -> PeerSocketState
  const peerSockets = new Map<string, PeerSocketState>();

  const rateLimiter =
    injected?.rateLimiter ??
    new RateLimiter({
      rateJoinPerMin: config.RATE_JOIN_PER_MIN,
      rateCreatePerMin: config.RATE_CREATE_PER_MIN,
      maxCodesPerIp: config.MAX_CODES_PER_IP,
      maxWsPerIp: config.MAX_WS_PER_IP,
      maxMsgsPer10s: config.MAX_MSGS_PER_10S,
      exemptLoopback: process.env.NODE_ENV !== 'production',
    });

  const codeRegistry =
    injected?.codeRegistry ??
    new CodeRegistry({
      ttlSeconds: config.CODE_TTL_SECONDS,
      cooldownSeconds: config.CODE_COOLDOWN_SECONDS,
      lockedIdleTimeoutSeconds: config.LOCKED_IDLE_TIMEOUT_SECONDS,
      maxActiveCodes: config.MAX_ACTIVE_CODES,
      onCodeReleased: (entry, reason: CodeReleaseReason, targets) => {
        logger.info(`Code ${maskCode(entry.code)} released (${reason})`);
        metrics.setActiveCodes(codeRegistry.getActiveCount());
        metrics.setLockedCodes(codeRegistry.getLockedCount());
        metrics.setCooldownCodes(codeRegistry.getCooldownCount());

        const notifyMsg: ServerMessage = {
          v: PROTOCOL_VERSION,
          t: 'code-released',
          reason,
        };

        const senderPeer = peerSockets.get(targets.senderId);
        if (senderPeer && senderPeer.socket.readyState === WebSocket.OPEN) {
          sendJson(senderPeer.socket, notifyMsg);
        }

        if (targets.receiverId) {
          const receiverPeer = peerSockets.get(targets.receiverId);
          if (receiverPeer && receiverPeer.socket.readyState === WebSocket.OPEN) {
            sendJson(receiverPeer.socket, notifyMsg);
          }
        }
      },
    });

  const app = Fastify({
    logger: false,
    trustProxy: config.TRUST_PROXY,
  });

  // Register WebSocket plugin with 64 KiB frame cap
  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: MAX_WS_FRAME_SIZE,
    },
  });

  function sendJson(socket: WebSocket, msg: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  function getClientIp(req: { headers: Record<string, unknown>; ip: string }): string {
    if (config.TRUST_PROXY && req.headers['x-forwarded-for']) {
      const header = req.headers['x-forwarded-for'];
      const raw = Array.isArray(header) ? header[0] : (header as string);
      if (raw) return raw.split(',')[0]!.trim();
    }
    return req.ip;
  }

  function isOriginAllowed(originHeader?: string): boolean {
    if (!originHeader) return true; // Direct/non-browser clients
    if (!config.PUBLIC_ORIGIN) return true; // Allowed in dev

    try {
      const parsedOrigin = new URL(originHeader).origin;
      const expectedOrigin = new URL(config.PUBLIC_ORIGIN).origin;
      if (parsedOrigin === expectedOrigin) return true;

      // Allow localhost/127.0.0.1 in development
      const originHost = new URL(originHeader).hostname;
      if (originHost === 'localhost' || originHost === '127.0.0.1') {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  // Security headers on all HTTP replies
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  // 1. GET /healthz
  app.get('/healthz', async () => {
    return {
      ok: true,
      version: PROTOCOL_VERSION,
      activeCodes: codeRegistry.getActiveCount(),
    };
  });

  // 2. GET /api/ice
  app.get('/api/ice', async (req, reply) => {
    const ip = getClientIp(req);
    // Light rate limit check on /api/ice (reuse join rate limiter)
    const joinCheck = rateLimiter.canJoinCode(ip);
    if (!joinCheck.allowed) {
      metrics.incRateLimitHits();
      reply.status(429).send({
        error: 'RATE_LIMITED',
        retryAfterMs: joinCheck.retryAfterMs,
      });
      return;
    }

    return getIceConfig(config);
  });

  // Internal metrics route (if configured on main app or queried locally)
  app.get('/metrics', async (_req, reply) => {
    metrics.setActiveCodes(codeRegistry.getActiveCount());
    metrics.setLockedCodes(codeRegistry.getLockedCount());
    metrics.setCooldownCodes(codeRegistry.getCooldownCount());
    reply.type('text/plain').send(metrics.toPrometheusText());
  });

  // 3. GET /ws (WebSocket upgrade)
  app.get('/ws', { websocket: true }, (socket: WebSocket, req) => {
    const ip = getClientIp(req);
    const origin = req.headers.origin as string | undefined;

    // Check Origin
    if (!isOriginAllowed(origin)) {
      logger.warn('WebSocket connection rejected due to invalid origin');
      socket.close(1008, 'Origin Not Allowed');
      return;
    }

    // Check WS connection limit per IP (20 per IP)
    if (!rateLimiter.canConnectWs(ip)) {
      metrics.incRateLimitHits();
      logger.warn('WebSocket connection rejected: per-IP connection limit exceeded');
      socket.close(1013, 'Try Again Later');
      return;
    }

    rateLimiter.onWsConnected(ip);
    metrics.incWsConnections();

    const peerId = crypto.randomBytes(16).toString('hex');
    const deviceName = generateDeviceName();

    const peerState: PeerSocketState = {
      peerId,
      deviceName,
      ip: normalizeIp(ip),
      socket,
      isAlive: true,
    };
    peerSockets.set(peerId, peerState);

    // Keepalive ping handler
    socket.on('pong', () => {
      peerState.isAlive = true;
    });

    socket.on('message', async (rawData: RawData) => {
      // Per-socket message rate limit (30 msgs / 10 s)
      if (!rateLimiter.checkMessageRate(peerId)) {
        metrics.incRateLimitHits();
        logger.warn('Socket message rate exceeded, closing socket');
        socket.close(1008, 'Message Rate Exceeded');
        return;
      }

      let parsedJson: unknown;
      try {
        const text = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
        parsedJson = JSON.parse(text);
      } catch {
        sendJson(socket, {
          v: PROTOCOL_VERSION,
          t: 'error',
          code: 'BAD_MESSAGE',
          message: 'Invalid JSON',
        });
        return;
      }

      let message;
      try {
        message = parseClientMessage(parsedJson);
      } catch (err: unknown) {
        sendJson(socket, {
          v: PROTOCOL_VERSION,
          t: 'error',
          code: 'BAD_MESSAGE',
          message: err instanceof Error ? err.message : 'Malformed message',
        });
        return;
      }

      // Handle message based on type
      switch (message.t) {
        case 'hello': {
          sendJson(socket, {
            v: PROTOCOL_VERSION,
            t: 'welcome',
            peerId,
            deviceName,
          });
          break;
        }

        case 'create': {
          const activeCount = codeRegistry.getActiveCodesForIp(peerState.ip);
          const check = rateLimiter.canCreateCode(peerState.ip, activeCount);
          if (!check.allowed) {
            metrics.incRateLimitHits();
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'RATE_LIMITED',
              message: 'Code creation limit reached. Please wait before creating another code.',
              retryAfterMs: check.retryAfterMs,
            });
            return;
          }

          try {
            const { code, expiresAt } = codeRegistry.createCode(peerId, peerState.ip);
            rateLimiter.recordCreateAttempt(peerState.ip);
            metrics.setActiveCodes(codeRegistry.getActiveCount());

            logger.info(`Code created: ${maskCode(code)} by peer ${peerId.slice(0, 8)}`);
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'code-created',
              code,
              expiresAt,
            });
          } catch (err: unknown) {
            if (err instanceof Error && err.message === 'SERVER_BUSY') {
              sendJson(socket, {
                v: PROTOCOL_VERSION,
                t: 'error',
                code: 'SERVER_BUSY',
                message: 'Server is currently at capacity. Please try again shortly.',
              });
            } else {
              sendJson(socket, {
                v: PROTOCOL_VERSION,
                t: 'error',
                code: 'INTERNAL',
                message: 'Failed to create code',
              });
            }
          }
          break;
        }

        case 'join': {
          const joinCheck = rateLimiter.canJoinCode(peerState.ip);
          if (!joinCheck.allowed) {
            metrics.incRateLimitHits();
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'RATE_LIMITED',
              message: 'Too many join attempts. Please try again later.',
              retryAfterMs: joinCheck.retryAfterMs,
            });
            return;
          }

          rateLimiter.recordJoinAttempt(peerState.ip);

          const result = codeRegistry.requestJoin(message.code, peerId, peerState.ip);

          if (result.status !== 'OK') {
            rateLimiter.recordFailedJoin(peerState.ip);
            metrics.incJoinFailures();

            // Random delay 50-150ms to prevent timing attacks
            const delay = Math.floor(Math.random() * 101) + 50;
            await new Promise((resolve) => setTimeout(resolve, delay));

            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'CODE_UNAVAILABLE',
              message: 'Code not found or no longer available',
            });
            return;
          }

          const entry = result.entry;
          const senderPeer = peerSockets.get(entry.senderId);

          if (!senderPeer || senderPeer.socket.readyState !== WebSocket.OPEN) {
            rateLimiter.recordFailedJoin(peerState.ip);
            metrics.incJoinFailures();

            codeRegistry.releaseCode(message.code, 'failed');
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'CODE_UNAVAILABLE',
              message: 'Code not found or no longer available',
            });
            return;
          }

          // Notify receiver that join is pending approval
          sendJson(socket, {
            v: PROTOCOL_VERSION,
            t: 'join-pending',
          });

          // Forward join request to sender with receiver device name
          sendJson(senderPeer.socket, {
            v: PROTOCOL_VERSION,
            t: 'join-request',
            receiverId: peerId,
            deviceName,
          });
          break;
        }

        case 'join-decision': {
          const entry = codeRegistry.getEntryBySocket(peerId);
          if (!entry || entry.senderId !== peerId) {
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'NOT_ALLOWED',
              message: 'Only the sender can decide on a join request',
            });
            return;
          }

          const receiverPeer = peerSockets.get(message.receiverId);

          if (!message.accept) {
            const rejectResult = codeRegistry.rejectJoin(entry.code, message.receiverId);
            logger.info(
              `Join rejected for code ${maskCode(entry.code)} (rejections: ${rejectResult.rejections})`
            );

            if (receiverPeer) {
              sendJson(receiverPeer.socket, {
                v: PROTOCOL_VERSION,
                t: 'join-rejected',
              });
            }
            return;
          }

          // Accepted
          const accepted = codeRegistry.acceptJoin(entry.code, message.receiverId);
          if (!accepted || !receiverPeer) {
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'NOT_ALLOWED',
              message: 'Unable to accept receiver',
            });
            return;
          }

          metrics.setActiveCodes(codeRegistry.getActiveCount());
          metrics.setLockedCodes(codeRegistry.getLockedCount());

          logger.info(`Code ${maskCode(entry.code)} LOCKED for transfer`);

          // Notify sender with receiver's peerId
          sendJson(socket, {
            v: PROTOCOL_VERSION,
            t: 'join-accepted',
            peerId: receiverPeer.peerId,
          });

          // Notify receiver with sender's peerId
          sendJson(receiverPeer.socket, {
            v: PROTOCOL_VERSION,
            t: 'join-accepted',
            peerId,
          });
          break;
        }

        case 'signal': {
          const entry = codeRegistry.getEntryBySocket(peerId);
          if (!entry || entry.state !== 'LOCKED') {
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'NOT_ALLOWED',
              message: 'Cannot send signal: transfer is not locked',
            });
            return;
          }

          // Verify target is the paired peer
          const targetPeerId = message.to;
          const isSender = peerId === entry.senderId;
          const expectedTarget = isSender ? entry.receiverId : entry.senderId;

          if (targetPeerId !== expectedTarget) {
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'NOT_ALLOWED',
              message: 'Invalid signal recipient',
            });
            return;
          }

          const targetPeer = peerSockets.get(targetPeerId);
          if (!targetPeer || targetPeer.socket.readyState !== WebSocket.OPEN) {
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'NOT_ALLOWED',
              message: 'Target peer is disconnected',
            });
            return;
          }

          // Reset idle timeout on signaling activity
          codeRegistry.resetIdleTimer(entry);

          // Relay signal
          sendJson(targetPeer.socket, {
            v: PROTOCOL_VERSION,
            t: 'signal',
            from: peerId,
            data: message.data,
          });
          break;
        }

        case 'release': {
          const entry = codeRegistry.getEntryBySocket(peerId);
          if (!entry) {
            return; // Already released or unknown
          }

          const isSender = peerId === entry.senderId;
          const isReceiver = peerId === entry.receiverId;

          if (!isSender && !isReceiver) {
            sendJson(socket, {
              v: PROTOCOL_VERSION,
              t: 'error',
              code: 'NOT_ALLOWED',
              message: 'Not authorized to release this code',
            });
            return;
          }

          // Receiver is only allowed to release with reason 'cancelled'
          const finalReason = isReceiver ? 'cancelled' : message.reason;
          codeRegistry.releaseCode(entry.code, finalReason);
          break;
        }

        case 'ping': {
          sendJson(socket, {
            v: PROTOCOL_VERSION,
            t: 'pong',
          });
          break;
        }
      }
    });

    socket.on('close', () => {
      rateLimiter.onWsDisconnected(ip);
      rateLimiter.onSocketClosed(peerId);
      metrics.decWsConnections();

      codeRegistry.handleDisconnect(peerId);
      peerSockets.delete(peerId);
    });

    socket.on('error', (err: Error) => {
      logger.error('WebSocket error on socket', err);
    });
  });

  return {
    app,
    codeRegistry,
    rateLimiter,
    metrics,
    config,
    close: async () => {
      codeRegistry.clear();
      for (const peer of peerSockets.values()) {
        try {
          peer.socket.terminate();
        } catch {
          // ignore
        }
      }
      peerSockets.clear();
      await app.close();
    },
  };
}

async function start() {
  const config = loadConfig(process.env);
  const server = await createSignalServer(config);

  try {
    await server.app.listen({ port: config.PORT, host: '0.0.0.0' });
    console.log(`Signal server running on port ${config.PORT}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Start if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
