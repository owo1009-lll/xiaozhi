import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getPptLessonData } from "./pptLessonData";

/* Audio */
const ACx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
let _ac = null;
let _pianoBuffers = null;
let _pianoPromise = null;
let _htmlAudioUnlocked = false;
const PIANO_SAMPLES = [
  { freq: 261.625565, url: "/audio/piano-C4.mp3" },
  { freq: 523.251131, url: "/audio/piano-C5.mp3" },
];
function getAC() { if (!_ac && ACx) _ac = new ACx(); return _ac; }
async function ensureAudioReady() {
  const c = getAC();
  if (!c) return null;
  if (c.state === "suspended") {
    try { await c.resume(); } catch {}
  }
  return c;
}
async function unlockAudioSystem() {
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
async function ensurePianoLoaded() {
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
    })
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
function playTone(freq, dur = 0.4, type = "piano", vol = 0.2) {
  if (type === "piano" && playHtmlSample(freq, dur, vol)) {
    return;
  }
  const c = getAC(); if (!c) return;
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
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
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

  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  o.connect(g);
  g.connect(master);
  o.start(now);
  o.stop(now + dur);
}
const NT = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const CN = ["do","鍗嘾o","re","鍗噐e","mi","fa","鍗噁a","sol","鍗噑ol","la","鍗噇a","si"];
const WK = [0,2,4,5,7,9,11];
const BK = [1,3,6,8,10];
function nFreq(n, o) { return 440 * Math.pow(2, (NT.indexOf(n) - 9) / 12 + (o - 4)); }

/* Data */
const INTERVALS = [
  { n: "\u5c0f\u4e8c\u5ea6", s: 1 }, { n: "\u5927\u4e8c\u5ea6", s: 2 }, { n: "\u5c0f\u4e09\u5ea6", s: 3 }, { n: "\u5927\u4e09\u5ea6", s: 4 },
  { n: "\u7eaf\u56db\u5ea6", s: 5 }, { n: "\u4e09\u5168\u97f3", s: 6 }, { n: "\u7eaf\u4e94\u5ea6", s: 7 }, { n: "\u5c0f\u516d\u5ea6", s: 8 },
  { n: "\u5927\u516d\u5ea6", s: 9 }, { n: "\u5c0f\u4e03\u5ea6", s: 10 }, { n: "\u5927\u4e03\u5ea6", s: 11 }, { n: "\u7eaf\u516b\u5ea6", s: 12 },
];
const CHORDS = [
  { n: "\u5927\u4e09\u548c\u5f26", iv: [0,4,7] }, { n: "\u5c0f\u4e09\u548c\u5f26", iv: [0,3,7] }, { n: "\u51cf\u4e09\u548c\u5f26", iv: [0,3,6] },
  { n: "\u589e\u4e09\u548c\u5f26", iv: [0,4,8] }, { n: "\u5c5e\u4e03\u548c\u5f26", iv: [0,4,7,10] }, { n: "\u5c0f\u4e03\u548c\u5f26", iv: [0,3,7,10] },
];
const TERMS = [
  { t: "Adagio", c: "\u67d4\u677f", m: "\u7f13\u6162\u5730\uff08\u7ea6 66-76 BPM\uff09" },
  { t: "Allegro", c: "\u5feb\u677f", m: "\u5feb\u901f\u6d3b\u6cfc\u5730\uff08\u7ea6 120-156 BPM\uff09" },
  { t: "Forte (f)", c: "\u5f3a", m: "\u5927\u58f0\u6f14\u594f" },
  { t: "Piano (p)", c: "\u5f31", m: "\u8f7b\u67d4\u6f14\u594f" },
  { t: "Crescendo", c: "\u6e10\u5f3a", m: "\u9010\u6e10\u589e\u5927\u97f3\u91cf" },
  { t: "Legato", c: "\u8fde\u594f", m: "\u97f3\u7b26\u4e4b\u95f4\u5e73\u6ed1\u8fde\u63a5" },
  { t: "Staccato", c: "\u65ad\u594f", m: "\u97f3\u7b26\u77ed\u4fc3\u5206\u5f00" },
  { t: "D.C.", c: "\u4ece\u5934\u53cd\u590d", m: "Da Capo\uff0c\u4ece\u4e50\u66f2\u5f00\u5934\u91cd\u65b0\u6f14\u594f" },
  { t: "Coda", c: "\u5c3e\u58f0", m: "\u8df3\u81f3\u7ed3\u5c3e\u6bb5\u843d" },
  { t: "Ritardando", c: "\u6e10\u6162", m: "\u9010\u6e10\u653e\u6162\u901f\u5ea6" },
];
const RHYTHMS = [
  { n: "\u56db\u5206\u97f3\u7b26", p: [1,0,1,0,1,0,1,0] },
  { n: "\u516b\u5206\u97f3\u7b26", p: [1,1,1,1,1,1,1,1] },
  { n: "\u9644\u70b9\u56db\u5206", p: [1,0,0,1,0,0,1,0] },
  { n: "\u5207\u5206\u8282\u594f", p: [1,0,1,1,0,1,1,0] },
  { n: "\u7efc\u5408\u8282\u594f", p: [1,1,0,1,0,1,1,0] },
];
function getStudentProfile() {
  if (typeof window === "undefined") {
    return { studentId: "student-local", studentLabel: "鏈湴瀛︾敓" };
  }
  const storageKey = "music-theory-student-profile";
  const cached = window.localStorage.getItem(storageKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {}
  }
  const profile = {
    studentId: `student-${Math.random().toString(36).slice(2, 10)}`,
    studentLabel: `瀛︾敓 ${new Date().toLocaleDateString("zh-CN").replace(/\//g, "")}`,
  };
  window.localStorage.setItem(storageKey, JSON.stringify(profile));
  return profile;
}

async function reportStudentAnalytics(payload) {
  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...getStudentProfile(), ...payload }),
    });
  } catch {}
}

const HOMEWORK_METER_MAP = {
  L4: "4/4",
  L9: "2/4",
  L10: "4/4",
  L11: "4/4",
  L12: "4/4",
};

const RHYTHM_SYMBOLS = [
  { id: "whole", label: "\\u5168\\u97f3\\u7b26", duration: 4, kind: "note" },
  { id: "half", label: "\\u4e8c\\u5206\\u97f3\\u7b26", duration: 2, kind: "note" },
  { id: "quarter", label: "\\u56db\\u5206\\u97f3\\u7b26", duration: 1, kind: "note" },
  { id: "eighth", label: "\\u516b\\u5206\\u97f3\\u7b26", duration: 0.5, kind: "note" },
  { id: "sixteenth", label: "\\u5341\\u516d\\u5206\\u97f3\\u7b26", duration: 0.25, kind: "note" },
  { id: "dotted-half", label: "\\u9644\\u70b9\\u4e8c\\u5206", duration: 3, kind: "note" },
  { id: "dotted-quarter", label: "\\u9644\\u70b9\\u56db\\u5206", duration: 1.5, kind: "note" },
  { id: "dotted-eighth", label: "\\u9644\\u70b9\\u516b\\u5206", duration: 0.75, kind: "note" },
  { id: "whole-rest", label: "\\u5168\\u4f11\\u6b62\\u7b26", duration: 4, kind: "rest" },
  { id: "half-rest", label: "\\u4e8c\\u5206\\u4f11\\u6b62", duration: 2, kind: "rest" },
  { id: "quarter-rest", label: "\\u56db\\u5206\\u4f11\\u6b62", duration: 1, kind: "rest" },
  { id: "eighth-rest", label: "\\u516b\\u5206\\u4f11\\u6b62", duration: 0.5, kind: "rest" },
  { id: "sixteenth-rest", label: "\\u5341\\u516d\\u5206\\u4f11\\u6b62", duration: 0.25, kind: "rest" },
  { id: "tie", label: "\\u8fde\\u97f3", duration: 0, kind: "tie" },
];

const HOMEWORK_REQUIREMENTS = {};

const LESSON_HOMEWORK_MATRIX = {
  L1: { channels: ["text", "image", "piano"], requiredAnyOf: ["text", "image", "piano"], helper: "\u672c\u8bfe\u4ee5\u97f3\u9ad8\u3001\u9891\u7387\u548c\u952e\u4f4d\u5b9a\u4f4d\u4e3a\u4e3b\u3002", evaluationType: "pitch", extraDimensions: ["\u952e\u4f4d\u5b9a\u4f4d", "\u97f3\u9ad8\u5224\u65ad"] },
  L2: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "\u672c\u8bfe\u4ee5\u7406\u8bba\u5206\u6790\u4e0e\u6bd4\u8f83\u8bf4\u660e\u4e3a\u4e3b\u3002", evaluationType: "theory", extraDimensions: ["\u6982\u5ff5\u7406\u89e3", "\u5206\u6790\u6df1\u5ea6"] },
  L3: { channels: ["text", "image", "staff"], requiredAnyOf: ["image", "staff"], helper: "\u672c\u8bfe\u91cd\u70b9\u662f\u8c31\u53f7\u4e0e\u4e94\u7ebf\u8c31\u8bfb\u5199\u3002", evaluationType: "staff", extraDimensions: ["\u8c31\u53f7\u8bc6\u522b", "\u97f3\u4f4d\u51c6\u786e", "\u8bb0\u8c31\u89c4\u8303"] },
  L4: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "\u672c\u8bfe\u4ee5\u97f3\u7b26\u3001\u4f11\u6b62\u7b26\u4e0e\u9644\u70b9\u8f93\u5165\u4e3a\u4e3b\u3002", evaluationType: "rhythm", extraDimensions: ["\u62cd\u53f7\u7406\u89e3", "\u65f6\u503c\u5b8c\u6574", "\u8282\u594f\u4e66\u5199"] },
  L5: { channels: ["text", "image", "staff"], requiredAnyOf: ["text", "image", "staff"], helper: "\u672c\u8bfe\u88c5\u9970\u97f3\u4f5c\u4e1a\u9700\u7ed3\u5408\u8c31\u4f8b\u4e0e\u6587\u5b57\u8bf4\u660e\u3002", evaluationType: "staff", extraDimensions: ["\u88c5\u9970\u97f3\u8bc6\u522b", "\u8bb0\u8c31\u89c4\u8303", "\u8c31\u9762\u8868\u8fbe"] },
  L6: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "\u672c\u8bfe\u4ee5\u672f\u8bed\u7406\u89e3\u548c\u4e50\u8c31\u5206\u6790\u4e3a\u4e3b\u3002", evaluationType: "theory", extraDimensions: ["\u672f\u8bed\u4f7f\u7528", "\u5206\u6790\u6df1\u5ea6"] },
  L7: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "\u672c\u8bfe\u4ee5\u53cd\u590d\u4e0e\u7565\u5199\u8bb0\u53f7\u7684\u7ed3\u6784\u7406\u89e3\u4e3a\u4e3b\u3002", evaluationType: "theory", extraDimensions: ["\u7ed3\u6784\u7406\u89e3", "\u8def\u7ebf\u5224\u65ad"] },
  L8: { channels: ["text", "image", "voice"], requiredAnyOf: ["text", "image", "voice"], helper: "\u672c\u8bfe\u652f\u6301\u672f\u8bed\u53e3\u8ff0\u4e0e\u6587\u5b57\u6574\u7406\u3002", evaluationType: "theory", extraDimensions: ["\u672f\u8bed\u4f7f\u7528", "\u8868\u8fbe\u6e05\u6670\u5ea6"] },
  L9: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "\u672c\u8bfe\u91cd\u70b9\u662f\u62cd\u53f7\u4e0b\u7684\u8282\u594f\u8bbe\u8ba1\u3002", evaluationType: "rhythm", extraDimensions: ["\u62cd\u53f7\u7406\u89e3", "\u65f6\u503c\u5b8c\u6574", "\u91cd\u97f3\u89c4\u5f8b"] },
  L10: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "\u672c\u8bfe\u91cd\u70b9\u662f\u97f3\u503c\u7ec4\u5408\u4e0e\u8fde\u97f3\u5199\u6cd5\u3002", evaluationType: "rhythm", extraDimensions: ["\u7ec4\u5408\u89c4\u8303", "\u8fde\u97f3\u4f7f\u7528", "\u8282\u594f\u4e66\u5199"] },
  L11: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "\u672c\u8bfe\u91cd\u70b9\u662f\u5207\u5206\u8282\u594f\u4e0e\u91cd\u97f3\u8fc1\u79fb\u3002", evaluationType: "rhythm", extraDimensions: ["\u91cd\u97f3\u8fc1\u79fb", "\u5207\u5206\u5199\u6cd5", "\u8282\u594f\u4e66\u5199"] },
  L12: { channels: ["text", "image", "rhythm", "staff", "piano"], requiredAnyOf: ["text", "image", "rhythm", "staff", "piano"], helper: "\u672c\u8bfe\u4e3a\u7efc\u5408\u590d\u4e60\uff0c\u53ef\u7ec4\u5408\u63d0\u4ea4\u591a\u79cd\u4f5c\u4e1a\u5f62\u5f0f\u3002", evaluationType: "mixed", extraDimensions: ["\u7efc\u5408\u5e94\u7528", "\u77e5\u8bc6\u8fc1\u79fb", "\u95ee\u9898\u8bca\u65ad"] },
};

const HOMEWORK_CHANNEL_LABELS = {
  text: "\u6587\u5b57\u8bf4\u660e",
  image: "\u62cd\u7167\u4e0a\u4f20",
  rhythm: "\u8282\u594f\u7f16\u8f91",
  staff: "\u4e94\u7ebf\u8c31\u4fee\u6b63",
  piano: "\u94a2\u7434\u8f93\u5165",
  voice: "\u8bed\u97f3\u8f93\u5165",
};

const BASE_EVALUATION_DIMENSIONS = ["\u5b8c\u6210\u5ea6", "\u51c6\u786e\u6027", "\u89c4\u8303\u6027", "\u8868\u8fbe\u6e05\u6670\u5ea6", "\u63d0\u4ea4\u8d28\u91cf"];

const STAFF_ROWS = [
  { row: 0, label: "G5" }, { row: 1, label: "F5" }, { row: 2, label: "E5" }, { row: 3, label: "D5" },
  { row: 4, label: "C5" }, { row: 5, label: "B4" }, { row: 6, label: "A4" }, { row: 7, label: "G4" },
  { row: 8, label: "F4" }, { row: 9, label: "E4" }, { row: 10, label: "D4" }, { row: 11, label: "C4" },
  { row: 12, label: "B3" },
];

function createDefaultRhythmSubmission(lessonId) {
  return {
    meter: HOMEWORK_METER_MAP[lessonId] || "4/4",
    measures: [[], []],
    activeMeasure: 0,
  };
}

function createDefaultStaffSubmission() {
  return {
    clef: "treble",
    activeSlot: 0,
    accidental: "natural",
    noteValue: "quarter",
    dotted: false,
    notes: [],
  };
}

function createDefaultPianoSubmission() {
  return {
    octave: 4,
    notes: [],
  };
}

function getMeterBeats(meter) {
  const [top, bottom] = String(meter || "4/4").split("/");
  const numerator = Number(top || 4);
  const denominator = Number(bottom || 4);
  if (!numerator || !denominator) return 4;
  return numerator * (4 / denominator);
}

function calculateMeasureDuration(measure = []) {
  return measure.reduce((sum, item) => sum + Number(item?.duration || 0), 0);
}

function getHomeworkRequirement(lessonId, lessonTitle) {
  return LESSON_HOMEWORK_MATRIX[lessonId] || {
    channels: ["text", "image"],
    requiredAnyOf: ["text", "image"],
    evaluationType: "theory",
    extraDimensions: ["\u6982\u5ff5\u7406\u89e3", "\u5206\u6790\u6df1\u5ea6"],
    helper: `${lessonTitle} \u5efa\u8bae\u63d0\u4ea4\u6587\u5b57\u8bf4\u660e\u6216\u62cd\u7167\u4f5c\u4e1a\u3002`,
  };
}

function getEvaluationDimensions(requirement) {
  return [...BASE_EVALUATION_DIMENSIONS, ...(requirement?.extraDimensions || [])];
}

function summarizePianoSubmission(pianoSubmission) {
  if (!pianoSubmission?.notes?.length) return "\u672a\u5f55\u5165\u94a2\u7434\u97f3\u9ad8\u3002";
  return pianoSubmission.notes.map((item) => `${item.note}${item.octave}`).join(" - ");
}

function getRhythmValidation(rhythmSubmission) {
  if (!rhythmSubmission?.measures) {
    return { complete: false, issues: [] };
  }
  const targetBeats = getMeterBeats(rhythmSubmission.meter);
  const issues = [];
  rhythmSubmission.measures.forEach((measure = [], index) => {
    const beats = calculateMeasureDuration(measure);
    if (!measure.length) {
      issues.push(`第 ${index + 1} 小节尚未填写。`);
      return;
    }
    if (beats < targetBeats) issues.push(`第 ${index + 1} 小节拍数不足。`);
    if (beats > targetBeats) issues.push(`第 ${index + 1} 小节超出拍号要求。`);
    const lastItem = measure[measure.length - 1];
    if (lastItem?.tieToNext && index === rhythmSubmission.measures.length - 1) {
      issues.push(`第 ${index + 1} 小节最后一个音带有连音，但后面没有对应音符。`);
    }
  });
  return { complete: issues.length === 0, issues };
}

function summarizeRhythmSubmissionLegacy(rhythmSubmission) {
  if (!rhythmSubmission?.measures) return "未填写节奏。";
  return rhythmSubmission.measures
    .map((measure, index) => `第${index + 1}小节：${(measure || []).map((item) => item.label).join(" / ") || "空"}`)
    .join("；");
}

function summarizeStaffSubmissionLegacy(staffSubmission) {
  if (!staffSubmission?.notes?.length) return "未填写五线谱。";
  return staffSubmission.notes
    .sort((a, b) => a.slot - b.slot)
    .map((note) => `位置${note.slot + 1}:${note.pitch}${note.accidental === "sharp" ? "#" : note.accidental === "flat" ? "b" : ""}`)
    .join("；");
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function summarizeRhythmSubmission(rhythmSubmission) {
  if (!rhythmSubmission?.measures) return "未填写节奏。";
  return rhythmSubmission.measures
    .map((measure, index) => `第${index + 1}小节：${(measure || []).map((item) => `${item.label}${item.tieToNext ? "~" : ""}`).join(" / ") || "空"}`)
    .join("；");
}

function summarizeStaffSubmission(staffSubmission) {
  if (!staffSubmission?.notes?.length) return "未填写五线谱。";
  return staffSubmission.notes
    .sort((a, b) => a.slot - b.slot)
    .map((note) => `位置${note.slot + 1}:${note.pitch}${note.accidental === "sharp" ? "#" : note.accidental === "flat" ? "b" : ""}${note.noteValue ? `(${note.noteValue})` : ""}${note.tieToNext ? "~" : ""}`)
    .join("；");
}

function formatStructuredEvaluation(evaluation) {
  if (!evaluation) return "";
  const strengths = (evaluation.strengths || []).join("；");
  const issues = (evaluation.issues || []).join("；");
  const suggestions = (evaluation.suggestions || []).join("；");
  return [
    `完成度评价：${evaluation.overallComment || "已完成作业提交。"}`,
    `错误说明：${issues || "暂无明显错误。"}`,
    `修改建议：${suggestions || "请继续保持。"}${strengths ? `\n优势：${strengths}` : ""}`,
  ].join("\n");
}

const LESSON_CONTENT = {};
const LESSON_LEARNING_SECTIONS = {};
const LESSON_QUIZ_BANK = {
  L1: { prompt: "A4 的标准频率是多少？", options: ["220Hz", "440Hz", "523Hz"], answer: "440Hz", explanation: "A4=440Hz 是标准音高。" },
  L2: { prompt: "十二平均律中相邻半音的频率比约是多少？", options: ["1.5", "1.25", "1.0595"], answer: "1.0595", explanation: "十二平均律将八度平均分成 12 份。" },
  L3: { prompt: "高音谱号的中心定位在线谱哪一线？", options: ["第二线", "第三线", "第四线"], answer: "第二线", explanation: "高音谱号将第二线定义为 G。" },
  L4: { prompt: "四分音符通常等于几拍？", options: ["0.5 拍", "1 拍", "2 拍"], answer: "1 拍", explanation: "四分音符常作为一拍的基本单位。" },
  L5: { prompt: "颤音通常表现为什么？", options: ["相邻音快速交替", "持续延长同一音", "强拍重音"], answer: "相邻音快速交替", explanation: "颤音的核心特征是主音与邻音快速交替。" },
  L6: { prompt: "Allegro 通常表示什么速度？", options: ["慢板", "中板", "快板"], answer: "快板", explanation: "Allegro 是常见的快板速度术语。" },
  L7: { prompt: "D.C. 在乐谱中表示什么？", options: ["从头反复", "结束", "跳到尾声"], answer: "从头反复", explanation: "D.C. 即 Da Capo。" },
  L8: { prompt: "Dolce 更接近哪种表情？", options: ["甜美柔和", "强烈激昂", "庄严缓慢"], answer: "甜美柔和", explanation: "Dolce 表示甜美、柔和。" },
  L9: { prompt: "3/4 拍每小节通常有几拍？", options: ["2 拍", "3 拍", "4 拍"], answer: "3 拍", explanation: "3/4 拍表示每小节三拍。" },
  L10: { prompt: "附点会让原音符时值增加多少？", options: ["增加一半", "增加一倍", "减少一半"], answer: "增加一半", explanation: "附点增加原时值的一半。" },
  L11: { prompt: "切分音最核心的听觉效果是什么？", options: ["重音迁移", "速度变慢", "音高升高"], answer: "重音迁移", explanation: "切分音打破原有强弱关系。" },
  L12: { prompt: "综合复习最重要的目标是什么？", options: ["只背术语", "整合知识并应用", "只做听辨"], answer: "整合知识并应用", explanation: "综合复习重在整合与迁移。" },
};

const LESSON_PRACTICE_EXTRA = {
  L1: { prompt: "音量变化最直接对应什么？", options: ["频率", "振幅", "谱号"], answer: "振幅", explanation: "音量通常由振幅决定。" },
  L2: { prompt: "泛音列中第二泛音最接近什么关系？", options: ["八度", "三度", "半音"], answer: "八度", explanation: "第二泛音与基音最接近八度关系。" },
  L3: { prompt: "低音谱号主要定位哪个音？", options: ["F", "C", "G"], answer: "F", explanation: "低音谱号两点包围 F 所在线。" },
  L4: { prompt: "附点四分音符等于多少拍？", options: ["1 拍", "1.5 拍", "2 拍"], answer: "1.5 拍", explanation: "附点四分音符等于 1.5 拍。" },
  L5: { prompt: "哪种装饰音最接近主音与邻音往复？", options: ["波音", "颤音", "倚音"], answer: "颤音", explanation: "颤音是主音与邻音快速交替。" },
  L6: { prompt: "mf 常表示什么力度层级？", options: ["很弱", "中强", "极强"], answer: "中强", explanation: "mf 即 mezzo forte。" },
  L7: { prompt: "Fine 常表示什么？", options: ["从头开始", "结束处", "跳到尾声"], answer: "结束处", explanation: "Fine 表示乐句或乐曲结束。" },
  L8: { prompt: "术语学习最稳的方法是什么？", options: ["一次死记", "分类复现", "只看中文"], answer: "分类复现", explanation: "术语记忆依赖分类和复现。" },
  L9: { prompt: "4/4 拍第一拍通常是什么属性？", options: ["弱拍", "次强拍", "强拍"], answer: "强拍", explanation: "4/4 的第一拍通常是强拍。" },
  L10: { prompt: "连音线连接同音高音符时作用是什么？", options: ["改变音高", "时值相加", "改成休止"], answer: "时值相加", explanation: "连音线会把时值相加。" },
  L11: { prompt: "切分最明显的感受是什么？", options: ["拍感平均", "重音迁移", "音高更高"], answer: "重音迁移", explanation: "切分音最核心的是重音迁移。" },
  L12: { prompt: "综合复习最有效的复盘方式是什么？", options: ["只做会的题", "按错误类型复盘", "跳过基础"], answer: "按错误类型复盘", explanation: "按错误类型复盘更容易找到薄弱项。" },
};

function createLessonPracticePool(lessonId, lessonTitle) {
  const primary = LESSON_QUIZ_BANK[lessonId];
  const extra = LESSON_PRACTICE_EXTRA[lessonId];
  const focus = HOMEWORK_FOCUS[lessonId] || lessonTitle;
  const pool = [primary, extra].filter(Boolean);
  if (!pool.length) {
    pool.push({
      prompt: `${lessonTitle} 的核心知识点是什么？`,
      options: [focus, "节拍器", "随机作答"],
      answer: focus,
      explanation: "本题用于回顾当前课时的核心重点。",
    });
  }
  return pool;
}

const HOMEWORK_FOCUS = {
  L1: "音的四种属性与音级关系",
  L2: "律制、泛音与等音概念",
  L3: "谱号与五线谱读写",
  L4: "音符、休止符与附点",
  L5: "装饰音辨认与应用",
  L6: "力度、速度与表情术语",
  L7: "反复与缩写记号",
  L8: "音乐术语记忆与分类",
  L9: "节拍、拍号与强弱规律",
  L10: "音值组合与连音写法",
  L11: "切分音与重音迁移",
  L12: "综合应用与复习提升",
};

function getIntervalInfo(a, b) {
  if (a == null || b == null) return null;
  const raw = Math.abs(a - b) % 12;
  const diff = raw > 6 ? 12 - raw : raw;
  if (diff === 1) return { label: "半音", color: "#1f2937", detail: "这两个音之间是相邻半音关系。" };
  if (diff === 2) return { label: "全音", color: "#111111", detail: "这两个音之间是标准全音关系。" };
  return { label: "其他", color: "#6b7280", detail: "这两个音之间不是全音或半音。", isError: true };
}

function LessonLearningWorkspaceLegacy() {
  return null;
}

function LessonLearningWorkspace({ lesson, section, showTabs = true }) {
  const pptLessonData = getPptLessonData(lesson.id);
  const homeworkFileInputRef = useRef(null);
  const homeworkCameraInputRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [activeSection, setActiveSection] = useState("content");
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [lastInterval, setLastInterval] = useState(null);
  const [practiceRound, setPracticeRound] = useState(0);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceAnswers, setPracticeAnswers] = useState([]);
  const [practiceResult, setPracticeResult] = useState(null);
  const [homeworkRemaining, setHomeworkRemaining] = useState(30 * 60);
  const [homeworkRunning, setHomeworkRunning] = useState(false);
  const [homeworkDraft, setHomeworkDraft] = useState("");
  const [homeworkImages, setHomeworkImages] = useState([]);
  const [homeworkRhythm, setHomeworkRhythm] = useState(() => createDefaultRhythmSubmission(lesson.id));
  const [homeworkStaff, setHomeworkStaff] = useState(() => createDefaultStaffSubmission());
  const [homeworkPiano, setHomeworkPiano] = useState(() => createDefaultPianoSubmission());
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [audioSubmission, setAudioSubmission] = useState(null);
  const [audioTranscribing, setAudioTranscribing] = useState(false);
  const [homeworkSubmitted, setHomeworkSubmitted] = useState(false);
  const [homeworkFeedback, setHomeworkFeedback] = useState("");
  const [homeworkEvaluation, setHomeworkEvaluation] = useState(null);
  const [homeworkReviewing, setHomeworkReviewing] = useState(false);
  const [showHomeworkDialog, setShowHomeworkDialog] = useState(false);
  const [stats, setStats] = useState(() => ({
    startedAt: Date.now(),
    interactions: 0,
    errors: 0,
    errorTypes: {},
    lastExplanation: "\u5148\u70b9\u51fb\u94a2\u7434\u952e\uff0c\u7cfb\u7edf\u4f1a\u6839\u636e\u4e24\u4e2a\u97f3\u7684\u8ddd\u79bb\u7ed9\u51fa\u97f3\u7a0b\u5ea6\u6570\u89e3\u91ca\u3002",
  }));

  const practicePool = createLessonPracticePool(lesson.id, lesson.t);
  const practiceQuestions = Array.from({ length: 20 }, (_, idx) => practicePool[(practiceRound * 20 + idx) % practicePool.length]);
  const currentPractice = practiceQuestions[practiceIndex];
  const correctCount = practiceAnswers.filter((item) => item.correct).length;
  const lessonSections = LESSON_LEARNING_SECTIONS[lesson.id] || [];
  const lessonContentItems = (pptLessonData?.knowledgePoints || []).map((item) => ({ h: item.title, b: item.detail })).filter((item) => item.h || item.b).length ? (pptLessonData?.knowledgePoints || []).map((item) => ({ h: item.title, b: item.detail })) : (LESSON_CONTENT[lesson.id] || []);
  const lessonHomework = homeworkRequirement.helper;
  const homeworkRequirement = getHomeworkRequirement(lesson.id, lesson.t);
  const studyMinutes = Math.max(1, Math.ceil((Date.now() - stats.startedAt) / 60000));
  const evaluationDimensions = getEvaluationDimensions(homeworkRequirement);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(Recognition));
  }, []);

  const recordError = useCallback((type, explanation) => {
    setStats((prev) => ({
      ...prev,
      errors: prev.errors + 1,
      errorTypes: { ...prev.errorTypes, [type]: (prev.errorTypes[type] || 0) + 1 },
      lastExplanation: explanation,
    }));
  }, []);

  const handleKeyPress = useCallback(async (idx) => {
    await unlockAudioSystem();
    playTone(nFreq(NT[idx], 4), 0.45, "piano", 0.26);
    setActiveNote(idx);
    setTimeout(() => setActiveNote(null), 180);
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1 }));

    setSelectedNotes((prev) => {
      const next = [...prev.slice(-1), idx];
      if (next.length === 2) {
        const interval = getIntervalInfoV2(next[0], next[1]);
        setLastInterval(interval);
        setStats((prevStats) => ({ ...prevStats, lastExplanation: interval.detail }));
        if (interval.semitones > 7) {
          recordError("键盘音程判断", "当前音程跨度较大，建议先从二度、三度这类基础音程开始练习。");
        }
      }
      return next;
    });
  }, [recordError]);

  const answerPractice = useCallback((option) => {
    if (!currentPractice || practiceAnswers[practiceIndex]) return;
    const ok = option === currentPractice.answer;
    const nextAnswers = [...practiceAnswers];
    nextAnswers[practiceIndex] = {
      selected: option,
      correct: ok,
      answer: currentPractice.answer,
      explanation: currentPractice.explanation,
    };
    setPracticeAnswers(nextAnswers);
    setPracticeResult({
      ok,
      message: ok ? "回答正确。" : `回答不正确，正确答案是 ${currentPractice.answer}。`,
      explanation: currentPractice.explanation,
    });
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1, lastExplanation: currentPractice.explanation }));
    if (!ok) recordError("课堂练习题", currentPractice.explanation);
  }, [currentPractice, practiceAnswers, practiceIndex, recordError]);

  const nextPracticeQuestion = useCallback(() => {
    setPracticeResult(null);
    setPracticeIndex((prev) => Math.min(prev + 1, practiceQuestions.length - 1));
  }, [practiceQuestions.length]);

  const restartPractice = useCallback(() => {
    setPracticeRound((prev) => prev + 1);
    setPracticeIndex(0);
    setPracticeAnswers([]);
    setPracticeResult(null);
  }, []);

  const handleHomeworkAddFiles = useCallback(async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 4);
    if (!files.length) return;
    const prepared = await Promise.all(files.map(async (file) => ({
      name: file.name,
      dataUrl: await fileToDataUrl(file),
    })));
    setHomeworkImages((prev) => [...prev, ...prepared].slice(0, 4));
    event.target.value = "";
  }, []);

  const removeHomeworkImage = useCallback((index) => {
    setHomeworkImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const playRhythmMeasure = useCallback(async (measure) => {
    if (!Array.isArray(measure) || !measure.length) return;
    await unlockAudioSystem();
    let offset = 0;
    measure.forEach((item) => {
      if (item.kind === "note") {
        window.setTimeout(() => {
          playTone(392, 0.4, "piano", Math.max(0.12, Math.min(0.35, item.duration * 0.18)));
        }, offset);
      }
      offset += Math.max(180, item.duration * 380) + (item.tieToNext ? 120 : 0);
    });
  }, []);

  const hasRhythmContent = homeworkRhythm.measures.some((measure) => measure.length > 0);
  const hasStaffContent = homeworkStaff.notes.length > 0;
  const hasPianoContent = homeworkPiano.notes.length > 0;
  const hasVoiceContent = Boolean(voiceTranscript.trim() || audioSubmission?.name);
  const rhythmValidation = getRhythmValidation(homeworkRhythm);
  const rhythmMeasuresComplete = rhythmValidation.complete;
  const homeworkSubmissionState = {
    text: Boolean(homeworkDraft.trim()),
    image: homeworkImages.length > 0,
    rhythm: hasRhythmContent,
    staff: hasStaffContent,
    piano: hasPianoContent,
    voice: hasVoiceContent,
  };
  const submissionTypes = [
    homeworkDraft.trim() ? "鏂囧瓧璇存槑" : null,
    homeworkImages.length ? "鎷嶇収涓婁紶" : null,
    hasRhythmContent ? "鑺傚缂栬緫" : null,
    hasStaffContent ? "五线谱修正" : null,
  ].filter(Boolean);
  submissionTypes.splice(
    0,
    submissionTypes.length,
    ...(homeworkSubmissionState.text ? [HOMEWORK_CHANNEL_LABELS.text] : []),
    ...(homeworkSubmissionState.image ? [HOMEWORK_CHANNEL_LABELS.image] : []),
    ...(homeworkSubmissionState.rhythm ? [HOMEWORK_CHANNEL_LABELS.rhythm] : []),
    ...(homeworkSubmissionState.staff ? [HOMEWORK_CHANNEL_LABELS.staff] : []),
    ...(homeworkSubmissionState.piano ? [HOMEWORK_CHANNEL_LABELS.piano] : []),
    ...(homeworkSubmissionState.voice ? [HOMEWORK_CHANNEL_LABELS.voice] : []),
  );
  const homeworkHasContent = submissionTypes.length > 0;
  const requiredSubmissionLabels = homeworkRequirement.requiredAnyOf.map((item) => HOMEWORK_CHANNEL_LABELS[item] || item).join(" / ");

  const homeworkItems = [
    `复习主题：围绕“${HOMEWORK_FOCUS[lesson.id] || lesson.t}”整理一页知识提纲。`,
    `练习要求：完成 1 轮课堂错题回顾，重点检查 ${Object.keys(stats.errorTypes)[0] || "音程判断与概念理解"}。`,
    `学习追踪：本次学习约 ${studyMinutes} 分钟，共记录 ${stats.interactions} 次交互，请写下今天最容易出错的 1 个知识点。`,
  ];

  const getKeyCenterX = useCallback((noteIndex) => {
    if (BK.includes(noteIndex)) {
      const wPos = WK.filter((w) => w < noteIndex).length;
      return wPos * 36;
    }
    const whiteIndex = WK.indexOf(noteIndex);
    return whiteIndex * 36 + 17;
  }, []);

  const relationPoints = selectedNotes.length === 2
    ? selectedNotes.map((note) => ({ note, x: getKeyCenterX(note), y: BK.includes(note) ? 40 : 76 }))
    : [];

  const sectionButtonStyle = (id) => ({
    padding: "9px 14px",
    borderRadius: 12,
    border: "1px solid rgba(17,17,17,0.12)",
    background: activeSection === id ? "#111111" : "#ffffff",
    color: activeSection === id ? "#ffffff" : "#111111",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  });

  useEffect(() => {
    if (section && section !== activeSection) {
      setActiveSection(section);
    }
  }, [section, activeSection]);

  useEffect(() => {
    setHomeworkImages([]);
    setHomeworkRhythm(createDefaultRhythmSubmission(lesson.id));
    setHomeworkStaff(createDefaultStaffSubmission());
    setHomeworkPiano(createDefaultPianoSubmission());
    setHomeworkDraft("");
    setVoiceTranscript("");
    setVoiceError("");
    setAudioSubmission(null);
    setHomeworkSubmitted(false);
    setHomeworkFeedback("");
    setHomeworkEvaluation(null);
    setHomeworkReviewing(false);
    setShowHomeworkDialog(false);
    setHomeworkRemaining(30 * 60);
    setHomeworkRunning(false);
  }, [lesson.id]);

  useEffect(() => {
    if (activeSection === "homework" && !homeworkSubmitted && homeworkRemaining > 0) {
      setHomeworkRunning(true);
    }
  }, [activeSection, homeworkSubmitted, homeworkRemaining]);

  useEffect(() => {
    if (!homeworkRunning || homeworkRemaining <= 0) return undefined;
    const timer = window.setInterval(() => {
      setHomeworkRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [homeworkRunning, homeworkRemaining]);

  const formattedHomeworkTime = `${String(Math.floor(homeworkRemaining / 60)).padStart(2, "0")}:${String(homeworkRemaining % 60).padStart(2, "0")}`;

  const openHomeworkSubmit = useCallback(() => {
    if (!homeworkDraft.trim()) {
      setHomeworkFeedback("请先在本页完成作业内容，再提交。");
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkDraft]);

  const confirmHomeworkSubmit = useCallback(() => {
    const feedback = homeworkDraft.length > 80
      ? "已提交。内容较完整，建议下一步重点检查术语准确性以及示例是否对应本课核心概念。"
      : "已提交。当前答案偏简略，建议补充术语解释、例子或节奏/音程分析。";
    setHomeworkSubmitted(true);
    setHomeworkRunning(false);
    setHomeworkFeedback(feedback);
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1 }));
    setShowHomeworkDialog(false);
  }, [homeworkDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      reportStudentAnalytics({
        lessonId: lesson.id,
        lessonTitle: lesson.t,
        source: "learning-workspace",
        section: activeSection,
        studyMinutes,
        interactions: stats.interactions,
        errors: stats.errors,
        errorTypes: stats.errorTypes,
        homeworkRemaining,
        homeworkSubmitted,
        homeworkLength: homeworkDraft.length,
        homeworkText: homeworkDraft,
        homeworkImages,
        homeworkImageCount: homeworkImages.length,
        homeworkRhythmData: homeworkRhythm,
        homeworkStaffData: homeworkStaff,
        homeworkPianoData: homeworkPiano,
        homeworkVoiceTranscript: voiceTranscript,
        homeworkAudioMeta: audioSubmission ? { name: audioSubmission.name, mimeType: audioSubmission.mimeType, size: audioSubmission.size, duration: audioSubmission.duration } : null,
        evaluationScores: homeworkEvaluation?.scores || null,
        evaluationTags: homeworkEvaluation?.tags || [],
        evaluationComment: homeworkEvaluation?.overallComment || "",
        submissionTypes,
        lastExplanation: stats.lastExplanation,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [lesson.id, lesson.t, activeSection, studyMinutes, stats, homeworkRemaining, homeworkSubmitted, homeworkDraft.length, homeworkImages, homeworkRhythm, homeworkStaff, homeworkPiano, voiceTranscript, audioSubmission, homeworkEvaluation, submissionTypes]);

  const openMixedHomeworkSubmit = useCallback(() => {
    if (!homeworkHasContent) {
      setHomeworkFeedback("请先补充文字、图片、节奏型、五线谱或钢琴输入中的任一项，再提交作业。");
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkHasContent]);

  const confirmMixedHomeworkSubmit = useCallback(async () => {
    setHomeworkReviewing(true);
    try {
      const response = await fetch("/api/homework-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          lessonTitle: lesson.t,
          homeworkPrompt: lessonHomework,
          text: homeworkDraft,
          images: homeworkImages,
          rhythmSubmission: homeworkRhythm,
          staffSubmission: homeworkStaff,
          pianoSubmission: homeworkPiano,
          voiceTranscript,
          audioSubmission,
          evaluationContext: {
            evaluationType: homeworkRequirement.evaluationType,
            dimensions: evaluationDimensions,
          },
        }),
      });
      const json = await response.json();
      const evaluation = json?.evaluation || null;
      const feedback = String(json?.text || "系统已记录你的作业，等待教师复核。");
      setHomeworkSubmitted(true);
      setHomeworkRunning(false);
      setHomeworkFeedback(feedback);
      setHomeworkEvaluation(evaluation);
      setStats((prev) => ({ ...prev, interactions: prev.interactions + 1, lastExplanation: "课后作业已提交并完成 AI 初评。" }));
      setShowHomeworkDialog(false);
      reportStudentAnalytics({
        lessonId: lesson.id,
        lessonTitle: lesson.t,
        source: "learning-workspace",
        section: "homework",
        studyMinutes,
        interactions: stats.interactions + 1,
        errors: stats.errors,
        errorTypes: stats.errorTypes,
        homeworkSeconds: 30 * 60 - homeworkRemaining,
        homeworkRemaining,
        homeworkSubmitted: true,
        homeworkLength: homeworkDraft.length,
        homeworkText: homeworkDraft,
        homeworkImages,
        homeworkImageCount: homeworkImages.length,
        homeworkRhythmData: homeworkRhythm,
        homeworkStaffData: homeworkStaff,
        homeworkPianoData: homeworkPiano,
        homeworkVoiceTranscript: voiceTranscript,
        homeworkAudioMeta: audioSubmission ? { name: audioSubmission.name, mimeType: audioSubmission.mimeType, size: audioSubmission.size, duration: audioSubmission.duration } : null,
        aiHomeworkFeedback: feedback,
        evaluationScores: evaluation?.scores || null,
        evaluationTags: evaluation?.tags || [],
        evaluationComment: evaluation?.overallComment || "",
        submissionTypes,
        lastExplanation: "课后作业已提交并完成 AI 初评。",
      });
    } catch {
      setHomeworkFeedback("作业提交失败，请检查网络后重试。");
    } finally {
      setHomeworkReviewing(false);
    }
  }, [lesson.id, lesson.t, lessonHomework, homeworkDraft, homeworkImages, homeworkRhythm, homeworkStaff, homeworkPiano, voiceTranscript, audioSubmission, homeworkRequirement, evaluationDimensions, studyMinutes, stats, homeworkRemaining, submissionTypes]);

  const openLessonHomeworkSubmit = useCallback(() => {
    if (!homeworkHasContent) {
      setHomeworkFeedback("请先补充本课所需的作业内容，再提交。");
      return;
    }
    const requiredOk = homeworkRequirement.requiredAnyOf.some((type) => homeworkSubmissionState[type]);
    const rhythmNeedsFix = homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete;
    if (!requiredOk) {
      setHomeworkFeedback(`请至少完成以下一种提交方式：${requiredSubmissionLabels}。`);
      return;
    }
    if (rhythmNeedsFix) {
      setHomeworkFeedback(rhythmValidation.issues.join(" "));
      return;
    }
    if (homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete) {
      setHomeworkFeedback("节奏作业尚未完成，请先检查每个小节的拍数是否与拍号一致。")
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkHasContent, homeworkRequirement, homeworkSubmissionState, rhythmMeasuresComplete]);

  return (
    <div style={{ marginTop: 10, marginBottom: 14 }}>
      {showTabs && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setActiveSection("content")} style={sectionButtonStyle("content")}>鍐呭鍛堢幇</button>
        <button onClick={() => setActiveSection("practice")} style={sectionButtonStyle("practice")}>璇惧爞缁冧範</button>
        <button onClick={() => setActiveSection("homework")} style={sectionButtonStyle("homework")}>璇惧悗浣滀笟</button>
      </div>}

      {activeSection === "content" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>{"\u8bfe\u65f6\u5185\u5bb9"}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
          {"\u5f53\u524d\u677f\u5757\u53ea\u5c55\u793a\u8be5\u8bfe\u65f6\u7684\u6b63\u5f0f\u5185\u5bb9\u4e0e\u914d\u5957 PPT\uff0c\u4e0d\u518d\u91cd\u590d\u663e\u793a\u4ea4\u4e92\u8bf4\u660e\u3002"}
        </div>
        {pptLessonData && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{`\u7b2c ${pptLessonData.lessonNumber} \u8bfe\u65f6`}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              {pptLessonData.chapter}
              <br />
              {pptLessonData.lessonTitle}
            </div>
          </div>
        )}
        <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
          {lessonContentItems.map((item, index) => (
            <div key={`${lesson.id}-content-${index}`} style={{ padding: 14, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{item.h}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {String(item.b || "").split(/\n+/).filter(Boolean).map((paragraph, paragraphIndex) => (
                  <div key={`${lesson.id}-content-${index}-${paragraphIndex}`} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.9 }}>
                    {paragraph}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {pptLessonData && <PptContentEmbedFixed lessonId={lesson.id} />}
      </div>}

      {activeSection === "practice" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课堂练习</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          系统会结合你在课时内容中的互动操作结果，提供 20 题连续课堂练习，并反馈当前掌握情况。
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>互动检测</div>
          <div style={{ fontSize: 11, color: stats.errors > 0 ? "#b91c1c" : "var(--color-text-secondary)" }}>
            {lastInterval ? `最近一次识别为 ${lastInterval.label}，${lastInterval.detail}` : "请先在课时内容里完成一次钢琴或互动操作，系统才会生成检测结果。"}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>课堂练习题</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>第 {practiceIndex + 1} / {practiceQuestions.length} 题</div>
          </div>
          <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7, marginBottom: 8 }}>{currentPractice?.prompt}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {currentPractice?.options.map((option) => (
              <button key={option} onClick={() => answerPractice(option)} disabled={Boolean(practiceAnswers[practiceIndex])} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.1)", background: practiceAnswers[practiceIndex] && option === currentPractice.answer ? "#111111" : "#ffffff", color: practiceAnswers[practiceIndex] && option === currentPractice.answer ? "#ffffff" : "#111111", cursor: practiceAnswers[practiceIndex] ? "default" : "pointer" }}>
                {option}
              </button>
            ))}
          </div>
          {practiceResult && <div style={{ marginTop: 8, fontSize: 11, color: practiceResult.ok ? "#166534" : "#b91c1c", lineHeight: 1.8 }}>
            {practiceResult.message}
            <br />
            {practiceResult.explanation}
          </div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={nextPracticeQuestion} disabled={!practiceAnswers[practiceIndex] || practiceIndex >= practiceQuestions.length - 1} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#111111", color: "#ffffff", cursor: !practiceAnswers[practiceIndex] || practiceIndex >= practiceQuestions.length - 1 ? "default" : "pointer" }}>下一题</button>
            <button onClick={restartPractice} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>切换到新的 20 题</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-secondary)" }}>
            答对题数/总题数：{correctCount}/{practiceQuestions.length}
          </div>
        </div>
      </div>}

      {activeSection === "homework" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课后作业</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          系统会依据本课知识点生成作业建议，并记录学习时长、错误类型和交互数据，辅助教师后续复核。
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>课后作业计时</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111111" }}>{formattedHomeworkTime}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button onClick={() => setHomeworkRunning(true)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>继续计时</button>
              <button onClick={() => setHomeworkRunning(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#ffffff", cursor: "pointer" }}>暂停</button>
              <button onClick={() => { setHomeworkRunning(false); setHomeworkRemaining(30 * 60); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>重置为 30 分钟</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              进入本页后已自动开始倒计时。
              <br />
              AI 指定任务：{lessonHomework}
              <br />
              当前学习轨迹：约 {studyMinutes} 分钟，互动 {stats.interactions} 次。
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>AI 生成作业</div>
            <div style={{ display: "grid", gap: 8 }}>
              {homeworkItems.map((item) => (
                <div key={item} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.7, padding: "8px 10px", borderRadius: 10, background: "#f8f8f8" }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          <div style={{ marginBottom: 4 }}>{"\u672c\u8bfe\u63d0\u4ea4\u65b9\u5f0f\uff1a"}{homeworkChannelLabels}</div>
          <div>{"\u4f5c\u4e1a\u8bf4\u660e\uff1a"}{homeworkRequirement.helper}</div>
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {homeworkRequirement.channels.includes("image") && <HomeworkImageUploader
            images={homeworkImages}
            onAddFiles={handleHomeworkAddFiles}
            onRemoveImage={removeHomeworkImage}
            fileInputRef={homeworkFileInputRef}
            cameraInputRef={homeworkCameraInputRef}
          />}
          {homeworkRequirement.channels.includes("rhythm") && <RhythmHomeworkEditorV2
            rhythmSubmission={homeworkRhythm}
            onChange={(updater) => setHomeworkRhythm((prev) => (typeof updater === "function" ? updater(prev) : updater))}
            onPlay={playRhythmMeasure}
          />}
          {homeworkRequirement.channels.includes("staff") && <StaffHomeworkEditorV2
            staffSubmission={homeworkStaff}
            onChange={(updater) => setHomeworkStaff((prev) => (typeof updater === "function" ? updater(prev) : updater))}
          />}
          {homeworkRequirement.channels.includes("piano") && <HomeworkPianoEditor
            pianoSubmission={homeworkPiano}
            onChange={(updater) => setHomeworkPiano((prev) => (typeof updater === "function" ? updater(prev) : updater))}
          />}
          {homeworkRequirement.channels.includes("voice") && <HomeworkVoiceInput
            transcript={voiceTranscript}
            audioSubmission={audioSubmission}
            voiceSupported={voiceSupported}
            listening={voiceListening}
            transcribing={audioTranscribing}
            error={voiceError}
            onStartListening={startSpeechRecognition}
            onStopListening={stopSpeechRecognition}
            onStartRecording={startAudioRecording}
            onStopRecording={stopAudioRecording}
            onApplyTranscript={applyTranscriptToDraft}
          />}
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>文字说明</div>
            <textarea
              value={homeworkDraft}
              onChange={(e) => setHomeworkDraft(e.target.value)}
              placeholder="可在这里补充概念解释、作业思路、节奏分析、音高判断依据，或对拍照上传内容的说明。"
              style={{ width: "100%", minHeight: 140, borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", padding: 12, fontSize: 12, lineHeight: 1.8, resize: "vertical", outline: "none" }}
            />
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>提交概览</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                提交类型：{submissionTypes.length ? submissionTypes.join(" / ") : "尚未开始"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>文字说明</div>
                <div style={{ fontSize: 12, color: "#111111" }}>{homeworkDraft.trim() ? `${homeworkDraft.trim().slice(0, 60)}${homeworkDraft.trim().length > 60 ? "..." : ""}` : "未填写"}</div>
              </div>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>节奏编辑</div>
                <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizeRhythmSubmission(homeworkRhythm)}</div>
              </div>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>五线谱修正</div>
                <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizeStaffSubmission(homeworkStaff)}</div>
              </div>
              {homeworkRequirement.channels.includes("piano") ? (
                <div className="subtle-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>钢琴输入</div>
                  <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizePianoSubmission(homeworkPiano)}</div>
                </div>
              ) : null}
              {homeworkRequirement.channels.includes("voice") ? (
                <div className="subtle-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>语音转写</div>
                  <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{voiceTranscript.trim() || "未录入"}</div>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                错误类型：{Object.keys(stats.errorTypes).length ? Object.entries(stats.errorTypes).map(([k, v]) => `${k} x${v}`).join("；") : "当前暂无错误记录"}
              </div>
              <button onClick={openLessonHomeworkSubmit} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>
                提交作业
              </button>
            </div>
            {homeworkFeedback && <div style={{ marginTop: 10, fontSize: 11, color: homeworkSubmitted ? "#166534" : "#b91c1c", whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{homeworkFeedback}</div>}
            <div style={{ marginTop: 10 }}>
              <HomeworkEvaluationCard evaluation={homeworkEvaluation} />
            </div>
          </div>
        </div>
        {showHomeworkDialog && <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.36)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ width: "min(640px, 100%)", background: "#ffffff", borderRadius: 16, padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>确认提交课后作业</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
              当前剩余时间 {formattedHomeworkTime}，提交后将生成 AI 初评结果，并同步到教师后台。
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111" }}>
                <strong>提交类型：</strong>{submissionTypes.join(" / ") || "未填写"}
              </div>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111", lineHeight: 1.8 }}>
                <strong>文字说明：</strong>{homeworkDraft.trim() || "未填写"}
              </div>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111", lineHeight: 1.8 }}>
                <strong>图片数量：</strong>{homeworkImages.length} 张
                <br />
                <strong>节奏摘要：</strong>{summarizeRhythmSubmission(homeworkRhythm)}
                <br />
                <strong>五线谱摘要：</strong>{summarizeStaffSubmission(homeworkStaff)}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowHomeworkDialog(false)} disabled={homeworkReviewing} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: homeworkReviewing ? "default" : "pointer" }}>继续修改</button>
              <button onClick={confirmMixedHomeworkSubmit} disabled={homeworkReviewing} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: homeworkReviewing ? "default" : "pointer" }}>
                {homeworkReviewing ? "AI 初评中..." : "确认提交"}
              </button>
            </div>
          </div>
        </div>}
      </div>}
    </div>
  );
}

function LessonSectionCharts({ lessonId }) {
  if (lessonId !== "L1") return null;
  return (
    <div style={{ marginTop: 14 }}>
      <LessonCharts lessonId={lessonId} />
    </div>
  );
}

function InteractivePitchFrequencyWidget() {
  const noteItems = [
    { label: "C3", freq: 130.81 },
    { label: "G3", freq: 196.0 },
    { label: "C4", freq: 261.63 },
    { label: "G4", freq: 392.0 },
    { label: "C5", freq: 523.25 },
  ];
  const [activeIndex, setActiveIndex] = useState(2);

  const playInteractiveNote = useCallback(async (index) => {
    const item = noteItems[index];
    if (!item) return;
    setActiveIndex(index);
    await unlockAudioSystem();
    playTone(item.freq, 0.55, "piano", 0.28);
  }, []);

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音高与频率关系互动钢琴</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        点击下方音键，可听到对应音高，并观察频率柱状图与键盘位置同步变化。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 146 }}>
            {noteItems.map((item, index) => {
              const height = Math.max(36, Math.round(item.freq / 4));
              const active = index === activeIndex;
              return (
                <button
                  key={item.label}
                  onClick={() => playInteractiveNote(index)}
                  style={{
                    flex: 1,
                    height: 140,
                    borderRadius: 14,
                    border: active ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                    background: "#ffffff",
                    cursor: "pointer",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    boxShadow: active ? "inset 0 -16px 28px rgba(17,17,17,0.08)" : "none",
                  }}
                >
                  <div style={{ width: "100%", height, borderRadius: 10, background: active ? "#111111" : "#D1D5DB", transition: "height 0.2s ease" }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginTop: 10 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>{`${item.freq} Hz`}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>当前选中音</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{noteItems[activeIndex].label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`频率：${noteItems[activeIndex].freq} Hz`}
            <br />
            规律：频率越高，听感中的音高越高。
            <br />
            建议：依次点击 C3、C4、C5，感受八度上行时频率翻倍的关系。
          </div>
        </div>
      </div>
    </div>
  );
}

function PptContentEmbed({ lessonId }) {
  return <PptContentEmbedFixed lessonId={lessonId} />;
}

function PptContentEmbedCn({ lessonId }) {
  return <PptContentEmbedFixed lessonId={lessonId} />;
}

function PptContentEmbedFixed({ lessonId }) {
  const lessonData = getPptLessonData(lessonId);
  const [pageIndex, setPageIndex] = useState(0);

  const slideNumbers = useMemo(() => {
    if (!lessonData?.lessonNumber) return [];
    if (lessonId === "L1") return [1, 2, 3, 4, 5, 6];
    if (lessonId === "L2") return [1, 2, 3, 4, 5, 6];
    if (lessonId === "L3") return [7, 8, 9, 10, 11, 12];
    if (lessonId === "L4") return [13, 14, 15, 16, 17, 18];
    if (lessonId === "L5") return [1, 2, 3, 4, 5];
    if (lessonId === "L6") return [6, 7, 8, 9, 10];
    if (lessonId === "L7") return [11, 12, 13, 14, 15];
    if (lessonId === "L8") return [16, 17, 18, 19, 20];
    if (lessonId === "L9") return [1, 2, 3, 4, 5];
    if (lessonId === "L10") return [6, 7, 8, 9, 10];
    if (lessonId === "L11") return [11, 12, 13, 14, 15];
    if (lessonId === "L12") return [16, 17, 18, 19, 20];
    const lessonNo = lessonData.lessonNumber;
    const start = 2 + (lessonNo - 1) * 4;
    return [start, start + 1, start + 2];
  }, [lessonData, lessonId]);

  useEffect(() => {
    setPageIndex(0);
  }, [lessonId]);

  if (!lessonData || slideNumbers.length === 0) return null;

  const currentSlideNo = slideNumbers[pageIndex];
  const imageRoot =
    lessonId === "L1"
      ? "/ppt-images-l1"
      : (lessonId === "L2" || lessonId === "L3" || lessonId === "L4")
        ? "/ppt-images-l234"
        : (lessonId === "L5" || lessonId === "L6" || lessonId === "L7" || lessonId === "L8")
          ? "/ppt-images-l5678"
          : (lessonId === "L9" || lessonId === "L10" || lessonId === "L11" || lessonId === "L12")
            ? "/ppt-images-l912"
            : "/ppt-images";
  const sourcePpt =
    lessonId === "L1"
      ? "/ppt/MusicAI_L1_Sample.pptx"
      : (lessonId === "L2" || lessonId === "L3" || lessonId === "L4")
        ? "/ppt/MusicAI_L2_L3_L4.pptx"
        : (lessonId === "L5" || lessonId === "L6" || lessonId === "L7" || lessonId === "L8")
          ? "/ppt/MusicAI_L5_L6_L7_L8.pptx"
          : (lessonId === "L9" || lessonId === "L10" || lessonId === "L11" || lessonId === "L12")
            ? "/ppt/MusicAI_L9_L10_L11_L12.pptx"
            : "/ppt/MusicAI_12_Lessons.pptx";
  const imageSrc = `${imageRoot}/${encodeURIComponent(`幻灯片${currentSlideNo}.PNG`)}`;

  return (
    <div className="section-card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>课时 PPT</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`第 ${lessonData.lessonNumber} 课时 · ${lessonData.lessonTitle}`}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
            disabled={pageIndex === 0}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: pageIndex === 0 ? "default" : "pointer" }}
          >
            上一页
          </button>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`${pageIndex + 1} / ${slideNumbers.length}`}</div>
          <button
            onClick={() => setPageIndex((prev) => Math.min(slideNumbers.length - 1, prev + 1))}
            disabled={pageIndex === slideNumbers.length - 1}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: pageIndex === slideNumbers.length - 1 ? "default" : "pointer" }}
          >
            下一页
          </button>
        </div>
      </div>
      <div className="subtle-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>{`当前显示：PPT 第 ${currentSlideNo} 页`}</div>
        <img
          src={imageSrc}
          alt={`${lessonData.lessonTitle} - 幻灯片 ${currentSlideNo}`}
          loading="lazy"
          style={{ width: "100%", display: "block", borderRadius: 12, border: "1px solid rgba(17,17,17,0.08)", background: "#f6f6f6" }}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <a href={sourcePpt} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#185FA5", textDecoration: "none" }}>
          打开原始 PPT
        </a>
      </div>
    </div>
  );
}

function LessonMediaHub({ lesson }) {
  return null;
}

function LessonSupportLinks({ onOpen }) {
  const items = [
    { id: "tutor", label: "AI 导师", desc: "针对当前课时提问，并获取讲解与纠错建议" },
    { id: "create", label: "创作", desc: "把本课知识转化成旋律与节奏实践" },
    { id: "lab", label: "实验室", desc: "进入音乐实验室做扩展探索" },
  ];

  return (
    <div className="support-grid">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item.id)}
          className="support-tile"
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>{item.desc}</div>
        </button>
      ))}
    </div>
  );
}

function LessonView({ lesson, ratings, setRating, scores, setScore }) {
  const [tab, setTab] = useState("learn");
  const [labOpen, setLabOpen] = useState(false);

  const ExComponent = EXERCISE_COMPONENTS[lesson.ex];
  const pptLessonData = getPptLessonData(lesson.id);
  const contentItems = (pptLessonData?.knowledgePoints || []).map((item, index) => ({
    h: item.title || `知识点 ${index + 1}`,
    b: item.detail || "",
  }));
  const handleScore = (v) => setScore(lesson.id, v);
  const displayTabs = [
    { id: "learn", label: "课前预习" },
    { id: "content", label: "课时内容" },
    { id: "classroom", label: "课堂练习" },
    { id: "homework", label: "课后作业" },
  ];

  useEffect(() => {
    reportStudentAnalytics({
      lessonId: lesson.id,
      lessonTitle: lesson.t,
      source: "lesson-summary",
      section: tab,
      score: scores[lesson.id] || 0,
      rating: ratings[lesson.id] || 0,
    });
  }, [lesson.id, lesson.t, tab, scores, ratings]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Tag color="#3C3489" bg="#EEEDFE">{`第${lesson.n}课`}</Tag>
        <Stars value={ratings[lesson.id] || 0} onChange={(v) => setRating(lesson.id, v)} size={16} />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 16px" }}>{lesson.t}</h2>

      <div className="chip-tabs">
        {displayTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`chip-tab${tab === item.id ? " is-active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "learn" && (
        <div className="lesson-layout" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)" }}>
          <div className="lesson-main">
            <div className="section-stack">
              {contentItems.length ? contentItems.map((section, index) => (
                <div key={`${lesson.id}-learn-${index}`} className="section-card">
                  <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--color-border-tertiary)" }}>{section.h}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{section.b}</div>
                  {lesson.id === "L1" && index === 0 && (
                    <>
                      <InteractivePitchFrequencyWidgetCn />
                      <InteractiveVolumeAmplitudeWidgetCn />
                    </>
                  )}
                </div>
              )) : (
                <div className="section-card">
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.9 }}>当前课时暂无独立预习文案，建议先阅读课时内容。</div>
                </div>
              )}
            </div>
          </div>
          <div className="lesson-side">
            {lesson.id !== "L1" && (
              <div className="section-card">
                <LessonCharts lessonId={lesson.id} />
              </div>
            )}
            <div className="section-card" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0.96), rgba(42,42,42,0.94))", color: "#ffffff" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>课前预习建议</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.8 }}>
                先完成本页阅读与互动预习，再进入“课时内容”查看 PPT。
                <br />
                理解核心概念后，再进入课堂练习和课后作业。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="lesson-layout" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)" }}>
          <div className="lesson-main">
            <LessonLearningWorkspace lesson={lesson} section="content" showTabs={false} />
          </div>
          <div className="lesson-side">
            {lesson.id !== "L1" && (
              <div className="section-card">
                <LessonCharts lessonId={lesson.id} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "classroom" && (
        <div className="lesson-layout" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)" }}>
          <div className="lesson-main">
            <LessonLearningWorkspace lesson={lesson} section="practice" showTabs={false} />
            <div className="section-card">
              {ExComponent && <ExComponent onScore={handleScore} />}
            </div>
          </div>
          <div className="lesson-side">
            {(scores[lesson.id] || 0) > 0 && (
              <div className="section-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>得分</span>
                <div style={{ flex: 1 }}><PBar v={scores[lesson.id]} max={100} color="#534AB7" /></div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#534AB7" }}>{scores[lesson.id]}%</span>
              </div>
            )}
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>练习说明</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                先完成本节小测与互动练习，再继续下方练习模块。
                <br />
                系统会记录错误类型，供课后作业与教师后台汇总使用。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "homework" && (
        <div className="lesson-layout" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 360px)" }}>
          <div className="lesson-main">
            <LessonLearningWorkspace lesson={lesson} section="homework" showTabs={false} />
          </div>
          <div className="lesson-side">
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>作业规范</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                建议按“概念解释、示例、错误反思”三部分完成。
                <br />
                提交前检查术语是否准确，示例是否对应本课核心概念。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "tutor" && <AITutorV2 lessonId={lesson.id} lessonTitle={lesson.t} />}

      {tab === "create" && (
        <div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>旋律创作器</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>点击网格放置音符，按播放试听，尝试运用本课乐理知识进行创作。</div>
            <MusicCreatorV2 />
          </div>
        </div>
      )}

      {tab === "lab" && (
        <div>
          <div className="section-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{`音乐实验室 · ${lesson.labN}`}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>互动音乐实验页面</div>
              </div>
              <button onClick={() => setLabOpen(!labOpen)} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>
                {labOpen ? "收起" : "打开"}
              </button>
            </div>
            {labOpen ? (
              <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border-tertiary)" }}>
                <iframe src={lesson.lab} title={lesson.labN} style={{ width: "100%", height: 400, border: "none" }} allow="autoplay; microphone" />
              </div>
            ) : (
              <div style={{ padding: 16, textAlign: "center", border: "1px dashed var(--color-border-secondary)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>点击“打开”加载实验，建议使用 Chrome 浏览器。</div>
              </div>
            )}
          </div>
          <a href={lesson.lab} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", fontSize: 11, color: "#185FA5", padding: 8, textDecoration: "none" }}>新窗口打开</a>
        </div>
      )}

      <div className="section-card" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>课程评价</span>
        <Stars value={ratings[lesson.id] || 0} onChange={(v) => setRating(lesson.id, v)} size={22} />
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{ratings[lesson.id] ? `${ratings[lesson.id]}/5` : ""}</span>
      </div>
    </div>
  );
}

/* Assessment */
function LessonSupportLinksV2({ onOpen }) {
  const items = [
    { id: "tutor", label: "AI 导师", desc: "围绕当前课时提问，获得针对性的概念解释与答疑。" },
    { id: "create", label: "音乐创作", desc: "把本课知识转成旋律、节奏与结构创作练习。" },
    { id: "lab", label: "实验室", desc: "进入扩展实验页面，继续做音高、节奏或谱面探索。" },
  ];

  return (
    <div className="support-grid">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item.id)}
          className="support-tile"
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>{item.desc}</div>
        </button>
      ))}
    </div>
  );
}

function LessonLearningWorkspaceV2() {
  return null;
}

function LessonViewV2() {
  return null;
}

function AssessmentPage({ scores, ratings }) {
  const done = ALL_LESSONS.filter(l => (scores[l.id] || 0) > 0).length;
  const avg = ALL_LESSONS.length > 0 ? Math.round(ALL_LESSONS.reduce((s, l) => s + (scores[l.id] || 0), 0) / ALL_LESSONS.length) : 0;
  const rated = ALL_LESSONS.filter(l => (ratings[l.id] || 0) > 0);
  const avgR = rated.length > 0 ? (rated.reduce((s, l) => s + ratings[l.id], 0) / rated.length).toFixed(1) : "--";
  const lv = (s) => s >= 80 ? "优秀" : s >= 60 ? "良好" : s >= 30 ? "一般" : s > 0 ? "需加强" : "未开始";

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px" }}>综合测评报告</h2>
      <div className="metric-grid" style={{ marginBottom: 20 }}>
        {[{ l: "综合得分", v: `${avg}%`, c: "#534AB7" }, { l: "已完成", v: `${done}/12`, c: "#0F6E56" }, { l: "平均评分", v: avgR, c: "#EF9F27" }, { l: "等级", v: lv(avg), c: "#993556" }].map((m, i) => (
          <div key={i} className="section-card" style={{ padding: "16px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{m.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: m.c }}>{m.v}</div>
          </div>
        ))}
      </div>
      {CHAPTERS.map(ch => {
        const ca = Math.round(ch.ls.reduce((s, l) => s + (scores[l.id] || 0), 0) / ch.ls.length);
        return (
          <div key={ch.id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{ch.t}</div>
            {ch.ls.map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingLeft: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 60, flexShrink: 0 }}>{`第${l.n}课`}</span>
                <div style={{ flex: 1 }}><PBar v={scores[l.id] || 0} max={100} color={ch.c} /></div>
                <span style={{ fontSize: 11, fontWeight: 500, width: 32, textAlign: "right" }}>{scores[l.id] || 0}%</span>
                <Stars value={ratings[l.id] || 0} size={10} />
              </div>
            ))}
          </div>
        );
      })}
      <div className="section-card" style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>智能学习建议</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {avg === 0 ? "开始任意课时后，系统会根据你的表现生成个性化建议。"
            : avg < 40 ? "建议每天进行 15-20 分钟短时练习，重点巩固基础概念，并结合 AI 导师查漏补缺。"
            : avg < 70 ? "基础掌握较好，建议重点突破薄弱章节，并在创作与实验模块中实践乐理知识。"
            : "当前表现优秀，建议挑战综合题，并把所学知识迁移到创作与分析任务中。"}
        </div>
      </div>
    </div>
  );
}

function TeacherDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/teacher/overview");
        const json = await response.json();
        if (active) setData(json);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>教师后台加载中...</div>;
  }

  if (!data?.ok) {
    return <div style={{ fontSize: 13, color: "#b91c1c" }}>教师后台数据加载失败。</div>;
  }

  const metricCard = (label, value) => (
    <div className="section-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#111111" }}>{value}</div>
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 14px" }}>教师后台</h2>
      <div className="metric-grid" style={{ marginBottom: 18 }}>
        {metricCard("数据记录数", data.summary.totalRecords)}
        {metricCard("学生数", data.summary.totalStudents)}
        {metricCard("平均得分", `${data.summary.averageScore}%`)}
        {metricCard("已提交作业", data.summary.totalHomeworkSubmitted)}
      </div>

      <div className="lesson-layout" style={{ marginBottom: 18 }}>
        <div className="section-card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>学生学习概览</div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.students.map((student) => (
              <div key={student.studentId} className="subtle-card" style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{student.studentLabel}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  访问课时：{student.lessonsVisited}，平均得分：{student.averageScore}%
                  <br />
                  学习时长：{student.totalStudyMinutes} 分钟，错误数：{student.totalErrors}，作业提交：{student.homeworkSubmitted}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="section-card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>课时数据概览</div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.lessons.map((lesson) => (
              <div key={lesson.lessonId} className="subtle-card" style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{lesson.lessonTitle || lesson.lessonId}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  参与学生：{lesson.activeStudents}，平均得分：{lesson.averageScore}%，累计错误：{lesson.totalErrors}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section-card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>最近学习记录</div>
        <div style={{ display: "grid", gap: 8 }}>
          {data.records.map((record, index) => (
            <div key={`${record.studentId}-${record.lessonId}-${index}`} className="subtle-card" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>
                {record.studentLabel} · {record.lessonTitle || record.lessonId} · {record.section || record.source}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                得分：{record.score || 0}% ，评分：{record.rating || 0}，学习时长：{record.studyMinutes || 0} 分钟，互动：{record.interactions || 0}
                <br />
                错误：{record.errors || 0}，作业：{record.homeworkSubmitted ? "已提交" : "未提交"}，更新时间：{record.updatedAt}
                <br />
                提交类型：{Array.isArray(record.submissionTypes) && record.submissionTypes.length ? record.submissionTypes.join(" / ") : "无"}，图片：{record.homeworkImageCount || 0} 张，节奏：{record.homeworkRhythmData ? "已提交" : "无"}，五线谱：{record.homeworkStaffData ? "已提交" : "无"}
                <br />
                AI 初评：{record.aiHomeworkFeedback ? `${String(record.aiHomeworkFeedback).slice(0, 80)}${String(record.aiHomeworkFeedback).length > 80 ? "..." : ""}` : "暂无"}
              </div>
              {(record.homeworkLength || record.homeworkRhythmData || record.homeworkStaffData || record.homeworkPianoData || record.homeworkVoiceTranscript || record.evaluationScores || (Array.isArray(record.homeworkImages) && record.homeworkImages.length > 0)) && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {record.homeworkText ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>文字说明：</strong>{`${String(record.homeworkText).slice(0, 120)}${String(record.homeworkText).length > 120 ? "..." : ""}`}
                    </div>
                  ) : null}
                  {record.homeworkRhythmData ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>节奏摘要：</strong>{summarizeRhythmSubmission(record.homeworkRhythmData)}
                    </div>
                  ) : null}
                  {record.homeworkStaffData ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>五线谱摘要：</strong>{summarizeStaffSubmission(record.homeworkStaffData)}
                    </div>
                  ) : null}
                  {record.homeworkPianoData ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>钢琴输入：</strong>{summarizePianoSubmission(record.homeworkPianoData)}
                    </div>
                  ) : null}
                  {record.homeworkVoiceTranscript ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>语音转写：</strong>{`${String(record.homeworkVoiceTranscript).slice(0, 120)}${String(record.homeworkVoiceTranscript).length > 120 ? "..." : ""}`}
                    </div>
                  ) : null}
                  {record.evaluationScores ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>课程评价：</strong>{Object.entries(record.evaluationScores).map(([label, value]) => `${label} ${value}`).join(" / ")}
                      {Array.isArray(record.evaluationTags) && record.evaluationTags.length ? <><br /><strong>评价标签：</strong>{record.evaluationTags.join(" / ")}</> : null}
                      {record.evaluationComment ? <><br /><strong>评价评语：</strong>{record.evaluationComment}</> : null}
                    </div>
                  ) : null}
                  {Array.isArray(record.homeworkImages) && record.homeworkImages.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: 8 }}>
                      {record.homeworkImages.slice(0, 4).map((image, imageIndex) => (
                        <img
                          key={`${record.studentId}-${record.lessonId}-${imageIndex}`}
                          src={image.dataUrl}
                          alt={image.name || `作业图片${imageIndex + 1}`}
                          style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(17,17,17,0.08)", background: "#ffffff" }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Home */
function HomePage({ setPage, scores }) {
  return <ModernHomePage setPage={setPage} scores={scores} />;
}

/* App Shell */
function ModernHomePage({ setPage, scores }) {
  return (
    <div>
      <section className="home-hero">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <div className="motion-chip">
              <span className="motion-dot" />
              <span>智能引导学习</span>
            </div>
            <div className="motion-chip">
              <span className="motion-bars"><span /><span /><span /></span>
              <span>互动音乐工作台</span>
            </div>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 800, margin: "0 0 10px", letterSpacing: "-0.03em" }}>音乐理论智能学习平台</h1>
          <div style={{ maxWidth: 680, fontSize: 14, lineHeight: 1.85, color: "rgba(255,255,255,0.72)" }}>
            每个单元下直接展示课时卡片，点击课时即可进入课前预习、课时内容、课堂练习与课后作业。
          </div>
        </div>
      </section>

      {CHAPTERS.map((ch, ci) => {
        const ca = Math.round(ch.ls.reduce((s, l) => s + (scores[l.id] || 0), 0) / ch.ls.length);
        return (
          <section key={ch.id} className="chapter-panel">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                  {`第 ${String(ci + 1).padStart(2, "0")} 单元`}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)" }}>{ch.t}</div>
              </div>
              <div style={{ minWidth: 160 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  <span>学习进度</span>
                  <strong style={{ color: "#111" }}>{ca}%</strong>
                </div>
                <PBar v={ca} max={100} color="#171717" />
              </div>
            </div>

            <div className="lesson-grid-modern">
              {ch.ls.map((l) => (
                <button key={l.id} className="lesson-card-modern" onClick={() => setPage(l.id)}>
                  <div className="lesson-card-top">
                    <span className="lesson-no">{`第 ${String(l.n).padStart(2, "0")} 课`}</span>
                    <span className="lesson-status">{(scores[l.id] || 0) > 0 ? `已完成 ${scores[l.id]}%` : "未开始"}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 8, lineHeight: 1.45 }}>
                    {l.t}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
export default function App() {
  const [page, setPage] = useState("home");
  const [scores, setScores] = useState({});
  const [ratings, setRatings] = useState({});
  const [sideOpen, setSideOpen] = useState(false);

  const handleSetScore = (id, v) => setScores((prev) => ({ ...prev, [id]: Math.max(prev[id] || 0, v) }));
  const handleSetRating = (id, v) => setRatings((prev) => ({ ...prev, [id]: v }));

  const currentLesson = ALL_LESSONS.find((l) => l.id === page);

  useEffect(() => {
    const unlock = () => {
      unlockAudioSystem();
    };
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("click", unlock, { passive: true });
    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  return (
    <div className="page-shell" style={{ fontFamily: "var(--font-sans, -apple-system, sans-serif)" }}>
      <div style={{ width: sideOpen ? 280 : 0, overflow: "hidden", transition: "width 0.25s", flexShrink: 0 }}>
        <div className="sidebar-shell">
          <div onClick={() => { setPage("home"); setSideOpen(false); }} style={{ padding: "10px 12px", borderRadius: 14, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 8, color: page === "home" ? "#111111" : "var(--color-text-primary)", background: page === "home" ? "rgba(17,17,17,0.08)" : "transparent" }}>
            首页
          </div>
          {CHAPTERS.map((ch) => (
            <div key={ch.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", padding: "4px 12px", letterSpacing: "0.08em" }}>{ch.t}</div>
              {ch.ls.map((l) => (
                <div
                  key={l.id}
                  onClick={() => { setPage(l.id); setSideOpen(false); }}
                  style={{ padding: "9px 12px", borderRadius: 14, cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", background: page === l.id ? "rgba(17,17,17,0.08)" : "transparent", color: page === l.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", marginBottom: 2 }}
                >
                  <span>{`第${l.n}课 ${l.t.length > 6 ? `${l.t.slice(0, 6)}...` : l.t}`}</span>
                  {(scores[l.id] || 0) > 0 && <span style={{ fontSize: 9, color: ch.c, fontWeight: 600 }}>{scores[l.id]}%</span>}
                </div>
              ))}
            </div>
          ))}
          <div onClick={() => { setPage("assessment"); setSideOpen(false); }} style={{ padding: "10px 12px", borderRadius: 14, cursor: "pointer", fontSize: 12, fontWeight: 600, marginTop: 8, color: page === "assessment" ? "#111111" : "var(--color-text-secondary)", background: page === "assessment" ? "rgba(17,17,17,0.08)" : "transparent" }}>
            综合测评
          </div>
          <div onClick={() => { setPage("teacher"); setSideOpen(false); }} style={{ padding: "10px 12px", borderRadius: 14, cursor: "pointer", fontSize: 12, fontWeight: 600, marginTop: 6, color: page === "teacher" ? "#111111" : "var(--color-text-secondary)", background: page === "teacher" ? "rgba(17,17,17,0.08)" : "transparent" }}>
            教师后台
          </div>
        </div>
      </div>

      <div className="main-shell">
        <header className="topbar-shell">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setSideOpen(!sideOpen)} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 14 }}>菜单</button>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(135deg,#111,#434343)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>M</div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>乐理智学</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {currentLesson && <Tag color="#3C3489" bg="#EEEDFE">{`第${currentLesson.n}课`}</Tag>}
            {page === "teacher" && <Tag color="#111111" bg="#F3F4F6">教师后台</Tag>}
            <button onClick={() => setPage("assessment")} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>测评</button>
            <button onClick={() => setPage("teacher")} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>教师后台</button>
            <button onClick={() => setPage("home")} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>首页</button>
          </div>
        </header>

        <main className="content-shell">
          {page === "home" && <ModernHomePage setPage={setPage} scores={scores} />}
          {page === "assessment" && <AssessmentPage scores={scores} ratings={ratings} />}
          {page === "teacher" && <TeacherDashboardPage />}
          {currentLesson && <LessonView lesson={currentLesson} ratings={ratings} setRating={handleSetRating} scores={scores} setScore={handleSetScore} />}
        </main>

        <footer style={{ textAlign: "center", padding: "16px 14px", borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 0, color: "var(--color-text-tertiary)", background: "rgba(255,255,255,0.56)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", marginTop: 0 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>贡献者：Gaun Xingzhi</span>
            <img src="/images/ucsi-logo-user.jpg" alt="UCSI University" style={{ height: 42, width: "auto", objectFit: "contain", display: "block" }} />
          </div>
        </footer>
      </div>
    </div>
  );
}

