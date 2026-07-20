import { describe, it, expect } from 'vitest';
import { initialsFor } from './NodeAvatar';

describe('initialsFor', () => {
  it('takes the first letter of the first two words', () => {
    expect(initialsFor('Jun Samson')).toBe('JS');
  });

  it('handles a single name', () => {
    expect(initialsFor('Cher')).toBe('C');
  });

  it('collapses extra whitespace', () => {
    expect(initialsFor('  Ren   Urot  ')).toBe('RU');
  });

  it('falls back to "?" for an empty name', () => {
    expect(initialsFor('')).toBe('?');
  });
});
