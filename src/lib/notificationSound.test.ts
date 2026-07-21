import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playNotificationSound } from './notificationSound';

const mockStart = vi.fn();
const mockStop = vi.fn();
const mockOscillatorConnect = vi.fn();
const mockGainConnect = vi.fn();
const mockResume = vi.fn();

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

function makeMockAudioContextClass(initialState: 'running' | 'suspended') {
  return class MockAudioContext {
    state = initialState;
    currentTime = 0;
    destination = {};
    resume = mockResume;
    createOscillator = vi.fn(() => makeOscillator());
    createGain = vi.fn(() => makeGain());
  };
}

describe('playNotificationSound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { AudioContext?: unknown }).AudioContext = makeMockAudioContextClass('running');
  });

  it('creates and starts four oscillators for the ring pattern', () => {
    playNotificationSound();

    expect(mockStart).toHaveBeenCalledTimes(4);
    expect(mockStop).toHaveBeenCalledTimes(4);
    expect(mockOscillatorConnect).toHaveBeenCalledTimes(4);
    expect(mockGainConnect).toHaveBeenCalledTimes(4);
  });

  it('does nothing when AudioContext is unavailable', async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
    vi.resetModules();
    const { playNotificationSound: playWithoutAudioContext } = await import('./notificationSound');
    expect(() => playWithoutAudioContext()).not.toThrow();
  });
});

describe('unlockNotificationAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resumes the audio context when it starts suspended', async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = makeMockAudioContextClass('suspended');
    vi.resetModules();
    const { unlockNotificationAudio } = await import('./notificationSound');

    unlockNotificationAudio();

    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('does not call resume when the context is already running', async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = makeMockAudioContextClass('running');
    vi.resetModules();
    const { unlockNotificationAudio } = await import('./notificationSound');

    unlockNotificationAudio();

    expect(mockResume).not.toHaveBeenCalled();
  });

  it('does nothing when AudioContext is unavailable', async () => {
    (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
    vi.resetModules();
    const { unlockNotificationAudio } = await import('./notificationSound');
    expect(() => unlockNotificationAudio()).not.toThrow();
  });
});
