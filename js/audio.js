import { loadMute, writeMute } from "./save.js";

export function createAudio() {
  let ctx = null;
  let muted = loadMute();

  function context() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gainValue, delay = 0) {
    if (muted) return;
    const ac = context();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = ac.currentTime + delay;
    gain.gain.setValueAtTime(gainValue, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noise(dur, gainValue) {
    if (muted) return;
    const ac = context();
    const length = Math.floor(ac.sampleRate * dur);
    const buffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ac.createBufferSource();
    source.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const gain = ac.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);
    source.start();
  }

  return {
    muted: () => muted,
    unlock() {
      if (!muted) context();
    },
    toggle() {
      muted = !muted;
      writeMute(muted);
      return muted;
    },
    play(name, detail = 0) {
      if (muted) return;
      if (name === "tick") tone(520 + detail * 40, 0.05, "triangle", 0.04);
      else if (name === "clear") tone(360 + Math.min(detail, 8) * 28, 0.12, "triangle", 0.06);
      else if (name === "blast") {
        noise(0.18, 0.08);
        tone(140, 0.2, "sawtooth", 0.03);
      }
      else if (name === "flow") tone(520, 0.08, "sine", 0.03);
      else if (name === "shot") tone(880, 0.09, "square", 0.03);
      else if (name === "swap") tone(640, 0.08, "sine", 0.04);
      else if (name === "ui") tone(700, 0.04, "sine", 0.03);
      else if (name === "deny") tone(180, 0.08, "square", 0.03);
      else if (name === "win") {
        [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.18, "triangle", 0.05, i * 0.09));
      } else if (name === "lose") tone(110, 0.35, "sawtooth", 0.04);
    },
    playEvent(event) {
      if (!event) return;
      if (event.type === "clear") this.play("clear", event.length || 3);
      else if (event.type === "blast") this.play("blast");
      else if (event.type === "flow") this.play("flow");
      else if (event.type === "shot") this.play("shot");
      else if (event.type === "swap") this.play("swap");
      else if (event.type === "notice") this.play("swap");
      else if (event.type === "win") this.play("win");
    },
  };
}
