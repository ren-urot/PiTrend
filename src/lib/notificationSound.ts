let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

/**
 * Browsers only allow an AudioContext to start/resume from inside a real
 * user gesture (click, tap, keypress) — not from an async callback like a
 * realtime WebSocket message. Call this once from a gesture handler (see
 * AppShell) so the context is already running by the time a notification
 * needs to play; without it, playNotificationSound() silently does nothing
 * forever, since resume() calls made outside a gesture are ignored too.
 */
export function unlockNotificationAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
}

/**
 * A four-note "ring-ring" alert, synthesized so no audio asset needs to
 * ship. Louder and brighter (triangle wave) than a single soft chime, and
 * repeats the two-tone pattern twice so it reads as an actual ring rather
 * than a quiet blip that's easy to miss.
 */
export function playNotificationSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const now = ctx.currentTime;
  const notes = [880, 1320, 880, 1320];
  notes.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;

    const start = now + index * 0.16;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.4, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });
}
