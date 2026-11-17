// Short mechanical-keyboard click, synthesized with Web Audio (no sound files).
(function () {
  'use strict';
  const FB = (globalThis.FastBlaze = globalThis.FastBlaze || {});
  let ctx = null;

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // gain: 0..1, when: seconds from now, pitch: ~1
  function keyClick(gain, when, pitch) {
    const ac = audio();
    if (!ac || gain <= 0) return;
    const t = ac.currentTime + (when || 0);
    pitch = pitch || 1;

    // "tick": short burst of filtered noise
    const len = Math.floor(ac.sampleRate * 0.03);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200 * pitch;
    band.Q.value = 1.2;
    const g1 = ac.createGain();
    g1.gain.setValueAtTime(gain, t);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    noise.connect(band).connect(g1).connect(ac.destination);
    noise.start(t);
    noise.stop(t + 0.05);

    // "thock": low body of the key bottoming out
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190 * pitch, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.03);
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(gain * 0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(g2).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  // volume: 0..100 (setting). 0 = silent.
  const toGain = (volume) => Math.max(0, Math.min(100, Number(volume) || 0)) / 100 * 0.6;

  FB.sound = {
    /** Snippet started: two quick key clicks. */
    trigger(volume) {
      const g = toGain(volume);
      if (!g) return;
      keyClick(g, 0, 1);
      keyClick(g * 0.8, 0.055, 1.15);
    },
    /** One automation click step: a softer single tick. */
    step(volume) {
      const g = toGain(volume) * 0.6;
      if (g) keyClick(g, 0, 1.05);
    },
  };
})();
