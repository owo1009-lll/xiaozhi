const ACx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
let _ac = null;
let _pianoBuffers = null;
let _pianoPromise = null;
let _htmlAudioUnlocked = false;

const PIANO_SAMPLES = [
  { freq: 261.625565, url: "/audio/piano-C4.mp3" },
  { freq: 523.251131, url: "/audio/piano-C5.mp3" },
];

export const NT = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const CN = ["do", "升do", "re", "升re", "mi", "fa", "升fa", "sol", "升sol", "la", "升la", "si"];
export const WK = [0, 2, 4, 5, 7, 9, 11];
export const BK = [1, 3, 6, 8, 10];

function getAC() {
  if (!_ac && ACx) _ac = new ACx();
  return _ac;
}

export async function ensureAudioReady() {
  const c = getAC();
  if (!c) return null;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {}
  }
  return c;
}

export async function unlockAudioSystem() {
  const c = await ensureAudioReady();
  if (!c) return null;
  try {
    const buffer = c.createBuffer(1, 1, c.sampleRate);
    const source = c.createBufferSource();
    const gain = c.createGain();
    gain.gain.value = 0.00001;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(c.destination);
    source.start(0);
  } catch {}
  await ensurePianoLoaded();
  if (!_htmlAudioUnlocked && typeof Audio !== "undefined") {
    try {
      const a = new Audio(PIANO_SAMPLES[0].url);
      a.preload = "auto";
      a.muted = true;
      await a.play();
      a.pause();
      a.currentTime = 0;
      _htmlAudioUnlocked = true;
    } catch {}
  }
  return c;
}

export async function ensurePianoLoaded() {
  if (_pianoBuffers) return _pianoBuffers;
  if (_pianoPromise) return _pianoPromise;
  const c = await ensureAudioReady();
  if (!c) return null;
  _pianoPromise = Promise.all(
    PIANO_SAMPLES.map(async (sample) => {
      const response = await fetch(sample.url, { cache: "force-cache" });
      const arrayBuffer = await response.arrayBuffer();
      const buffer = await c.decodeAudioData(arrayBuffer.slice(0));
      return { ...sample, buffer };
    }),
  ).then((buffers) => {
    _pianoBuffers = buffers;
    return buffers;
  }).catch(() => null);
  return _pianoPromise;
}

function playHtmlSample(freq, dur = 0.4, vol = 0.2) {
  if (typeof Audio === "undefined") return false;
  const sample = PIANO_SAMPLES.reduce((best, current) => (
    Math.abs(current.freq - freq) < Math.abs(best.freq - freq) ? current : best
  ));
  const audio = new Audio(sample.url);
  audio.preload = "auto";
  audio.volume = Math.min(1, vol * 1.8);
  audio.playbackRate = Math.min(4, Math.max(0.5, freq / sample.freq));
  try {
    audio.preservesPitch = false;
    audio.mozPreservesPitch = false;
    audio.webkitPreservesPitch = false;
  } catch {}
  audio.play().catch(() => {});
  setTimeout(() => {
    try {
      audio.pause();
      audio.src = "";
    } catch {}
  }, Math.max(500, dur * 1200));
  return true;
}

export function playTone(freq, dur = 0.4, type = "piano", vol = 0.2) {
  if (type === "piano" && playHtmlSample(freq, dur, vol)) {
    return;
  }
  const c = getAC();
  if (!c) return;
  if (c.state === "suspended") {
    c.resume().catch(() => {});
  }
  if (type === "piano") {
    if (_pianoBuffers?.length) {
      const sample = _pianoBuffers.reduce((best, current) => (
        Math.abs(current.freq - freq) < Math.abs(best.freq - freq) ? current : best
      ));
      const source = c.createBufferSource();
      const gain = c.createGain();
      source.buffer = sample.buffer;
      source.playbackRate.setValueAtTime(freq / sample.freq, c.currentTime);
      gain.gain.setValueAtTime(Math.min(1, vol * 1.8), c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + Math.max(dur, 0.35));
      source.connect(gain);
      gain.connect(c.destination);
      source.start(c.currentTime);
      source.stop(c.currentTime + Math.max(dur + 1.2, 1.5));
      return;
    }
    ensurePianoLoaded();
  }
  const now = c.currentTime;
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(vol, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.5);
  master.connect(c.destination);

  if (type === "piano") {
    const partials = [
      { ratio: 1, gain: 1.0, decay: 1.8 },
      { ratio: 2, gain: 0.45, decay: 1.3 },
      { ratio: 3, gain: 0.18, decay: 1.0 },
      { ratio: 4, gain: 0.08, decay: 0.7 },
    ];
    partials.forEach(({ ratio, gain, decay }) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = ratio === 1 ? "triangle" : "sine";
      o.frequency.setValueAtTime(freq * ratio, now);
      g.gain.setValueAtTime(vol * gain, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.12, dur * decay));
      o.connect(g);
      g.connect(master);
      o.start(now);
      o.stop(now + dur + 0.6);
    });

    const hammer = c.createBufferSource();
    const noiseBuffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.02), c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * 0.2;
    hammer.buffer = noiseBuffer;
    const hammerFilter = c.createBiquadFilter();
    const hammerGain = c.createGain();
    hammerFilter.type = "highpass";
    hammerFilter.frequency.value = 1800;
    hammerGain.gain.setValueAtTime(vol * 0.08, now);
    hammerGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    hammer.connect(hammerFilter);
    hammerFilter.connect(hammerGain);
    hammerGain.connect(master);
    hammer.start(now);
    hammer.stop(now + 0.03);
    return;
  }

  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  o.connect(g);
  g.connect(master);
  o.start(now);
  o.stop(now + dur);
}

export function nFreq(n, o) {
  return 440 * Math.pow(2, (NT.indexOf(n) - 9) / 12 + (o - 4));
}
