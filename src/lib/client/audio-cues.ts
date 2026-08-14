let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function playTone(freq: number, durationMs: number, type: OscillatorType = 'sine', volume = 0.08) {
  try {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + durationMs / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + durationMs / 1000);
  } catch {
    // AudioContext may be blocked by browser autoplay policy
  }
}

export function playThinkingCue() {
  playTone(880, 120, 'sine', 0.06);
}

export function playCompleteCue() {
  playTone(660, 150, 'sine', 0.07);
  setTimeout(() => playTone(880, 200, 'sine', 0.05), 100);
}

export function playSyncStartCue() {
  playTone(440, 200, 'triangle', 0.06);
}

export function playSyncDoneCue() {
  playTone(523, 120, 'sine', 0.06);
  setTimeout(() => playTone(659, 120, 'sine', 0.06), 80);
  setTimeout(() => playTone(784, 200, 'sine', 0.05), 160);
}

export function playErrorCue() {
  playTone(220, 300, 'sawtooth', 0.04);
}
