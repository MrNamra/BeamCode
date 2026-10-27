import { describe, it, expect } from 'vitest';
import {
  extractFingerprintFromSdp,
  deriveSecurityPhrase,
  normalizeFingerprint,
} from '../src/securityPhrase.js';

describe('Security Phrase (DTLS Fingerprint)', () => {
  it('extracts fingerprint from standard SDP attribute', () => {
    const sdp = [
      'v=0',
      'o=- 12345 2 IN IP4 127.0.0.1',
      's=-',
      't=0 0',
      'a=fingerprint:sha-256 3B:7D:F2:89:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78:9A:BC:DE:F0:12:34:56:78',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    ].join('\r\n');

    const fp = extractFingerprintFromSdp(sdp);
    expect(fp).toBe('3b7df289123456789abcdef0123456789abcdef0123456789abcdef012345678');
  });

  it('normalizes fingerprints consistently', () => {
    const fp1 = '3B:7D:F2:89';
    const fp2 = '3b-7d-f2-89';
    const fp3 = '3b 7d f2 89';
    expect(normalizeFingerprint(fp1)).toBe('3b7df289');
    expect(normalizeFingerprint(fp2)).toBe('3b7df289');
    expect(normalizeFingerprint(fp3)).toBe('3b7df289');
  });

  it('produces identical phrase regardless of peer ordering (mutual verification)', () => {
    const fpA = '11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00';
    const fpB = 'ff:ee:dd:cc:bb:aa:99:88:77:66:55:44:33:22:11:00';

    const phraseFromA = deriveSecurityPhrase(fpA, fpB);
    const phraseFromB = deriveSecurityPhrase(fpB, fpA);

    expect(phraseFromA).toBe(phraseFromB);
    expect(phraseFromA.split('-')).toHaveLength(4);
  });

  it('produces different phrases for different fingerprints (tamper detection)', () => {
    const fpA = '11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00';
    const fpB = 'ff:ee:dd:cc:bb:aa:99:88:77:66:55:44:33:22:11:00';
    const fpAttacker = '99:99:99:99:99:99:99:99:99:99:99:99:99:99:99:99';

    const honestPhrase = deriveSecurityPhrase(fpA, fpB);
    const mitmPhrase = deriveSecurityPhrase(fpA, fpAttacker);

    expect(honestPhrase).not.toBe(mitmPhrase);
  });
});
