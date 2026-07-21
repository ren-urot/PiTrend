import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playNotificationSound } from './notificationSound';

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockConnect = vi.fn();
const mockOscillatorConnect = vi.fn();
const mockGainConnect = vi.fn();

function makeGain() {
  return {
    gain: {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: mockGainConnect,
  };
}

function makeOscillator() {
  return {
    type: 'sine',
    frequency: { value: 0 },
    connect: mockOscillatorConnect,
    start: mockStart,
    stop: mockStop,
  };
}

class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn();
  createOscillator = vi.fn(() => makeOscillator());
  createGain = vi.fn(() => makeGain());
}

describe('playNotificationSound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockClear();
    (globalThis as { AudioContext?: unknown }).AudioContext = MockAudioContext;
  });

  it('creates and starts two oscillators for the chime', () => {
    playNotificationSound();

    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(mockStop).toHaveBeenCalledTimes(2);
    expect(mockOscillatorConnect).toHaveBeenCalledTimes(2);
    expect(mockGainConnect).toHaveBeenCalledTimes(2);
  });

  it('does nothing when AudioContext is unavailable', async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
    vi.resetModules();
    const { playNotificationSound: playWithoutAudioContext } = await import('./notificationSound');
    expect(() => playWithoutAudioContext()).not.toThrow();
  });
});
