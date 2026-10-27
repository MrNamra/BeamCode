import { describe, it, expect } from 'vitest';
import { detectConnectionType } from '../src/core/rtc/connectionType.js';

function createMockStats(entries: Record<string, Record<string, unknown>>): RTCStatsReport {
  const map = new Map<string, unknown>();
  for (const [key, val] of Object.entries(entries)) {
    map.set(key, val);
  }
  return map as unknown as RTCStatsReport;
}

describe('detectConnectionType', () => {
  it('detects LAN connection from host <-> host candidates', async () => {
    const stats = createMockStats({
      transport_1: {
        type: 'transport',
        selectedCandidatePairId: 'pair_1',
      },
      pair_1: {
        type: 'candidate-pair',
        localCandidateId: 'cand_local',
        remoteCandidateId: 'cand_remote',
      },
      cand_local: {
        type: 'local-candidate',
        candidateType: 'host',
      },
      cand_remote: {
        type: 'remote-candidate',
        candidateType: 'host',
      },
    });

    const pc = { getStats: async () => stats };
    const type = await detectConnectionType(pc as unknown as RTCPeerConnection);
    expect(type).toBe('lan');
  });

  it('detects LAN connection from srflx <-> srflx with matching public IP (hairpin NAT)', async () => {
    const stats = createMockStats({
      transport_1: {
        type: 'transport',
        selectedCandidatePairId: 'pair_1',
      },
      pair_1: {
        type: 'candidate-pair',
        localCandidateId: 'cand_local',
        remoteCandidateId: 'cand_remote',
      },
      cand_local: {
        type: 'local-candidate',
        candidateType: 'srflx',
        address: '203.0.113.195',
      },
      cand_remote: {
        type: 'remote-candidate',
        candidateType: 'srflx',
        address: '203.0.113.195',
      },
    });

    const pc = { getStats: async () => stats };
    const type = await detectConnectionType(pc as unknown as RTCPeerConnection);
    expect(type).toBe('lan');
  });

  it('detects Direct connection from srflx <-> srflx with different IPs', async () => {
    const stats = createMockStats({
      transport_1: {
        type: 'transport',
        selectedCandidatePairId: 'pair_1',
      },
      pair_1: {
        type: 'candidate-pair',
        localCandidateId: 'cand_local',
        remoteCandidateId: 'cand_remote',
      },
      cand_local: {
        type: 'local-candidate',
        candidateType: 'srflx',
        address: '203.0.113.10',
      },
      cand_remote: {
        type: 'remote-candidate',
        candidateType: 'srflx',
        address: '198.51.100.20',
      },
    });

    const pc = { getStats: async () => stats };
    const type = await detectConnectionType(pc as unknown as RTCPeerConnection);
    expect(type).toBe('direct');
  });

  it('detects Relay connection when either side uses relay', async () => {
    const stats = createMockStats({
      transport_1: {
        type: 'transport',
        selectedCandidatePairId: 'pair_1',
      },
      pair_1: {
        type: 'candidate-pair',
        localCandidateId: 'cand_local',
        remoteCandidateId: 'cand_remote',
      },
      cand_local: {
        type: 'local-candidate',
        candidateType: 'relay',
      },
      cand_remote: {
        type: 'remote-candidate',
        candidateType: 'srflx',
      },
    });

    const pc = { getStats: async () => stats };
    const type = await detectConnectionType(pc as unknown as RTCPeerConnection);
    expect(type).toBe('relay');
  });

  it('returns unknown when no pair is selected or found', async () => {
    const stats = createMockStats({});
    const pc = { getStats: async () => stats };
    const type = await detectConnectionType(pc as unknown as RTCPeerConnection);
    expect(type).toBe('unknown');
  });
});
