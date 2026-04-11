import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getPptLessonData } from "./pptLessonData";

/* ─── Audio ─── */
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
const CN = ["do","升do","re","升re","mi","fa","升fa","sol","升sol","la","升la","si"];
const WK = [0,2,4,5,7,9,11];
const BK = [1,3,6,8,10];
function nFreq(n, o) { return 440 * Math.pow(2, (NT.indexOf(n) - 9) / 12 + (o - 4)); }

/* ─── Data ─── */
const INTERVALS = [
  { n: "小二度", s: 1 }, { n: "大二度", s: 2 }, { n: "小三度", s: 3 }, { n: "大三度", s: 4 },
  { n: "纯四度", s: 5 }, { n: "三全音", s: 6 }, { n: "纯五度", s: 7 }, { n: "小六度", s: 8 },
  { n: "大六度", s: 9 }, { n: "小七度", s: 10 }, { n: "大七度", s: 11 }, { n: "纯八度", s: 12 },
];
const CHORDS = [
  { n: "大三和弦", iv: [0,4,7] }, { n: "小三和弦", iv: [0,3,7] }, { n: "减三和弦", iv: [0,3,6] },
  { n: "增三和弦", iv: [0,4,8] }, { n: "属七和弦", iv: [0,4,7,10] }, { n: "小七和弦", iv: [0,3,7,10] },
];
const TERMS = [
  { t: "Adagio", c: "柔板", m: "缓慢地（约66-76 BPM）" },
  { t: "Allegro", c: "快板", m: "快速活泼地（约120-156 BPM）" },
  { t: "Forte (f)", c: "强", m: "大声演奏" },
  { t: "Piano (p)", c: "弱", m: "轻柔演奏" },
  { t: "Crescendo", c: "渐强", m: "逐渐增大音量" },
  { t: "Legato", c: "连奏", m: "音符之间平滑连接" },
  { t: "Staccato", c: "断奏", m: "音符短促分开" },
  { t: "D.C.", c: "从头反复", m: "Da Capo，从乐曲开头重新演奏" },
  { t: "Coda", c: "尾声", m: "跳至结尾段落" },
  { t: "Ritardando", c: "渐慢", m: "逐渐放慢速度" },
];
const RHYTHMS = [
  { n: "四分音符", p: [1,0,1,0,1,0,1,0] },
  { n: "八分音符", p: [1,1,1,1,1,1,1,1] },
  { n: "附点四分", p: [1,0,0,1,0,0,1,0] },
  { n: "切分节奏", p: [1,0,1,1,0,1,1,0] },
  { n: "综合节奏", p: [1,1,0,1,0,1,1,0] },
];

function getStudentProfile() {
  if (typeof window === "undefined") {
    return { studentId: "student-local", studentLabel: "本地学生" };
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
    studentLabel: `学生 ${new Date().toLocaleDateString("zh-CN").replace(/\//g, "")}`,
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
  { id: "quarter", label: "四分", duration: 1, kind: "note" },
  { id: "eighth", label: "八分", duration: 0.5, kind: "note" },
  { id: "dotted-quarter", label: "附点四分", duration: 1.5, kind: "note" },
  { id: "quarter-rest", label: "四分休止", duration: 1, kind: "rest" },
  { id: "eighth-rest", label: "八分休止", duration: 0.5, kind: "rest" },
  { id: "tie", label: "连音", duration: 0, kind: "tie" },
];

RHYTHM_SYMBOLS.splice(
  0,
  RHYTHM_SYMBOLS.length,
  { id: "whole", label: "全音符", duration: 4, kind: "note" },
  { id: "half", label: "二分音符", duration: 2, kind: "note" },
  { id: "quarter", label: "四分音符", duration: 1, kind: "note" },
  { id: "eighth", label: "八分音符", duration: 0.5, kind: "note" },
  { id: "dotted-quarter", label: "附点四分", duration: 1.5, kind: "note" },
  { id: "dotted-half", label: "附点二分", duration: 3, kind: "note" },
  { id: "whole-rest", label: "全休止", duration: 4, kind: "rest" },
  { id: "half-rest", label: "二分休止", duration: 2, kind: "rest" },
  { id: "quarter-rest", label: "四分休止", duration: 1, kind: "rest" },
  { id: "eighth-rest", label: "八分休止", duration: 0.5, kind: "rest" },
);

const HOMEWORK_REQUIREMENTS = {
  L1: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "本课以概念整理为主，建议提交文字说明；如为手写笔记，可直接拍照上传。" },
  L2: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "本课侧重律制与泛音列理解，建议提交概念比较、倍频示意图或手写分析。" },
  L3: { channels: ["text", "image", "staff"], requiredAnyOf: ["image", "staff"], helper: "本课涉及五线谱与谱号识别，支持拍照上传手写谱例，或在页面内直接修正五线谱音位。" },
  L4: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "本课需要书写音符时值与休止符，建议用节奏编辑器完成，或上传手写节奏作业。" },
  L5: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "装饰音作业以说明与示例为主，可写文字分析，也可上传手写乐谱。" },
  L6: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "演奏记号作业重点在术语理解与应用说明，建议提交文字设计或标注后的图片。" },
  L7: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "反复与省略记号更适合结构说明、顺序写作或手写结构图。" },
  L8: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "音乐术语以术语卡片、记忆整理或拍照上传笔记为主。" },
  L9: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "本课需要写出不同拍号下的节奏型，建议使用节奏编辑器，或上传纸面作业。" },
  L10: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "音值组合训练建议直接在节奏编辑器中完成，并检查是否跨拍不当。" },
  L11: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "切分音作业需要写清重音移动，建议使用节奏编辑器或拍照上传完整节奏。" },
  L12: { channels: ["text", "image", "rhythm", "staff"], requiredAnyOf: ["text", "image", "rhythm", "staff"], helper: "综合复习课支持文字总结、节奏设计、五线谱修正或拍照上传任一形式。" },
};

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
  return HOMEWORK_REQUIREMENTS[lessonId] || {
    channels: ["text", "image"],
    requiredAnyOf: ["text", "image"],
    helper: `本课“${lessonTitle}”建议提交文字说明或拍照作业。`,
  };
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

const LESSON_CONTENT = {
  L1: [
    { h: "一、音的四种物理性质", b: "【音高】由振动频率决定，频率越高音越高。国际标准音 A4 = 440Hz。\n\n【音值】由振动持续时间决定。全音符4拍，二分音符2拍，四分音符1拍。\n\n【音量】由振动幅度决定。力度记号从 ppp（最弱）到 fff（最强）。\n\n【音色】由泛音列构成决定。不同乐器演奏同一音高，音色不同。" },
    { h: "二、乐音体系与音阶", b: "【乐音】振动规则、有固定音高的音。\n【噪音】振动不规则、没有固定音高的音。\n\n七个基本音级：C D E F G A B（do re mi fa sol la si）\n\n【全音与半音】E-F 和 B-C 之间是半音，其他相邻音级之间是全音。\n【变化音级】通过升号♯或降号♭改变基本音级。" },
  ],
  L2: [
    { h: "一、音组与律制", b: "乐音体系按八度关系分为若干组。中央C位于小字一组（c¹）。\n\n【十二平均律】将八度均分为12个半音。每个半音频率比 ≈ 1.0595。\n【纯律】以自然泛音列频率比为基础。纯五度 3:2，大三度 5:4。\n【五度相生律】以纯五度连续生成各音。中国古代「三分损益法」属此类。" },
    { h: "二、泛音列与等音", b: "任何乐音都包含基音和泛音。泛音频率是基音的整数倍：f → 2f → 3f → 4f...\n\n泛音列是自然和声的物理基础。\n\n【等音】音高相同但名称不同：C♯ = D♭（在十二平均律中）\n【音域】乐器或人声能发出的音高范围。\n【音区】低音区（浑厚）、中音区（自然）、高音区（明亮）。" },
  ],
  L3: [
    { h: "一、五线谱基础", b: "五线谱由五条平行线组成，从下到上为第一线至第五线。线与线之间为「间」。\n\n超出范围使用加线表示。音符越高，位置越高。" },
    { h: "二、常用谱号", b: "【高音谱号 𝄞】G谱号，第二线为G。钢琴右手、小提琴使用。\n五线：E4-G4-B4-D5-F5（每Good Boy Does Fine）\n\n【低音谱号 𝄢】F谱号，第四线为F。钢琴左手、大提琴使用。\n五线：G2-B2-D3-F3-A3\n\n【中音谱号】C谱号，第三线为中央C。中提琴使用。" },
  ],
  L4: [
    { h: "一、音符构成与时值", b: "音符由符头、符干、符尾三部分组成。\n\n𝅝 全音符 = 4拍（空心，无符干）\n𝅗𝅥 二分音符 = 2拍（空心+符干）\n♩ 四分音符 = 1拍（实心+符干）\n♪ 八分音符 = ½拍（+1条符尾）\n\n【附点】增加音符一半时值。附点四分 = 1.5拍。" },
    { h: "二、休止符", b: "每种音符有对应的休止符：\n全休止符（悬挂第四线下）= 4拍\n二分休止符（坐在第三线上）= 2拍\n四分休止符（锯齿形）= 1拍\n八分休止符 = ½拍" },
  ],
  L5: [
    { h: "五种装饰音", b: "【颤音 tr】主音与上方二度音快速交替。\n【波音 ~】主音与上方/下方邻音的快速装饰。\n【回音 ∽】上方音→主音→下方音→主音。\n【前倚音】主音前短暂出现的装饰音，占用主音时值。\n【后倚音】主音后出现的装饰音，快速演奏。小音符带斜线。\n\n不同时期的装饰音演奏方式不同——巴洛克从上方辅助音开始，古典浪漫更灵活。" },
  ],
  L6: [
    { h: "演奏符号", b: "【力度】pp→p→mp→mf→f→ff。渐强 <，渐弱 >，突强 sfz。\n\n【奏法】连奏Legato（连线）、断奏Staccato（加点）、保持音Tenuto（横线）。\n\n【速度】Largo→Adagio→Andante→Moderato→Allegro→Presto。\n\n【表情】dolce甜美、cantabile如歌、espressivo有表情、con brio有活力。" },
  ],
  L7: [
    { h: "略写记号", b: "【反复记号 𝄆 𝄇】括住的段落重复演奏。\n【D.C.】Da Capo，从头开始。\n【D.S.】Dal Segno，从 𝄋 记号处开始。\n【Fine】在此处结束。\n【Coda ⊕】跳至尾声。\n【第一/二结尾】1. 2. — 第一次走1结尾，反复后走2结尾。\n\n【8va】高八度演奏。【8vb】低八度演奏。" },
  ],
  L8: [
    { h: "音乐术语", b: "意大利语是国际通用的音乐语言：\n\n速度：Largo广板→Adagio柔板→Andante行板→Moderato中板→Allegro快板→Presto急板\n\n力度：pp很弱→p弱→mp中弱→mf中强→f强→ff很强\n\n表情：dolce甜美、cantabile如歌、espressivo有表情\n\n【记忆策略】间隔重复法——1天→3天→7天→14天→30天复习。将术语放在乐谱语境中记忆。" },
  ],
  L9: [
    { h: "节奏与节拍", b: "【节拍】音乐中有规律的时间脉动。\n【节奏】不同时值音符在时间中的组织方式。\n【拍号】上方=每小节几拍，下方=以几分音符为一拍。\n\n2/4拍：强-弱（进行曲）\n3/4拍：强-弱-弱（华尔兹）\n4/4拍：强-弱-次强-弱（最常见，也记作 C）\n6/8拍：强-弱-弱-次强-弱-弱（复拍子）" },
  ],
  L10: [
    { h: "音值组合法", b: "音值组合法将音符按拍子要求正确书写：\n\n1. 每一拍的音值组合应清晰可见\n2. 音符时值不应跨越强拍\n3. 4/4拍中不应跨越第二三拍界限\n\n【连音线】连接同音高音符，时值相加。\n【附点】增加一半时值。双附点增加四分之三。\n【三连音】将一拍均分为三等份。" },
  ],
  L11: [
    { h: "切分音", b: "【切分】将重音从强拍移到弱拍，打破规律强弱交替。\n\n三种形式：\n1. 弱拍延长到强拍（连音线）\n2. 弱位重音（accent记号）\n3. 休止强拍（强拍用休止符）\n\n最常见切分型：「短-长-短」（八分-四分-八分）\n\n应用：爵士摇摆、拉丁桑巴、古典交响曲、流行摇滚——切分无处不在。" },
  ],
  L12: [
    { h: "综合复习", b: "12课核心知识回顾：\n\n第1-2课：音的性质、音阶音级、律制、泛音列\n第3-4课：谱号谱表、音符与休止符\n第5-6课：五种装饰音、五类演奏符号\n第7-8课：略写记号、音乐术语\n第9-12课：拍号、音值组合、切分音\n\n请完成课堂练习进行综合测评。" },
  ],
};

const LESSON_LEARNING_SECTIONS = {
  L1: [
    { title: "内容呈现", body: "讲解音高、音值、音量与音色四个基础维度，并用频率与振幅图帮助建立声音认知。" },
    { title: "课堂练习", body: "识别不同音高变化，比较强弱差异，并完成基础音级与全音半音判断练习。" },
    { title: "反馈方式", body: "通过钢琴键点击结果与图表对照，及时确认是否正确理解了音的基本属性。" },
    { title: "课后作业", body: "整理一份音的四种属性笔记，并举 3 个生活中能体现音高或音量变化的例子。" },
  ],
  L2: [
    { title: "内容呈现", body: "展示音组、律制、十二平均律与泛音列之间的对应关系，帮助理解音高体系的来源。" },
    { title: "课堂练习", body: "完成音程听辨、泛音序列观察和等音判断练习，比较不同律制的听觉差异。" },
    { title: "反馈方式", body: "通过比例图和泛音柱状图校对判断结果，明确每一个半音与倍频关系。" },
    { title: "课后作业", body: "复述十二平均律和泛音列的核心概念，并画出一个简化的倍频示意图。" },
  ],
  L3: [
    { title: "内容呈现", body: "围绕五线谱、线间关系以及高音谱号和低音谱号展开，建立基础识谱框架。" },
    { title: "课堂练习", body: "完成五线谱音位辨认、谱号切换识别和音高位置匹配练习。" },
    { title: "反馈方式", body: "通过谱表示意图与答题反馈同步检查，快速确认音符在谱表中的具体位置。" },
    { title: "课后作业", body: "抄写高音谱号与低音谱号常见音位各一遍，并独立完成 8 个音符识别。" },
  ],
  L4: [
    { title: "内容呈现", body: "介绍常见音符与休止符的时值结构，结合附点说明不同节奏单位的延长规则。" },
    { title: "课堂练习", body: "完成音符时值排序、休止符匹配和附点节奏计算练习。" },
    { title: "反馈方式", body: "通过时值可视化条形图与作答结果比对，判断节奏单位理解是否准确。" },
    { title: "课后作业", body: "设计两小节节奏型，要求同时包含音符、休止符和至少一种附点写法。" },
  ],
  L5: [
    { title: "内容呈现", body: "系统介绍倚音、回音、波音、颤音等装饰音的写法、位置和音乐作用。" },
    { title: "课堂练习", body: "辨认不同装饰音符号，并尝试在短旋律中选择合适的装饰音进行填充。" },
    { title: "反馈方式", body: "通过装饰音密度和时长图观察不同写法的差异，再对照 AI 讲解修正理解。" },
    { title: "课后作业", body: "选一段熟悉旋律，自行添加 2 到 3 个装饰音，并说明这样处理的原因。" },
  ],
  L6: [
    { title: "内容呈现", body: "讲解力度、速度、奏法和表情术语，让学生理解乐谱中的演奏指示系统。" },
    { title: "课堂练习", body: "完成力度符号排序、速度术语识别和奏法含义判断练习。" },
    { title: "反馈方式", body: "结合力度层级图和速度区间图查看错误点，明确每个术语的使用语境。" },
    { title: "课后作业", body: "给一段简单旋律添加力度和速度记号，并写出你的演奏设计思路。" },
  ],
  L7: [
    { title: "内容呈现", body: "围绕反复记号、D.C.、D.S.、Fine、Coda 等缩写与结构记号展开教学。" },
    { title: "课堂练习", body: "根据结构路径图判断乐段实际演奏顺序，并识别常见缩写的功能。" },
    { title: "反馈方式", body: "通过流程图回看错误路径，定位自己在哪一步误解了乐曲结构。" },
    { title: "课后作业", body: "画出一个包含反复与结尾处理的迷你结构图，并写出演奏顺序。" },
  ],
  L8: [
    { title: "内容呈现", body: "分类讲解速度、力度、表情等音乐术语，并强调长期记忆和复现方法。" },
    { title: "课堂练习", body: "进行术语分类、含义匹配和记忆巩固训练，建立术语检索能力。" },
    { title: "反馈方式", body: "通过分类气泡图与复习节奏建议，明确哪些术语需要再次复习。" },
    { title: "课后作业", body: "整理本课术语卡片，至少完成一次当天、三天后和七天后的复习。" },
  ],
  L9: [
    { title: "内容呈现", body: "讲解节拍、拍号与重音分布，并帮助学生区分拍子结构和节奏组织。" },
    { title: "课堂练习", body: "完成 2/4、3/4、4/4 等拍号辨认和节拍脉冲跟随练习。" },
    { title: "反馈方式", body: "通过重音结构图与节拍脉冲示意图查看理解偏差，纠正拍感。" },
    { title: "课后作业", body: "分别写出 2/4、3/4、4/4 各一小节简单节奏，并标出强弱规律。" },
  ],
  L10: [
    { title: "内容呈现", body: "重点讲解音值组合原则、附点、连音和三连音的规范书写逻辑。" },
    { title: "课堂练习", body: "将零散音值重新组合成正确拍内结构，并判断哪些写法不规范。" },
    { title: "反馈方式", body: "通过组合切分图和连音示意图核对答案，确认拍内结构是否清晰。" },
    { title: "课后作业", body: "写一条包含附点或连音的节奏练习，并检查它是否符合拍号规则。" },
  ],
  L11: [
    { title: "内容呈现", body: "讲解切分音的形成方式、重音迁移逻辑以及弱拍强调的表现效果。" },
    { title: "课堂练习", body: "从给定节奏中找出切分音位置，并尝试读出切分产生的重音变化。" },
    { title: "反馈方式", body: "借助切分迁移图和弱拍强调曲线，对照自己的判断修正节奏感觉。" },
    { title: "课后作业", body: "创作一条包含切分音的两小节节奏，并标出你设计的重音位置。" },
  ],
  L12: [
    { title: "内容呈现", body: "对前 11 课知识进行综合归纳，帮助学生建立完整的乐理学习结构。" },
    { title: "课堂练习", body: "通过综合题、听辨题和应用题检验音高、记谱、术语与节奏掌握情况。" },
    { title: "反馈方式", body: "结合知识雷达图与进阶路径图，判断当前能力分布与后续提升重点。" },
    { title: "课后作业", body: "完成一次综合复习，并基于自己的薄弱项制定下一阶段练习计划。" },
  ],
};

const LESSON_QUIZ_BANK = {
  L1: { prompt: "国际标准音 A4 的频率是多少？", options: ["220Hz", "440Hz", "523Hz"], answer: "440Hz", explanation: "A4=440Hz 是最基础的乐音参考标准。" },
  L2: { prompt: "十二平均律中相邻半音的频率比大约是多少？", options: ["1.5", "1.25", "1.0595"], answer: "1.0595", explanation: "十二平均律将八度平均分成 12 份，相邻半音频率比约为 1.0595。" },
  L3: { prompt: "高音谱号的中心定位在哪条线？", options: ["第二线", "第三线", "第四线"], answer: "第二线", explanation: "高音谱号将第二线定义为 G 音，是读谱的关键。" },
  L4: { prompt: "四分音符通常等于几拍？", options: ["0.5 拍", "1 拍", "2 拍"], answer: "1 拍", explanation: "在常见拍号中，四分音符通常作为 1 拍的基本单位。" },
  L5: { prompt: "颤音通常表现为什么？", options: ["两个相邻音快速交替", "持续延长同一个音", "强拍重音"], answer: "两个相邻音快速交替", explanation: "颤音的核心特征是主音与邻音的快速交替。" },
  L6: { prompt: "Allegro 通常表示什么速度？", options: ["慢板", "中板", "快板"], answer: "快板", explanation: "Allegro 是常见的快板速度术语。" },
  L7: { prompt: "D.C. 在乐谱中表示什么？", options: ["从头反复", "结束", "跳到尾声"], answer: "从头反复", explanation: "D.C. 即 Da Capo，表示回到乐曲开头再演奏。" },
  L8: { prompt: "Dolce 更接近哪种表情？", options: ["甜美柔和", "强烈激昂", "庄严缓慢"], answer: "甜美柔和", explanation: "Dolce 用于提示演奏风格甜美、柔和。" },
  L9: { prompt: "3/4 拍每小节通常有几拍？", options: ["2 拍", "3 拍", "4 拍"], answer: "3 拍", explanation: "3/4 拍表示每小节 3 拍，以四分音符为一拍。" },
  L10: { prompt: "附点会让原音符时值增加多少？", options: ["增加一半", "增加一倍", "减少一半"], answer: "增加一半", explanation: "附点会增加原音符时值的一半。" },
  L11: { prompt: "切分音的核心效果是什么？", options: ["重音迁移", "速度变慢", "音高升高"], answer: "重音迁移", explanation: "切分音会把听感重音从强拍转移到弱拍或拍间位置。" },
  L12: { prompt: "综合复习阶段最重要的目标是什么？", options: ["只背术语", "整合知识并应用", "只做听辨"], answer: "整合知识并应用", explanation: "综合复习重在把前面知识串起来并用于实际分析与练习。" },
};

const LESSON_PRACTICE_EXTRA = {
  L1: { prompt: "下列哪一项最直接反映音量变化？", options: ["频率", "振幅", "谱号"], answer: "振幅", explanation: "音量变化通常对应振幅变化，振幅越大，听感通常越强。" },
  L2: { prompt: "泛音列中第二泛音与基音最接近什么关系？", options: ["八度", "三度", "半音"], answer: "八度", explanation: "第二泛音是基音的倍频，听感上最接近八度关系。" },
  L3: { prompt: "低音谱号主要标记哪一个音作为定位？", options: ["F 音", "C 音", "G 音"], answer: "F 音", explanation: "低音谱号的两点包围 F 所在的线，是低音谱号的核心定位点。" },
  L4: { prompt: "附点四分音符的时值等于什么？", options: ["1 拍", "1.5 拍", "2 拍"], answer: "1.5 拍", explanation: "附点会增加原时值的一半，因此四分音符加附点等于 1.5 拍。" },
  L5: { prompt: "哪种装饰音最接近主音与邻音快速来回？", options: ["波音", "颤音", "倚音"], answer: "颤音", explanation: "颤音的核心是主音与邻音之间的持续快速交替。" },
  L6: { prompt: "mf 通常表示什么力度层级？", options: ["很弱", "中强", "极强"], answer: "中强", explanation: "mf 是 mezzo forte，表示中强力度。" },
  L7: { prompt: "Fine 在结构记号里通常意味着什么？", options: ["从头开始", "结束处", "跳到尾声"], answer: "结束处", explanation: "Fine 通常表示乐曲或某一反复路线的结束位置。" },
  L8: { prompt: "音乐术语学习最稳的方式是什么？", options: ["一次性死记", "分类反复复现", "只看中文"], answer: "分类反复复现", explanation: "术语的记忆更依赖分类和间隔复习，而不是一次性记忆。" },
  L9: { prompt: "4/4 拍中第一拍的常见属性是什么？", options: ["弱拍", "次强拍", "强拍"], answer: "强拍", explanation: "4/4 拍的第一拍通常是全小节最稳定的强拍。" },
  L10: { prompt: "连音线连接两个同音高音符时，作用是什么？", options: ["改变音高", "时值相加", "改成休止符"], answer: "时值相加", explanation: "连音线连接同音高音符时，会把它们的时值相加。" },
  L11: { prompt: "切分音最明显的听觉感受是什么？", options: ["拍感更平均", "重音前移或后移", "音高更清晰"], answer: "重音前移或后移", explanation: "切分音的核心是打破原有强弱格局，形成重音迁移。" },
  L12: { prompt: "综合阶段最有效的复盘方式是什么？", options: ["只重做会的题", "按错误类型分类复盘", "跳过基础内容"], answer: "按错误类型分类复盘", explanation: "综合复习更应按错误类型分类，才能看出真正的薄弱项。" },
};

function createLessonPracticePool(lessonId, lessonTitle) {
  const primary = LESSON_QUIZ_BANK[lessonId];
  const extra = LESSON_PRACTICE_EXTRA[lessonId];
  const sections = LESSON_LEARNING_SECTIONS[lessonId] || [];
  const focus = HOMEWORK_FOCUS[lessonId] || lessonTitle;
  const otherFocuses = Object.entries(HOMEWORK_FOCUS)
    .filter(([id]) => id !== lessonId)
    .map(([, value]) => value);

  const contentBody = sections.find((item) => item.title === "内容呈现")?.body || "围绕课程核心概念进行结构化讲解。";
  const practiceBody = sections.find((item) => item.title === "课堂练习")?.body || "围绕知识点做即时练习。";
  const homeworkBody = sections.find((item) => item.title === "课后作业")?.body || "完成复习与巩固任务。";
  const wrongFocusA = otherFocuses[0] || "音乐术语分类";
  const wrongFocusB = otherFocuses[1] || "谱号与识谱";

  const optionSet = (correct, a = wrongFocusA, b = wrongFocusB) => [correct, a, b];
  const trueFalse = (prompt, answer, explanation) => ({
    prompt,
    options: ["正确", "错误"],
    answer,
    explanation,
  });

  const questions = [
    primary,
    extra,
    {
      prompt: "下列哪一项最符合本课复习主题？",
      options: optionSet(focus, wrongFocusA, wrongFocusB),
      answer: focus,
      explanation: `本课复习主题聚焦“${focus}”。`,
    },
    {
      prompt: "下列哪一项最接近本课内容呈现的核心任务？",
      options: [contentBody, sections.find((item) => item.title === "课堂练习")?.body || "完成答题", sections.find((item) => item.title === "课后作业")?.body || "完成作业"],
      answer: contentBody,
      explanation: "内容呈现页负责讲解本课核心知识和展示关键概念。",
    },
    {
      prompt: "下列哪一项最接近本课课堂练习的目标？",
      options: [practiceBody, contentBody, homeworkBody],
      answer: practiceBody,
      explanation: "课堂练习页主要承担检测与即时巩固功能。",
    },
    {
      prompt: "下列哪一项最接近本课课后作业的要求？",
      options: [homeworkBody, contentBody, practiceBody],
      answer: homeworkBody,
      explanation: "课后作业页会围绕本课的复习任务和独立完成要求展开。",
    },
    trueFalse(`判断：本课标题是“${lessonTitle}”。`, "正确", "这是当前课时的正式标题。"),
    trueFalse(`判断：本课复习重点是“${focus}”。`, "正确", `本课复习重点确实围绕“${focus}”。`),
    trueFalse(`判断：本课复习重点是“${wrongFocusA}”。`, "错误", `“${wrongFocusA}”属于其他课时，不是本课复习重点。`),
    trueFalse("判断：课堂练习的目的之一是发现错误并立即纠正。", "正确", "课堂练习的设计目标之一就是发现错误并进行及时巩固。"),
    trueFalse("判断：课后作业只需要看，不需要在页面中作答。", "错误", "本项目的课后作业支持在本页完成并提交。"),
    trueFalse("判断：内容呈现页只放静态文字，不需要互动。", "错误", "内容呈现页包含动态钢琴与即时反馈。"),
    trueFalse("判断：课堂练习会结合本节重点进行测验。", "正确", "课堂练习页本身就是围绕本节重点组织题目。"),
    trueFalse("判断：课后作业会记录学习时长与错误类型。", "正确", "课后作业页会记录学习行为数据。"),
    trueFalse("判断：本课学习不需要关注复习主题。", "错误", "复习主题用于帮助学生回到本课核心概念。"),
  ];

  while (questions.length < 60) {
    const index = questions.length + 1;
    const altFocus = otherFocuses[index % otherFocuses.length] || wrongFocusA;
    questions.push(
      index % 3 === 0
        ? {
            prompt: `练习 ${index}：本课更适合围绕哪一项进行复习与巩固？`,
            options: optionSet(focus, altFocus, wrongFocusB),
            answer: focus,
            explanation: `本课仍然应回到“${focus}”这一核心主题。`,
          }
        : index % 3 === 1
          ? trueFalse(`练习 ${index}：本课课堂练习与“${practiceBody.slice(0, 16)}”这一目标相关。`, "正确", "课堂练习页的设计目标与本节练习目标一致。")
          : trueFalse(`练习 ${index}：本课课后作业主要要求完成“${altFocus}”。`, "错误", `“${altFocus}”不是本课的作业中心，本课应围绕“${focus}”。`)
    );
  }

  return questions.slice(0, 60).map((item, index) => ({
    ...item,
    key: `${lessonId}-q-${index}`,
  }));
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
  L12: "综合应用与复盘提升",
};

function getIntervalInfo(a, b) {
  if (a == null || b == null) return null;
  const raw = Math.abs(a - b) % 12;
  const diff = raw > 6 ? 12 - raw : raw;
  if (diff === 1) return { label: "半音", color: "#1f2937", detail: "这两个音之间是相邻半音关系。" };
  if (diff === 2) return { label: "全音", color: "#111111", detail: "这两个音之间是标准全音关系。" };
  return { label: "其他", color: "#6b7280", detail: "这两个音之间不是全音或半音，可继续尝试。", isError: true };
}

function LessonLearningWorkspaceLegacy({ lesson }) {
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [lastInterval, setLastInterval] = useState(null);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizResult, setQuizResult] = useState(null);
  const [stats, setStats] = useState(() => ({
    startedAt: Date.now(),
    interactions: 0,
    errors: 0,
    errorTypes: {},
    lastExplanation: "先点击钢琴键，系统会自动分析音程关系并记录学习行为。",
  }));

  const quiz = LESSON_QUIZ_BANK[lesson.id];
  const studyMinutes = Math.max(1, Math.ceil((Date.now() - stats.startedAt) / 60000));

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
        const interval = getIntervalInfo(next[0], next[1]);
        setLastInterval(interval);
        setStats((prevStats) => ({ ...prevStats, lastExplanation: interval.detail }));
        if (interval?.isError) {
          recordError("键盘音程判断", "当前点击形成的是其他音程关系。请重新尝试点出全音或半音。");
        }
      }
      return next;
    });
  }, [recordError]);

  const answerQuiz = useCallback((option) => {
    if (quizAnswered) return;
    const ok = option === quiz.answer;
    setQuizAnswered(true);
    setQuizResult({ ok, message: ok ? "回答正确，已掌握本课关键点。" : `回答不正确，正确答案是 ${quiz.answer}。` });
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1, lastExplanation: quiz.explanation }));
    if (!ok) {
      recordError("课堂小测", quiz.explanation);
    }
  }, [quiz, quizAnswered, recordError]);

  const resetQuiz = useCallback(() => {
    setQuizAnswered(false);
    setQuizResult(null);
  }, []);

  const homeworkItems = [
    `复习主题：围绕“${HOMEWORK_FOCUS[lesson.id] || lesson.t}”整理一页知识提纲。`,
    `练习要求：完成 1 轮课堂错题回顾，重点检查 ${Object.keys(stats.errorTypes)[0] || "音程判断与概念理解"}。`,
    `学习追踪：本次学习约 ${studyMinutes} 分钟，共记录 ${stats.interactions} 次交互，请写下今天最容易出错的 1 个知识点。`,
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 10, marginBottom: 14 }}>
      <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>内容呈现</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
          制作动态钢琴键盘可视化界面。点击琴键即可播放对应音高；连续点击两个音会实时显示全音、半音或其他关系。
        </div>
        <div style={{ position: "relative", height: 132, margin: "0 auto", width: 252, userSelect: "none" }}>
          {WK.map((ni, i) => (
            <div key={ni} onClick={() => handleKeyPress(ni)} style={{ position: "absolute", left: i * 36, top: 0, width: 34, height: 124, borderRadius: "0 0 8px 8px", border: "1px solid #d1d5db", background: activeNote === ni ? "#e5e7eb" : "#ffffff", cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, fontSize: 10, color: "#6b7280" }}>{NT[ni]}</div>
          ))}
          {BK.map((ni) => {
            const wPos = WK.filter((w) => w < ni).length;
            return <div key={ni} onClick={() => handleKeyPress(ni)} style={{ position: "absolute", left: wPos * 36 - 12, top: 0, width: 24, height: 78, borderRadius: "0 0 6px 6px", background: activeNote === ni ? "#4b5563" : "#111111", cursor: "pointer", zIndex: 2, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6, color: "#d1d5db", fontSize: 9 }}>{NT[ni]}</div>;
          })}
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: lastInterval?.color || "#111111" }}>
            {lastInterval ? `关系识别：${lastInterval.label}` : "关系识别：等待连续点击两个音"}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>{lastInterval?.detail || "建议先尝试点出 E-F 或 C-D 观察半音与全音差别。"}</div>
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课堂练习</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          系统会检测你在内容呈现中的钢琴操作是否形成了错误关系，并通过本节课重点小测继续检验理解情况。
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>钢琴演示检测</div>
          <div style={{ fontSize: 11, color: lastInterval?.isError ? "#b91c1c" : "var(--color-text-secondary)" }}>
            {lastInterval?.isError ? "检测到当前钢琴操作不是目标全音/半音关系，建议重新尝试。" : "当前钢琴操作结果正常，可继续完成小测验。"}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>本节小测验</div>
          <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7, marginBottom: 8 }}>{quiz.prompt}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {quiz.options.map((option) => (
              <button key={option} onClick={() => answerQuiz(option)} disabled={quizAnswered} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.1)", background: quizAnswered && option === quiz.answer ? "#111111" : "#ffffff", color: quizAnswered && option === quiz.answer ? "#ffffff" : "#111111", cursor: quizAnswered ? "default" : "pointer" }}>
                {option}
              </button>
            ))}
          </div>
          {quizResult && <div style={{ fontSize: 11, color: quizResult.ok ? "#166534" : "#b91c1c", marginTop: 8 }}>{quizResult.message}</div>}
          <button onClick={resetQuiz} style={{ marginTop: 10, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>重做小测</button>
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>反馈方式</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          提交作答后立即反馈，并针对当前错误给出解释说明，帮助你知道“错在哪里”和“应该怎么改”。
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>即时反馈摘要</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            学习交互：{stats.interactions} 次
            <br />
            当前错误数：{stats.errors} 次
            <br />
            最近解释：{stats.lastExplanation}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课后作业</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          AI 智能生成本节作业，并记录学习时长、错误类型和互动次数等行为数据，形成个性化练习建议。
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
    </div>
  );
}

const LEGACY_CHAPTERS = [
  { id: "ch1", t: "第一章：乐音体系", c: "#534AB7", bg: "#EEEDFE", ls: [
    { id: "L1", n: 1, t: "音的性质与乐音体系", lab: "https://musiclab.chromeexperiments.com/Sound-Waves/", labN: "声波实验", ex: "pitch" },
    { id: "L2", n: 2, t: "音组、律制与泛音", lab: "https://musiclab.chromeexperiments.com/Harmonics/", labN: "泛音实验", ex: "interval" },
  ]},
  { id: "ch2", t: "第二章：记谱法", c: "#0F6E56", bg: "#E1F5EE", ls: [
    { id: "L3", n: 3, t: "谱号与谱表", lab: "https://musiclab.chromeexperiments.com/Piano-Roll/", labN: "钢琴卷帘", ex: "notation" },
    { id: "L4", n: 4, t: "音符与休止符", lab: "https://musiclab.chromeexperiments.com/Song-Maker/", labN: "歌曲创作器", ex: "notation" },
  ]},
  { id: "ch3", t: "第三章：装饰音与演奏符号", c: "#993556", bg: "#FBEAF0", ls: [
    { id: "L5", n: 5, t: "五种常见装饰音", lab: "https://musiclab.chromeexperiments.com/Melody-Maker/", labN: "旋律创作器", ex: "interval" },
    { id: "L6", n: 6, t: "演奏符号与乐谱分析", lab: "https://musiclab.chromeexperiments.com/Arpeggios/", labN: "琶音实验", ex: "chord" },
  ]},
  { id: "ch4", t: "第四章：略写记号与音乐术语", c: "#854F0B", bg: "#FAEEDA", ls: [
    { id: "L7", n: 7, t: "略写记号与演奏法", lab: "https://musiclab.chromeexperiments.com/Strings/", labN: "弦乐实验", ex: "interval" },
    { id: "L8", n: 8, t: "音乐术语", lab: "https://musiclab.chromeexperiments.com/Shared-Piano/", labN: "共享钢琴", ex: "terms" },
  ]},
  { id: "ch5", t: "第五章：节奏与节拍", c: "#993C1D", bg: "#FAECE7", ls: [
    { id: "L9", n: 9, t: "节奏与节拍基础", lab: "https://musiclab.chromeexperiments.com/Rhythm/", labN: "节奏实验", ex: "rhythm" },
    { id: "L10", n: 10, t: "音值组合", lab: "https://musiclab.chromeexperiments.com/Song-Maker/", labN: "歌曲创作器", ex: "rhythm" },
    { id: "L11", n: 11, t: "切分音与切分节奏", lab: "https://musiclab.chromeexperiments.com/Rhythm/", labN: "节奏实验", ex: "rhythm" },
    { id: "L12", n: 12, t: "综合复习与测评", lab: "https://musiclab.chromeexperiments.com/Song-Maker/", labN: "歌曲创作器", ex: "chord" },
  ]},
];

const CHAPTERS = LEGACY_CHAPTERS;
const ALL_LESSONS = CHAPTERS.flatMap(c => c.ls);

const LESSON_VIDEO_META = {
  L1: {
    minutes: 10,
    hook: "从 A4=440Hz 和日常听到的高低、强弱差异切入，帮助学生把抽象乐理转回声音经验。",
    goals: ["能区分音高、音值、音量、音色四个维度", "能说出乐音与噪音的差别", "能判断自然音级中的全音与半音"],
    wrap: "用钢琴键盘和频率、振幅图回到声音本身，完成第一课的概念建构。",
  },
  L2: {
    minutes: 11,
    hook: "从中央 C 定位和倍频关系入手，解释为什么乐音体系既是数学问题，也是听觉问题。",
    goals: ["理解音组与八度关系", "比较十二平均律、纯律与五度相生律", "解释泛音列、等音与音区概念"],
    wrap: "把音高体系、律制和泛音列三者关联起来，建立更完整的乐音结构观。",
  },
  L3: {
    minutes: 9,
    hook: "先解决学生最常见的识谱焦虑，再建立五线谱与谱号的定位规则。",
    goals: ["理解五线、四间与加线位置", "掌握高音谱号与低音谱号定位", "了解中音谱号的用途"],
    wrap: "通过位置记忆和乐器对照，把读谱从死记转为有参照的识别。",
  },
  L4: {
    minutes: 10,
    hook: "从节拍里的时值单位出发，解释为什么音符和休止符必须成系统地学习。",
    goals: ["识别常见音符与休止符", "掌握附点的延长规律", "能进行基础时值换算"],
    wrap: "用拍感和书写规则统一理解音符、休止符与附点。",
  },
  L5: {
    minutes: 11,
    hook: "同一条旋律为什么加上装饰音后更像真实音乐，这一课专门解决这个问题。",
    goals: ["辨认五种常见装饰音", "理解装饰音与主音的关系", "能在短句中判断装饰音的使用场景"],
    wrap: "把装饰音从单纯符号识别推进到风格化表达。",
  },
  L6: {
    minutes: 9,
    hook: "让学生知道乐谱不仅写音高时值，还在指挥演奏者怎么弹、怎么唱、怎么表达。",
    goals: ["识别力度层级", "理解速度术语区间", "掌握常见奏法与表情术语"],
    wrap: "把演奏指示读懂，才算真正读懂了一页乐谱。",
  },
  L7: {
    minutes: 8,
    hook: "这一课重点处理“为什么乐谱看起来结束了却还要回去演奏”的结构问题。",
    goals: ["识别反复和缩写记号", "判断乐段实际演奏顺序", "理解 8va/8vb 等移位记号"],
    wrap: "通过流程图理解结构记号，避免演奏路径判断错误。",
  },
  L8: {
    minutes: 9,
    hook: "音乐术语不是零散单词，而是音乐语境中的通用指令系统。",
    goals: ["分类记忆速度、力度、表情术语", "理解术语的常见语境", "掌握间隔复习策略"],
    wrap: "把术语学习从背单词转向分类检索与长期复现。",
  },
  L9: {
    minutes: 10,
    hook: "先把拍子感建立起来，再解释节奏为什么会在同样拍号下产生不同组织。",
    goals: ["区分节拍与节奏", "理解常见拍号含义", "把握 2/4、3/4、4/4、6/8 的强弱规律"],
    wrap: "用脉冲和重音模式把拍号学扎实，为后续节奏写作做准备。",
  },
  L10: {
    minutes: 12,
    hook: "这一课处理最容易写错的内容: 音值组合、连音与附点规则。",
    goals: ["掌握拍内组合原则", "理解连音线与附点的书写逻辑", "认识三连音与规范性问题"],
    wrap: "让学生知道“能写出来”和“写得规范”不是一回事。",
  },
  L11: {
    minutes: 11,
    hook: "切分音的难点不是记符号，而是感受重音为什么会被移位。",
    goals: ["理解切分的三种形成方式", "识别重音迁移", "能在节奏中找出切分位置"],
    wrap: "把切分音听觉效果、书写方式和风格应用连接起来。",
  },
  L12: {
    minutes: 15,
    hook: "最后一课不是重复，而是把前 11 课的概念串成一套完整的大学乐理基础框架。",
    goals: ["梳理十二课知识网络", "定位个人薄弱点", "形成后续自主复习路径"],
    wrap: "通过综合回顾、错因分析和应用迁移完成课程闭环。",
  },
};

const LESSON_COMMON_MISTAKES = {
  L1: ["把音高和音量混为一谈", "只会背 A4=440Hz，不会解释频率与音高的关系", "全音与半音位置判断不稳定"],
  L2: ["把律制当成纯记忆点，不理解用途", "不知道等音只在特定律制里成立", "泛音列与音色关系说不清"],
  L3: ["五线和线间位置混淆", "高音谱号与低音谱号定位点记反", "加线音符读谱速度太慢"],
  L4: ["附点时值加错", "音符与休止符对应关系不清", "拍子中时值换算不稳定"],
  L5: ["装饰音名称会认不会用", "前倚音、后倚音时值关系混淆", "忽视不同风格时期的处理差异"],
  L6: ["力度、速度、表情术语混类", "只记中文，不记原术语", "演奏指示不能和音乐效果对应"],
  L7: ["D.C.、D.S.、Fine、Coda 路径判断错误", "第一结尾与第二结尾处理混乱", "结构记号和演奏法记号混淆"],
  L8: ["术语记忆脱离乐谱语境", "速度和表情词混用", "没有按间隔复习巩固"],
  L9: ["拍号和节奏概念混淆", "6/8 拍按单拍子理解", "强弱拍规律记忆不牢"],
  L10: ["音值跨拍书写不规范", "连音线与圆滑线混淆", "三连音和附点节奏分不清"],
  L11: ["只看到符号，听不出重音迁移", "切分形成方式判断不完整", "弱拍强调和强拍休止不会分析"],
  L12: ["知识点会背但不会串联", "错题没有按类型复盘", "复习顺序只追求速度不追求结构"],
};

function splitLessonPoints(text) {
  return text
    .replace(/【/g, "")
    .replace(/】/g, "：")
    .replace(/\r/g, "")
    .split(/\n+|。|；/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^[-•]\s*/, ""));
}

function chunkLessonPoints(points, size = 3) {
  const chunks = [];
  for (let i = 0; i < points.length; i += size) {
    chunks.push(points.slice(i, i + size));
  }
  return chunks;
}

function formatTimeLabel(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildLessonMediaPlan(lesson) {
  const meta = LESSON_VIDEO_META[lesson.id] || {
    minutes: 10,
    level: "基础",
    hook: `围绕《${lesson.t}》进行结构化讲解。`,
    goals: ["完成概念理解", "完成例题观察", "完成课堂巩固"],
    wrap: "回顾本课核心知识点。",
  };
  const content = LESSON_CONTENT[lesson.id] || [];
  const sections = LESSON_LEARNING_SECTIONS[lesson.id] || [];
  const contentSection = sections.find((item) => item.title === "内容呈现")?.body || `围绕《${lesson.t}》进行知识呈现。`;
  const practiceSection = sections.find((item) => item.title === "课堂练习")?.body || "围绕本课重点进行练习。";
  const homeworkSection = sections.find((item) => item.title === "课后作业")?.body || `完成《${lesson.t}》课后作业。`;
  const pitfalls = LESSON_COMMON_MISTAKES[lesson.id] || ["回到概念定义", "回到书写规范", "回到课堂示例"];

  const derivedSlides = content.flatMap((section) => {
    const points = chunkLessonPoints(splitLessonPoints(section.b), 3).slice(0, 2);
    return points.map((chunk, index) => ({
      title: index === 0 ? section.h : `${section.h} · 深化`,
      subtitle: index === 0 ? "知识点展开" : "重点补充",
      bullets: chunk,
      note: `教师讲解时结合 ${section.h} 的谱例、钢琴演示或图表进行说明。`,
    }));
  });

  const slides = [
    {
      title: `第${lesson.n}课 ${lesson.t}`,
      subtitle: `大学乐理微课 · 预计 ${meta.minutes} 分钟`,
      bullets: [`难度定位：${meta.level}`, ...meta.goals],
      note: meta.hook,
    },
    ...derivedSlides,
    {
      title: "课堂示例与易错点",
      subtitle: "从大学课堂常见误区出发",
      bullets: pitfalls,
      note: `建议把“${practiceSection}”拆成 1 个示例演示和 1 个即时提问。`,
    },
    {
      title: "课堂练习设计",
      subtitle: "讲授后即时巩固",
      bullets: splitLessonPoints(practiceSection).slice(0, 4),
      note: "课堂练习应围绕本课核心知识，不额外引入未讲授的新概念。",
    },
    {
      title: "总结与课后延伸",
      subtitle: "形成学习闭环",
      bullets: [meta.wrap, homeworkSection, `建议用 2-3 分钟做课堂总结，布置课后追踪任务。`],
      note: "以“概念回顾 + 关键规则 + 课后作业”结束一节大学乐理微课。",
    },
  ];

  const segmentDraft = [
    {
      title: "导入与目标",
      focus: meta.hook,
      narration: `本节课主题是《${lesson.t}》。教师先用 1 个可感知的声音或谱例情境导入，再明确 ${meta.goals.join("、")} 这三个学习目标。`,
      visual: "课程标题页、学习目标、导入问题",
      weight: 1.2,
    },
    ...content.map((section) => ({
      title: section.h,
      focus: splitLessonPoints(section.b).slice(0, 3).join("；"),
      narration: splitLessonPoints(section.b).slice(0, 4).join("；"),
      visual: `${section.h} 的关键图示、谱例或键盘示意`,
      weight: 2.2,
    })),
    {
      title: "课堂示范与易错点",
      focus: pitfalls.join("；"),
      narration: `这一段重点处理学生最容易混淆的地方：${pitfalls.join("；")}。教师应给出 1 个反例和 1 个正例。`,
      visual: "错误示例 vs 正确示例、教师板书提示",
      weight: 1.8,
    },
    {
      title: "练习过渡与总结",
      focus: `${practiceSection}；${homeworkSection}`,
      narration: `在完成知识讲授后，教师用课堂练习做即时检测，并在结尾布置课后作业：${homeworkSection}`,
      visual: "课堂练习题、作业要求、总结框图",
      weight: 1.4,
    },
  ];

  const totalSeconds = meta.minutes * 60;
  const totalWeight = segmentDraft.reduce((sum, item) => sum + item.weight, 0);
  let cursor = 0;
  const segments = segmentDraft.map((item, index) => {
    const rawSeconds = index === segmentDraft.length - 1
      ? totalSeconds - cursor
      : Math.max(50, Math.round((item.weight / totalWeight) * totalSeconds));
    const start = cursor;
    const end = index === segmentDraft.length - 1 ? totalSeconds : Math.min(totalSeconds, cursor + rawSeconds);
    cursor = end;
    return {
      ...item,
      start,
      end,
      timeLabel: `${formatTimeLabel(start)} - ${formatTimeLabel(end)}`,
    };
  });

  return {
    ...meta,
    teachingMode: "大学乐理课 · 讲授 + 例证 + 即时练习 + 课后迁移",
    slides,
    segments,
    totalSeconds,
    totalMinutesLabel: `${meta.minutes} 分钟`,
    practiceSection,
    homeworkSection,
  };
}

/* ─── Shared UI ─── */
function Stars({ value, onChange, size = 18 }) {
  const [hov, setHov] = useState(0);
  return (
    <div style={{ display: "flex", gap: 1 }}>
      {[1,2,3,4,5].map(s => (
        <span key={s}
          onClick={() => onChange && onChange(s)}
          onMouseEnter={() => setHov(s)}
          onMouseLeave={() => setHov(0)}
          style={{ cursor: onChange ? "pointer" : "default", fontSize: size, color: s <= (hov || value) ? "#EF9F27" : "#ccc", userSelect: "none" }}>
          {s <= (hov || value) ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
}

function PBar({ v, max, color = "#1D9E75" }) {
  const pct = max > 0 ? Math.round((v / max) * 100) : 0;
  return (
    <div style={{ height: 5, background: "var(--color-background-tertiary)", borderRadius: 3, overflow: "hidden", width: "100%" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.4s" }} />
    </div>
  );
}

function Tag({ children, color = "#0F6E56", bg = "#E1F5EE" }) {
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 10, background: bg, color }}>{children}</span>;
}

function FeedbackBar({ ok, msg, onNext }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", background: ok ? "#E1F5EE" : "#FCEBEB", border: `1px solid ${ok ? "#5DCAA5" : "#F09595"}`, marginTop: 10 }}>
      <span style={{ fontSize: 13, color: ok ? "#085041" : "#791F1F", fontWeight: 500 }}>{ok ? "✓ " : "✗ "}{msg}</span>
      {onNext && <button onClick={onNext} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 5, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer" }}>下一题 →</button>}
    </div>
  );
}

/* ─── Exercise: Pitch ─── */
function PitchExercise({ onScore }) {
  const [target, setTarget] = useState(null);
  const [fb, setFb] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(null);

  const generate = useCallback(() => {
    const allKeys = [...WK, ...BK];
    const idx = allKeys[Math.floor(Math.random() * allKeys.length)];
    setTarget(idx);
    setFb(null);
  }, []);

  useEffect(() => { generate(); }, [generate]);

  const handleKey = async (idx) => {
    await unlockAudioSystem();
    playTone(nFreq(NT[idx], 4));
    setActive(idx);
    setTimeout(() => setActive(null), 200);
    if (target === null || fb) return;
    const ok = idx === target;
    const newC = correct + (ok ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    setFb({ ok, msg: ok ? `正确！${NT[target]}（${CN[target]}）` : `错误，正确答案是 ${NT[target]}（${CN[target]}）` });
    onScore(Math.min(100, Math.round((newC / newT) * 100)));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <Tag>音高识别</Tag>
        <Tag color="#085041" bg="#E1F5EE">{correct}/{total}</Tag>
      </div>
      {target !== null && (
        <div style={{ textAlign: "center", padding: 14, background: "var(--color-background-secondary)", borderRadius: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>找到这个音</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#534AB7" }}>{NT[target]} <span style={{ fontSize: 15, color: "var(--color-text-secondary)" }}>({CN[target]})</span></div>
        </div>
      )}
      <div style={{ position: "relative", height: 120, margin: "0 auto", width: WK.length * 36, userSelect: "none" }}>
        {WK.map((ni, i) => (
          <div key={ni} onClick={() => handleKey(ni)} style={{
            position: "absolute", left: i * 36, top: 0, width: 34, height: 112,
            background: active === ni ? "#E1F5EE" : "var(--color-background-primary)",
            border: "1px solid var(--color-border-secondary)", borderRadius: "0 0 5px 5px",
            cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center",
            paddingBottom: 5, fontSize: 10, color: "var(--color-text-tertiary)", zIndex: 1
          }}>{NT[ni]}</div>
        ))}
        {BK.map(ni => {
          const wPos = WK.filter(w => w < ni).length;
          return (
            <div key={ni} onClick={() => handleKey(ni)} style={{
              position: "absolute", left: wPos * 36 - 12, top: 0, width: 24, height: 72,
              background: active === ni ? "#534AB7" : "#2C2C2A", borderRadius: "0 0 3px 3px",
              cursor: "pointer", zIndex: 2, display: "flex", alignItems: "flex-end",
              justifyContent: "center", paddingBottom: 4, fontSize: 9, color: "#999"
            }}>{NT[ni]}</div>
          );
        })}
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} onNext={generate} />}
    </div>
  );
}

/* ─── Exercise: Intervals ─── */
function IntervalExercise({ onScore }) {
  const [q, setQ] = useState(null);
  const [fb, setFb] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const generate = useCallback(() => {
    const iv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
    const rootIdx = WK[Math.floor(Math.random() * 7)];
    setQ({ iv, root: NT[rootIdx] });
    setFb(null);
  }, []);

  useEffect(() => { generate(); }, [generate]);

  const hear = async () => {
    if (!q) return;
    await unlockAudioSystem();
    const f = nFreq(q.root, 4);
    playTone(f, 0.5);
    setTimeout(() => playTone(f * Math.pow(2, q.iv.s / 12), 0.5), 400);
  };

  const answer = (name) => {
    if (!q || fb) return;
    const ok = name === q.iv.n;
    const newC = correct + (ok ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    setFb({ ok, msg: ok ? `正确！${q.iv.n}（${q.iv.s}个半音）` : `错误，答案是${q.iv.n}（${q.iv.s}半音）` });
    onScore(Math.min(100, Math.round((newC / newT) * 100)));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>根音: <strong>{q && q.root}</strong></span>
        <Tag color="#085041" bg="#E1F5EE">{correct}/{total}</Tag>
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button onClick={hear} style={{ padding: "8px 20px", borderRadius: 14, background: "#534AB7", color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>♪ 播放音程</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 5 }}>
        {INTERVALS.map(iv => (
          <button key={iv.n} onClick={() => answer(iv.n)} disabled={!!fb}
            style={{ padding: "7px 3px", borderRadius: 5, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", cursor: fb ? "default" : "pointer", fontSize: 12, fontWeight: 500, opacity: fb ? 0.6 : 1 }}>
            {iv.n}
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{iv.s}半音</div>
          </button>
        ))}
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} onNext={generate} />}
    </div>
  );
}

/* ─── Exercise: Chords ─── */
function ChordExercise({ onScore }) {
  const [q, setQ] = useState(null);
  const [fb, setFb] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const generate = useCallback(() => {
    const ch = CHORDS[Math.floor(Math.random() * CHORDS.length)];
    const ri = WK[Math.floor(Math.random() * 7)];
    setQ({ ch, root: NT[ri], ri });
    setFb(null);
  }, []);

  useEffect(() => { generate(); }, [generate]);

  const playChord = async () => {
    if (!q) return;
    await unlockAudioSystem();
    const f = nFreq(q.root, 4);
    q.ch.iv.forEach((s, i) => setTimeout(() => playTone(f * Math.pow(2, s / 12), 0.7, "piano"), i * 60));
  };

  const answer = (name) => {
    if (!q || fb) return;
    const ok = name === q.ch.n;
    const notes = q.ch.iv.map(s => NT[(q.ri + s) % 12]).join("–");
    const newC = correct + (ok ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    setFb({ ok, msg: ok ? `正确！${notes}` : `错误，答案：${q.ch.n}（${notes}）` });
    onScore(Math.min(100, Math.round((newC / newT) * 100)));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>根音: <strong>{q && q.root}</strong></span>
        <Tag color="#0C447C" bg="#E6F1FB">{correct}/{total}</Tag>
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button onClick={playChord} style={{ padding: "8px 20px", borderRadius: 14, background: "#185FA5", color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>♪ 播放和弦</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 5 }}>
        {CHORDS.map(ch => (
          <button key={ch.n} onClick={() => answer(ch.n)} disabled={!!fb}
            style={{ padding: "8px", borderRadius: 5, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", cursor: fb ? "default" : "pointer", fontSize: 12, fontWeight: 500, opacity: fb ? 0.6 : 1 }}>
            {ch.n}
          </button>
        ))}
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} onNext={generate} />}
    </div>
  );
}

/* ─── Exercise: Notation ─── */
function NotationExercise({ onScore }) {
  const [clef, setClef] = useState(0);
  const [note, setNote] = useState(null);
  const [fb, setFb] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const trebleNotes = ["E4","F4","G4","A4","B4","C5","D5"];
  const bassNotes = ["G2","A2","B2","C3","D3","E3","F3"];
  const trebleY = { E4: 80, F4: 72, G4: 64, A4: 56, B4: 48, C5: 40, D5: 32 };
  const bassY = { G2: 80, A2: 72, B2: 64, C3: 56, D3: 48, E3: 40, F3: 32 };

  const generate = useCallback(() => {
    const pool = clef === 0 ? trebleNotes : bassNotes;
    setNote(pool[Math.floor(Math.random() * pool.length)]);
    setFb(null);
  }, [clef]);

  useEffect(() => { generate(); }, [generate]);

  const yPos = note ? ((clef === 0 ? trebleY : bassY)[note] || 48) : 48;

  const answer = (letter) => {
    if (!note || fb) return;
    const ok = letter === note[0];
    const newC = correct + (ok ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    setFb({ ok, msg: ok ? `正确！${note}` : `错误，答案是 ${note}` });
    onScore(Math.min(100, Math.round((newC / newT) * 100)));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
        {["𝄞 高音", "𝄢 低音"].map((label, i) => (
          <button key={i} onClick={() => setClef(i)} style={{ flex: 1, padding: "5px", borderRadius: 5, fontSize: 12, cursor: "pointer", background: i === clef ? "#FAEEDA" : "transparent", border: `1px solid ${i === clef ? "#EF9F27" : "var(--color-border-tertiary)"}`, color: i === clef ? "#633806" : "var(--color-text-secondary)", fontWeight: 500 }}>{label}</button>
        ))}
        <Tag color="#633806" bg="#FAEEDA">{correct}/{total}</Tag>
      </div>
      <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12, textAlign: "center", marginBottom: 8 }}>
        <svg width="220" height="92" viewBox="0 0 220 92">
          {[16,32,48,64,80].map((y, i) => <line key={i} x1="24" y1={y} x2="200" y2={y} stroke="var(--color-border-secondary)" strokeWidth="0.7" />)}
          <text x="6" y="54" fontSize="30" fill="var(--color-text-secondary)" fontFamily="serif">{clef === 0 ? "𝄞" : "𝄢"}</text>
          {note && (
            <>
              <ellipse cx="120" cy={yPos} rx="8" ry="5.5" fill="#854F0B" transform={`rotate(-10 120 ${yPos})`} />
              <line x1="128" y1={yPos} x2="128" y2={yPos - 24} stroke="#854F0B" strokeWidth="1.5" />
            </>
          )}
        </svg>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {["C","D","E","F","G","A","B"].map(l => (
          <button key={l} onClick={() => answer(l)} disabled={!!fb}
            style={{ flex: 1, padding: "9px 0", borderRadius: 5, fontSize: 15, fontWeight: 600, border: "1px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", cursor: fb ? "default" : "pointer", opacity: fb ? 0.6 : 1 }}>
            {l}
          </button>
        ))}
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} onNext={generate} />}
    </div>
  );
}

/* ─── Exercise: Terms ─── */
function TermsExercise({ onScore }) {
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const term = TERMS[idx];

  const next = (knew) => {
    const newC = correct + (knew ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    onScore(Math.min(100, Math.round((newC / newT) * 100)));
    setShow(false);
    setIdx((idx + 1) % TERMS.length);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <Tag color="#3C3489" bg="#EEEDFE">间隔重复卡片</Tag>
        <Tag color="#085041" bg="#E1F5EE">{idx + 1}/{TERMS.length}</Tag>
      </div>
      <div onClick={() => setShow(true)} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 28, textAlign: "center", cursor: "pointer", marginBottom: 8, minHeight: 80 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#534AB7" }}>{term.t}</div>
        {show ? (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)" }}>{term.c}</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>{term.m}</div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 8 }}>点击翻转查看答案</div>
        )}
      </div>
      {show && (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => next(false)} style={{ flex: 1, padding: "9px", borderRadius: 6, border: "1px solid #F09595", background: "#FCEBEB", color: "#791F1F", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>不熟悉</button>
          <button onClick={() => next(true)} style={{ flex: 1, padding: "9px", borderRadius: 6, border: "1px solid #5DCAA5", background: "#E1F5EE", color: "#085041", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>已掌握</button>
        </div>
      )}
    </div>
  );
}

/* ─── Exercise: Rhythm ─── */
function RhythmExercise({ onScore }) {
  const [pi, setPi] = useState(0);
  const [taps, setTaps] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [fb, setFb] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const timerRef = useRef(null);

  const pat = RHYTHMS[pi];

  const doPlay = async () => {
    await unlockAudioSystem();
    setPlaying(true); setTaps([]); setFb(null);
    let i = 0;
    timerRef.current = setInterval(() => {
      setBeat(i);
      if (pat.p[i]) playTone(800, 0.04, "square", 0.12);
      i++;
      if (i >= 8) { clearInterval(timerRef.current); setTimeout(() => { setBeat(-1); setPlaying(false); }, 250); }
    }, 250);
  };

  const check = () => {
    const filled = Array.from({ length: 8 }, (_, i) => taps[i] || 0);
    const ok = filled.every((v, i) => v === pat.p[i]);
    const newC = correct + (ok ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    setFb({ ok, msg: ok ? "节奏正确！" : "节奏不匹配，再听一次" });
    onScore(Math.min(100, Math.round((newC / newT) * 100)));
  };

  useEffect(() => { return () => clearInterval(timerRef.current); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{pat.n}</span>
        <Tag color="#085041" bg="#E1F5EE">{correct}/{total}</Tag>
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button onClick={doPlay} disabled={playing} style={{ padding: "7px 20px", borderRadius: 14, background: "#993C1D", color: "#fff", border: "none", fontSize: 13, cursor: playing ? "default" : "pointer", opacity: playing ? 0.7 : 1 }}>
          {playing ? "播放中..." : "♪ 听一遍"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>参考：</div>
      <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
        {pat.p.map((v, i) => <div key={i} style={{ flex: 1, height: 28, borderRadius: 4, background: beat === i ? "#D85A30" : v ? "#F0997B" : "var(--color-background-tertiary)", transition: "all 0.1s" }} />)}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>你的（点击切换）：</div>
      <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} onClick={() => { if (!playing) setTaps(p => { const n = [...p]; n[i] = n[i] ? 0 : 1; return n; }); }}
            style={{ flex: 1, height: 28, borderRadius: 4, cursor: "pointer", background: taps[i] ? "#534AB7" : "var(--color-background-tertiary)", transition: "all 0.15s" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button onClick={check} disabled={playing} style={{ flex: 1, padding: "7px", borderRadius: 5, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 12 }}>检查</button>
        <button onClick={() => { setPi(i => (i + 1) % RHYTHMS.length); setTaps([]); setFb(null); }} style={{ flex: 1, padding: "7px", borderRadius: 5, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 12 }}>下一个</button>
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} />}
    </div>
  );
}

const EXERCISE_COMPONENTS = {
  pitch: PitchExercise,
  interval: IntervalExercise,
  chord: ChordExercise,
  notation: NotationExercise,
  terms: TermsExercise,
  rhythm: RhythmExercise,
};

/* ─── AI Tutor ─── */
function AITutor({ lessonId, lessonTitle }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const contentSections = LESSON_CONTENT[lessonId] || [];
  const contextText = contentSections.map(s => s.h + ": " + s.b).join("\n\n");

  useEffect(() => {
    setMsgs([{ role: "assistant", text: `你好！我是你的AI乐理导师。当前课程：「${lessonTitle}」\n\n你可以问我：\n• 解释本课的核心概念\n• 某个知识点的详细说明\n• 出一道练习题\n• 这些知识在实际中怎么应用\n\n请开始提问吧！` }]);
  }, [lessonId, lessonTitle]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput("");
    const updated = [...msgs, { role: "user", text: userText }];
    setMsgs(updated);
    setLoading(true);

    try {
      const apiMsgs = updated.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `你是一位专业的大学音乐理论教师和AI辅导员。当前课程：${lessonTitle}。\n课程内容：\n${contextText}\n\n规则：1.用中文回复 2.通俗易懂 3.可举中国学生熟悉的音乐例子 4.鼓励练习 5.简洁但完整`,
          messages: apiMsgs,
        }),
      });
      const data = await resp.json();
      if (data.content) {
        const text = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
        setMsgs(prev => [...prev, { role: "assistant", text }]);
      } else {
        setMsgs(prev => [...prev, { role: "assistant", text: "抱歉，请求出错。请重试。" }]);
      }
    } catch (e) {
      setMsgs(prev => [...prev, { role: "assistant", text: "网络错误，请检查连接后重试。" }]);
    }
    setLoading(false);
  };

  const quickQs = ["请解释本课核心概念", "给我出道练习题", "总结本课重点", "实际演奏中怎么应用"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 460, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "9px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 13, background: "linear-gradient(135deg,#534AB7,#7F77DD)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>AI</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>AI乐理导师</div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{lessonTitle}</div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "82%", padding: "9px 13px", borderRadius: 12, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
              background: m.role === "user" ? "#534AB7" : "var(--color-background-secondary)",
              color: m.role === "user" ? "#fff" : "var(--color-text-primary)",
              borderBottomRightRadius: m.role === "user" ? 2 : 12,
              borderBottomLeftRadius: m.role === "assistant" ? 2 : 12,
            }}>{m.text}</div>
          </div>
        ))}
        {loading && (
          <div style={{ padding: "9px 13px", borderRadius: 12, background: "var(--color-background-secondary)", fontSize: 13, color: "var(--color-text-tertiary)", alignSelf: "flex-start" }}>
            思考中...
          </div>
        )}
      </div>

      <div style={{ padding: "8px 10px", borderTop: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
          {quickQs.map((q, i) => (
            <button key={i} onClick={() => setInput(q)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-secondary)" }}>{q}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="输入你的问题..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 13, outline: "none", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
          <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "8px 16px", borderRadius: 8, background: loading ? "var(--color-background-tertiary)" : "#534AB7", color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: loading ? "default" : "pointer" }}>发送</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Music Creator ─── */
function MusicCreator() {
  const COLS = 16;
  const ROWS = 12;
  const scaleNotes = [0,2,4,5,7,9,11,12,14,16,17,19];
  const [grid, setGrid] = useState(() => Array.from({ length: ROWS }, () => Array(COLS).fill(false)));
  const [isPlaying, setIsPlaying] = useState(false);
  const [col, setCol] = useState(-1);
  const [bpm, setBpm] = useState(140);
  const [timbre, setTimbre] = useState("piano");
  const timerRef = useRef(null);

  const noteInfo = scaleNotes.map(s => ({ name: NT[s % 12], oct: 4 + Math.floor(s / 12) })).reverse();

  const toggle = async (r, c) => {
    await unlockAudioSystem();
    setGrid(prev => {
      const ng = prev.map(row => [...row]);
      ng[r][c] = !ng[r][c];
      if (ng[r][c]) {
        const info = noteInfo[r];
        playTone(nFreq(info.name, info.oct), 0.2, timbre);
      }
      return ng;
    });
  };

  const playSeq = async () => {
    await unlockAudioSystem();
    if (isPlaying) {
      clearInterval(timerRef.current);
      setIsPlaying(false);
      setCol(-1);
      return;
    }
    setIsPlaying(true);
    let c = 0;
    const ms = 60000 / bpm / 2;
    timerRef.current = setInterval(() => {
      setCol(c);
      for (let r = 0; r < ROWS; r++) {
        if (grid[r][c]) {
          const info = noteInfo[r];
          playTone(nFreq(info.name, info.oct), ms / 1000 * 1.5, timbre);
        }
      }
      c = (c + 1) % COLS;
    }, ms);
  };

  const clear = () => setGrid(Array.from({ length: ROWS }, () => Array(COLS).fill(false)));

  const randomize = () => {
    const ng = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (let c = 0; c < COLS; c++) {
      if (Math.random() > 0.35) {
        ng[Math.floor(Math.random() * ROWS)][c] = true;
      }
    }
    setGrid(ng);
  };

  useEffect(() => { return () => clearInterval(timerRef.current); }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={playSeq} style={{ padding: "6px 14px", borderRadius: 7, background: isPlaying ? "#A32D2D" : "#534AB7", color: "#fff", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            {isPlaying ? "⏹ 停止" : "▶ 播放"}
          </button>
          <button onClick={clear} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 11 }}>清空</button>
          <button onClick={randomize} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 11 }}>随机</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>BPM:{bpm}</label>
          <input type="range" min="60" max="200" step="5" value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ width: 70 }} />
          <select value={timbre} onChange={e => setTimbre(e.target.value)} style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--color-border-tertiary)" }}>
            <option value="sine">正弦波</option>
            <option value="triangle">三角波</option>
            <option value="square">方波</option>
            <option value="sawtooth">锯齿波</option>
          </select>
        </div>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
          {noteInfo.map((info, r) => (
            <div key={r} style={{ display: "flex", alignItems: "center", gap: 1 }}>
              <div style={{ width: 32, fontSize: 9, color: "var(--color-text-tertiary)", textAlign: "right", paddingRight: 3, flexShrink: 0 }}>{info.name}{info.oct}</div>
              {Array.from({ length: COLS }, (_, c) => (
                <div key={c} onClick={() => toggle(r, c)} style={{
                  width: 26, height: 22, borderRadius: 3, cursor: "pointer",
                  background: grid[r][c] ? (col === c ? "#7F77DD" : "#534AB7") : col === c ? "rgba(127,119,221,0.12)" : c % 4 === 0 ? "var(--color-background-secondary)" : "var(--color-background-tertiary)",
                  border: `0.5px solid ${grid[r][c] ? "#534AB7" : "var(--color-border-tertiary)"}`,
                  transition: "background 0.08s",
                }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AITutorV2({ lessonId, lessonTitle }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const contentSections = LESSON_CONTENT[lessonId] || [];
  const contextText = contentSections.map((s) => s.h + ": " + s.b).join("\n\n");

  const normalizeAiText = (text) => String(text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  useEffect(() => {
    setMsgs([{
      role: "assistant",
      text: `你好，我是你的 AI 乐理导师。当前课程：${lessonTitle}\n\n你可以问我：\n• 解释本课核心概念\n• 某个知识点的详细说明\n• 出一道练习题\n• 这些知识在实际中怎么应用\n\n请开始提问吧。`,
    }]);
  }, [lessonId, lessonTitle]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  const send = async () => {
    if ((!input.trim() && !imageDataUrl) || loading) return;
    const userText = input.trim();
    setInput("");
    const updated = [...msgs, { role: "user", text: userText || "请结合我上传的图片进行讲解。", imageDataUrl, imageName }];
    setMsgs(updated);
    setLoading(true);

    try {
      const apiMsgs = updated.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text,
        imageDataUrl: m.imageDataUrl || undefined,
        imageName: m.imageName || undefined,
      }));
      const resp = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1000,
          system: `你是一位专业的大学音乐理论教师和 AI 辅导员。当前课程：${lessonTitle}。\n课程内容：\n${contextText}\n\n规则：1. 用中文回复 2. 通俗易懂 3. 结合常见音乐例子 4. 鼓励练习 5. 不使用 Markdown 标题或加粗符号`,
          messages: apiMsgs,
        }),
      });
      const data = await resp.json();
      if (data.text) {
        const text = normalizeAiText(data.text);
        setMsgs((prev) => [...prev, { role: "assistant", text }]);
      } else {
        setMsgs((prev) => [...prev, { role: "assistant", text: data.detail || "抱歉，请求出错。请重试。" }]);
      }
    } catch {
      setMsgs((prev) => [...prev, { role: "assistant", text: "网络错误，请检查连接后重试。" }]);
    }
    setImageDataUrl("");
    setImageName("");
    setLoading(false);
  };

  const handlePickImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsgs((prev) => [...prev, { role: "assistant", text: "请上传图片文件。" }]);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result || ""));
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const quickQs = ["请解释本课核心概念", "给我出一道练习题", "总结本课重点", "实际演奏中怎么应用"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 460, border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "9px 14px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 13, background: "linear-gradient(135deg,#534AB7,#7F77DD)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>AI</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>AI 乐理导师</div>
          <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{lessonTitle}</div>
        </div>
      </div>

      {false && <div style={{ padding: "8px 12px", borderBottom: "0.5px solid var(--color-border-tertiary)", background: "#F6F3FF", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 11, color: "#534AB7" }}>
          {audioReady ? "声音已启用，手机端可播放真实钢琴采样。" : "手机端若无声，请先点击“启用声音”。"}
        </div>
        <button onClick={unlockAudio} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #B6ACEB", background: "#fff", color: "#534AB7", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
          启用声音
        </button>
      </div>}

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "82%", padding: "9px 13px", borderRadius: 12, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
              background: m.role === "user" ? "#534AB7" : "var(--color-background-secondary)",
              color: m.role === "user" ? "#fff" : "var(--color-text-primary)",
              borderBottomRightRadius: m.role === "user" ? 2 : 12,
              borderBottomLeftRadius: m.role === "assistant" ? 2 : 12,
            }}>
              {m.imageDataUrl && <img src={m.imageDataUrl} alt={m.imageName || "uploaded"} style={{ display: "block", maxWidth: 220, borderRadius: 10, marginBottom: m.text ? 8 : 0 }} />}
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ padding: "9px 13px", borderRadius: 12, background: "var(--color-background-secondary)", fontSize: 13, color: "var(--color-text-tertiary)", alignSelf: "flex-start" }}>
            思考中...
          </div>
        )}
      </div>

      <div style={{ padding: "8px 10px", borderTop: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
          {quickQs.map((q, i) => (
            <button key={i} onClick={() => setInput(q)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 12, border: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-primary)", cursor: "pointer", color: "var(--color-text-secondary)" }}>{q}</button>
          ))}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePickImage} style={{ display: "none" }} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePickImage} style={{ display: "none" }} />
        {imageDataUrl && <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
          <img src={imageDataUrl} alt={imageName || "preview"} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#111111" }}>已选择图片</div>
            <div style={{ fontSize: 10, color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{imageName}</div>
          </div>
          <button onClick={() => { setImageDataUrl(""); setImageName(""); if (fileInputRef.current) fileInputRef.current.value = ""; }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.08)", background: "#f5f5f5", cursor: "pointer", fontSize: 11 }}>移除</button>
        </div>}
        {false && <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
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
          {homeworkRequirement.channels.includes("text") && <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>文字说明</div>
            <textarea
              value={homeworkDraft}
              onChange={(e) => setHomeworkDraft(e.target.value)}
              placeholder="可在这里补充概念解释、作业思路、节奏分析、音高判断依据或对拍照内容的说明。"
              style={{ width: "100%", minHeight: 140, borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", padding: 12, fontSize: 12, lineHeight: 1.8, resize: "vertical", outline: "none" }}
            />
          </div>}
          {homeworkRequirement.channels.includes("text") && <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
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
          </div>}
        </div>}
        {false && showHomeworkDialog && <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.36)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ width: "min(640px, 100%)", background: "#ffffff", borderRadius: 16, padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>确认提交课后作业</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
              当前剩余时间 {formattedHomeworkTime}，提交后将生成 AI 初评结果并同步到教师后台。
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
        <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 8 }}>
          手机端可直接点击“拍照上传”，调起相机拍照后让 AI 结合图片解答。
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="输入你的问题，或上传图片后提问..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", fontSize: 13, outline: "none", background: "var(--color-background-primary)", color: "var(--color-text-primary)" }} />
          <button onClick={() => cameraInputRef.current?.click()} style={{ padding: "8px 12px", borderRadius: 8, background: "#ffffff", color: "#111111", border: "1px solid rgba(17,17,17,0.08)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>拍照上传</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "8px 12px", borderRadius: 8, background: "#ffffff", color: "#111111", border: "1px solid rgba(17,17,17,0.08)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>相册上传</button>
          <button onClick={send} disabled={loading || (!input.trim() && !imageDataUrl)} style={{ padding: "8px 16px", borderRadius: 8, background: loading ? "var(--color-background-tertiary)" : "#534AB7", color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: loading ? "default" : "pointer" }}>发送</button>
        </div>
      </div>
    </div>
  );
}

function MusicCreatorV2() {
  const COLS = 16;
  const ROWS = 12;
  const scaleNotes = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
  const [grid, setGrid] = useState(() => Array.from({ length: ROWS }, () => Array(COLS).fill(false)));
  const [isPlaying, setIsPlaying] = useState(false);
  const [col, setCol] = useState(-1);
  const [bpm, setBpm] = useState(140);
  const [timbre, setTimbre] = useState("piano");
  const timerRef = useRef(null);

  const noteInfo = scaleNotes.map((s) => ({ name: NT[s % 12], oct: 4 + Math.floor(s / 12) })).reverse();

  const toggle = async (r, c) => {
    await unlockAudioSystem();
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = !next[r][c];
      if (next[r][c]) {
        const info = noteInfo[r];
        playTone(nFreq(info.name, info.oct), 0.25, timbre);
      }
      return next;
    });
  };

  const playSeq = async () => {
    await unlockAudioSystem();
    if (isPlaying) {
      clearInterval(timerRef.current);
      setIsPlaying(false);
      setCol(-1);
      return;
    }

    setIsPlaying(true);
    let currentCol = 0;
    const stepMs = 60000 / bpm / 2;
    timerRef.current = setInterval(() => {
      setCol(currentCol);
      for (let r = 0; r < ROWS; r++) {
        if (grid[r][currentCol]) {
          const info = noteInfo[r];
          playTone(nFreq(info.name, info.oct), stepMs / 1000 * 1.5, timbre);
        }
      }
      currentCol = (currentCol + 1) % COLS;
    }, stepMs);
  };

  const clear = () => setGrid(Array.from({ length: ROWS }, () => Array(COLS).fill(false)));

  const randomize = () => {
    const next = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    for (let c = 0; c < COLS; c++) {
      if (Math.random() > 0.35) {
        next[Math.floor(Math.random() * ROWS)][c] = true;
      }
    }
    setGrid(next);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={playSeq} style={{ padding: "6px 14px", borderRadius: 7, background: isPlaying ? "#A32D2D" : "#534AB7", color: "#fff", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            {isPlaying ? "停止" : "播放"}
          </button>
          <button onClick={clear} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 11 }}>清空</button>
          <button onClick={randomize} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 11 }}>随机</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>BPM:{bpm}</label>
          <input type="range" min="60" max="200" step="5" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} style={{ width: 70 }} />
          <select value={timbre} onChange={(e) => setTimbre(e.target.value)} style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--color-border-tertiary)" }}>
            <option value="piano">钢琴</option>
            <option value="sine">正弦波</option>
            <option value="triangle">三角波</option>
            <option value="square">方波</option>
            <option value="sawtooth">锯齿波</option>
          </select>
        </div>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
          {noteInfo.map((info, r) => (
            <div key={r} style={{ display: "flex", alignItems: "center", gap: 1 }}>
              <div style={{ width: 32, fontSize: 9, color: "var(--color-text-tertiary)", textAlign: "right", paddingRight: 3, flexShrink: 0 }}>{info.name}{info.oct}</div>
              {Array.from({ length: COLS }, (_, c) => (
                <div
                  key={c}
                  onClick={() => toggle(r, c)}
                  style={{
                    width: 26,
                    height: 22,
                    borderRadius: 3,
                    cursor: "pointer",
                    background: grid[r][c]
                      ? (col === c ? "#7F77DD" : "#534AB7")
                      : col === c
                        ? "rgba(127,119,221,0.12)"
                        : c % 4 === 0
                          ? "var(--color-background-secondary)"
                          : "var(--color-background-tertiary)",
                    border: `0.5px solid ${grid[r][c] ? "#534AB7" : "var(--color-border-tertiary)"}`,
                    transition: "background 0.08s",
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LessonChartsLegacy({ lessonId }) {
  if (lessonId === "L1") {
    const waveData = [18, 28, 40, 56, 74];
    const loudness = [20, 38, 52, 76, 92];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(83,74,183,0.08)", border: "1px solid rgba(83,74,183,0.12)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#3C3489" }}>音高与频率关系</div>
          <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>
            <line x1="18" y1="110" x2="242" y2="110" stroke="#C7CBE8" />
            <line x1="18" y1="18" x2="18" y2="110" stroke="#C7CBE8" />
            {waveData.map((v, i) => (
              <g key={i}>
                <rect x={32 + i * 40} y={110 - v} width="24" height={v} rx="8" fill="#534AB7" />
                <text x={44 + i * 40} y="124" textAnchor="middle" fontSize="10" fill="#6B7280">{["C3","G3","C4","G4","C5"][i]}</text>
              </g>
            ))}
          </svg>
        </div>
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(15,110,86,0.08)", border: "1px solid rgba(15,110,86,0.12)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#0F6E56" }}>音量与振幅示意</div>
          <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>
            {loudness.map((v, i) => (
              <g key={i}>
                <rect x={26 + i * 44} y={110 - v} width="28" height={v} rx="10" fill="#1D9E75" />
                <text x={40 + i * 44} y="124" textAnchor="middle" fontSize="10" fill="#6B7280">{["pp","p","mp","mf","f"][i]}</text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  }

  if (lessonId === "L2") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(24,95,165,0.08)", border: "1px solid rgba(24,95,165,0.12)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#185FA5" }}>十二平均律比例</div>
          <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>
            {[0,1,2,3,4,5,6].map((i) => (
              <g key={i}>
                <circle cx={28 + i * 32} cy={70 - i * 5} r={9 + i * 1.8} fill="rgba(24,95,165,0.12)" stroke="#185FA5" />
                <text x={28 + i * 32} y="118" textAnchor="middle" fontSize="10" fill="#6B7280">{i}</text>
              </g>
            ))}
          </svg>
        </div>
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(153,60,29,0.08)", border: "1px solid rgba(153,60,29,0.12)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#993C1D" }}>泛音列示意</div>
          <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>
            {[1,2,3,4,5,6].map((n, i) => (
              <g key={n}>
                <line x1={26 + i * 36} y1="110" x2={26 + i * 36} y2={110 - n * 12} stroke="#993C1D" strokeWidth="10" strokeLinecap="round" />
                <text x={26 + i * 36} y="124" textAnchor="middle" fontSize="10" fill="#6B7280">{n}f</text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    );
  }

  return null;
}

/* ─── Lesson View ─── */
function LessonCharts({ lessonId }) {
  const wrapStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 14 };
  const cardStyle = { padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" };
  const titleStyle = { fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#111111" };

  const card = (title, body) => (
    <div style={cardStyle}>
      <div style={titleStyle}>{title}</div>
      {body}
    </div>
  );

  const charts = {
    L1: [
      card("音高与频率关系", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[18, 28, 40, 56, 74].map((v, i) => <g key={i}><rect x={32 + i * 40} y={110 - v} width="24" height={v} rx="8" fill="#111111" /><text x={44 + i * 40} y="124" textAnchor="middle" fontSize="10" fill="#6B7280">{["C3", "G3", "C4", "G4", "C5"][i]}</text></g>)}</svg>),
      card("音量与振幅示意", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[20, 38, 52, 76, 92].map((v, i) => <g key={i}><rect x={26 + i * 44} y={110 - v} width="28" height={v} rx="10" fill="#4A4A4A" /><text x={40 + i * 44} y="124" textAnchor="middle" fontSize="10" fill="#6B7280">{["pp", "p", "mp", "mf", "f"][i]}</text></g>)}</svg>),
    ],
    L2: [
      card("十二平均律比例", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[0, 1, 2, 3, 4, 5, 6].map((i) => <g key={i}><circle cx={28 + i * 32} cy={70 - i * 5} r={9 + i * 1.8} fill="rgba(17,17,17,0.06)" stroke="#111111" /><text x={28 + i * 32} y="118" textAnchor="middle" fontSize="10" fill="#6B7280">{i}</text></g>)}</svg>),
      card("泛音列示意", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[1, 2, 3, 4, 5, 6].map((n, i) => <g key={n}><line x1={26 + i * 36} y1="110" x2={26 + i * 36} y2={110 - n * 12} stroke="#222222" strokeWidth="10" strokeLinecap="round" /><text x={26 + i * 36} y="124" textAnchor="middle" fontSize="10" fill="#6B7280">{n}f</text></g>)}</svg>),
    ],
    L3: [
      card("高音谱号音高分布", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[22, 40, 58, 76, 94].map((y, i) => <line key={i} x1="28" y1={y} x2="228" y2={y} stroke="#C9C9C9" />)}{[0, 1, 2, 3].map((i) => <g key={i}><ellipse cx={90 + i * 28} cy={94 - i * 18} rx="9" ry="6" fill="#111111" transform={`rotate(-14 ${90 + i * 28} ${94 - i * 18})`} /><line x1={98 + i * 28} y1={94 - i * 18} x2={98 + i * 28} y2={58 - i * 18} stroke="#111111" /></g>)}</svg>),
      card("低音谱号音区层次", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[0, 1, 2].map((i) => <g key={i}><rect x={30 + i * 66} y={36 + i * 10} width="46" height={58 - i * 8} rx="12" fill={["#111111", "#555555", "#9B9B9B"][i]} /><text x={53 + i * 66} y="114" textAnchor="middle" fontSize="10" fill="#6B7280">{["低音区", "中音区", "高音区"][i]}</text></g>)}</svg>),
    ],
    L4: [
      card("常见音符时值对比", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[88, 62, 36, 18].map((v, i) => <g key={i}><rect x={26 + i * 54} y={112 - v} width="30" height={v} rx="10" fill="#111111" /><text x={41 + i * 54} y="124" textAnchor="middle" fontSize="10" fill="#6B7280">{["全音符", "二分", "四分", "八分"][i]}</text></g>)}</svg>),
      card("休止符时值比例", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[4, 2, 1, 0.5].map((v, i) => <g key={i}><circle cx={40 + i * 54} cy="66" r={10 + v * 6} fill="rgba(17,17,17,0.1)" stroke="#111111" /><text x={40 + i * 54} y="118" textAnchor="middle" fontSize="10" fill="#6B7280">{["全休", "二分休", "四分休", "八分休"][i]}</text></g>)}</svg>),
    ],
    L5: [
      card("装饰音密度变化", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[1, 2, 4, 6, 8].map((v, i) => <g key={i}>{Array.from({ length: v }, (_, j) => <circle key={j} cx={28 + i * 44 + j * 3} cy={88 - j * 5} r="2.5" fill="#111111" />)}<text x={40 + i * 44} y="120" textAnchor="middle" fontSize="10" fill="#6B7280">{["倚音", "回音", "波音", "颤音", "群音"][i]}</text></g>)}</svg>),
      card("装饰音时长占比", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[24, 34, 44, 28, 18].map((v, i) => <rect key={i} x="28" y={18 + i * 20} width={v * 3.6} height="10" rx="5" fill={i % 2 === 0 ? "#111111" : "#5B5B5B"} />)}</svg>),
    ],
    L6: [
      card("力度层级", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{["pp", "p", "mp", "mf", "f", "ff"].map((label, i) => <g key={label}><rect x={20 + i * 38} y={94 - i * 10} width="24" height={22 + i * 10} rx="8" fill="#111111" opacity={0.25 + i * 0.12} /><text x={32 + i * 38} y="122" textAnchor="middle" fontSize="10" fill="#6B7280">{label}</text></g>)}</svg>),
      card("速度术语区间", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[["Largo", 44], ["Andante", 76], ["Moderato", 102], ["Allegro", 132], ["Presto", 172]].map(([label, bpm], i) => <g key={label}><line x1={24 + i * 46} y1="104" x2={24 + i * 46} y2={104 - (Number(bpm) - 30) / 2} stroke="#111111" strokeWidth="8" strokeLinecap="round" /><text x={24 + i * 46} y="122" textAnchor="middle" fontSize="9" fill="#6B7280">{label}</text></g>)}</svg>),
    ],
    L7: [
      card("反复结构路径", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}><path d="M20 80 H90 Q110 80 110 60 V40 H180" fill="none" stroke="#111111" strokeWidth="4" strokeLinecap="round" /><path d="M110 60 Q120 92 154 92 H228" fill="none" stroke="#5D5D5D" strokeWidth="4" strokeLinecap="round" />{["A", "Repeat", "B", "Coda"].map((t, i) => <text key={t} x={[20, 88, 178, 220][i]} y={[96, 96, 30, 106][i]} fontSize="10" fill="#6B7280">{t}</text>)}</svg>),
      card("常见缩写出现频率", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[68, 52, 42, 34].map((v, i) => <g key={i}><rect x={34 + i * 48} y={110 - v} width="26" height={v} rx="8" fill="#111111" /><text x={47 + i * 48} y="124" textAnchor="middle" fontSize="10" fill="#6B7280">{["D.C.", "D.S.", "Fine", "Coda"][i]}</text></g>)}</svg>),
    ],
    L8: [
      card("术语类别分布", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[30, 46, 62].map((r, i) => <circle key={i} cx={72 + i * 64} cy="62" r={r / 3} fill="rgba(17,17,17,0.08)" stroke="#111111" />)}{["速度", "力度", "表情"].map((t, i) => <text key={t} x={72 + i * 64} y="116" textAnchor="middle" fontSize="10" fill="#6B7280">{t}</text>)}</svg>),
      card("复习节奏建议", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[1, 3, 7, 14, 30].map((d, i) => <g key={d}><circle cx={26 + i * 46} cy={92 - i * 12} r="7" fill="#111111" /><text x={26 + i * 46} y="118" textAnchor="middle" fontSize="10" fill="#6B7280">{d}d</text></g>)}<path d="M26 92 C60 84, 100 68, 210 42" fill="none" stroke="#7B7B7B" strokeWidth="3" strokeDasharray="5 4" /></svg>),
    ],
    L9: [
      card("常见拍号重音结构", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[[70, 40], [74, 46, 38], [76, 42, 54, 40]].map((arr, row) => <g key={row}>{arr.map((h, i) => <rect key={i} x={24 + i * 30} y={24 + row * 30 + (18 - h / 6)} width="16" height={h / 6} rx="6" fill="#111111" opacity={0.28 + i * 0.12} />)}<text x="182" y={38 + row * 30} fontSize="10" fill="#6B7280">{["2/4", "3/4", "4/4"][row]}</text></g>)}</svg>),
      card("节拍脉冲示意", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{Array.from({ length: 8 }, (_, i) => <circle key={i} cx={24 + i * 28} cy={i % 2 === 0 ? 54 : 76} r={i % 4 === 0 ? 9 : 6} fill="#111111" opacity={i % 4 === 0 ? 1 : 0.45} />)}</svg>),
    ],
    L10: [
      card("音值组合切分", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[42, 26, 58, 34, 46].map((w, i) => <rect key={i} x={22 + [0, 46, 76, 138, 176][i]} y="46" width={w} height="26" rx="8" fill={i % 2 === 0 ? "#111111" : "#6A6A6A"} />)}</svg>),
      card("附点与连音延长", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}><ellipse cx="42" cy="66" rx="10" ry="7" fill="#111111" transform="rotate(-16 42 66)" /><line x1="50" y1="66" x2="50" y2="34" stroke="#111111" /><circle cx="64" cy="68" r="3.5" fill="#111111" /><path d="M92 66 C120 44, 154 44, 182 66" fill="none" stroke="#444444" strokeWidth="4" strokeLinecap="round" /><ellipse cx="196" cy="66" rx="10" ry="7" fill="#111111" transform="rotate(-16 196 66)" /></svg>),
    ],
    L11: [
      card("切分重音迁移", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[18, 44, 72, 98, 126, 154, 182, 210].map((x, i) => <rect key={i} x={x} y={i === 3 || i === 4 ? 34 : 56} width="14" height={i === 3 || i === 4 ? 50 : 28} rx="7" fill="#111111" opacity={i === 3 || i === 4 ? 1 : 0.45} />)}</svg>),
      card("弱拍强调示意", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}><path d="M20 78 Q52 42 84 78 T148 78 T212 78" fill="none" stroke="#111111" strokeWidth="4" />{[52, 116, 180].map((x) => <circle key={x} cx={x} cy="48" r="6" fill="#111111" />)}</svg>),
    ],
    L12: [
      card("全课程知识雷达", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}><polygon points="130,18 178,40 190,84 130,108 72,84 84,40" fill="rgba(17,17,17,0.08)" stroke="#111111" /><polygon points="130,34 164,48 172,78 130,94 90,78 98,48" fill="rgba(17,17,17,0.12)" stroke="#444444" /></svg>),
      card("综合能力进阶路径", <svg viewBox="0 0 260 130" style={{ width: "100%", height: 130 }}>{[["基础", 94], ["记谱", 76], ["术语", 60], ["节奏", 44], ["综合", 28]].map(([label, y], i) => <g key={label}><circle cx={34 + i * 46} cy={y} r="8" fill="#111111" />{i < 4 && <line x1={42 + i * 46} y1={y} x2={72 + i * 46} y2={[76, 60, 44, 28][i]} stroke="#777777" strokeWidth="3" />}<text x={34 + i * 46} y="118" textAnchor="middle" fontSize="10" fill="#6B7280">{label}</text></g>)}</svg>),
    ],
  };

  return charts[lessonId] ? <div style={wrapStyle}>{charts[lessonId]}</div> : null;
}

function getIntervalInfoV2(a, b) {
  if (a == null || b == null) return null;
  const diff = Math.abs(a - b);
  const names = {
    0: "纯一度",
    1: "小二度",
    2: "大二度",
    3: "小三度",
    4: "大三度",
    5: "纯四度",
    6: "增四度",
    7: "纯五度",
    8: "小六度",
    9: "大六度",
    10: "小七度",
    11: "大七度",
    12: "纯八度",
  };
  const detail = {
    0: "两个音完全相同，形成纯一度。",
    1: "两个音相差 1 个半音，形成小二度。",
    2: "两个音相差 2 个半音，形成大二度。",
    3: "两个音相差 3 个半音，形成小三度。",
    4: "两个音相差 4 个半音，形成大三度。",
    5: "两个音相差 5 个半音，形成纯四度。",
    6: "两个音相差 6 个半音，形成增四度。",
    7: "两个音相差 7 个半音，形成纯五度。",
    8: "两个音相差 8 个半音，形成小六度。",
    9: "两个音相差 9 个半音，形成大六度。",
    10: "两个音相差 10 个半音，形成小七度。",
    11: "两个音相差 11 个半音，形成大七度。",
    12: "两个音跨越八度，形成纯八度。",
  };
  const normalized = diff > 12 ? diff % 12 : diff;
  return {
    label: names[diff] || names[normalized] || `${diff} 半音`,
    detail: detail[diff] || detail[normalized] || `两个音相差 ${diff} 个半音。`,
    semitones: diff,
    degree: diff + 1,
    color: diff <= 2 ? "#111111" : "#374151",
  };
}

function HomeworkImageUploader({
  images,
  onAddFiles,
  onRemoveImage,
  fileInputRef,
  cameraInputRef,
}) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>拍照上传与图片附件</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            手机端可直接拍照上传作业纸、节奏型或五线谱图片。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => cameraInputRef.current?.click()}
            style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}
          >
            拍照上传
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", color: "#111111", cursor: "pointer" }}
          >
            相册上传
          </button>
        </div>
      </div>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onAddFiles}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={onAddFiles}
      />
      {images.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {images.map((image, index) => (
            <div key={`${image.name}-${index}`} style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(17,17,17,0.1)", background: "#f8f8f8" }}>
              <img src={image.dataUrl} alt={image.name || `作业图片${index + 1}`} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
              <div style={{ padding: 8, fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {image.name || `图片 ${index + 1}`}
              </div>
              <button
                onClick={() => onRemoveImage(index)}
                style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 999, border: "1px solid rgba(17,17,17,0.16)", background: "rgba(255,255,255,0.96)", cursor: "pointer", fontSize: 12 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 14, borderRadius: 10, background: "#f8f8f8", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          当前尚未上传图片。若作业需要书写节奏型、五线谱或手写分析，可直接拍照后提交。
        </div>
      )}
    </div>
  );
}

function RhythmHomeworkEditor({ rhythmSubmission, onChange, onPlay }) {
  const activeMeasure = rhythmSubmission?.activeMeasure || 0;
  const measures = rhythmSubmission?.measures || [[], []];

  const appendSymbol = useCallback((symbol) => {
    onChange((prev) => {
      const nextMeasures = (prev.measures || [[], []]).map((measure) => [...measure]);
      nextMeasures[prev.activeMeasure || 0].push(symbol);
      return { ...prev, measures: nextMeasures };
    });
  }, [onChange]);

  const clearMeasure = useCallback(() => {
    onChange((prev) => {
      const nextMeasures = (prev.measures || [[], []]).map((measure) => [...measure]);
      nextMeasures[prev.activeMeasure || 0] = [];
      return { ...prev, measures: nextMeasures };
    });
  }, [onChange]);

  const resetAll = useCallback(() => {
    onChange((prev) => ({
      ...prev,
      measures: [[], []],
      activeMeasure: 0,
    }));
  }, [onChange]);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>节奏编辑器</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            以小节为单位输入节奏，默认拍号为 {rhythmSubmission?.meter || "4/4"}。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[0, 1].map((measureIndex) => (
            <button
              key={measureIndex}
              onClick={() => onChange((prev) => ({ ...prev, activeMeasure: measureIndex }))}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(17,17,17,0.12)",
                background: activeMeasure === measureIndex ? "#111111" : "#ffffff",
                color: activeMeasure === measureIndex ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              第 {measureIndex + 1} 小节
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 10 }}>
        {RHYTHM_SYMBOLS.map((symbol) => (
          <button
            key={symbol.id}
            onClick={() => appendSymbol(symbol)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.1)", background: "#f8f8f8", cursor: "pointer", textAlign: "left" }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{symbol.label}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>{symbol.kind === "tie" ? "连接前后音" : `${symbol.duration} 拍`}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {measures.map((measure, index) => (
          <div key={`measure-${index}`} style={{ padding: 10, borderRadius: 10, border: activeMeasure === index ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)", background: activeMeasure === index ? "#fafafa" : "#ffffff" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#111111", marginBottom: 8 }}>第 {index + 1} 小节</div>
            <div style={{ minHeight: 58, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {measure.length ? measure.map((item, itemIndex) => (
                <span key={`${item.id}-${itemIndex}`} style={{ padding: "6px 8px", borderRadius: 999, background: "#111111", color: "#ffffff", fontSize: 10 }}>
                  {item.label}
                </span>
              )) : (
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>当前小节尚未录入。</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={() => onPlay?.(measures[activeMeasure] || [])} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>试听当前小节</button>
        <button onClick={clearMeasure} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>清空当前小节</button>
        <button onClick={resetAll} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>重置两小节</button>
      </div>
    </div>
  );
}

function StaffHomeworkEditor({ staffSubmission, onChange }) {
  const noteSlots = Array.from({ length: 8 }, (_, slot) => {
    const matched = (staffSubmission?.notes || []).find((item) => item.slot === slot);
    return matched || null;
  });

  const placeNote = useCallback((row) => {
    const pitch = STAFF_ROWS.find((item) => item.row === row)?.label;
    if (!pitch) return;
    onChange((prev) => {
      const nextNotes = (prev.notes || []).filter((item) => item.slot !== prev.activeSlot);
      nextNotes.push({
        slot: prev.activeSlot,
        row,
        pitch,
        accidental: prev.accidental || "natural",
      });
      return { ...prev, notes: nextNotes };
    });
  }, [onChange]);

  const removeCurrentSlot = useCallback(() => {
    onChange((prev) => ({
      ...prev,
      notes: (prev.notes || []).filter((item) => item.slot !== prev.activeSlot),
    }));
  }, [onChange]);

  const resetAll = useCallback(() => {
    onChange((prev) => ({
      ...prev,
      activeSlot: 0,
      accidental: "natural",
      notes: [],
    }));
  }, [onChange]);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>五线谱修正器</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            先拍照上传，再在下方简化五线谱上点选修正音位。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={staffSubmission?.clef || "treble"} onChange={(e) => onChange((prev) => ({ ...prev, clef: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="treble">高音谱号</option>
            <option value="bass">低音谱号</option>
          </select>
          <select value={staffSubmission?.accidental || "natural"} onChange={(e) => onChange((prev) => ({ ...prev, accidental: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="natural">还原</option>
            <option value="sharp">升号</option>
            <option value="flat">降号</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {noteSlots.map((item, slot) => (
          <button
            key={`slot-${slot}`}
            onClick={() => onChange((prev) => ({ ...prev, activeSlot: slot }))}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(17,17,17,0.12)",
              background: staffSubmission?.activeSlot === slot ? "#111111" : "#ffffff",
              color: staffSubmission?.activeSlot === slot ? "#ffffff" : "#111111",
              cursor: "pointer",
            }}
          >
            音位 {slot + 1}{item ? ` · ${item.pitch}` : ""}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 360 220" style={{ width: "100%", maxWidth: 540, height: "auto", display: "block", margin: "0 auto", background: "#fafafa", borderRadius: 12, border: "1px solid rgba(17,17,17,0.08)" }}>
        {[0, 1, 2, 3, 4].map((line) => {
          const y = 54 + line * 22;
          return <line key={`staff-line-${line}`} x1="32" y1={y} x2="328" y2={y} stroke="#111111" strokeWidth="1.3" />;
        })}
        <text x="20" y="68" fontSize="28" fill="#111111">{staffSubmission?.clef === "bass" ? "𝄢" : "𝄞"}</text>
        {Array.from({ length: 8 }, (_, slot) => {
          const x = 78 + slot * 30;
          return (
            <g key={`guide-${slot}`}>
              <line x1={x} y1="38" x2={x} y2="170" stroke="rgba(17,17,17,0.08)" strokeWidth="1" />
              <text x={x} y="192" textAnchor="middle" fontSize="10" fill={staffSubmission?.activeSlot === slot ? "#111111" : "#9ca3af"}>{slot + 1}</text>
            </g>
          );
        })}
        {STAFF_ROWS.map((item) => {
          const y = 32 + item.row * 12;
          return (
            <g key={`row-${item.row}`} onClick={() => placeNote(item.row)} style={{ cursor: "pointer" }}>
              <rect x="58" y={y - 6} width="250" height="12" fill="transparent" />
              <text x="332" y={y + 4} fontSize="10" fill="#6b7280">{item.label}</text>
            </g>
          );
        })}
        {(staffSubmission?.notes || []).map((note) => {
          const x = 78 + note.slot * 30;
          const y = 32 + note.row * 12;
          const accidentalLabel = note.accidental === "sharp" ? "#" : note.accidental === "flat" ? "b" : "";
          return (
            <g key={`note-${note.slot}-${note.pitch}`}>
              {accidentalLabel ? <text x={x - 14} y={y + 5} fontSize="13" fill="#111111">{accidentalLabel}</text> : null}
              <ellipse cx={x} cy={y} rx="8" ry="6" fill="#111111" />
              <line x1={x + 7} y1={y} x2={x + 7} y2={y - 28} stroke="#111111" strokeWidth="1.4" />
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={removeCurrentSlot} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>删除当前音位</button>
        <button onClick={resetAll} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>重置五线谱</button>
      </div>
    </div>
  );
}

function RhythmHomeworkEditorV2({ rhythmSubmission, onChange, onPlay }) {
  const activeMeasure = rhythmSubmission?.activeMeasure || 0;
  const measures = rhythmSubmission?.measures || [[], []];
  const targetBeats = getMeterBeats(rhythmSubmission?.meter);

  const appendSymbol = useCallback((symbol) => {
    onChange((prev) => {
      const nextMeasures = (prev.measures || [[], []]).map((measure) => [...measure]);
      nextMeasures[prev.activeMeasure || 0].push({ ...symbol, tieToNext: false });
      return { ...prev, measures: nextMeasures };
    });
  }, [onChange]);

  const removeLastSymbol = useCallback(() => {
    onChange((prev) => {
      const nextMeasures = (prev.measures || [[], []]).map((measure) => [...measure]);
      nextMeasures[prev.activeMeasure || 0].pop();
      return { ...prev, measures: nextMeasures };
    });
  }, [onChange]);

  const toggleTieOnLast = useCallback(() => {
    onChange((prev) => {
      const nextMeasures = (prev.measures || [[], []]).map((measure) => [...measure]);
      const current = nextMeasures[prev.activeMeasure || 0];
      if (!current.length) return prev;
      const lastIndex = current.length - 1;
      if (current[lastIndex].kind !== "note") return prev;
      current[lastIndex] = { ...current[lastIndex], tieToNext: !current[lastIndex].tieToNext };
      return { ...prev, measures: nextMeasures };
    });
  }, [onChange]);

  const clearMeasure = useCallback(() => {
    onChange((prev) => {
      const nextMeasures = (prev.measures || [[], []]).map((measure) => [...measure]);
      nextMeasures[prev.activeMeasure || 0] = [];
      return { ...prev, measures: nextMeasures };
    });
  }, [onChange]);

  const resetAll = useCallback(() => {
    onChange((prev) => ({ ...prev, measures: [[], []], activeMeasure: 0 }));
  }, [onChange]);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>节奏编辑器</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            以小节为单位输入节奏，系统会检查每小节拍数是否完整。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={rhythmSubmission?.meter || "4/4"} onChange={(e) => onChange((prev) => ({ ...prev, meter: e.target.value }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff" }}>
            {["2/4", "3/4", "4/4", "6/8"].map((meter) => <option key={meter} value={meter}>{meter}</option>)}
          </select>
          {[0, 1].map((measureIndex) => (
            <button key={measureIndex} onClick={() => onChange((prev) => ({ ...prev, activeMeasure: measureIndex }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(17,17,17,0.12)", background: activeMeasure === measureIndex ? "#111111" : "#ffffff", color: activeMeasure === measureIndex ? "#ffffff" : "#111111", cursor: "pointer" }}>
              第 {measureIndex + 1} 小节
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 10 }}>
        {RHYTHM_SYMBOLS.map((symbol) => (
          <button key={symbol.id} onClick={() => appendSymbol(symbol)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.1)", background: "#f8f8f8", cursor: "pointer", textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{symbol.label}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>{`${symbol.duration} 拍`}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {measures.map((measure, index) => {
          const currentBeats = calculateMeasureDuration(measure);
          const status = currentBeats === targetBeats ? "完整" : currentBeats < targetBeats ? "未满" : "超拍";
          const statusColor = currentBeats === targetBeats ? "#166534" : currentBeats < targetBeats ? "#92400e" : "#b91c1c";
          return (
            <div key={`measure-v2-${index}`} style={{ padding: 10, borderRadius: 10, border: activeMeasure === index ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)", background: activeMeasure === index ? "#fafafa" : "#ffffff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#111111" }}>第 {index + 1} 小节</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>{`${currentBeats}/${targetBeats} 拍 · ${status}`}</div>
              </div>
              <div style={{ minHeight: 58, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {measure.length ? measure.map((item, itemIndex) => (
                  <span key={`${item.id}-${itemIndex}`} style={{ padding: "6px 8px", borderRadius: 999, background: "#111111", color: "#ffffff", fontSize: 10 }}>
                    {item.label}{item.tieToNext ? "~" : ""}
                  </span>
                )) : <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>当前小节尚未录入。</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={() => onPlay?.(measures[activeMeasure] || [])} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>试听当前小节</button>
        <button onClick={toggleTieOnLast} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>为最后一个音加连音</button>
        <button onClick={removeLastSymbol} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>撤销上一步</button>
        <button onClick={clearMeasure} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>清空当前小节</button>
        <button onClick={resetAll} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>重置两小节</button>
      </div>
    </div>
  );
}

function StaffHomeworkEditorV2({ staffSubmission, onChange }) {
  const noteSlots = Array.from({ length: 8 }, (_, slot) => {
    const matched = (staffSubmission?.notes || []).find((item) => item.slot === slot);
    return matched || null;
  });

  const placeNote = useCallback((row) => {
    const pitch = STAFF_ROWS.find((item) => item.row === row)?.label;
    if (!pitch) return;
    onChange((prev) => {
      const nextNotes = (prev.notes || []).filter((item) => item.slot !== prev.activeSlot);
      nextNotes.push({
        slot: prev.activeSlot,
        row,
        pitch,
        accidental: prev.accidental || "natural",
        noteValue: prev.noteValue || "quarter",
        tieToNext: false,
      });
      return { ...prev, notes: nextNotes };
    });
  }, [onChange]);

  const toggleTieForCurrent = useCallback(() => {
    onChange((prev) => {
      const nextNotes = (prev.notes || []).map((item) => item.slot === prev.activeSlot ? { ...item, tieToNext: !item.tieToNext } : item);
      return { ...prev, notes: nextNotes };
    });
  }, [onChange]);

  const removeCurrentSlot = useCallback(() => {
    onChange((prev) => ({ ...prev, notes: (prev.notes || []).filter((item) => item.slot !== prev.activeSlot) }));
  }, [onChange]);

  const resetAll = useCallback(() => {
    onChange((prev) => ({ ...prev, activeSlot: 0, accidental: "natural", noteValue: "quarter", notes: [] }));
  }, [onChange]);

  const sortedNotes = [...(staffSubmission?.notes || [])].sort((a, b) => a.slot - b.slot);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>五线谱修正器</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            支持谱号、升降号、音值和连音弧的基础修正，适合大学乐理作业录入。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={staffSubmission?.clef || "treble"} onChange={(e) => onChange((prev) => ({ ...prev, clef: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="treble">高音谱号</option>
            <option value="bass">低音谱号</option>
          </select>
          <select value={staffSubmission?.accidental || "natural"} onChange={(e) => onChange((prev) => ({ ...prev, accidental: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="natural">还原</option>
            <option value="sharp">升号</option>
            <option value="flat">降号</option>
          </select>
          <select value={staffSubmission?.noteValue || "quarter"} onChange={(e) => onChange((prev) => ({ ...prev, noteValue: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="whole">全音符</option>
            <option value="half">二分音符</option>
            <option value="quarter">四分音符</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {noteSlots.map((item, slot) => (
          <button key={`slot-v2-${slot}`} onClick={() => onChange((prev) => ({ ...prev, activeSlot: slot }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(17,17,17,0.12)", background: staffSubmission?.activeSlot === slot ? "#111111" : "#ffffff", color: staffSubmission?.activeSlot === slot ? "#ffffff" : "#111111", cursor: "pointer" }}>
            音位 {slot + 1}{item ? ` · ${item.pitch}` : ""}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 360 220" style={{ width: "100%", maxWidth: 540, height: "auto", display: "block", margin: "0 auto", background: "#fafafa", borderRadius: 12, border: "1px solid rgba(17,17,17,0.08)" }}>
        {[0, 1, 2, 3, 4].map((line) => {
          const y = 54 + line * 22;
          return <line key={`staff-line-v2-${line}`} x1="32" y1={y} x2="328" y2={y} stroke="#111111" strokeWidth="1.3" />;
        })}
        <text x="20" y="68" fontSize="28" fill="#111111">{staffSubmission?.clef === "bass" ? "𝄢" : "𝄞"}</text>
        {Array.from({ length: 8 }, (_, slot) => {
          const x = 78 + slot * 30;
          return <g key={`guide-v2-${slot}`}><line x1={x} y1="38" x2={x} y2="170" stroke="rgba(17,17,17,0.08)" strokeWidth="1" /><text x={x} y="192" textAnchor="middle" fontSize="10" fill={staffSubmission?.activeSlot === slot ? "#111111" : "#9ca3af"}>{slot + 1}</text></g>;
        })}
        {STAFF_ROWS.map((item) => {
          const y = 32 + item.row * 12;
          return <g key={`row-v2-${item.row}`} onClick={() => placeNote(item.row)} style={{ cursor: "pointer" }}><rect x="58" y={y - 6} width="250" height="12" fill="transparent" /><text x="332" y={y + 4} fontSize="10" fill="#6b7280">{item.label}</text></g>;
        })}
        {sortedNotes.map((note) => {
          const x = 78 + note.slot * 30;
          const y = 32 + note.row * 12;
          const accidentalLabel = note.accidental === "sharp" ? "#" : note.accidental === "flat" ? "b" : "";
          const isFilled = note.noteValue === "quarter";
          const showStem = note.noteValue !== "whole";
          return (
            <g key={`note-v2-${note.slot}-${note.pitch}`}>
              {accidentalLabel ? <text x={x - 14} y={y + 5} fontSize="13" fill="#111111">{accidentalLabel}</text> : null}
              <ellipse cx={x} cy={y} rx="8" ry="6" fill={isFilled ? "#111111" : "#ffffff"} stroke="#111111" strokeWidth="1.3" />
              {showStem ? <line x1={x + 7} y1={y} x2={x + 7} y2={y - 28} stroke="#111111" strokeWidth="1.4" /> : null}
            </g>
          );
        })}
        {sortedNotes.map((note) => {
          if (!note.tieToNext) return null;
          const next = sortedNotes.find((item) => item.slot === note.slot + 1);
          if (!next) return null;
          const x1 = 78 + note.slot * 30;
          const x2 = 78 + next.slot * 30;
          const y = Math.max(32 + note.row * 12, 32 + next.row * 12) + 16;
          return <path key={`tie-v2-${note.slot}`} d={`M ${x1 - 4} ${y} Q ${(x1 + x2) / 2} ${y + 14} ${x2 + 4} ${y}`} fill="none" stroke="#111111" strokeWidth="1.3" />;
        })}
      </svg>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={toggleTieForCurrent} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>为当前音位切换连音</button>
        <button onClick={removeCurrentSlot} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>删除当前音位</button>
        <button onClick={resetAll} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>重置五线谱</button>
      </div>
    </div>
  );
}

function LessonLearningWorkspace({ lesson, section, showTabs = true }) {
  const pptLessonData = getPptLessonData(lesson.id);
  const homeworkFileInputRef = useRef(null);
  const homeworkCameraInputRef = useRef(null);
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
  const [homeworkSubmitted, setHomeworkSubmitted] = useState(false);
  const [homeworkFeedback, setHomeworkFeedback] = useState("");
  const [homeworkReviewing, setHomeworkReviewing] = useState(false);
  const [showHomeworkDialog, setShowHomeworkDialog] = useState(false);
  const [stats, setStats] = useState(() => ({
    startedAt: Date.now(),
    interactions: 0,
    errors: 0,
    errorTypes: {},
    lastExplanation: "先点击钢琴键，系统会根据两个音的距离给出音程度数解释。",
  }));

  const practicePool = createLessonPracticePool(lesson.id, lesson.t);
  const practiceQuestions = Array.from({ length: 20 }, (_, idx) => practicePool[(practiceRound * 20 + idx) % practicePool.length]);
  const currentPractice = practiceQuestions[practiceIndex];
  const correctCount = practiceAnswers.filter((item) => item.correct).length;
  const lessonSections = LESSON_LEARNING_SECTIONS[lesson.id] || [];
  const lessonHomework = lessonSections.find((item) => item.title === "课后作业")?.body || `围绕“${HOMEWORK_FOCUS[lesson.id] || lesson.t}”完成一份课后整理。`;
  const homeworkRequirement = getHomeworkRequirement(lesson.id, lesson.t);
  const studyMinutes = Math.max(1, Math.ceil((Date.now() - stats.startedAt) / 60000));

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
  const rhythmMeasuresComplete = homeworkRhythm.measures.every((measure) => calculateMeasureDuration(measure) === getMeterBeats(homeworkRhythm.meter));
  const homeworkSubmissionState = {
    text: Boolean(homeworkDraft.trim()),
    image: homeworkImages.length > 0,
    rhythm: hasRhythmContent,
    staff: hasStaffContent,
  };
  const submissionTypes = [
    homeworkDraft.trim() ? "文字说明" : null,
    homeworkImages.length ? "拍照上传" : null,
    hasRhythmContent ? "节奏编辑" : null,
    hasStaffContent ? "五线谱修正" : null,
  ].filter(Boolean);
  submissionTypes.splice(
    0,
    submissionTypes.length,
    ...(homeworkSubmissionState.text ? ["文字说明"] : []),
    ...(homeworkSubmissionState.image ? ["拍照上传"] : []),
    ...(homeworkSubmissionState.rhythm ? ["节奏编辑"] : []),
    ...(homeworkSubmissionState.staff ? ["五线谱修正"] : []),
  );
  const homeworkHasContent = submissionTypes.length > 0;

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
    setHomeworkDraft("");
    setHomeworkSubmitted(false);
    setHomeworkFeedback("");
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
      ? "已提交。内容较完整，建议下一步重点检查术语准确性和示例是否对应本课核心概念。"
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
        lastExplanation: stats.lastExplanation,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [lesson.id, lesson.t, activeSection, studyMinutes, stats, homeworkRemaining, homeworkSubmitted, homeworkDraft.length]);

  const openMixedHomeworkSubmit = useCallback(() => {
    if (!homeworkHasContent) {
      setHomeworkFeedback("请先补充文字、图片、节奏型或五线谱中的任一项，再提交作业。");
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
        }),
      });
      const json = await response.json();
      const feedback = String(json?.text || "系统已记录你的作业，等待教师复核。");
      setHomeworkSubmitted(true);
      setHomeworkRunning(false);
      setHomeworkFeedback(feedback);
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
        aiHomeworkFeedback: feedback,
        submissionTypes,
        lastExplanation: "课后作业已提交并完成 AI 初评。",
      });
    } catch {
      setHomeworkFeedback("作业提交失败，请检查网络后重试。");
    } finally {
      setHomeworkReviewing(false);
    }
  }, [lesson.id, lesson.t, lessonHomework, homeworkDraft, homeworkImages, homeworkRhythm, homeworkStaff, studyMinutes, stats, homeworkRemaining, submissionTypes]);

  const openLessonHomeworkSubmit = useCallback(() => {
    if (!homeworkHasContent) {
      setHomeworkFeedback("请先补充本课所需的作业内容，再提交。");
      return;
    }
    const requiredOk = homeworkRequirement.requiredAnyOf.some((type) => homeworkSubmissionState[type]);
    if (!requiredOk) {
      setHomeworkFeedback(`当前课时更适合通过${homeworkRequirement.requiredAnyOf.join(" / ")}完成作业，请按课时要求补充后再提交。`);
      return;
    }
    if (homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete) {
      setHomeworkFeedback("节奏作业尚未完成。请检查每个小节的拍数是否与拍号一致，再提交。");
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkHasContent, homeworkRequirement, homeworkSubmissionState, rhythmMeasuresComplete]);

  return (
    <div style={{ marginTop: 10, marginBottom: 14 }}>
      {showTabs && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setActiveSection("content")} style={sectionButtonStyle("content")}>内容呈现</button>
        <button onClick={() => setActiveSection("practice")} style={sectionButtonStyle("practice")}>课堂练习</button>
        <button onClick={() => setActiveSection("homework")} style={sectionButtonStyle("homework")}>课后作业</button>
      </div>}

      {activeSection === "content" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>内容呈现</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
          制作动态钢琴键盘可视化界面。点击琴键即可播放对应音高；连续点击两个音会实时显示音程度数关系，并同步给出音程解释。
        </div>
        <div style={{ position: "relative", height: 132, margin: "0 auto", width: 252, userSelect: "none" }}>
          {relationPoints.length === 2 && (
            <svg viewBox="0 0 252 132" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5 }}>
              <defs>
                <linearGradient id="intervalLine" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#111111" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#6b7280" stopOpacity="0.65" />
                </linearGradient>
              </defs>
              <path
                d={`M ${relationPoints[0].x} ${relationPoints[0].y} Q ${(relationPoints[0].x + relationPoints[1].x) / 2} 8 ${relationPoints[1].x} ${relationPoints[1].y}`}
                fill="none"
                stroke="url(#intervalLine)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray="6 5"
              />
              <circle cx={relationPoints[0].x} cy={relationPoints[0].y} r="5" fill="#111111" />
              <circle cx={relationPoints[1].x} cy={relationPoints[1].y} r="5" fill="#4b5563" />
              <rect x={(relationPoints[0].x + relationPoints[1].x) / 2 - 32} y="6" width="64" height="18" rx="9" fill="#111111" />
              <text x={(relationPoints[0].x + relationPoints[1].x) / 2} y="19" textAnchor="middle" fontSize="10" fill="#ffffff">
                {lastInterval?.label || "音程"}
              </text>
            </svg>
          )}
          {WK.map((ni, i) => (
            <div key={ni} onClick={() => handleKeyPress(ni)} style={{ position: "absolute", left: i * 36, top: 0, width: 34, height: 124, borderRadius: "0 0 8px 8px", border: selectedNotes.includes(ni) ? "1px solid #111111" : "1px solid #d1d5db", background: activeNote === ni ? "#e5e7eb" : selectedNotes.includes(ni) ? "#f3f4f6" : "#ffffff", boxShadow: selectedNotes.includes(ni) ? "inset 0 -10px 24px rgba(17,17,17,0.08)" : "none", cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, fontSize: 10, color: "#6b7280" }}>{NT[ni]}</div>
          ))}
          {BK.map((ni) => {
            const wPos = WK.filter((w) => w < ni).length;
            return <div key={ni} onClick={() => handleKeyPress(ni)} style={{ position: "absolute", left: wPos * 36 - 12, top: 0, width: 24, height: 78, borderRadius: "0 0 6px 6px", background: activeNote === ni ? "#4b5563" : selectedNotes.includes(ni) ? "#1f2937" : "#111111", outline: selectedNotes.includes(ni) ? "2px solid rgba(255,255,255,0.55)" : "none", cursor: "pointer", zIndex: 6, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6, color: "#d1d5db", fontSize: 9 }}>{NT[ni]}</div>;
          })}
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: lastInterval?.color || "#111111" }}>
            {lastInterval ? `音程关系：${lastInterval.label}` : "音程关系：等待连续点击两个音"}
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>{lastInterval?.detail || "建议先点击相邻两个音，再观察音程度数与半音数量。"}</div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
            {lastInterval ? `音程度数：第 ${lastInterval.degree} 度，半音数：${lastInterval.semitones}` : "音程度数：未生成"}
          </div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8 }}>
            反馈说明：{stats.lastExplanation}
          </div>
        </div>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>本节知识锚点</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              {lessonSections.find((item) => item.title === "内容呈现")?.body || "本节围绕核心概念做结构化讲解。"}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>操作记录</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              最近点击音：{selectedNotes.length ? selectedNotes.map((n) => NT[n]).join(" → ") : "暂无"}
              <br />
              本节交互：{stats.interactions} 次
              <br />
              当前错误类型：{Object.keys(stats.errorTypes).length ? Object.keys(stats.errorTypes).join("、") : "暂无"}
            </div>
          </div>
        </div>
        {pptLessonData && <PptContentEmbedCn lessonId={lesson.id} />}
        {false && pptLessonData && (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>PPT 课时内容</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
                {`第 ${pptLessonData.lessonNumber} 课时 · ${pptLessonData.lessonTitle}`}
                <br />
                {pptLessonData.chapter}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {pptLessonData.knowledgePoints.map((item, index) => (
                  <div key={`${lesson.id}-ppt-kp-${index}`} style={{ padding: 10, borderRadius: 10, background: "#f8f8f8", border: "1px solid rgba(17,17,17,0.06)" }}>
                    <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>{`知识点 ${index + 1}`}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>PPT 重点</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {pptLessonData.keyPoints.map((item, index) => (
                    <div key={`${lesson.id}-ppt-key-${index}`} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                      {`${index + 1}. ${item}`}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>PPT 难点</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {pptLessonData.difficultPoints.map((item, index) => (
                    <div key={`${lesson.id}-ppt-diff-${index}`} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                      {`${index + 1}. ${item}`}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>}

      {activeSection === "practice" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课堂练习</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          系统会结合你在内容呈现中的钢琴操作来判断是否存在错误，并提供 20 题连续课堂练习。
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>钢琴演示检测</div>
          <div style={{ fontSize: 11, color: stats.errors > 0 ? "#b91c1c" : "var(--color-text-secondary)" }}>
            {lastInterval ? `最近一次识别为 ${lastInterval.label}，${lastInterval.detail}` : "先在内容呈现里点击钢琴键，系统才会生成检测结果。"}
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
            <button onClick={restartPractice} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>切换到新的20题</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-secondary)" }}>
            答对题数/总题数：{correctCount}/{practiceQuestions.length}
          </div>
        </div>
      </div>}

      {activeSection === "homework" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课后作业</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          AI 智能生成本节作业，并记录学习时长、错误类型和互动次数等学习行为数据，形成个性化作业方案。
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
              <button onClick={() => { setHomeworkRunning(false); setHomeworkRemaining(30 * 60); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>重置为30分钟</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              进入本页后已自动开始倒计时。
              <br />
              AI 指定任务：{lessonHomework}
              <br />
              当前学习追踪：约 {studyMinutes} 分钟，互动 {stats.interactions} 次。
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
          本课提交方式：{homeworkRequirement.channels.map((item) => item === "text" ? "文字说明" : item === "image" ? "拍照上传" : item === "rhythm" ? "节奏编辑" : "五线谱修正").join(" / ")}
          <br />
          {homeworkRequirement.helper}
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
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>文字说明</div>
            <textarea
              value={homeworkDraft}
              onChange={(e) => setHomeworkDraft(e.target.value)}
              placeholder="可在这里补充概念解释、作业思路、节奏分析、音高判断依据或对拍照内容的说明。"
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
          </div>
        </div>
        {showHomeworkDialog && <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.36)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ width: "min(640px, 100%)", background: "#ffffff", borderRadius: 16, padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>确认提交课后作业</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
              当前剩余时间 {formattedHomeworkTime}，提交后将生成 AI 初评结果并同步到教师后台。
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
        {false && <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>本页完成并提交作业</div>
          <textarea
            value={homeworkDraft}
            onChange={(e) => setHomeworkDraft(e.target.value)}
            placeholder="在这里直接完成作业。可以写概念解释、音程/节奏分析、例子或你的练习过程。"
            style={{ width: "100%", minHeight: 150, borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", padding: 12, fontSize: 12, lineHeight: 1.8, resize: "vertical", outline: "none" }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              错误类型：{Object.keys(stats.errorTypes).length ? Object.entries(stats.errorTypes).map(([k, v]) => `${k} x${v}`).join("；") : "当前暂无错误记录"}
            </div>
            <button onClick={openHomeworkSubmit} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>
              提交作业
            </button>
          </div>
          {homeworkFeedback && <div style={{ marginTop: 10, fontSize: 11, color: homeworkSubmitted ? "#166534" : "#b91c1c" }}>{homeworkFeedback}</div>}
        </div>}
        {false && showHomeworkDialog && <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.36)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div style={{ width: "min(560px, 100%)", background: "#ffffff", borderRadius: 16, padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>确认提交课后作业</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
              当前剩余时间 {formattedHomeworkTime}，正文 {homeworkDraft.length} 字。提交后会在本页生成反馈摘要。
            </div>
            <div style={{ maxHeight: 180, overflow: "auto", fontSize: 12, lineHeight: 1.8, color: "#111111", padding: 12, borderRadius: 12, background: "#f8f8f8", marginBottom: 12 }}>
              {homeworkDraft}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowHomeworkDialog(false)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>继续修改</button>
              <button onClick={confirmHomeworkSubmit} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>确认提交</button>
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
            建议：依次点击 C3 → C4 → C5，感受八度上行时频率翻倍的关系。
          </div>
        </div>
      </div>
    </div>
  );
}

function PptContentEmbed({ lessonId }) {
  const lessonData = getPptLessonData(lessonId);
  const [pageIndex, setPageIndex] = useState(0);

  const slides = useMemo(() => {
    if (!lessonData) return [];
    return [
      {
        title: "本课知识点",
        body: (
          <div style={{ display: "grid", gap: 10 }}>
            {lessonData.knowledgePoints.map((item, index) => (
              <div key={`${lessonId}-slide-k-${index}`} className="subtle-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>{`知识点 ${index + 1}`}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item.detail}</div>
              </div>
            ))}
          </div>
        ),
      },
      {
        title: "重点与难点",
        body: (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>重点</div>
              {lessonData.keyPoints.map((item, index) => (
                <div key={`${lessonId}-slide-key-${index}`} style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 6 }}>
                  {`${index + 1}. ${item}`}
                </div>
              ))}
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>难点</div>
              {lessonData.difficultPoints.map((item, index) => (
                <div key={`${lessonId}-slide-diff-${index}`} style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 6 }}>
                  {`${index + 1}. ${item}`}
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        title: "课堂练习",
        body: (
          <div style={{ display: "grid", gap: 10 }}>
            {lessonData.inClassExercises.map((item, index) => (
              <div key={`${lessonId}-slide-ex-${index}`} className="subtle-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{`练习 ${index + 1}`}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item}</div>
              </div>
            ))}
          </div>
        ),
      },
    ];
  }, [lessonData, lessonId]);

  useEffect(() => {
    setPageIndex(0);
  }, [lessonId]);

  if (!lessonData || slides.length === 0) return null;

  const currentSlide = slides[pageIndex];

  return (
    <div className="section-card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>PPT 内容嵌入</div>
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
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`${pageIndex + 1} / ${slides.length}`}</div>
          <button
            onClick={() => setPageIndex((prev) => Math.min(slides.length - 1, prev + 1))}
            disabled={pageIndex === slides.length - 1}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: pageIndex === slides.length - 1 ? "default" : "pointer" }}
          >
            下一页
          </button>
        </div>
      </div>
      <div className="subtle-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{currentSlide.title}</div>
        {currentSlide.body}
      </div>
      <div style={{ marginTop: 10 }}>
        <a href={sourcePpt} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#185FA5", textDecoration: "none" }}>
          查看原始 PPT →
        </a>
      </div>
    </div>
  );
}

function InteractivePitchFrequencyWidgetCn() {
  const noteItems = [
    { label: "C3", freq: 130.81, tip: "低音区起点，频率较低，音高较沉稳。" },
    { label: "G3", freq: 196.0, tip: "继续上行，频率升高，听感更明亮。" },
    { label: "C4", freq: 261.63, tip: "中央 C，常作为钢琴与乐理学习的参考音。" },
    { label: "G4", freq: 392.0, tip: "高音区进一步抬升，频率变化更直观。" },
    { label: "C5", freq: 523.25, tip: "与 C4 构成八度，频率约翻倍。" },
  ];
  const [activeIndex, setActiveIndex] = useState(2);

  const playInteractiveNote = useCallback(async (index) => {
    const item = noteItems[index];
    if (!item) return;
    setActiveIndex(index);
    await unlockAudioSystem();
    playTone(item.freq, 0.55, "piano", 0.28);
  }, []);

  const activeNote = noteItems[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音高与频率关系互动钢琴</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        点击下方音键即可播放钢琴音色，并同步观察频率柱状变化。建议按 C3、C4、C5 的顺序试听，对比八度上行时频率接近翻倍的关系。
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
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{activeNote.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`频率：${activeNote.freq} Hz`}
            <br />
            规律：频率越高，听感中的音高越高。
            <br />
            说明：{activeNote.tip}
          </div>
        </div>
      </div>
    </div>
  );
}

function InteractiveVolumeAmplitudeWidgetCn() {
  const levels = [
    { label: "pp", amp: 0.18, volume: 0.1, desc: "很弱，振幅最小，波形起伏较平缓。" },
    { label: "p", amp: 0.3, volume: 0.16, desc: "较弱，能量增加但仍保持柔和。" },
    { label: "mp", amp: 0.46, volume: 0.22, desc: "中弱，振幅开始明显抬升。" },
    { label: "mf", amp: 0.64, volume: 0.3, desc: "中强，适合作为常规演奏力度。" },
    { label: "f", amp: 0.82, volume: 0.4, desc: "强，振幅较大，听感更饱满有力。" },
  ];
  const [activeIndex, setActiveIndex] = useState(2);

  const playLevel = useCallback(async (index) => {
    const item = levels[index];
    if (!item) return;
    setActiveIndex(index);
    await unlockAudioSystem();
    playTone(261.63, item.volume, "piano", 0.38);
  }, []);

  const activeLevel = levels[activeIndex];
  const wavePoints = Array.from({ length: 25 }, (_, index) => {
    const x = 12 + index * 11;
    const y = 62 + Math.sin(index / 2) * activeLevel.amp * 28;
    return `${x},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音量与振幅互动示意</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        点击不同力度等级可听到同一音高在不同音量下的变化，并同步观察振幅波形起伏。音量越强，通常对应振幅越大。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 14 }}>
        <div className="subtle-card" style={{ padding: 14 }}>
          <svg viewBox="0 0 280 130" style={{ width: "100%", height: 130 }}>
            <line x1="10" y1="62" x2="270" y2="62" stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="4 4" />
            <polyline points={wavePoints} fill="none" stroke="#111111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 8 }}>
            {levels.map((level, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={level.label}
                  onClick={() => playLevel(index)}
                  style={{
                    padding: "8px 0",
                    borderRadius: 12,
                    border: active ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                    background: active ? "#111111" : "#ffffff",
                    color: active ? "#ffffff" : "#111111",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {level.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>当前力度</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{activeLevel.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`振幅系数：${activeLevel.amp.toFixed(2)}`}
            <br />
            {`试听音量：${activeLevel.volume.toFixed(2)}`}
            <br />
            说明：{activeLevel.desc}
          </div>
        </div>
      </div>
    </div>
  );
}

function PptContentEmbedCn({ lessonId }) {
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
  const actualImageRoot =
    lessonId === "L1"
      ? "/ppt-images-l1"
      : (lessonId === "L2" || lessonId === "L3" || lessonId === "L4")
        ? "/ppt-images-l234"
        : (lessonId === "L5" || lessonId === "L6" || lessonId === "L7" || lessonId === "L8")
          ? "/ppt-images-l5678"
          : (lessonId === "L9" || lessonId === "L10" || lessonId === "L11" || lessonId === "L12")
            ? "/ppt-images-l912"
            : "/ppt-images";
  const actualSourcePpt =
    lessonId === "L1"
      ? "/ppt/MusicAI_L1_Sample.pptx"
      : (lessonId === "L2" || lessonId === "L3" || lessonId === "L4")
        ? "/ppt/MusicAI_L2_L3_L4.pptx"
        : (lessonId === "L5" || lessonId === "L6" || lessonId === "L7" || lessonId === "L8")
          ? "/ppt/MusicAI_L5_L6_L7_L8.pptx"
          : (lessonId === "L9" || lessonId === "L10" || lessonId === "L11" || lessonId === "L12")
            ? "/ppt/MusicAI_L9_L10_L11_L12.pptx"
            : "/ppt/MusicAI_12_Lessons.pptx";
  const actualDisplayImageSrc = `${actualImageRoot}/${encodeURIComponent(`幻灯片${currentSlideNo}.PNG`)}`;
  const displayImageSrc = `${actualImageRoot}/${encodeURIComponent(`幻灯片${currentSlideNo}.PNG`)}`;
  const imageRoot = lessonId === "L1" ? "/ppt-images-l1" : (lessonId === "L2" || lessonId === "L3" || lessonId === "L4") ? "/ppt-images-l234" : "/ppt-images";
  const sourcePpt = lessonId === "L1" ? "/ppt/MusicAI_L1_Sample.pptx" : (lessonId === "L2" || lessonId === "L3" || lessonId === "L4") ? "/ppt/MusicAI_L2_L3_L4.pptx" : "/ppt/MusicAI_12_Lessons.pptx";
  const actualImageSrc = `${imageRoot}/${encodeURIComponent(`幻灯片${currentSlideNo}.PNG`)}`;
  const normalizedImageSrc = `${imageRoot}/${encodeURIComponent(`幻灯片${currentSlideNo}.PNG`)}`;
  const imageSrc = `/ppt-images/${encodeURIComponent(`幻灯片${currentSlideNo}.PNG`)}`;

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
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>{`当前展示：PPT 第 ${currentSlideNo} 页`}</div>
        <img
          src={actualDisplayImageSrc}
          alt={`${lessonData.lessonTitle} - 幻灯片 ${pageIndex + 1}`}
          style={{ width: "100%", display: "block", borderRadius: 12, border: "1px solid rgba(17,17,17,0.08)" }}
        />
      </div>
      <div style={{ marginTop: 10 }}>
        <a href={actualSourcePpt} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#185FA5", textDecoration: "none" }}>
          打开原始 PPT
        </a>
      </div>
    </div>
  );
}

function LessonMediaHub({ lesson }) {
  const plan = useMemo(() => buildLessonMediaPlan(lesson), [lesson]);
  const videoSrc = `/videos/${lesson.id}.mp4`;

  return (
    <div className="lesson-media-grid">
      <div className="section-card">
        <div className="media-header">
          <div>
            <div className="media-kicker">课时视频</div>
            <div className="media-title">{lesson.t}</div>
          </div>
        </div>

        <div className="lesson-video-grid">
          <div className="lesson-video-frame">
            <video className="lesson-video-player" controls preload="metadata" src={videoSrc} />
            <div className="media-subtitle" style={{ marginTop: 10 }}>
              当前课时成片包含导入、知识讲解、重难点、课堂例证和拓展迁移。
            </div>
          </div>

          <div className="video-script-card">
            <div className="media-kicker">分章大纲</div>
            <div className="video-segment-list">
              {plan.segments.map((segment, index) => (
                <div key={`${lesson.id}-segment-${index}`} className="video-segment-item">
                  <span>{segment.timeLabel}</span>
                  <strong>{segment.title}</strong>
                </div>
              ))}
            </div>
            <div className="video-script-body" style={{ marginTop: 12 }}>
              <strong>学习目标：</strong>
              {plan.goals.join("；")}
              <br />
              <br />
              <strong>课程收束：</strong>
              {plan.wrap}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LessonSupportLinks({ onOpen }) {
  const items = [
    { id: "tutor", label: "🤖 AI导师", desc: "针对当前课时提问并获取解释" },
    { id: "create", label: "🎵 创作", desc: "把本课知识转成旋律与节奏实践" },
    { id: "lab", label: "🧪 实验室", desc: "进入音乐实验室做扩展探索" },
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
  const content = LESSON_CONTENT[lesson.id] || [];
  const handleScore = (v) => setScore(lesson.id, v);
  const displayTabs = [
    { id: "learn", label: "课前预习" },
    { id: "content", label: "内容呈现" },
    { id: "classroom", label: "课堂练习" },
    { id: "homework", label: "课后作业" },
  ];
  const tabs = [
    { id: "learn", label: "📖 学习" },
    { id: "content", label: "内容呈现" },
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
        <Tag color="#3C3489" bg="#EEEDFE">第{lesson.n}课</Tag>
        <Stars value={ratings[lesson.id] || 0} onChange={v => setRating(lesson.id, v)} size={16} />
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 16px" }}>{lesson.t}</h2>

      <div className="chip-tabs">
        {displayTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`chip-tab${tab === t.id ? " is-active" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "learn" && (
        <div className="lesson-layout" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div className="lesson-main">
            <div className="section-stack">
              {content.map((s, i) => (
                <div key={i} className="section-card">
                  <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--color-border-tertiary)" }}>{s.h}</div>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.9, whiteSpace: "pre-wrap" }}>{s.b}</div>
                  {lesson.id === "L1" && i === 0 && (
                    <>
                      <InteractivePitchFrequencyWidgetCn />
                      <InteractiveVolumeAmplitudeWidgetCn />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="lesson-side">
            {lesson.id !== "L1" && <div className="section-card"><LessonCharts lessonId={lesson.id} /></div>}
            <div className="section-card" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0.96), rgba(42,42,42,0.94))", color: "#ffffff" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>课前预习建议</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.8 }}>先完成本课正文阅读与互动预习，再进入内容呈现翻阅 PPT。理解核心概念后，再进入课堂练习、AI 导师与创作模块。</div>
            </div>
            <div className="section-card" style={{ background: "linear-gradient(180deg, rgba(17,17,17,0.96), rgba(42,42,42,0.94))", color: "#ffffff", display: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>学习路径建议</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.8 }}>阅读完成后 → 课堂练习检验理解 → AI导师解答疑惑 → 音乐创作实践 → 实验室探索</div>
            </div>
            <div className="section-card" style={{ display: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>延伸入口</div>
              <LessonSupportLinks onOpen={setTab} />
            </div>
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="lesson-layout" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div className="lesson-main">
          <LessonLearningWorkspace lesson={lesson} section="content" showTabs={false} />
          </div>
          <div className="lesson-side">
            <div className="section-card" style={{ display: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>内容呈现提示</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                先使用钢琴互动区试听音高，再在下方翻页查看本课 PPT 内容。
                <br />
                PPT 以内嵌分页方式展示，适合手机端直接浏览。
              </div>
            </div>
            <div className="section-card" style={{ display: "none" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>学习提醒</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                连续点击两个音后观察音程度数、半音数与解释。
                <br />
                建议先从相邻音开始，再逐步扩展到三度、五度和八度。
              </div>
            </div>
            <div className="section-card" style={{ display: lesson.id === "L1" ? "none" : "block" }}>
              <LessonCharts lessonId={lesson.id} />
            </div>
          </div>
        </div>
      )}

      {tab === "classroom" && (
        <div className="lesson-layout" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
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
                先完成本节小测与进阶快答，再继续下方练习模块。
                <br />
                系统会记录错误类型，供课后作业与教师后台汇总使用。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "homework" && (
        <div className="lesson-layout" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div className="lesson-main">
          <LessonLearningWorkspace lesson={lesson} section="homework" showTabs={false} />
          </div>
          <div className="lesson-side">
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>作业规范</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                建议按“概念解释、示例、错误反思”三部分完成。
                <br />
                提交前检查术语是否准确，例子是否与本课核心概念对应。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "tutor" && <AITutorV2 lessonId={lesson.id} lessonTitle={lesson.t} />}

      {tab === "create" && (
        <div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>旋律音序器</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>点击网格放置音符，按播放试听。试着运用本课的乐理知识创作旋律！</div>
            <MusicCreatorV2 />
          </div>
        </div>
      )}

      {tab === "lab" && (
        <div>
          <div className="section-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>音乐实验室 · {lesson.labN}</div>
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
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>点击「打开」加载实验（建议 Chrome 浏览器）</div>
              </div>
            )}
          </div>
          <a href={lesson.lab} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", fontSize: 11, color: "#185FA5", padding: 8, textDecoration: "none" }}>新窗口打开 →</a>
        </div>
      )}

      <div className="section-card" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>课程评价</span>
        <Stars value={ratings[lesson.id] || 0} onChange={v => setRating(lesson.id, v)} size={22} />
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{ratings[lesson.id] ? `${ratings[lesson.id]}/5` : ""}</span>
      </div>
    </div>
  );
}

/* ─── Assessment ─── */
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

function LessonLearningWorkspaceV2({ lesson, lessonData, section, showTabs = true, onPracticeScore }) {
  const [activeSection, setActiveSection] = useState(section || "content");
  const [reviewedPoints, setReviewedPoints] = useState([]);
  const [exerciseDone, setExerciseDone] = useState(() => lessonData.inClassExercises.map(() => false));
  const [exerciseNotes, setExerciseNotes] = useState(() => lessonData.inClassExercises.map(() => ""));
  const [homeworkRemaining, setHomeworkRemaining] = useState(30 * 60);
  const [homeworkRunning, setHomeworkRunning] = useState(false);
  const [homeworkDraft, setHomeworkDraft] = useState("");
  const [homeworkSubmitted, setHomeworkSubmitted] = useState(false);
  const [homeworkFeedback, setHomeworkFeedback] = useState("");
  const [showHomeworkDialog, setShowHomeworkDialog] = useState(false);
  const [stats, setStats] = useState(() => ({
    startedAt: Date.now(),
    interactions: 0,
    errors: 0,
    errorTypes: {},
    lastExplanation: "先阅读本课知识点，再进入课堂练习与课后作业完成巩固。",
  }));

  const studyMinutes = Math.max(1, Math.ceil((Date.now() - stats.startedAt) / 60000));
  const completedExercises = exerciseDone.filter(Boolean).length;

  useEffect(() => {
    if (section && section !== activeSection) {
      setActiveSection(section);
    }
  }, [section, activeSection]);

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

  useEffect(() => {
    const score = lessonData.inClassExercises.length
      ? Math.round((completedExercises / lessonData.inClassExercises.length) * 100)
      : 0;
    onPracticeScore?.(score);
  }, [completedExercises, lessonData.inClassExercises.length, onPracticeScore]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      reportStudentAnalytics({
        lessonId: lesson.id,
        lessonTitle: lessonData.lessonTitle,
        source: "learning-workspace-ppt",
        section: activeSection,
        studyMinutes,
        interactions: stats.interactions,
        errors: stats.errors,
        errorTypes: stats.errorTypes,
        homeworkRemaining,
        homeworkSubmitted,
        homeworkLength: homeworkDraft.length,
        completedExercises,
        lastExplanation: stats.lastExplanation,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [lesson.id, lessonData.lessonTitle, activeSection, studyMinutes, stats, homeworkRemaining, homeworkSubmitted, homeworkDraft.length, completedExercises]);

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

  const markPointReviewed = (index) => {
    setReviewedPoints((prev) => (prev.includes(index) ? prev : [...prev, index]));
    setStats((prev) => ({
      ...prev,
      interactions: prev.interactions + 1,
      lastExplanation: lessonData.knowledgePoints[index]?.detail || prev.lastExplanation,
    }));
  };

  const toggleExerciseDone = (index) => {
    setExerciseDone((prev) => prev.map((item, idx) => (idx === index ? !item : item)));
    setStats((prev) => ({
      ...prev,
      interactions: prev.interactions + 1,
      lastExplanation: `已更新课堂练习 ${index + 1} 的完成状态。`,
    }));
  };

  const updateExerciseNote = (index, value) => {
    setExerciseNotes((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const openHomeworkSubmit = () => {
    if (!homeworkDraft.trim()) {
      setHomeworkFeedback("请先在本页完成作业内容，再提交。");
      return;
    }
    setShowHomeworkDialog(true);
  };

  const confirmHomeworkSubmit = () => {
    const feedback = homeworkDraft.length > 120
      ? `已提交。你的作业覆盖较完整，下一步请重点检查“${lessonData.difficultPoints[0]}”是否解释清楚。`
      : `已提交。当前作答偏简略，建议补充“${lessonData.keyPoints[0]}”和“${lessonData.difficultPoints[0]}”相关说明。`;
    setHomeworkSubmitted(true);
    setHomeworkRunning(false);
    setHomeworkFeedback(feedback);
    setStats((prev) => ({
      ...prev,
      interactions: prev.interactions + 1,
      lastExplanation: feedback,
    }));
    setShowHomeworkDialog(false);
  };

  const formattedHomeworkTime = `${String(Math.floor(homeworkRemaining / 60)).padStart(2, "0")}:${String(homeworkRemaining % 60).padStart(2, "0")}`;

  return (
    <div style={{ marginTop: 10, marginBottom: 14 }}>
      {showTabs && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button onClick={() => setActiveSection("content")} style={sectionButtonStyle("content")}>内容呈现</button>
          <button onClick={() => setActiveSection("practice")} style={sectionButtonStyle("practice")}>课堂练习</button>
          <button onClick={() => setActiveSection("homework")} style={sectionButtonStyle("homework")}>课后作业</button>
        </div>
      )}

      {activeSection === "content" && (
        <div className="section-stack">
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 10 }}>内容呈现</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 14 }}>
              本页按照 PPT 的 6 个知识点展开。点击任一知识点卡片，可将其标记为已阅读并记录学习进度。
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {lessonData.knowledgePoints.map((item, index) => (
                <button
                  key={`${lesson.id}-point-${index}`}
                  onClick={() => markPointReviewed(index)}
                  className="subtle-card"
                  style={{
                    textAlign: "left",
                    padding: 14,
                    borderRadius: 14,
                    border: reviewedPoints.includes(index) ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                    background: reviewedPoints.includes(index) ? "rgba(17,17,17,0.04)" : "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>知识点 {index + 1}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item.detail}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>重点与难点对照</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <div className="subtle-card" style={{ padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>本课重点</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {lessonData.keyPoints.map((item) => (
                    <div key={item} style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="subtle-card" style={{ padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>本课难点</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {lessonData.difficultPoints.map((item) => (
                    <div key={item} style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>知识点图表</div>
            <LessonCharts lessonId={lesson.id} />
          </div>
        </div>
      )}

      {activeSection === "practice" && (
        <div className="section-stack">
          <div className="section-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 4 }}>课堂练习</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  本页题干直接来自 PPT，每课固定 4 道课堂练习，不再使用旧的通用题库。
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                已完成 {completedExercises}/{lessonData.inClassExercises.length}
              </div>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {lessonData.inClassExercises.map((item, index) => (
                <div key={`${lesson.id}-exercise-${index}`} className="subtle-card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>练习 {index + 1}</div>
                    <button
                      onClick={() => toggleExerciseDone(index)}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 9,
                        border: "1px solid rgba(17,17,17,0.12)",
                        background: exerciseDone[index] ? "#111111" : "#ffffff",
                        color: exerciseDone[index] ? "#ffffff" : "#111111",
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {exerciseDone[index] ? "已完成" : "标记完成"}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.8, marginBottom: 10 }}>{item}</div>
                  <textarea
                    value={exerciseNotes[index]}
                    onChange={(e) => updateExerciseNote(index, e.target.value)}
                    placeholder="记录你的作答要点、疑问或教师讲评摘要。"
                    style={{ width: "100%", minHeight: 88, borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", padding: 10, fontSize: 12, lineHeight: 1.8, resize: "vertical", outline: "none" }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeSection === "homework" && (
        <div className="section-stack">
          <div className="section-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>课后作业</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  打开本页后自动开始 30 分钟倒计时。以下 3 项作业均依据本课知识点、重点和难点生成。
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#111111" }}>{formattedHomeworkTime}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {lessonData.homework.map((item, index) => (
                <div key={`${lesson.id}-homework-${index}`} className="subtle-card" style={{ padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>作业 {index + 1}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button onClick={() => setHomeworkRunning(true)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>继续计时</button>
              <button onClick={() => setHomeworkRunning(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#ffffff", cursor: "pointer" }}>暂停</button>
              <button onClick={() => { setHomeworkRunning(false); setHomeworkRemaining(30 * 60); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>重置为 30 分钟</button>
            </div>
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>本页完成并提交作业</div>
            <textarea
              value={homeworkDraft}
              onChange={(e) => setHomeworkDraft(e.target.value)}
              placeholder="在这里直接完成本课课后作业，可整理概念、回答规则应用题，或写你的举例分析。"
              style={{ width: "100%", minHeight: 170, borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", padding: 12, fontSize: 12, lineHeight: 1.8, resize: "vertical", outline: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                学习时长约 {studyMinutes} 分钟，课堂练习完成 {completedExercises}/{lessonData.inClassExercises.length}。
              </div>
              <button onClick={openHomeworkSubmit} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>
                提交作业
              </button>
            </div>
            {homeworkFeedback && <div style={{ marginTop: 10, fontSize: 11, color: homeworkSubmitted ? "#166534" : "#b91c1c" }}>{homeworkFeedback}</div>}
          </div>
          {showHomeworkDialog && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.36)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
              <div style={{ width: "min(560px, 100%)", background: "#ffffff", borderRadius: 16, padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>确认提交课后作业</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
                  当前剩余时间 {formattedHomeworkTime}，正文 {homeworkDraft.length} 字。提交后会在本页生成反馈摘要。
                </div>
                <div style={{ maxHeight: 180, overflow: "auto", fontSize: 12, lineHeight: 1.8, color: "#111111", padding: 12, borderRadius: 12, background: "#f8f8f8", marginBottom: 12 }}>
                  {homeworkDraft}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button onClick={() => setShowHomeworkDialog(false)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>继续修改</button>
                  <button onClick={confirmHomeworkSubmit} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>确认提交</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LessonViewV2({ lesson, ratings, setRating, scores, setScore }) {
  const [tab, setTab] = useState("learn");
  const [labOpen, setLabOpen] = useState(false);
  const lessonData = getPptLessonData(lesson.id);
  const handleScore = useCallback((value) => setScore(lesson.id, value), [lesson.id, setScore]);

  const tabs = [
    { id: "learn", label: "学习" },
    { id: "content", label: "内容呈现" },
    { id: "classroom", label: "课堂练习" },
    { id: "homework", label: "课后作业" },
  ];

  useEffect(() => {
    reportStudentAnalytics({
      lessonId: lesson.id,
      lessonTitle: lessonData?.lessonTitle || lesson.t,
      source: "lesson-summary-ppt",
      section: tab,
      score: scores[lesson.id] || 0,
      rating: ratings[lesson.id] || 0,
    });
  }, [lesson.id, lesson.t, lessonData, tab, scores, ratings]);

  if (!lessonData) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <Tag color="#111111" bg="#F3F4F6">{`第 ${lessonData.lessonNumber} 课时`}</Tag>
        <Tag color="#4B5563" bg="#F9FAFB">{lessonData.chapter}</Tag>
        <Stars value={ratings[lesson.id] || 0} onChange={(value) => setRating(lesson.id, value)} size={16} />
      </div>
      <h2 style={{ fontSize: 26, fontWeight: 700, margin: "4px 0 10px" }}>{lessonData.lessonTitle}</h2>

      <div className="chip-tabs">
        {tabs.map((item) => (
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
        <div className="lesson-layout">
          <div className="lesson-main">
            <div className="section-stack">
              <div className="section-card">
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>本课知识点</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  {lessonData.knowledgePoints.map((item, index) => (
                    <div key={`${lesson.id}-learn-kp-${index}`} className="subtle-card" style={{ padding: 14 }}>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>知识点 {index + 1}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-card">
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>重点与难点</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                  <div className="subtle-card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>本课重点</div>
                    {lessonData.keyPoints.map((item) => (
                      <div key={item} style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 6 }}>{item}</div>
                    ))}
                  </div>
                  <div className="subtle-card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>本课难点</div>
                    {lessonData.difficultPoints.map((item) => (
                      <div key={item} style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 6 }}>{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="lesson-side">
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>学习路径建议</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                先通读本课知识点与重点难点，再进入内容呈现逐点学习，随后完成课堂练习，最后在课后作业页整理与提交作答。
              </div>
            </div>
            <div className="section-card">
              <LessonCharts lessonId={lesson.id} />
            </div>
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>延伸入口</div>
              <LessonSupportLinksV2 onOpen={setTab} />
            </div>
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="lesson-layout">
          <div className="lesson-main">
            <LessonLearningWorkspaceV2 lesson={lesson} lessonData={lessonData} section="content" showTabs={false} onPracticeScore={handleScore} />
          </div>
          <div className="lesson-side">
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>学习提醒</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                内容呈现页只保留与当前课时知识点直接相关的信息，不再显示旧版泛化文案或视频内容。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "classroom" && (
        <div className="lesson-layout">
          <div className="lesson-main">
            <LessonLearningWorkspaceV2 lesson={lesson} lessonData={lessonData} section="practice" showTabs={false} onPracticeScore={handleScore} />
          </div>
          <div className="lesson-side">
            <div className="section-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>课堂练习完成度</span>
              <div style={{ flex: 1 }}><PBar v={scores[lesson.id] || 0} max={100} color="#111111" /></div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111111" }}>{scores[lesson.id] || 0}%</span>
            </div>
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>练习说明</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                本页题干直接对应 PPT 的课堂练习页。建议边做边记录答案要点，便于后续教师点评与课后整理。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "homework" && (
        <div className="lesson-layout">
          <div className="lesson-main">
            <LessonLearningWorkspaceV2 lesson={lesson} lessonData={lessonData} section="homework" showTabs={false} onPracticeScore={handleScore} />
          </div>
          <div className="lesson-side">
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>作业要求</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                建议按“概念整理 → 规则应用 → 举例分析”的顺序完成。提交前检查是否覆盖了本课重点与难点。
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "tutor" && <AITutorV2 lessonId={lesson.id} lessonTitle={lessonData.lessonTitle} />}

      {tab === "create" && (
        <div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>旋律音序器</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>点击网格放置音符并试听，把本课知识用于音乐创作。</div>
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
          <a href={lesson.lab} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", fontSize: 11, color: "#185FA5", padding: 8, textDecoration: "none" }}>新窗口打开 →</a>
        </div>
      )}

      <div className="section-card" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>课程评价</span>
        <Stars value={ratings[lesson.id] || 0} onChange={(value) => setRating(lesson.id, value)} size={22} />
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{ratings[lesson.id] ? `${ratings[lesson.id]}/5` : ""}</span>
      </div>
    </div>
  );
}

function AssessmentPage({ scores, ratings }) {
  const done = ALL_LESSONS.filter(l => (scores[l.id] || 0) > 0).length;
  const avg = ALL_LESSONS.length > 0 ? Math.round(ALL_LESSONS.reduce((s, l) => s + (scores[l.id] || 0), 0) / ALL_LESSONS.length) : 0;
  const rated = ALL_LESSONS.filter(l => (ratings[l.id] || 0) > 0);
  const avgR = rated.length > 0 ? (rated.reduce((s, l) => s + ratings[l.id], 0) / rated.length).toFixed(1) : "—";
  const lv = s => s >= 80 ? "优秀" : s >= 60 ? "良好" : s >= 30 ? "一般" : s > 0 ? "需加强" : "未开始";

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
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 60, flexShrink: 0 }}>第{l.n}课</span>
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
          {avg === 0 ? "开始任意课程后，AI将根据表现生成个性化建议。"
            : avg < 40 ? "建议每天15-20分钟短时练习，重点巩固基础。配合AI导师解答疑惑。"
            : avg < 70 ? "基础良好！重点攻克薄弱章节，在创作工具中实践理论知识。"
            : "表现优秀！挑战综合题目，用创作工具运用高级和声与节奏技法。"}
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
                  访问课时：{student.lessonsVisited}，平均得分：{student.averageScore}%<br />
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
              {(record.homeworkLength || record.homeworkRhythmData || record.homeworkStaffData || (Array.isArray(record.homeworkImages) && record.homeworkImages.length > 0)) && (
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

/* ─── Home ─── */
function HomePage({ setPage, scores }) {
  return (
    <div>
      <div style={{ textAlign: "center", padding: "30px 16px 22px" }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#534AB7", letterSpacing: 2, marginBottom: 4 }}>AI 驱动 · 自主学习</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>乐理智学平台</h1>
        <p style={{ display: "none", fontSize: 13, color: "var(--color-text-secondary)", maxWidth: 440, margin: "0 auto", lineHeight: 1.7 }}>
          12课时完整课程 · AI自适应练习 · 智能导师答疑 · 旋律创作 · 互动音乐实验室
        </p>
      </div>
      {CHAPTERS.map((ch, ci) => {
        const ca = Math.round(ch.ls.reduce((s, l) => s + (scores[l.id] || 0), 0) / ch.ls.length);
        return (
          <div key={ch.id} style={{ marginBottom: 8, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: ch.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: ch.c }}>{ci + 1}</div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{ch.t}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: ch.c }}>{ca}%</span>
            </div>
            <PBar v={ca} max={100} color={ch.c} />
            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {ch.ls.map(l => (
                <button key={l.id} onClick={() => setPage(l.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "0.5px solid var(--color-border-tertiary)", background: (scores[l.id] || 0) > 50 ? ch.bg : "var(--color-background-secondary)", color: (scores[l.id] || 0) > 50 ? ch.c : "var(--color-text-secondary)", cursor: "pointer", fontWeight: 500 }}>
                  第{l.n}课{(scores[l.id] || 0) > 0 ? ` ${scores[l.id]}%` : ""}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div style={{ display: "none", background: "var(--color-background-secondary)", borderRadius: 10, padding: "14px 16px", marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>五大学习模式</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {[
            { i: "📖", t: "知识讲解", d: "每课完整知识点" },
            { i: "🎯", t: "AI自适应练习", d: "智能调整难度" },
            { i: "🤖", t: "AI导师答疑", d: "随时提问辅导" },
            { i: "🎵", t: "旋律创作", d: "音序器实践" },
            { i: "🧪", t: "Chrome实验室", d: "互动音乐实验" },
          ].map((f, i) => (
            <div key={i} style={{ padding: 8, borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)" }}>
              <div style={{ fontSize: 13, marginBottom: 2 }}>{f.i} <span style={{ fontSize: 12, fontWeight: 500 }}>{f.t}</span></div>
              <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── App Shell ─── */
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
            每个单元下直接展示课时卡片。点击课时即可进入学习、练习、AI 导师、创作与实验模块。
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
                  第 {String(ci + 1).padStart(2, "0")} 单元
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

            <div className="lesson-grid">
              {ch.ls.map((l) => (
                <button key={l.id} className="lesson-tile" onClick={() => setPage(l.id)}>
                  <div className="lesson-kicker">
                    <span className="lesson-no">第 {String(l.n).padStart(2, "0")} 课</span>
                    <span className="lesson-status">{(scores[l.id] || 0) > 0 ? `已完成 ${scores[l.id]}%` : "未开始"}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 8, lineHeight: 1.45 }}>
                    {l.t}
                  </div>
                  <div style={{ fontSize: 12, color: "#5a5a5a", lineHeight: 1.7 }}>
                    进入本课后可完成学习、练习、提问与创作实践。
                  </div>
                  <div className="lesson-cta">
                    <span className="motion-bars"><span /><span /><span /></span>
                    <span>打开课时工作区</span>
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

  const handleSetScore = (id, v) => setScores(prev => ({ ...prev, [id]: Math.max(prev[id] || 0, v) }));
  const handleSetRating = (id, v) => setRatings(prev => ({ ...prev, [id]: v }));

  const currentLesson = ALL_LESSONS.find(l => l.id === page);

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
      {/* Sidebar */}
      <div style={{ width: sideOpen ? 280 : 0, overflow: "hidden", transition: "width 0.25s", flexShrink: 0 }}>
        <div className="sidebar-shell">
          <div onClick={() => { setPage("home"); setSideOpen(false); }} style={{ padding: "10px 12px", borderRadius: 14, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 8, color: page === "home" ? "#111111" : "var(--color-text-primary)", background: page === "home" ? "rgba(17,17,17,0.08)" : "transparent" }}>
            首页
          </div>
          {CHAPTERS.map(ch => (
            <div key={ch.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", padding: "4px 12px", letterSpacing: "0.08em" }}>{ch.t}</div>
              {ch.ls.map(l => (
                <div key={l.id} onClick={() => { setPage(l.id); setSideOpen(false); }}
                  style={{ padding: "9px 12px", borderRadius: 14, cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", background: page === l.id ? "rgba(17,17,17,0.08)" : "transparent", color: page === l.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", marginBottom: 2 }}>
                  <span>第{l.n}课 {l.t.length > 6 ? l.t.slice(0, 6) + "…" : l.t}</span>
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

      {/* Main */}
      <div className="main-shell">
        <header className="topbar-shell">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setSideOpen(!sideOpen)} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 14 }}>☰</button>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(135deg,#111,#434343)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>M</div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>乐理智学</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {currentLesson && <Tag color="#3C3489" bg="#EEEDFE">第{currentLesson.n}课</Tag>}
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
          AI辅助乐理学习平台 · 基于个性化AI音乐教育研究
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", marginTop: 0 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>贡献者：Gaun Xingzhi</span>
            <img src="/images/ucsi-logo-user.jpg" alt="UCSI University" style={{ height: 42, width: "auto", objectFit: "contain", display: "block" }} />
          </div>
        </footer>
      </div>
    </div>
  );
}
