import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { generateCoturnCredentials, getIceConfig } from '../src/ice.js';
import { loadConfig } from '../src/config.js';

describe('ICE configuration and TURN credentials', () => {
  it('generates HMAC-SHA1 coturn credentials matching the algorithm', () => {
    const secret = 'test-secret-123';
    const ttlSeconds = 3600;
    const nowEpoch = 1700000000;

    const creds = generateCoturnCredentials(secret, ttlSeconds, nowEpoch);
    const [expiryStr] = creds.username.split(':');

    expect(Number(expiryStr)).toBe(nowEpoch + ttlSeconds);

    // Verify HMAC-SHA1
    const expectedHmac = crypto
      .createHmac('sha1', secret)
      .update(creds.username)
      .digest('base64');

    expect(creds.credential).toBe(expectedHmac);
  });

  it('omits TURN when TURN_URLS is not set', () => {
    const config = loadConfig({
      STUN_URLS: 'stun:stun.l.google.com:19302',
    });

    const ice = getIceConfig(config);
    expect(ice.iceServers.length).toBe(1);
    expect(ice.iceServers[0]!.urls).toEqual(['stun:stun.l.google.com:19302']);
    expect(ice.iceServers[0]!.username).toBeUndefined();
  });

  it('includes TURN credentials when configured', () => {
    const config = loadConfig({
      STUN_URLS: 'stun:stun.l.google.com:19302',
      TURN_URLS: 'turn:turn.example.com:3478?transport=udp',
      TURN_STATIC_AUTH_SECRET: 'supersecret',
    });

    const ice = getIceConfig(config);
    expect(ice.iceServers.length).toBe(2);

    const turnServer = ice.iceServers[1]!;
    expect(turnServer.urls).toEqual(['turn:turn.example.com:3478?transport=udp']);
    expect(turnServer.username).toBeDefined();
    expect(turnServer.credential).toBeDefined();
  });
});
