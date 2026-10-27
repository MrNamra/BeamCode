import crypto from 'node:crypto';
import type { Config } from './config.js';

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceResponse {
  iceServers: IceServerConfig[];
  ttl: number;
}

export function generateCoturnCredentials(
  secret: string,
  ttlSeconds: number,
  nowEpochSec = Math.floor(Date.now() / 1000)
): { username: string; credential: string } {
  const expiry = nowEpochSec + ttlSeconds;
  const nonce = crypto.randomBytes(4).toString('hex');
  const username = `${expiry}:${nonce}`;

  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(username);
  const credential = hmac.digest('base64');

  return { username, credential };
}

export function getIceConfig(config: Config): IceResponse {
  const iceServers: IceServerConfig[] = [];

  // STUN
  if (config.STUN_URLS.length > 0) {
    iceServers.push({
      urls: config.STUN_URLS,
    });
  }

  // TURN (only if both TURN_URLS and TURN_STATIC_AUTH_SECRET are present)
  if (config.TURN_URLS && config.TURN_URLS.length > 0 && config.TURN_STATIC_AUTH_SECRET) {
    const creds = generateCoturnCredentials(
      config.TURN_STATIC_AUTH_SECRET,
      config.TURN_CREDENTIAL_TTL_SECONDS
    );

    iceServers.push({
      urls: config.TURN_URLS,
      username: creds.username,
      credential: creds.credential,
    });
  }

  return {
    iceServers,
    ttl: config.TURN_CREDENTIAL_TTL_SECONDS,
  };
}
