export type ConnectionType = 'lan' | 'direct' | 'relay' | 'unknown';

interface CandidateReport {
  candidateType?: string;
  address?: string;
  ip?: string;
}

interface CandidatePairReport {
  type: string;
  id: string;
  localCandidateId: string;
  remoteCandidateId: string;
  state?: string;
  nominated?: boolean;
}

interface TransportReport {
  type: string;
  selectedCandidatePairId?: string;
}

export async function detectConnectionType(
  pc: Pick<RTCPeerConnection, 'getStats'>
): Promise<ConnectionType> {
  let stats: RTCStatsReport;
  try {
    stats = await pc.getStats();
  } catch {
    return 'unknown';
  }

  let selectedPair: CandidatePairReport | undefined;

  // 1. Look for selectedCandidatePairId from active transport
  stats.forEach((report) => {
    if (report.type === 'transport') {
      const transport = report as unknown as TransportReport;
      if (transport.selectedCandidatePairId) {
        selectedPair = stats.get(transport.selectedCandidatePairId) as unknown as CandidatePairReport;
      }
    }
  });

  // 2. Fallback: find nominated & succeeded candidate-pair
  if (!selectedPair) {
    stats.forEach((report) => {
      if (report.type === 'candidate-pair') {
        const pair = report as unknown as CandidatePairReport;
        if (pair.nominated && pair.state === 'succeeded') {
          selectedPair = pair;
        }
      }
    });
  }

  if (!selectedPair) {
    return 'unknown';
  }

  const local = stats.get(selectedPair.localCandidateId) as unknown as CandidateReport | undefined;
  const remote = stats.get(selectedPair.remoteCandidateId) as unknown as CandidateReport | undefined;

  if (!local || !remote) {
    return 'unknown';
  }

  // If either side uses relay -> 'relay'
  if (local.candidateType === 'relay' || remote.candidateType === 'relay') {
    return 'relay';
  }

  // host <-> host is LAN
  if (local.candidateType === 'host' && remote.candidateType === 'host') {
    return 'lan';
  }

  // Hairpin NAT: both srflx with matching public IP behaves like LAN
  const localAddr = local.address || local.ip;
  const remoteAddr = remote.address || remote.ip;
  if (
    local.candidateType === 'srflx' &&
    remote.candidateType === 'srflx' &&
    localAddr &&
    localAddr === remoteAddr
  ) {
    return 'lan';
  }

  return 'direct';
}
