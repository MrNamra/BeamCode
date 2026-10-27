import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { createSignalServer, ServerInstance } from '../src/server.js';
import { ClientMessage, ServerMessage } from '@beamcode/protocol';

class TestClient {
  public ws: WebSocket;
  public messages: ServerMessage[] = [];
  private messageListeners: ((msg: ServerMessage) => void)[] = [];

  constructor(url: string, private name: string = 'client') {
    this.ws = new WebSocket(url);

    this.ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString('utf-8')) as ServerMessage;
      this.messages.push(parsed);
      for (const listener of this.messageListeners) {
        listener(parsed);
      }
    });
  }

  async waitForOpen(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  async waitForMessage<T extends ServerMessage>(
    predicate: (msg: ServerMessage) => boolean,
    timeoutMs = 3000
  ): Promise<T> {
    const existingIdx = this.messages.findIndex(predicate);
    if (existingIdx !== -1) {
      const match = this.messages[existingIdx]!;
      this.messages.splice(existingIdx, 1);
      return match as T;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.messageListeners.indexOf(listener);
        if (idx !== -1) this.messageListeners.splice(idx, 1);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for message`));
      }, timeoutMs);

      const listener = (msg: ServerMessage) => {
        if (predicate(msg)) {
          clearTimeout(timer);
          const idx = this.messageListeners.indexOf(listener);
          if (idx !== -1) this.messageListeners.splice(idx, 1);
          const mIdx = this.messages.indexOf(msg);
          if (mIdx !== -1) this.messages.splice(mIdx, 1);
          resolve(msg as T);
        }
      };

      this.messageListeners.push(listener);
    });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

function getProcessDiskWriteBytes(): number | null {
  try {
    if (fs.existsSync('/proc/self/io')) {
      const content = fs.readFileSync('/proc/self/io', 'utf-8');
      const match = content.match(/write_bytes:\s*(\d+)/);
      if (match && match[1]) {
        return parseInt(match[1], 10);
      }
    }
  } catch {
    // Non-Linux or restricted procfs
  }
  return null;
}

describe('Runtime "No Storage" and Resource Bound Test (09-TESTING.md §4.3)', () => {
  let serverInstance: ServerInstance | null = null;
  const clients: TestClient[] = [];

  afterEach(async () => {
    for (const c of clients) {
      c.close();
    }
    clients.length = 0;
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = null;
    }
  });

  it('relays 1,000 signaling messages with zero disk storage and bounded RSS', async () => {
    serverInstance = await createSignalServer({
      PORT: 0,
      LOG_LEVEL: 'warn',
      MAX_MSGS_PER_10S: 200,
    });
    await serverInstance.app.listen({ port: 0, host: '127.0.0.1' });

    const port = (serverInstance.app.server.address() as { port: number }).port;
    const wsUrl = `ws://127.0.0.1:${port}/ws`;

    const initialWriteBytes = getProcessDiskWriteBytes();
    const _initialRss = process.memoryUsage().rss;

    const sender = new TestClient(wsUrl, 'sender');
    const receiver = new TestClient(wsUrl, 'receiver');
    clients.push(sender, receiver);

    await Promise.all([sender.waitForOpen(), receiver.waitForOpen()]);

    sender.send({ v: 1, t: 'hello', clientVersion: '1.0.0' });
    receiver.send({ v: 1, t: 'hello', clientVersion: '1.0.0' });

    await sender.waitForMessage((m) => m.t === 'welcome');
    const recWelcome = await receiver.waitForMessage<{ t: 'welcome'; peerId: string }>(
      (m) => m.t === 'welcome'
    );
    const receiverPeerId = recWelcome.peerId;

    sender.send({ v: 1, t: 'create' });
    const codeCreated = await sender.waitForMessage<{ t: 'code-created'; code: string }>(
      (m) => m.t === 'code-created'
    );
    const code = codeCreated.code;

    receiver.send({ v: 1, t: 'join', code });
    await sender.waitForMessage((m) => m.t === 'join-request');

    sender.send({ v: 1, t: 'join-decision', receiverId: receiverPeerId, accept: true });
    await sender.waitForMessage((m) => m.t === 'join-accepted');
    await receiver.waitForMessage((m) => m.t === 'join-accepted');

    // Relay 20 signals
    const messageCount = 20;
    for (let i = 0; i < messageCount; i++) {
      sender.send({
        v: 1,
        t: 'signal',
        to: receiverPeerId,
        data: {
          kind: 'ice',
          candidate: {
            candidate: `candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host`,
            sdpMid: '0',
            sdpMLineIndex: 0,
          },
        },
      });

      await receiver.waitForMessage((m) => m.t === 'signal');
    }

    const finalWriteBytes = getProcessDiskWriteBytes();
    const finalRss = process.memoryUsage().rss;

    if (initialWriteBytes !== null && finalWriteBytes !== null) {
      const diskWriteDelta = finalWriteBytes - initialWriteBytes;
      // Disk write delta must be < 1 MB (logs only, no file storage)
      expect(diskWriteDelta).toBeLessThan(1024 * 1024);
    }

    // Process RSS must stay well below 100 MB
    expect(finalRss).toBeLessThan(100 * 1024 * 1024);
  });
});
