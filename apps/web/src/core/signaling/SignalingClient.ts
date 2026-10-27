import {
  ClientMessage,
  ServerMessage,
  PROTOCOL_VERSION,
  parseServerMessage,
  WS_KEEPALIVE_INTERVAL_MS,
  SignalData,
} from '@beamcode/protocol';

export type SignalingEventMap = {
  open: () => void;
  close: (event: CloseEvent) => void;
  error: (err: unknown) => void;
  message: (msg: ServerMessage) => void;
  welcome: (msg: { peerId: string; deviceName: string }) => void;
  'code-created': (msg: { code: string; expiresAt: number }) => void;
  'join-request': (msg: { receiverId: string; deviceName: string }) => void;
  'join-pending': () => void;
  'join-accepted': (msg: { peerId: string }) => void;
  'join-rejected': () => void;
  signal: (msg: { from: string; data: SignalData }) => void;
  'code-released': (msg: { reason: string }) => void;
  serverError: (msg: { code: string; message: string; retryAfterMs?: number }) => void;
};

export class SignalingClient {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Map<keyof SignalingEventMap, Set<(...args: unknown[]) => void>>();
  private isIntentionalClose = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  public peerId: string | null = null;
  public deviceName: string | null = null;

  constructor(private wsUrl: string) {}

  on<K extends keyof SignalingEventMap>(event: K, fn: SignalingEventMap[K]): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as (...args: unknown[]) => void);
    return () => set?.delete(fn as (...args: unknown[]) => void);
  }

  private emit<K extends keyof SignalingEventMap>(
    event: K,
    ...args: Parameters<SignalingEventMap[K]>
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const fn of set) {
        try {
          fn(...args);
        } catch (e) {
          console.error(`Error in signaling listener for ${event}:`, e);
        }
      }
    }
  }

  async connect(): Promise<void> {
    this.isIntentionalClose = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.send({
          v: PROTOCOL_VERSION,
          t: 'hello',
          clientVersion: '1.0.0',
        });
        this.emit('open');
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data);
          const parsed = JSON.parse(raw);
          const message = parseServerMessage(parsed);
          this.handleServerMessage(message);
        } catch (err) {
          console.warn('Failed to parse incoming signaling message:', err);
        }
      };

      this.ws.onerror = (err) => {
        this.emit('error', err);
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.emit('close', event);

        if (!this.isIntentionalClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 5000);
          this.reconnectAttempts++;
          setTimeout(() => {
            if (!this.isIntentionalClose) {
              this.connect().catch(() => {});
            }
          }, delay);
        }
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private handleServerMessage(msg: ServerMessage): void {
    this.emit('message', msg);

    switch (msg.t) {
      case 'welcome':
        this.peerId = msg.peerId;
        this.deviceName = msg.deviceName;
        this.emit('welcome', msg);
        break;
      case 'code-created':
        this.emit('code-created', msg);
        break;
      case 'join-request':
        this.emit('join-request', msg);
        break;
      case 'join-pending':
        this.emit('join-pending');
        break;
      case 'join-accepted':
        this.emit('join-accepted', msg);
        break;
      case 'join-rejected':
        this.emit('join-rejected');
        break;
      case 'signal':
        this.emit('signal', msg);
        break;
      case 'code-released':
        this.emit('code-released', msg);
        break;
      case 'error':
        this.emit('serverError', msg);
        break;
      case 'pong':
        break;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.send({
        v: PROTOCOL_VERSION,
        t: 'ping',
      });
    }, WS_KEEPALIVE_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  disconnect(): void {
    this.isIntentionalClose = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
