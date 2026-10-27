import {
  MAX_CHANNELS,
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  SignalData,
} from '@beamcode/protocol';
import { detectConnectionType, ConnectionType } from './connectionType.js';

export interface PeerSessionOptions {
  iceServers: RTCIceServer[];
  onSignal: (data: SignalData) => void;
  onConnectionTypeChange?: (type: ConnectionType) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export class PeerSession {
  public pc: RTCPeerConnection;
  public ctrlChannel: RTCDataChannel;
  public dataChannels: RTCDataChannel[] = [];
  public connectionType: ConnectionType = 'unknown';

  private remoteCandidateQueue: RTCIceCandidateInit[] = [];
  private hasRemoteDescription = false;

  constructor(private options: PeerSessionOptions) {
    this.pc = new RTCPeerConnection({
      iceServers: options.iceServers,
      iceTransportPolicy: 'all', // ICE policy all (never force relay)
      bundlePolicy: 'max-bundle',
      iceCandidatePoolSize: 2,
    });

    // Create negotiated control channel (id: 0)
    this.ctrlChannel = this.pc.createDataChannel('ctrl', {
      negotiated: true,
      id: 0,
      ordered: true,
    });

    // Create 8 negotiated data channels (id: 1..8)
    for (let i = 0; i < MAX_CHANNELS; i++) {
      const ch = this.pc.createDataChannel(`data-${i}`, {
        negotiated: true,
        id: i + 1,
        ordered: true,
      });
      ch.binaryType = 'arraybuffer';
      ch.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
      this.dataChannels.push(ch);
    }

    this.setupListeners();
  }

  private setupListeners(): void {
    // Trickle ICE
    this.pc.onicecandidate = (event) => {
      this.options.onSignal({
        kind: 'ice',
        candidate: event.candidate ? event.candidate.toJSON() : null,
      });
    };

    this.pc.onconnectionstatechange = async () => {
      const state = this.pc.connectionState;
      this.options.onConnectionStateChange?.(state);

      if (state === 'connected') {
        await this.checkConnectionType();
      }
    };

    this.pc.oniceconnectionstatechange = async () => {
      if (this.pc.iceConnectionState === 'connected' || this.pc.iceConnectionState === 'completed') {
        await this.checkConnectionType();
      }
    };
  }

  private async checkConnectionType(): Promise<void> {
    const detected = await detectConnectionType(this.pc);
    if (detected !== this.connectionType) {
      this.connectionType = detected;
      this.options.onConnectionTypeChange?.(detected);
    }
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(sdp: string): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription({ type: 'offer', sdp });
    this.hasRemoteDescription = true;
    await this.flushQueuedCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
    this.hasRemoteDescription = true;
    await this.flushQueuedCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit | null): Promise<void> {
    if (!candidate) return;

    if (!this.hasRemoteDescription) {
      this.remoteCandidateQueue.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Failed to add ICE candidate:', err);
    }
  }

  private async flushQueuedCandidates(): Promise<void> {
    while (this.remoteCandidateQueue.length > 0) {
      const cand = this.remoteCandidateQueue.shift();
      if (cand) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.warn('Failed to add queued ICE candidate:', err);
        }
      }
    }
  }

  async waitForChannelsOpen(channelCount = 1, timeoutMs = 30000): Promise<void> {
    const channelsToCheck = [this.ctrlChannel, ...this.dataChannels.slice(0, channelCount)];

    await Promise.all(
      channelsToCheck.map(
        (ch) =>
          new Promise<void>((resolve, reject) => {
            if (ch.readyState === 'open') {
              resolve();
              return;
            }

            const timer = setTimeout(() => {
              reject(new Error(`Timeout waiting for channel ${ch.label} to open`));
            }, timeoutMs);

            ch.onopen = () => {
              clearTimeout(timer);
              resolve();
            };

            ch.onerror = (err) => {
              clearTimeout(timer);
              reject(err);
            };
          })
      )
    );
  }

  close(): void {
    try {
      this.ctrlChannel.close();
      for (const ch of this.dataChannels) {
        ch.close();
      }
      this.pc.close();
    } catch {
      // ignore
    }
  }
}
