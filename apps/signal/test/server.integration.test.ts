import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { createSignalServer, ServerInstance } from '../src/server.js';
import { ClientMessage, ServerMessage } from '@beamcode/protocol';

class TestClient {
  public ws: WebSocket;
  public messages: ServerMessage[] = [];
  private messageListeners: ((msg: ServerMessage) => void)[] = [];

  constructor(url: string) {
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
    // Check existing
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

describe('Signal Server Integration Tests', () => {
  let server: ServerInstance;
  let wsUrl: string;

  beforeEach(async () => {
    // Port 0 picks a random available port
    server = await createSignalServer({
      PORT: 0,
      CODE_COOLDOWN_SECONDS: 1, // Short cooldown for fast tests
      CODE_TTL_SECONDS: 10,
    });
    await server.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (server.app.server.address() as { port: number }).port;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
  });

  afterEach(async () => {
    await server.close();
  });

  it('runs full happy path: hello -> create -> join -> approve -> relay -> release -> cooldown -> re-assign', async () => {
    const sender = new TestClient(wsUrl);
    const receiver = new TestClient(wsUrl);
    await Promise.all([sender.waitForOpen(), receiver.waitForOpen()]);

    // 1. Hello
    sender.send({ v: 1, t: 'hello', clientVersion: '1.0.0' });
    const welcomeSender = await sender.waitForMessage<{ t: 'welcome'; peerId: string }>(
      (m) => m.t === 'welcome'
    );
    expect(welcomeSender.peerId).toBeDefined();

    receiver.send({ v: 1, t: 'hello', clientVersion: '1.0.0' });
    const welcomeReceiver = await receiver.waitForMessage<{ t: 'welcome'; peerId: string }>(
      (m) => m.t === 'welcome'
    );
    expect(welcomeReceiver.peerId).toBeDefined();

    // 2. Sender creates code
    sender.send({ v: 1, t: 'create' });
    const codeCreated = await sender.waitForMessage<{ t: 'code-created'; code: string }>(
      (m) => m.t === 'code-created'
    );
    expect(codeCreated.code).toMatch(/^\d{6}$/);

    // 3. Receiver joins with code
    receiver.send({ v: 1, t: 'join', code: codeCreated.code });
    await receiver.waitForMessage((m) => m.t === 'join-pending');

    const joinReq = await sender.waitForMessage<{ t: 'join-request'; receiverId: string }>(
      (m) => m.t === 'join-request'
    );
    expect(joinReq.receiverId).toBe(welcomeReceiver.peerId);

    // 4. Sender approves join
    sender.send({ v: 1, t: 'join-decision', receiverId: joinReq.receiverId, accept: true });

    const senderAccepted = await sender.waitForMessage<{ t: 'join-accepted'; peerId: string }>(
      (m) => m.t === 'join-accepted'
    );
    expect(senderAccepted.peerId).toBe(welcomeReceiver.peerId);

    const receiverAccepted = await receiver.waitForMessage<{ t: 'join-accepted'; peerId: string }>(
      (m) => m.t === 'join-accepted'
    );
    expect(receiverAccepted.peerId).toBe(welcomeSender.peerId);

    // 5. Signal relay: sender sends offer to receiver
    sender.send({
      v: 1,
      t: 'signal',
      to: welcomeReceiver.peerId,
      data: { kind: 'offer', sdp: 'v=0 offer' },
    });

    const receivedOffer = await receiver.waitForMessage<{ t: 'signal'; from: string; data: { kind: 'offer'; sdp: string } }>(
      (m) => m.t === 'signal'
    );
    expect(receivedOffer.from).toBe(welcomeSender.peerId);
    expect(receivedOffer.data.sdp).toBe('v=0 offer');

    // Receiver answers sender
    receiver.send({
      v: 1,
      t: 'signal',
      to: welcomeSender.peerId,
      data: { kind: 'answer', sdp: 'v=0 answer' },
    });

    const receivedAnswer = await sender.waitForMessage<{ t: 'signal'; from: string; data: { kind: 'answer'; sdp: string } }>(
      (m) => m.t === 'signal'
    );
    expect(receivedAnswer.from).toBe(welcomeReceiver.peerId);
    expect(receivedAnswer.data.sdp).toBe('v=0 answer');

    // 6. Release transfer (completed)
    sender.send({ v: 1, t: 'release', reason: 'completed' });

    const senderReleased = await sender.waitForMessage<{ t: 'code-released'; reason: string }>(
      (m) => m.t === 'code-released'
    );
    const receiverReleased = await receiver.waitForMessage<{ t: 'code-released'; reason: string }>(
      (m) => m.t === 'code-released'
    );
    expect(senderReleased.reason).toBe('completed');
    expect(receiverReleased.reason).toBe('completed');

    // 7. Cooldown test: joining immediately must fail with CODE_UNAVAILABLE
    const thirdClient = new TestClient(wsUrl);
    await thirdClient.waitForOpen();
    thirdClient.send({ v: 1, t: 'join', code: codeCreated.code });

    const err = await thirdClient.waitForMessage<{ t: 'error'; code: string }>(
      (m) => m.t === 'error'
    );
    expect(err.code).toBe('CODE_UNAVAILABLE');

    // 8. Re-assignment: wait 1.1s for cooldown to expire (configured to 1s)
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Inject RNG into codeRegistry to force the exact same code
    (server.codeRegistry as unknown as { rng: () => number }).rng = () => Number(codeCreated.code);

    thirdClient.send({ v: 1, t: 'create' });
    const reissued = await thirdClient.waitForMessage<{ t: 'code-created'; code: string }>(
      (m) => m.t === 'code-created'
    );
    expect(reissued.code).toBe(codeCreated.code);

    sender.close();
    receiver.close();
    thirdClient.close();
  });

  it('handles negative path: wrong/unknown code', async () => {
    const client = new TestClient(wsUrl);
    await client.waitForOpen();

    client.send({ v: 1, t: 'join', code: '999999' });
    const err = await client.waitForMessage<{ t: 'error'; code: string }>(
      (m) => m.t === 'error'
    );
    expect(err.code).toBe('CODE_UNAVAILABLE');
    client.close();
  });

  it('handles negative path: locked code blocks second joiner', async () => {
    const sender = new TestClient(wsUrl);
    const receiver1 = new TestClient(wsUrl);
    const receiver2 = new TestClient(wsUrl);
    await Promise.all([sender.waitForOpen(), receiver1.waitForOpen(), receiver2.waitForOpen()]);

    sender.send({ v: 1, t: 'create' });
    const { code } = await sender.waitForMessage<{ t: 'code-created'; code: string }>((m) => m.t === 'code-created');

    receiver1.send({ v: 1, t: 'join', code });
    const req = await sender.waitForMessage<{ t: 'join-request'; receiverId: string }>((m) => m.t === 'join-request');
    sender.send({ v: 1, t: 'join-decision', receiverId: req.receiverId, accept: true });
    await receiver1.waitForMessage((m) => m.t === 'join-accepted');

    // receiver2 tries to join the already locked code
    receiver2.send({ v: 1, t: 'join', code });
    const err = await receiver2.waitForMessage<{ t: 'error'; code: string }>((m) => m.t === 'error');
    expect(err.code).toBe('CODE_UNAVAILABLE');

    sender.close();
    receiver1.close();
    receiver2.close();
  });

  it('handles negative path: 3 rejections releases the code', async () => {
    const sender = new TestClient(wsUrl);
    await sender.waitForOpen();

    sender.send({ v: 1, t: 'create' });
    const { code } = await sender.waitForMessage<{ t: 'code-created'; code: string }>((m) => m.t === 'code-created');

    for (let i = 0; i < 3; i++) {
      const rec = new TestClient(wsUrl);
      await rec.waitForOpen();
      rec.send({ v: 1, t: 'join', code });
      const req = await sender.waitForMessage<{ t: 'join-request'; receiverId: string }>((m) => m.t === 'join-request');
      sender.send({ v: 1, t: 'join-decision', receiverId: req.receiverId, accept: false });
      await rec.waitForMessage((m) => m.t === 'join-rejected');
      rec.close();
    }

    // Sender should receive code-released with cancelled
    const released = await sender.waitForMessage<{ t: 'code-released'; reason: string }>((m) => m.t === 'code-released');
    expect(released.reason).toBe('cancelled');
    sender.close();
  });

  it('handles negative path: sender disconnects mid-lock', async () => {
    const sender = new TestClient(wsUrl);
    const receiver = new TestClient(wsUrl);
    await Promise.all([sender.waitForOpen(), receiver.waitForOpen()]);

    sender.send({ v: 1, t: 'create' });
    const { code } = await sender.waitForMessage<{ t: 'code-created'; code: string }>((m) => m.t === 'code-created');

    receiver.send({ v: 1, t: 'join', code });
    const req = await sender.waitForMessage<{ t: 'join-request'; receiverId: string }>((m) => m.t === 'join-request');
    sender.send({ v: 1, t: 'join-decision', receiverId: req.receiverId, accept: true });
    await receiver.waitForMessage((m) => m.t === 'join-accepted');

    // Abrupt sender disconnect
    sender.close();

    const released = await receiver.waitForMessage<{ t: 'code-released'; reason: string }>((m) => m.t === 'code-released');
    expect(released.reason).toBe('peer-left');
    receiver.close();
  });

  it('handles negative path: oversized frame > 64 KiB closes socket with 1009', async () => {
    const client = new TestClient(wsUrl);
    await client.waitForOpen();

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      client.ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() });
      });
    });

    // Send a frame > 64 KiB (e.g. 65 KiB)
    const bigPayload = 'x'.repeat(65 * 1024);
    client.ws.send(bigPayload);

    const result = await closePromise;
    expect(result.code).toBe(1009); // Message Too Big
  });

  it('handles negative path: malformed JSON or unknown message type', async () => {
    const client = new TestClient(wsUrl);
    await client.waitForOpen();

    // Invalid JSON
    client.ws.send('invalid json {');
    const badJsonErr = await client.waitForMessage<{ t: 'error'; code: string }>((m) => m.t === 'error');
    expect(badJsonErr.code).toBe('BAD_MESSAGE');

    // Unknown message type
    client.ws.send(JSON.stringify({ v: 1, t: 'unknown-type' }));
    const badTypeErr = await client.waitForMessage<{ t: 'error'; code: string }>((m) => m.t === 'error');
    expect(badTypeErr.code).toBe('BAD_MESSAGE');

    client.close();
  });
});
