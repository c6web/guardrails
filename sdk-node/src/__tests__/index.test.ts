import { describe, it, expect } from 'vitest';
import { SDK_VERSION } from '../index.js';

describe('SDK_VERSION', () => {
  it('should export the current version', () => {
    expect(SDK_VERSION).toBe('1.0.0');
  });
});
