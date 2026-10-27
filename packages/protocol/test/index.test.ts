import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION } from '../src/index.js';

describe('protocol scaffold', () => {
  it('exports PROTOCOL_VERSION 1', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
