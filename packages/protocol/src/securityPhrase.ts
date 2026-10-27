/**
 * Security phrase derivation from DTLS certificate fingerprints.
 * Provides mutual authentication check against MITM attacks on signaling.
 */

// 256 phonetically distinct, easy-to-pronounce English words
export const WORDLIST_256: readonly string[] = [
  'acorn', 'alder', 'amber', 'anchor', 'anvil', 'apple', 'apron', 'archer',
  'arrow', 'atlas', 'badger', 'baker', 'balsam', 'banner', 'barley', 'beacon',
  'beaver', 'beetle', 'birch', 'bison', 'blade', 'blazer', 'bloom', 'board',
  'bonnet', 'branch', 'breeze', 'bridge', 'brook', 'buckle', 'butter', 'cabin',
  'cactus', 'candle', 'canyon', 'carpet', 'castle', 'cedar', 'celery', 'chalk',
  'cherry', 'circle', 'cliff', 'cloak', 'cloud', 'clover', 'cobalt', 'comet',
  'copper', 'coral', 'corner', 'cotton', 'crater', 'cricket', 'crown', 'crystal',
  'daisy', 'danger', 'delta', 'desert', 'diamond', 'dinner', 'dolphin', 'dragon',
  'drift', 'driver', 'eagle', 'echo', 'ember', 'engine', 'expert', 'fabric',
  'falcon', 'feather', 'fender', 'fern', 'finger', 'fir', 'flame', 'flask',
  'flavor', 'fleece', 'flint', 'flower', 'forest', 'fossil', 'fox', 'frost',
  'galaxy', 'garden', 'garnet', 'gate', 'geyser', 'glacier', 'glass', 'glove',
  'goblet', 'granite', 'gravel', 'grove', 'hammer', 'harbor', 'hawk', 'hazel',
  'header', 'helmet', 'heron', 'horizon', 'hornet', 'hound', 'hunter', 'iceberg',
  'island', 'jacket', 'jaguar', 'jasper', 'jewel', 'jumper', 'jungle', 'kettle',
  'ladder', 'lagoon', 'lantern', 'lark', 'laurel', 'leader', 'leather', 'lemon',
  'leopard', 'lichen', 'lily', 'lizard', 'llama', 'locket', 'lotus', 'lumber',
  'magnet', 'mallet', 'mango', 'maple', 'marble', 'meadow', 'melon', 'meteor',
  'mirror', 'monkey', 'moon', 'morning', 'moss', 'mountain', 'needle', 'nest',
  'nickel', 'night', 'oak', 'oasis', 'ocean', 'olive', 'onyx', 'opal',
  'orbit', 'orchid', 'otter', 'owl', 'palace', 'panther', 'paper', 'parade',
  'parrot', 'pebble', 'pelican', 'pepper', 'pewter', 'phantom', 'picnic', 'pillar',
  'pine', 'planet', 'plasma', 'platypus', 'pocket', 'pond', 'poplar', 'portal',
  'puddle', 'quartz', 'quiver', 'rabbit', 'radar', 'rainbow', 'ranger', 'raven',
  'reed', 'reef', 'ribbon', 'rider', 'river', 'robin', 'rocket', 'ruby',
  'sailor', 'salmon', 'sandal', 'sapphire', 'saturn', 'scale', 'scarlet', 'shadow',
  'shield', 'shore', 'silver', 'skater', 'slate', 'sleet', 'solar', 'spider',
  'spruce', 'squirrel', 'star', 'stone', 'stream', 'summit', 'sunset', 'swift',
  'sword', 'temple', 'thistle', 'thunder', 'tiger', 'timber', 'topaz', 'torch',
  'tower', 'track', 'travel', 'treasure', 'tree', 'tulip', 'tunnel', 'turtle',
  'valley', 'vapor', 'velvet', 'vessel', 'violet', 'volcano', 'vortex', 'walnut',
  'water', 'wave', 'willow', 'wind', 'winter', 'wizard', 'wolf', 'zenith',
];

/**
 * Normalizes a fingerprint string into lowercase hex digits without punctuation.
 */
export function normalizeFingerprint(fp: string): string {
  return fp.toLowerCase().replace(/[^a-f0-9]/g, '');
}

/**
 * Extracts the DTLS fingerprint from an SDP string.
 * Looks for `a=fingerprint:sha-256 ...` or similar.
 */
export function extractFingerprintFromSdp(sdp: string): string | null {
  const match = sdp.match(/a=fingerprint:(?:sha-256|sha-1)\s+([A-Fa-f0-9:]+)/i);
  if (!match || !match[1]) return null;
  return normalizeFingerprint(match[1]);
}

/**
 * Derives a deterministic 4-word verification phrase from two DTLS fingerprints.
 * Sorting the fingerprints ensures both peers compute the exact same phrase.
 */
export function deriveSecurityPhrase(fpA: string, fpB: string): string {
  const normA = normalizeFingerprint(fpA);
  const normB = normalizeFingerprint(fpB);

  // Sort fingerprints to achieve identical order on sender and receiver
  const sorted = [normA, normB].sort().join(':');

  // Simple, fast deterministic 32-bit FNV-1a based multi-hash
  let h1 = 0x811c9dc5;
  let h2 = 0x84222325;
  let h3 = 0xcbf29ce4;
  let h4 = 0x67452301;

  for (let i = 0; i < sorted.length; i++) {
    const code = sorted.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ code, 0x01000193);
    h3 = Math.imul(h3 ^ (code + i), 0x01000193);
    h4 = Math.imul(h4 ^ (code * 31), 0x01000193);
  }

  const idx1 = Math.abs(h1) % WORDLIST_256.length;
  const idx2 = Math.abs(h2) % WORDLIST_256.length;
  const idx3 = Math.abs(h3) % WORDLIST_256.length;
  const idx4 = Math.abs(h4) % WORDLIST_256.length;

  return `${WORDLIST_256[idx1]}-${WORDLIST_256[idx2]}-${WORDLIST_256[idx3]}-${WORDLIST_256[idx4]}`;
}
