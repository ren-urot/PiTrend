import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs in a jsdom environment with DOM globals available', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
  });
});
