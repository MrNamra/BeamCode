export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceConfigResponse {
  iceServers: IceServer[];
  ttl: number;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
];

export async function fetchIceServers(signalApiBase = ''): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${signalApiBase}/api/ice`);
    if (res.ok) {
      const data = (await res.json()) as IceConfigResponse;
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        return data.iceServers.map((s) => ({
          urls: s.urls,
          username: s.username,
          credential: s.credential,
        }));
      }
    }
  } catch {
    // fallback to default
  }

  return DEFAULT_ICE_SERVERS;
}
