import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { getPptLessonData, PPT_CHAPTERS } from "./pptLessonData";
import { getKnowledgePointsForLesson } from "./musicaiKnowledge";
import { getQuestionsForLesson } from "./musicaiQuestionBank";
import { buildPilotTemplateCsv, buildPilotTemplateJson, REAL_STUDENT_PILOT_TEMPLATES } from "./studentPilotTemplate";
import {
  appendErrorRecord,
  appendSessionRecord,
  appendTutorHistory,
  buildKnowledgeMirrorPayload,
  chooseAdaptivePracticeQuestions,
  clearVirtualStudentsFromLocalStorage,
  createVirtualStudents,
  getKnowledgeMapping,
  getRecommendationFromSummary,
  initializeKnowledgeStore,
  setKnowledgeMapping,
  summarizeLessonKnowledge,
  updateKnowledgePointEvidence,
  writeVirtualStudentsToLocalStorage,
} from "./musicaiBkt";

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

const CHAPTERS = PPT_CHAPTERS;
const ALL_LESSONS = CHAPTERS.flatMap((chapter) => chapter.ls);

function Tag({ children, color = "#111111", bg = "#F5F5F5" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
        border: "1px solid rgba(17,17,17,0.08)",
      }}
    >
      {children}
    </span>
  );
}

function PBar({ v = 0, max = 100, color = "#111111" }) {
  const safeMax = Math.max(1, Number(max) || 100);
  const percent = Math.max(0, Math.min(100, (Number(v) || 0) / safeMax * 100));
  return (
    <div
      style={{
        width: "100%",
        height: 8,
        borderRadius: 999,
        background: "rgba(17,17,17,0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${percent}%`,
          height: "100%",
          borderRadius: 999,
          background: color,
          transition: "width 0.25s ease",
        }}
      />
    </div>
  );
}

function Stars({ value = 0, onChange, size = 16 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange?.(star)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              margin: 0,
              cursor: onChange ? "pointer" : "default",
              fontSize: size,
              lineHeight: 1,
              color: active ? "#f59e0b" : "rgba(17,17,17,0.18)",
            }}
            aria-label={`评分 ${star} 星`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function FeedbackBar({ ok, msg, onNext }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: ok ? "#EAF8F1" : "#FDECEC",
        border: `1px solid ${ok ? "#9AD9BC" : "#F1B5B5"}`,
        marginTop: 10,
      }}
    >
      <span style={{ fontSize: 12, color: ok ? "#0F6E56" : "#B42318", fontWeight: 600 }}>
        {ok ? "回答正确：" : "需要修正："}
        {msg}
      </span>
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#fff", cursor: "pointer", fontSize: 12 }}
        >
          下一题
        </button>
      ) : null}
    </div>
  );
}

function LessonCharts({ lessonId }) {
  const lessonsWithCharts = new Set(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12"]);
  if (!lessonsWithCharts.has(lessonId)) return null;

  const barSets = {
    L1: [26, 39, 52, 78, 100],
    L2: [22, 31, 48, 66, 84],
    L3: [18, 30, 45, 63, 82],
    L4: [25, 40, 58, 74, 92],
    L5: [24, 36, 51, 68, 88],
    L6: [28, 41, 57, 73, 90],
    L7: [19, 34, 49, 62, 81],
    L8: [23, 38, 54, 70, 86],
    L9: [20, 37, 55, 72, 91],
    L10: [21, 35, 53, 69, 87],
    L11: [24, 42, 59, 76, 94],
    L12: [30, 45, 60, 80, 100],
  };
  const bars = barSets[lessonId] || [30, 48, 66, 84, 100];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="subtle-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>知识点分布图</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 124 }}>
          {bars.map((value, index) => (
            <div key={`${lessonId}-bar-${index}`} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 96, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                <div style={{ width: "100%", maxWidth: 34, height: `${value}%`, borderRadius: 10, background: "#111111" }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 6 }}>{`点 ${index + 1}`}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="subtle-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>学习重点提示</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          图表用于辅助理解当前课时的知识重心。建议先阅读课前预习，再结合图示完成课堂练习。
        </div>
      </div>
    </div>
  );
}

function InteractivePitchFrequencyWidgetCn() {
  const noteItems = [
    { label: "C3", freq: 130.81, tip: "频率较低，听感较沉稳。" },
    { label: "G3", freq: 196.0, tip: "频率上升，音高更明亮。" },
    { label: "C4", freq: 261.63, tip: "中央 C，常作为参考音。" },
    { label: "G4", freq: 392.0, tip: "高音区更明显，频率继续升高。" },
    { label: "C5", freq: 523.25, tip: "与 C4 构成八度，频率接近翻倍。" },
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
        点击不同音键试听，并观察频率柱状变化。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
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
                }}
              >
                <div style={{ width: "100%", height, borderRadius: 10, background: active ? "#111111" : "#D1D5DB" }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginTop: 10 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>{`${item.freq} Hz`}</div>
              </button>
            );
          })}
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
    { label: "pp", amp: 0.18, volume: 0.1, desc: "很弱，振幅最小。" },
    { label: "p", amp: 0.3, volume: 0.16, desc: "较弱，保持柔和。" },
    { label: "mp", amp: 0.46, volume: 0.22, desc: "中弱，振幅抬升。" },
    { label: "mf", amp: 0.64, volume: 0.3, desc: "中强，常规演奏力度。" },
    { label: "f", amp: 0.82, volume: 0.4, desc: "较强，听感更饱满。" },
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
    setFb({ ok, msg: ok ? `正确，答案是 ${NT[target]}` : `错误，正确答案是 ${NT[target]}` });
    onScore?.(Math.min(100, Math.round((newC / newT) * 100)));
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
          <div style={{ fontSize: 28, fontWeight: 700, color: "#534AB7" }}>{NT[target]}</div>
        </div>
      )}
      <div style={{ position: "relative", height: 120, margin: "0 auto", width: WK.length * 36, userSelect: "none" }}>
        {WK.map((ni, i) => (
          <div key={ni} onClick={() => handleKey(ni)} style={{ position: "absolute", left: i * 36, top: 0, width: 34, height: 112, background: active === ni ? "#E1F5EE" : "#fff", border: "1px solid var(--color-border-secondary)", borderRadius: "0 0 5px 5px", cursor: "pointer", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 5, fontSize: 10, color: "var(--color-text-tertiary)", zIndex: 1 }}>{NT[ni]}</div>
        ))}
        {BK.map((ni) => {
          const wPos = WK.filter((w) => w < ni).length;
          return (
            <div key={ni} onClick={() => handleKey(ni)} style={{ position: "absolute", left: wPos * 36 - 12, top: 0, width: 24, height: 72, background: active === ni ? "#534AB7" : "#2C2C2A", borderRadius: "0 0 3px 3px", cursor: "pointer", zIndex: 2, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4, fontSize: 9, color: "#999" }}>{NT[ni]}</div>
          );
        })}
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} onNext={generate} />}
    </div>
  );
}

function IntervalExercise({ onScore }) {
  const [q, setQ] = useState(null);
  const [fb, setFb] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const generate = useCallback(() => {
    const iv = INTERVALS[Math.floor(Math.random() * INTERVALS.length)];
    const rootIdx = WK[Math.floor(Math.random() * WK.length)];
    setQ({ iv, root: NT[rootIdx] });
    setFb(null);
  }, []);

  useEffect(() => { generate(); }, [generate]);

  const hear = async () => {
    if (!q) return;
    await unlockAudioSystem();
    const f = nFreq(q.root, 4);
    playTone(f, 0.5, "piano", 0.22);
    setTimeout(() => playTone(f * Math.pow(2, q.iv.s / 12), 0.5, "piano", 0.22), 400);
  };

  const answer = (name) => {
    if (!q || fb) return;
    const ok = name === q.iv.n;
    const newC = correct + (ok ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    setFb({ ok, msg: ok ? `正确，${q.iv.n}` : `错误，正确答案是 ${q.iv.n}` });
    onScore?.(Math.min(100, Math.round((newC / newT) * 100)));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>根音：<strong>{q && q.root}</strong></span>
        <Tag color="#085041" bg="#E1F5EE">{correct}/{total}</Tag>
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button onClick={hear} style={{ padding: "8px 20px", borderRadius: 14, background: "#534AB7", color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>播放音程</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 6 }}>
        {INTERVALS.map((iv) => (
          <button key={iv.n} onClick={() => answer(iv.n)} disabled={!!fb} style={{ padding: "7px 4px", borderRadius: 6, border: "1px solid var(--color-border-tertiary)", background: "#fff", cursor: fb ? "default" : "pointer", fontSize: 12, fontWeight: 500, opacity: fb ? 0.6 : 1 }}>
            {iv.n}
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{iv.s} 半音</div>
          </button>
        ))}
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} onNext={generate} />}
    </div>
  );
}

function ChordExercise({ onScore }) {
  const [q, setQ] = useState(null);
  const [fb, setFb] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const generate = useCallback(() => {
    const ch = CHORDS[Math.floor(Math.random() * CHORDS.length)];
    const ri = WK[Math.floor(Math.random() * WK.length)];
    setQ({ ch, root: NT[ri], ri });
    setFb(null);
  }, []);

  useEffect(() => { generate(); }, [generate]);

  const playChord = async () => {
    if (!q) return;
    await unlockAudioSystem();
    const f = nFreq(q.root, 4);
    q.ch.iv.forEach((s, i) => setTimeout(() => playTone(f * Math.pow(2, s / 12), 0.7, "piano", 0.18), i * 60));
  };

  const answer = (name) => {
    if (!q || fb) return;
    const ok = name === q.ch.n;
    const newC = correct + (ok ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    setFb({ ok, msg: ok ? `正确，${q.ch.n}` : `错误，正确答案是 ${q.ch.n}` });
    onScore?.(Math.min(100, Math.round((newC / newT) * 100)));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>根音：<strong>{q && q.root}</strong></span>
        <Tag color="#0C447C" bg="#E6F1FB">{correct}/{total}</Tag>
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button onClick={playChord} style={{ padding: "8px 20px", borderRadius: 14, background: "#185FA5", color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>播放和弦</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 6 }}>
        {CHORDS.map((ch) => (
          <button key={ch.n} onClick={() => answer(ch.n)} disabled={!!fb} style={{ padding: 8, borderRadius: 6, border: "1px solid var(--color-border-tertiary)", background: "#fff", cursor: fb ? "default" : "pointer", fontSize: 12, fontWeight: 500, opacity: fb ? 0.6 : 1 }}>
            {ch.n}
          </button>
        ))}
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} onNext={generate} />}
    </div>
  );
}

function NotationExercise({ onScore }) {
  const [clef, setClef] = useState(0);
  const [note, setNote] = useState(null);
  const [fb, setFb] = useState(null);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const trebleNotes = ["E4", "F4", "G4", "A4", "B4", "C5", "D5"];
  const bassNotes = ["G2", "A2", "B2", "C3", "D3", "E3", "F3"];
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
    setFb({ ok, msg: ok ? `正确，${note}` : `错误，正确答案是 ${note}` });
    onScore?.(Math.min(100, Math.round((newC / newT) * 100)));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
        {["高音谱号", "低音谱号"].map((label, i) => (
          <button key={i} onClick={() => setClef(i)} style={{ flex: 1, padding: 6, borderRadius: 6, fontSize: 12, cursor: "pointer", background: i === clef ? "#FAEEDA" : "transparent", border: `1px solid ${i === clef ? "#EF9F27" : "var(--color-border-tertiary)"}` }}>{label}</button>
        ))}
        <Tag color="#633806" bg="#FAEEDA">{correct}/{total}</Tag>
      </div>
      <div style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: 12, textAlign: "center", marginBottom: 8 }}>
        <svg width="220" height="92" viewBox="0 0 220 92">
          {[16, 32, 48, 64, 80].map((y, i) => <line key={i} x1="24" y1={y} x2="200" y2={y} stroke="var(--color-border-secondary)" strokeWidth="0.7" />)}
          <text x="6" y="54" fontSize="30" fill="var(--color-text-secondary)" fontFamily="serif">{clef === 0 ? "𝄞" : "𝄢"}</text>
          {note ? (
            <>
              <ellipse cx="120" cy={yPos} rx="8" ry="5.5" fill="#854F0B" transform={`rotate(-10 120 ${yPos})`} />
              <line x1="128" y1={yPos} x2="128" y2={yPos - 24} stroke="#854F0B" strokeWidth="1.5" />
            </>
          ) : null}
        </svg>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {["C", "D", "E", "F", "G", "A", "B"].map((letter) => (
          <button key={letter} onClick={() => answer(letter)} disabled={!!fb} style={{ flex: 1, padding: "9px 0", borderRadius: 6, fontSize: 15, fontWeight: 600, border: "1px solid var(--color-border-tertiary)", background: "#fff", cursor: fb ? "default" : "pointer", opacity: fb ? 0.6 : 1 }}>
            {letter}
          </button>
        ))}
      </div>
      {fb && <FeedbackBar ok={fb.ok} msg={fb.msg} onNext={generate} />}
    </div>
  );
}

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
    onScore?.(Math.min(100, Math.round((newC / newT) * 100)));
    setShow(false);
    setIdx((prev) => (prev + 1) % TERMS.length);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <Tag color="#3C3489" bg="#EEEDFE">术语卡片</Tag>
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
      {show ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => next(false)} style={{ flex: 1, padding: 9, borderRadius: 6, border: "1px solid #F09595", background: "#FCEBEB", color: "#791F1F", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>不熟悉</button>
          <button onClick={() => next(true)} style={{ flex: 1, padding: 9, borderRadius: 6, border: "1px solid #5DCAA5", background: "#E1F5EE", color: "#085041", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>已掌握</button>
        </div>
      ) : null}
    </div>
  );
}

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
    setPlaying(true);
    setTaps([]);
    setFb(null);
    let i = 0;
    timerRef.current = setInterval(() => {
      setBeat(i);
      if (pat.p[i]) playTone(800, 0.04, "square", 0.12);
      i += 1;
      if (i >= 8) {
        clearInterval(timerRef.current);
        setTimeout(() => {
          setBeat(-1);
          setPlaying(false);
        }, 250);
      }
    }, 250);
  };

  const check = () => {
    const filled = Array.from({ length: 8 }, (_, i) => taps[i] || 0);
    const ok = filled.every((v, i) => v === pat.p[i]);
    const newC = correct + (ok ? 1 : 0);
    const newT = total + 1;
    setCorrect(newC);
    setTotal(newT);
    setFb({ ok, msg: ok ? "节奏正确" : "节奏不匹配，请再听一遍" });
    onScore?.(Math.min(100, Math.round((newC / newT) * 100)));
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{pat.n}</span>
        <Tag color="#085041" bg="#E1F5EE">{correct}/{total}</Tag>
      </div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button onClick={doPlay} disabled={playing} style={{ padding: "7px 20px", borderRadius: 14, background: "#993C1D", color: "#fff", border: "none", fontSize: 13, cursor: playing ? "default" : "pointer", opacity: playing ? 0.7 : 1 }}>
          {playing ? "播放中..." : "听一遍"}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>参考：</div>
      <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
        {pat.p.map((v, i) => <div key={i} style={{ flex: 1, height: 28, borderRadius: 4, background: beat === i ? "#D85A30" : v ? "#F0997B" : "var(--color-background-tertiary)", transition: "all 0.1s" }} />)}
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>你的点击：</div>
      <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} onClick={() => { if (!playing) setTaps((prev) => { const next = [...prev]; next[i] = next[i] ? 0 : 1; return next; }); }} style={{ flex: 1, height: 28, borderRadius: 4, cursor: "pointer", background: taps[i] ? "#534AB7" : "var(--color-background-tertiary)", transition: "all 0.15s" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <button onClick={check} disabled={playing} style={{ flex: 1, padding: 7, borderRadius: 5, border: "1px solid var(--color-border-secondary)", background: "#fff", cursor: "pointer", fontSize: 12 }}>检查</button>
        <button onClick={() => { setPi((prev) => (prev + 1) % RHYTHMS.length); setTaps([]); setFb(null); }} style={{ flex: 1, padding: 7, borderRadius: 5, border: "1px solid var(--color-border-secondary)", background: "#fff", cursor: "pointer", fontSize: 12 }}>下一个</button>
      </div>
      {fb ? <FeedbackBar ok={fb.ok} msg={fb.msg} /> : null}
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

async function syncKnowledgeSummary(lessonId) {
  try {
    const profile = getStudentProfile();
    initializeKnowledgeStore(profile.studentId);
    const payload = buildKnowledgeMirrorPayload(profile.studentId, lessonId);
    await fetch("/api/bkt/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        userId: profile.studentId,
        studentLabel: profile.studentLabel,
      }),
    });
  } catch {}
}

function createKnowledgeMappingKey(lessonId, signature) {
  return `${lessonId}:${String(signature || "").slice(0, 120)}`;
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

async function compressImageFileToDataUrl(file, { maxWidth = 1280, maxHeight = 1280, quality = 0.82 } = {}) {
  const originalDataUrl = await fileToDataUrl(file);
  if (typeof document === "undefined") {
    return originalDataUrl;
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
      const targetWidth = Math.max(1, Math.round(image.width * scale));
      const targetHeight = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(originalDataUrl);
        return;
      }
      context.drawImage(image, 0, 0, targetWidth, targetHeight);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(originalDataUrl);
      }
    };
    image.onerror = () => resolve(originalDataUrl);
    image.src = originalDataUrl;
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
  L1: { id: "L1-Q1", lessonId: "L1", chapterId: "ch1", knowledgePointId: "L1_K1_pitchProperties", difficulty: "basic", prompt: "A4 的标准频率是多少？", options: ["220Hz", "440Hz", "523Hz"], answer: "440Hz", explanation: "A4=440Hz 是标准音高。" },
  L2: { id: "L2-Q1", lessonId: "L2", chapterId: "ch1", knowledgePointId: "L2_K2_temperamentEnharmonic", difficulty: "medium", prompt: "十二平均律中相邻半音的频率比约是多少？", options: ["1.5", "1.25", "1.0595"], answer: "1.0595", explanation: "十二平均律将八度平均分成 12 份。" },
  L3: { id: "L3-Q1", lessonId: "L3", chapterId: "ch2", knowledgePointId: "L3_K1_trebleClef", difficulty: "basic", prompt: "高音谱号的中心定位在线谱哪一线？", options: ["第二线", "第三线", "第四线"], answer: "第二线", explanation: "高音谱号将第二线定义为 G。" },
  L4: { id: "L4-Q1", lessonId: "L4", chapterId: "ch2", knowledgePointId: "L4_K1_noteValues", difficulty: "basic", prompt: "四分音符通常等于几拍？", options: ["0.5 拍", "1 拍", "2 拍"], answer: "1 拍", explanation: "四分音符常作为一拍的基本单位。" },
  L5: { id: "L5-Q1", lessonId: "L5", chapterId: "ch3", knowledgePointId: "L5_K1_trillMordent", difficulty: "basic", prompt: "颤音通常表现为什么？", options: ["相邻音快速交替", "持续延长同一音", "强拍重音"], answer: "相邻音快速交替", explanation: "颤音的核心特征是主音与邻音快速交替。" },
  L6: { id: "L6-Q1", lessonId: "L6", chapterId: "ch3", knowledgePointId: "L6_K1_dynamics", difficulty: "basic", prompt: "Allegro 通常表示什么速度？", options: ["慢板", "中板", "快板"], answer: "快板", explanation: "Allegro 是常见的快板速度术语。" },
  L7: { id: "L7-Q1", lessonId: "L7", chapterId: "ch4", knowledgePointId: "L7_K1_repeatSigns", difficulty: "basic", prompt: "D.C. 在乐谱中表示什么？", options: ["从头反复", "结束", "跳到尾声"], answer: "从头反复", explanation: "D.C. 即 Da Capo。" },
  L8: { id: "L8-Q1", lessonId: "L8", chapterId: "ch4", knowledgePointId: "L8_K2_expressionTerms", difficulty: "basic", prompt: "Dolce 更接近哪种表情？", options: ["甜美柔和", "强烈激昂", "庄严缓慢"], answer: "甜美柔和", explanation: "Dolce 表示甜美、柔和。" },
  L9: { id: "L9-Q1", lessonId: "L9", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "basic", prompt: "3/4 拍每小节通常有几拍？", options: ["2 拍", "3 拍", "4 拍"], answer: "3 拍", explanation: "3/4 拍表示每小节三拍。" },
  L10: { id: "L10-Q1", lessonId: "L10", chapterId: "ch5", knowledgePointId: "L10_K1_noteGrouping", difficulty: "basic", prompt: "附点会让原音符时值增加多少？", options: ["增加一半", "增加一倍", "减少一半"], answer: "增加一半", explanation: "附点增加原时值的一半。" },
  L11: { id: "L11-Q1", lessonId: "L11", chapterId: "ch5", knowledgePointId: "L11_K1_syncopationTypes", difficulty: "medium", prompt: "切分音最核心的听觉效果是什么？", options: ["重音迁移", "速度变慢", "音高升高"], answer: "重音迁移", explanation: "切分音打破原有强弱关系。" },
  L12: { id: "L12-Q1", lessonId: "L12", chapterId: "ch5", knowledgePointId: "L1_K1_pitchProperties", difficulty: "core", prompt: "综合诊断中最重要的目标是什么？", options: ["只背术语", "整合知识并应用", "只做听辨"], answer: "整合知识并应用", explanation: "综合诊断重在整合知识、定位薄弱点并推动迁移应用。" },
};

const LESSON_PRACTICE_EXTRA = {
  L1: { id: "L1-Q2", lessonId: "L1", chapterId: "ch1", knowledgePointId: "L1_K1_pitchProperties", difficulty: "medium", prompt: "音量变化最直接对应什么？", options: ["频率", "振幅", "谱号"], answer: "振幅", explanation: "音量通常由振幅决定。" },
  L2: { id: "L2-Q2", lessonId: "L2", chapterId: "ch1", knowledgePointId: "L2_K2_temperamentEnharmonic", difficulty: "medium", prompt: "泛音列中第二泛音最接近什么关系？", options: ["八度", "三度", "半音"], answer: "八度", explanation: "第二泛音与基音最接近八度关系。" },
  L3: { id: "L3-Q2", lessonId: "L3", chapterId: "ch2", knowledgePointId: "L3_K2_bassClef", difficulty: "basic", prompt: "低音谱号主要定位哪个音？", options: ["F", "C", "G"], answer: "F", explanation: "低音谱号两点包围 F 所在线。" },
  L4: { id: "L4-Q2", lessonId: "L4", chapterId: "ch2", knowledgePointId: "L4_K2_dotsAndTies", difficulty: "medium", prompt: "附点四分音符等于多少拍？", options: ["1 拍", "1.5 拍", "2 拍"], answer: "1.5 拍", explanation: "附点四分音符等于 1.5 拍。" },
  L5: { id: "L5-Q2", lessonId: "L5", chapterId: "ch3", knowledgePointId: "L5_K2_turnAppoggiatura", difficulty: "medium", prompt: "哪种装饰音最接近主音与邻音往复？", options: ["波音", "颤音", "倚音"], answer: "颤音", explanation: "颤音是主音与邻音快速交替。" },
  L6: { id: "L6-Q2", lessonId: "L6", chapterId: "ch3", knowledgePointId: "L6_K1_dynamics", difficulty: "basic", prompt: "mf 常表示什么力度层级？", options: ["很弱", "中强", "极强"], answer: "中强", explanation: "mf 即 mezzo forte。" },
  L7: { id: "L7-Q2", lessonId: "L7", chapterId: "ch4", knowledgePointId: "L7_K2_dcDsCoda", difficulty: "basic", prompt: "Fine 常表示什么？", options: ["从头开始", "结束处", "跳到尾声"], answer: "结束处", explanation: "Fine 表示乐句或乐曲结束。" },
  L8: { id: "L8-Q2", lessonId: "L8", chapterId: "ch4", knowledgePointId: "L8_K1_tempoTerms", difficulty: "core", prompt: "术语学习最稳的方法是什么？", options: ["一次死记", "分类复现", "只看中文"], answer: "分类复现", explanation: "术语记忆依赖分类和复现。" },
  L9: { id: "L9-Q2", lessonId: "L9", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "basic", prompt: "4/4 拍第一拍通常是什么属性？", options: ["弱拍", "次强拍", "强拍"], answer: "强拍", explanation: "4/4 的第一拍通常是强拍。" },
  L10: { id: "L10-Q2", lessonId: "L10", chapterId: "ch5", knowledgePointId: "L10_K2_crossBarTies", difficulty: "medium", prompt: "连音线连接同音高音符时作用是什么？", options: ["改变音高", "时值相加", "改成休止"], answer: "时值相加", explanation: "连音线会把时值相加。" },
  L11: { id: "L11-Q2", lessonId: "L11", chapterId: "ch5", knowledgePointId: "L11_K2_classicSyncopation", difficulty: "core", prompt: "切分最明显的感受是什么？", options: ["拍感平均", "重音迁移", "音高更高"], answer: "重音迁移", explanation: "切分音最核心的是重音迁移。" },
  L12: { id: "L12-Q2", lessonId: "L12", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "core", prompt: "综合诊断后最有效的复盘方式是什么？", options: ["只做会的题", "按错误类型复盘", "跳过基础"], answer: "按错误类型复盘", explanation: "按错误类型复盘更容易找到薄弱知识点并安排后续练习。" },
};

function ensureQuestionOptions(values = [], fallbackValues = []) {
  const merged = [...values, ...fallbackValues].filter((item, index, array) => item && array.indexOf(item) === index);
  return merged.slice(0, 4);
}

function buildKnowledgePointQuestionSet(point, lessonPoints = []) {
  const siblingPoints = lessonPoints.filter((item) => item.id !== point.id);
  const conceptPool = siblingPoints.flatMap((item) => item.subConcepts || []);
  const exercisePool = siblingPoints.flatMap((item) => item.exerciseTypes || []);
  const easyPool = siblingPoints.flatMap((item) => item.easy || []);
  const mediumPool = siblingPoints.flatMap((item) => item.medium || []);
  const hardPool = siblingPoints.flatMap((item) => item.hard || []);

  const conceptAnswer = point.subConcepts?.[0] || point.title;
  const conceptOptions = ensureQuestionOptions(
    [conceptAnswer, ...conceptPool],
    ["基础概念辨识题", "术语闪卡", "综合分析题"],
  );

  const exerciseAnswer = point.exerciseTypes?.[0] || "AI 导师问答";
  const exerciseOptions = ensureQuestionOptions(
    [exerciseAnswer, ...exercisePool],
    ["AI 导师问答", "术语闪卡", "记谱练习 (Notation Exercise)", "节奏练习 (Rhythm Exercise)"],
  );

  const easyAnswer = point.easy?.[0] || point.subConcepts?.[0] || point.title;
  const easyOptions = ensureQuestionOptions(
    [easyAnswer, ...easyPool],
    ["基础概念辨识题", "相邻白键判断", "识别基本等音对：C♯=D♭", "什么决定了音的高低？"],
  );

  const mediumAnswer = point.medium?.[0] || point.easy?.[0] || point.title;
  const mediumOptions = ensureQuestionOptions(
    [mediumAnswer, ...mediumPool],
    ["概念应用题", "混合时值识别", "等音的作曲选择原理", "含变化音的复杂识读"],
  );

  const hardAnswer = point.hard?.[0] || point.medium?.[0] || point.title;
  const hardOptions = ensureQuestionOptions(
    [hardAnswer, ...hardPool],
    ["综合分析题", "跨多个音组的快速识别", "复杂节奏型的拍数推算", "大调音阶完整推导"],
  );

  return [
    {
      id: `${point.id}-supplement-1`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "basic",
      prompt: `下列哪一项最直接对应“${point.title}”的核心概念？`,
      options: conceptOptions,
      answer: conceptAnswer,
      explanation: `${point.title}的核心概念包括：${conceptAnswer}。`,
    },
    {
      id: `${point.id}-supplement-2`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "medium",
      prompt: `学习“${point.title}”时，优先匹配哪类练习最合适？`,
      options: exerciseOptions,
      answer: exerciseAnswer,
      explanation: `${point.title}当前优先对应：${exerciseAnswer}。`,
    },
    {
      id: `${point.id}-supplement-3`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "basic",
      prompt: `下列哪一项属于“${point.title}”的基础训练示例？`,
      options: easyOptions,
      answer: easyAnswer,
      explanation: `${point.title}的基础训练示例包括：${easyAnswer}。`,
    },
    {
      id: `${point.id}-supplement-4`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "medium",
      prompt: `针对“${point.title}”的进阶练习，下列哪一项更匹配？`,
      options: mediumOptions,
      answer: mediumAnswer,
      explanation: `${point.title}的进阶训练可对应：${mediumAnswer}。`,
    },
    {
      id: `${point.id}-supplement-5`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "hard",
      prompt: `如果要挑战“${point.title}”的高阶应用，下列哪一项更符合？`,
      options: hardOptions,
      answer: hardAnswer,
      explanation: `${point.title}的高阶应用可对应：${hardAnswer}。`,
    },
  ].filter((item) => Array.isArray(item.options) && item.options.length >= 3);
}

function createLessonPracticePool(lessonId, lessonTitle) {
  const lessonPoints = getKnowledgePointsForLesson(lessonId);
  const focus = HOMEWORK_FOCUS[lessonId] || lessonTitle;
  const formalQuestions = getQuestionsForLesson(lessonId);
  const pool = formalQuestions.length ? formalQuestions : [];
  if (!pool.length) {
    pool.push({
      id: `${lessonId}-fallback`,
      lessonId,
      chapterId: "",
      knowledgePointId: lessonPoints[0]?.id || "",
      difficulty: "basic",
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
          <button onClick={() => cameraInputRef.current?.click()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>
            拍照上传
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", color: "#111111", cursor: "pointer" }}>
            相册上传
          </button>
        </div>
      </div>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onAddFiles} />
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onAddFiles} />
      {images.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {images.map((image, index) => (
            <div key={`${image.name}-${index}`} style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(17,17,17,0.1)", background: "#f8f8f8" }}>
              <img src={image.dataUrl} alt={image.name || `作业图片${index + 1}`} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
              <div style={{ padding: 8, fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {image.name || `图片 ${index + 1}`}
              </div>
              <button onClick={() => onRemoveImage(index)} style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 999, border: "1px solid rgba(17,17,17,0.16)", background: "rgba(255,255,255,0.96)", cursor: "pointer", fontSize: 12 }}>
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
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>{symbol.kind === "tie" ? "连接前后音" : `${symbol.duration} 拍`}</div>
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

function HomeworkPianoEditor({ pianoSubmission, onChange }) {
  const octave = pianoSubmission?.octave || 4;
  const notes = pianoSubmission?.notes || [];

  const addNote = useCallback(async (note) => {
    await unlockAudioSystem();
    playTone(nFreq(note, octave), 0.42, "piano", 0.24);
    onChange((prev) => ({
      ...prev,
      notes: [...(prev.notes || []), { note, octave }].slice(-12),
    }));
  }, [octave, onChange]);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>钢琴输入器</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            点击琴键录入音高序列，适用于音高、音级与基础键盘定位作业。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={octave} onChange={(e) => onChange((prev) => ({ ...prev, octave: Number(e.target.value) }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            {[3, 4, 5].map((value) => <option key={value} value={value}>{value} 组</option>)}
          </select>
          <button onClick={() => onChange((prev) => ({ ...prev, notes: (prev.notes || []).slice(0, -1) }))} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>
            撤销
          </button>
          <button onClick={() => onChange((prev) => ({ ...prev, notes: [] }))} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>
            清空
          </button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
        {["C", "D", "E", "F", "G", "A", "B"].map((note) => (
          <button key={note} onClick={() => addNote(note)} style={{ padding: "12px 8px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.1)", background: "#fafafa", color: "#111111", cursor: "pointer", fontWeight: 600 }}>
            {note}{octave}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#f8f8f8", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        {notes.length ? notes.map((item) => `${item.note}${item.octave}`).join(" - ") : "当前尚未录入钢琴音高。"}
      </div>
    </div>
  );
}

function HomeworkVoiceInput({
  transcript,
  audioSubmission,
  voiceSupported,
  listening,
  transcribing,
  error,
  onStartListening,
  onStopListening,
  onStartRecording,
  onStopRecording,
  onApplyTranscript,
}) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>语音输入</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            支持浏览器实时识别与录音转写，适合术语解释、口头分析与作业补充说明。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {voiceSupported ? (
            <>
              <button onClick={onStartListening} disabled={listening} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: listening ? "#f1f1f1" : "#111111", color: listening ? "#666666" : "#ffffff", cursor: listening ? "default" : "pointer" }}>
                开始实时识别
              </button>
              <button onClick={onStopListening} disabled={!listening} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: !listening ? "default" : "pointer" }}>
                停止识别
              </button>
            </>
          ) : (
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>当前浏览器不支持实时语音识别。</span>
          )}
          <button onClick={onStartRecording} disabled={transcribing} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: transcribing ? "default" : "pointer" }}>
            开始录音
          </button>
          <button onClick={onStopRecording} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>
            结束录音并转写
          </button>
        </div>
      </div>
      <div style={{ padding: 10, borderRadius: 10, background: "#f8f8f8", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        <div><strong>识别文本：</strong>{transcript.trim() || "尚未生成语音转写。"}</div>
        <div style={{ marginTop: 6 }}><strong>录音文件：</strong>{audioSubmission?.name || "尚未录音"}</div>
        {transcribing ? <div style={{ marginTop: 6, color: "#92400e" }}>正在转写录音，请稍候…</div> : null}
        {error ? <div style={{ marginTop: 6, color: "#b91c1c" }}>{error}</div> : null}
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onApplyTranscript} disabled={!transcript.trim()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: !transcript.trim() ? "default" : "pointer" }}>
          将转写内容写入文字说明
        </button>
      </div>
    </div>
  );
}

function HomeworkEvaluationCard({ evaluation }) {
  if (!evaluation) {
    return (
      <div style={{ padding: 12, borderRadius: 12, background: "#f8f8f8", border: "1px solid rgba(17,17,17,0.08)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        提交作业后，这里会显示结构化课程评价与 AI 初评结果。
      </div>
    );
  }

  const scoreEntries = Object.entries(evaluation.scores || {});
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#f8f8f8", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#111111", marginBottom: 8 }}>课程评价</div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
        {evaluation.overallComment || "暂无评价。"}
      </div>
      {scoreEntries.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
          {scoreEntries.map(([label, value]) => (
            <div key={label} style={{ padding: 10, borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111111" }}>{value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {Array.isArray(evaluation.tags) && evaluation.tags.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {evaluation.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 8 }}>
        {Array.isArray(evaluation.strengths) && evaluation.strengths.length ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>优点</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{evaluation.strengths.join("；")}</div>
          </div>
        ) : null}
        {Array.isArray(evaluation.issues) && evaluation.issues.length ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>待修正问题</div>
            <div style={{ fontSize: 11, color: "#b91c1c", lineHeight: 1.8 }}>{evaluation.issues.join("；")}</div>
          </div>
        ) : null}
        {Array.isArray(evaluation.suggestions) && evaluation.suggestions.length ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>修改建议</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{evaluation.suggestions.join("；")}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LessonLearningWorkspace({ lesson, section, showTabs = true, contentPageHint = null, onBktChange = null }) {
  const pptLessonData = getPptLessonData(lesson.id);
  const studentProfile = useMemo(() => getStudentProfile(), []);
  const userId = studentProfile.studentId;
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
  const [labelingState, setLabelingState] = useState({ pending: false, message: "" });
  const [stats, setStats] = useState(() => ({
    startedAt: Date.now(),
    interactions: 0,
    errors: 0,
    errorTypes: {},
    lastExplanation: "\u5148\u70b9\u51fb\u94a2\u7434\u952e\uff0c\u7cfb\u7edf\u4f1a\u6839\u636e\u4e24\u4e2a\u97f3\u7684\u8ddd\u79bb\u7ed9\u51fa\u97f3\u7a0b\u5ea6\u6570\u89e3\u91ca\u3002",
  }));

  useEffect(() => {
    initializeKnowledgeStore(userId);
  }, [userId]);

  const practicePool = useMemo(() => createLessonPracticePool(lesson.id, lesson.t), [lesson.id, lesson.t]);
  const adaptivePool = useMemo(() => chooseAdaptivePracticeQuestions(userId, lesson.id, practicePool), [userId, lesson.id, practicePool]);
  const practiceQuestions = useMemo(
    () => {
      const source = adaptivePool.length ? adaptivePool : practicePool;
      return Array.from({ length: 20 }, (_, idx) => source[(practiceRound * 20 + idx) % source.length]);
    },
    [adaptivePool, practicePool, practiceRound],
  );
  const currentPractice = practiceQuestions[practiceIndex];
  const correctCount = practiceAnswers.filter((item) => item.correct).length;
  const lessonKnowledgeSummary = useMemo(() => summarizeLessonKnowledge(userId, lesson.id), [userId, lesson.id, practiceAnswers, homeworkEvaluation, homeworkSubmitted]);
  const lessonSections = LESSON_LEARNING_SECTIONS[lesson.id] || [];
  const lessonContentItems = (pptLessonData?.knowledgePoints || []).map((item) => ({ h: item.title, b: item.detail })).filter((item) => item.h || item.b).length ? (pptLessonData?.knowledgePoints || []).map((item) => ({ h: item.title, b: item.detail })) : (LESSON_CONTENT[lesson.id] || []);
  const homeworkRequirement = getHomeworkRequirement(lesson.id, lesson.t);
  const lessonHomework = homeworkRequirement.helper;
  const studyMinutes = Math.max(1, Math.ceil((Date.now() - stats.startedAt) / 60000));
  const evaluationDimensions = getEvaluationDimensions(homeworkRequirement);
  const homeworkChannelLabels = homeworkRequirement.channels.map((channel) => HOMEWORK_CHANNEL_LABELS[channel] || channel).join(" / ");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(Recognition));
  }, []);

  const startSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("当前浏览器不支持实时语音识别。");
      return;
    }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onstart = () => {
      setVoiceError("");
      setVoiceListening(true);
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join("")
        .trim();
      if (transcript) {
        setVoiceTranscript((prev) => prev ? `${prev}\n${transcript}` : transcript);
      }
    };
    recognition.onerror = () => {
      setVoiceError("语音识别失败，请改用录音转写。");
      setVoiceListening(false);
    };
    recognition.onend = () => {
      setVoiceListening(false);
      speechRecognitionRef.current = null;
    };
    speechRecognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    try {
      speechRecognitionRef.current?.stop();
    } catch {}
    setVoiceListening(false);
  }, []);

  const startAudioRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceError("当前浏览器不支持录音功能。");
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new window.MediaRecorder(stream);
      audioChunksRef.current = [];
      setVoiceError("");
      recorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        if (!audioChunksRef.current.length) {
          setVoiceError("未捕获到录音内容。");
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `homework-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
        const audioDataUrl = await fileToDataUrl(file);
        setAudioSubmission({ name: file.name, mimeType: file.type, size: file.size, duration: null });
        setAudioTranscribing(true);
        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioDataUrl,
              fileName: file.name,
              mimeType: file.type,
            }),
          });
          const json = await response.json();
          if (response.ok && json.text) {
            setVoiceTranscript((prev) => prev ? `${prev}\n${json.text}` : json.text);
          } else {
            setVoiceError(json?.error || "录音转写失败，请稍后重试。");
          }
        } catch {
          setVoiceError("录音转写失败，请稍后重试。");
        } finally {
          setAudioTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      setVoiceError("无法启动录音，请检查浏览器麦克风权限。");
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    try {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      setVoiceError("结束录音失败，请重试。");
    }
  }, []);

  const applyTranscriptToDraft = useCallback(() => {
    const trimmed = voiceTranscript.trim();
    if (!trimmed) return;
    setHomeworkDraft((prev) => prev.trim() ? `${prev.trim()}\n${trimmed}` : trimmed);
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1 }));
  }, [voiceTranscript]);

  const recordError = useCallback((type, explanation) => {
    setStats((prev) => ({
      ...prev,
      errors: prev.errors + 1,
      errorTypes: { ...prev.errorTypes, [type]: (prev.errorTypes[type] || 0) + 1 },
      lastExplanation: explanation,
    }));
  }, []);

  const lessonKnowledgePoints = useMemo(() => getKnowledgePointsForLesson(lesson.id), [lesson.id]);

  const resolveKnowledgePointForText = useCallback(async (signature, fallbackId = lessonKnowledgePoints[0]?.id || "") => {
    const mappingKey = createKnowledgeMappingKey(lesson.id, signature);
    const cached = getKnowledgeMapping(mappingKey);
    if (cached?.knowledgePointId) return cached.knowledgePointId;
    try {
      setLabelingState({ pending: true, message: "正在匹配知识点..." });
      const response = await fetch("/api/bkt/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          content: signature,
          candidates: lessonKnowledgePoints.map((item) => ({ id: item.id, title: item.title })),
        }),
      });
      const json = await response.json();
      const knowledgePointId = json?.knowledgePointId || fallbackId;
      setKnowledgeMapping(mappingKey, {
        knowledgePointId,
        confidence: Number(json?.confidence || 0.35),
        reason: json?.reason || "知识点已缓存。",
      });
      return knowledgePointId;
    } catch {
      return fallbackId;
    } finally {
      setLabelingState({ pending: false, message: "" });
    }
  }, [lesson.id, lessonKnowledgePoints]);

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

  const answerPractice = useCallback(async (option) => {
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

    let knowledgePointId = currentPractice.knowledgePointId || "";
    if (!knowledgePointId) {
      knowledgePointId = await resolveKnowledgePointForText(currentPractice.prompt);
    }
    const shouldUpdateBkt = knowledgePointId && currentPractice.evidenceWeight === "strong";
    if (shouldUpdateBkt) {
      updateKnowledgePointEvidence(userId, knowledgePointId, ok ? "correct" : "incorrect", {
        lessonId: lesson.id,
        source: "classroom-practice",
        prompt: currentPractice.prompt,
        difficulty: currentPractice.difficulty || "medium",
      });
      appendSessionRecord(userId, {
        lessonId: lesson.id,
        chapterId: lessonKnowledgePoints[0]?.chapterId || "",
        action: "classroom-practice",
        knowledgePointId,
        correct: ok,
        prompt: currentPractice.prompt,
      });
      await syncKnowledgeSummary(lesson.id);
      onBktChange?.();
    }

    if (!ok) {
      appendErrorRecord(userId, {
        lessonId: lesson.id,
        knowledgePointId,
        type: "课堂练习题",
        prompt: currentPractice.prompt,
        explanation: currentPractice.explanation,
      });
      recordError("课堂练习题", currentPractice.explanation);
    }
  }, [currentPractice, practiceAnswers, practiceIndex, recordError, resolveKnowledgePointForText, userId, lesson.id, lessonKnowledgePoints, onBktChange]);

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
  const submissionTypes = [];
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
    syncKnowledgeSummary(lesson.id);
    appendSessionRecord(userId, {
      lessonId: lesson.id,
      chapterId: lessonKnowledgePoints[0]?.chapterId || "",
      action: "lesson-open",
    });
  }, [lesson.id, userId, lessonKnowledgePoints]);

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
    if (!showHomeworkDialog || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !homeworkReviewing) {
        setShowHomeworkDialog(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showHomeworkDialog, homeworkReviewing]);

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

      const scoreValues = Object.values(evaluation?.scores || {}).map((value) => Number(value || 0));
      const averageEvaluationScore = scoreValues.length
        ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length
        : 75;
      const homeworkObservation = averageEvaluationScore >= 80 ? "correct" : averageEvaluationScore < 65 ? "incorrect" : "neutral";
      const matchedKnowledgePointId = await resolveKnowledgePointForText(
        `${lessonHomework}\n${homeworkDraft}\n${voiceTranscript}`.trim(),
        lessonKnowledgePoints[0]?.id || "",
      );
      const matchedKnowledgePoint = lessonKnowledgePoints.find((item) => item.id === matchedKnowledgePointId);
      const shouldUpdateHomeworkBkt = matchedKnowledgePointId
        && homeworkObservation !== "neutral"
        && !/综合复习/.test(matchedKnowledgePoint?.title || "");
      if (shouldUpdateHomeworkBkt) {
        updateKnowledgePointEvidence(userId, matchedKnowledgePointId, homeworkObservation, {
          lessonId: lesson.id,
          source: "homework-review",
          prompt: lessonHomework,
          score: averageEvaluationScore,
          difficulty: averageEvaluationScore >= 80 ? "hard" : "medium",
        });
        await syncKnowledgeSummary(lesson.id);
        onBktChange?.();
      }
      appendSessionRecord(userId, {
        lessonId: lesson.id,
        chapterId: lessonKnowledgePoints[0]?.chapterId || "",
        action: "homework-submit",
        knowledgePointId: matchedKnowledgePointId,
        score: Number(averageEvaluationScore.toFixed(1)),
        submissionTypes,
      });
    } catch {
      setHomeworkFeedback("作业提交失败，请检查网络后重试。");
    } finally {
      setHomeworkReviewing(false);
    }
  }, [lesson.id, lesson.t, lessonHomework, homeworkDraft, homeworkImages, homeworkRhythm, homeworkStaff, homeworkPiano, voiceTranscript, audioSubmission, homeworkRequirement, evaluationDimensions, studyMinutes, stats, homeworkRemaining, submissionTypes, resolveKnowledgePointForText, lessonKnowledgePoints, userId, onBktChange]);

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
        <button onClick={() => setActiveSection("content")} style={sectionButtonStyle("content")}>内容呈现</button>
        <button onClick={() => setActiveSection("practice")} style={sectionButtonStyle("practice")}>课堂练习</button>
        <button onClick={() => setActiveSection("homework")} style={sectionButtonStyle("homework")}>课后作业</button>
      </div>}

      {activeSection === "content" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>内容呈现</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
          本页仅保留本课 PPT 课件，不再重复展示知识点长列表。
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
        {pptLessonData && <PptContentEmbedFixed lessonId={lesson.id} pageHint={contentPageHint} />}
      </div>}

      {activeSection === "practice" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课堂练习</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          系统会结合你在内容呈现中的互动操作结果，提供 20 题连续课堂练习，并反馈当前掌握情况。
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>知识点掌握摘要</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            已掌握较好：{lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "尚未形成稳定强项"}
            <br />
            当前薄弱点：{lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "暂无"}
            <br />
            下一步建议：{getRecommendationFromSummary(lessonKnowledgeSummary)}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>互动检测</div>
          <div style={{ fontSize: 11, color: stats.errors > 0 ? "#b91c1c" : "var(--color-text-secondary)" }}>
            {lastInterval ? `最近一次识别为 ${lastInterval.label}，${lastInterval.detail}` : "请先在内容呈现里完成一次钢琴或互动操作，系统才会生成检测结果。"}
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
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111", marginBottom: 6 }}>自适应建议</div>
          已掌握较好：{lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "尚未形成稳定强项"}
          <br />
          当前薄弱点：{lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "暂无"}
          <br />
          下一步建议：{getRecommendationFromSummary(lessonKnowledgeSummary)}
          {labelingState.pending ? <><br />知识点匹配中：{labelingState.message}</> : null}
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
        {showHomeworkDialog && <div onClick={() => { if (!homeworkReviewing) setShowHomeworkDialog(false); }} style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.36)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: "min(640px, 100%)", background: "#ffffff", borderRadius: 16, padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
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

function PptContentEmbed({ lessonId, pageHint }) {
  return <PptContentEmbedFixed lessonId={lessonId} pageHint={pageHint} />;
}

function PptContentEmbedCn({ lessonId, pageHint }) {
  return <PptContentEmbedFixed lessonId={lessonId} pageHint={pageHint} />;
}

function PptContentEmbedFixed({ lessonId, pageHint = null }) {
  const lessonData = getPptLessonData(lessonId);
  const [pageIndex, setPageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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

  useEffect(() => {
    if (pageHint == null || Number.isNaN(Number(pageHint))) return;
    const nextIndex = Math.max(0, Math.min(slideNumbers.length - 1, Number(pageHint)));
    setPageIndex(nextIndex);
  }, [pageHint, slideNumbers.length]);

  useEffect(() => {
    if (!lightboxOpen || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen]);

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
  const imageSrc = `${imageRoot}/slide-${currentSlideNo}.png`;

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
        <img
          src={imageSrc}
          alt={`${lessonData.lessonTitle} - 幻灯片 ${currentSlideNo}`}
          loading="lazy"
          onClick={() => setLightboxOpen(true)}
          style={{ width: "100%", display: "block", borderRadius: 12, border: "1px solid rgba(17,17,17,0.08)", background: "#f6f6f6", cursor: "zoom-in" }}
        />
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>点击当前幻灯片可放大查看</div>
        <a href={sourcePpt} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#185FA5", textDecoration: "none" }}>
          打开原始 PPT
        </a>
      </div>
      {lightboxOpen ? (
        <div
          onClick={() => setLightboxOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(10,10,10,0.86)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ position: "relative", width: "min(1200px, 100%)", maxHeight: "94vh", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              style={{ position: "absolute", top: -8, right: -8, width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(255,255,255,0.22)", background: "rgba(17,17,17,0.88)", color: "#ffffff", cursor: "pointer", fontSize: 16, zIndex: 2 }}
            >
              ×
            </button>
            <img
              src={imageSrc}
              alt={`${lessonData.lessonTitle} - 幻灯片 ${currentSlideNo} 放大查看`}
              style={{ maxWidth: "100%", maxHeight: "94vh", width: "auto", height: "auto", display: "block", borderRadius: 14, background: "#ffffff" }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LessonMediaHub({ lesson }) {
  return null;
}

function LessonSupportLinks({ onOpen }) {
  const items = [
    { id: "tutor", label: "AI 导师", desc: "针对当前课时提问，并获取讲解与纠错建议" },
    { id: "lab", label: "音乐创作实验室", desc: "进入音乐创作实验室做扩展探索" },
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

function KnowledgeMindMap({ lessonTitle, chapterTitle, items = [], onNodeSelect }) {
  const nodes = items.slice(0, 4);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 860 : false));
  const summarize = (text) => String(text || "").split(/\n+/).filter(Boolean).join(" ").slice(0, isMobile ? 18 : 24);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setIsMobile(window.innerWidth <= 860);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const layoutNodes = nodes.map((item, index) => {
    const isLeft = index < Math.ceil(nodes.length / 2);
    const leftPositions = [70, 180, 290];
    const rightPositions = [95, 220, 345];
    const laneIndex = isLeft ? index : index - Math.ceil(nodes.length / 2);
    return {
      ...item,
      index,
      isLeft,
      x: isLeft ? 70 : 690,
      y: (isLeft ? leftPositions : rightPositions)[laneIndex] || (90 + laneIndex * 120),
      anchorX: isLeft ? 290 : 690,
      anchorY: ((isLeft ? leftPositions : rightPositions)[laneIndex] || (90 + laneIndex * 120)) + 44,
    };
  });

  return (
    <div className="section-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>知识导图</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{chapterTitle}</div>
        </div>
        <Tag color="#111111" bg="#F3F4F6">{`${nodes.length} 个预习主线`}</Tag>
      </div>

      {isMobile ? (
        <div style={{ borderRadius: 22, background: "linear-gradient(180deg, #fcfcfc 0%, #f5f5f5 100%)", border: "1px solid rgba(17,17,17,0.08)", padding: 14 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              background: "linear-gradient(180deg, rgba(17,17,17,0.98), rgba(36,36,36,0.95))",
              color: "#ffffff",
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginBottom: 8 }}>中心主题</div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35, marginBottom: 10 }}>{lessonTitle}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.7 }}>
              先看 4 个主节点建立整体框架，再进入课时内容查看完整 PPT。
            </div>
          </div>

          <div style={{ position: "relative", paddingLeft: 24, display: "grid", gap: 12 }}>
            <div style={{ position: "absolute", left: 11, top: 6, bottom: 6, width: 2, background: "rgba(17,17,17,0.12)" }} />
            {nodes.map((item, index) => {
              const active = hoveredIndex === index;
              return (
                <button
                  key={`${lessonTitle}-mobile-map-${index}`}
                  type="button"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                  onClick={() => onNodeSelect?.(index)}
                  style={{
                    position: "relative",
                    padding: 14,
                    borderRadius: 16,
                    background: active ? "#111111" : "rgba(255,255,255,0.96)",
                    border: active ? "1px solid #111111" : "1px solid rgba(17,17,17,0.1)",
                    boxShadow: active ? "0 12px 28px rgba(17,17,17,0.14)" : "0 8px 20px rgba(17,17,17,0.06)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ position: "absolute", left: -21, top: 18, width: 12, height: 12, borderRadius: 999, background: active ? "#111111" : "#ffffff", border: "2px solid #111111" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 999, background: active ? "#ffffff" : "#111111", color: active ? "#111111" : "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                      {index + 1}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#ffffff" : "#111111", lineHeight: 1.4 }}>{item.h}</div>
                  </div>
                  <div style={{ fontSize: 12, color: active ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    {summarize(item.b)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: active ? "rgba(255,255,255,0.88)" : "#111111", marginTop: 8 }}>
                    点击进入对应课时内容
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 22, background: "linear-gradient(180deg, #fcfcfc 0%, #f5f5f5 100%)", border: "1px solid rgba(17,17,17,0.08)", overflowX: "auto" }}>
          <div style={{ position: "relative", width: 980, minHeight: 470, margin: "0 auto", padding: "18px 0" }}>
            <svg
              width="980"
              height="470"
              viewBox="0 0 980 470"
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="mind-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(17,17,17,0.18)" />
                  <stop offset="100%" stopColor="rgba(17,17,17,0.45)" />
                </linearGradient>
              </defs>
              {layoutNodes.map((item) => {
                const centerX = 490;
                const centerY = 235;
                const branchX = item.isLeft ? 380 : 600;
                const branchY = item.anchorY;
                return (
                  <g key={`line-${lessonTitle}-${item.index}`}>
                    <path
                      d={`M ${centerX} ${centerY} C ${item.isLeft ? 450 : 530} ${centerY}, ${item.isLeft ? 420 : 560} ${branchY}, ${branchX} ${branchY}`}
                      fill="none"
                      stroke={hoveredIndex === item.index ? "#111111" : "url(#mind-line-gradient)"}
                      strokeWidth={hoveredIndex === item.index ? "4" : "3"}
                      strokeLinecap="round"
                    />
                    <path
                      d={`M ${branchX} ${branchY} L ${item.anchorX} ${item.anchorY}`}
                      fill="none"
                      stroke={hoveredIndex === item.index ? "rgba(17,17,17,0.82)" : "rgba(17,17,17,0.22)"}
                      strokeWidth={hoveredIndex === item.index ? "3.5" : "2.5"}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
            </svg>

            <div
              style={{
                position: "absolute",
                left: 380,
                top: 150,
                width: 220,
                minHeight: 150,
                padding: 18,
                borderRadius: 24,
                background: "linear-gradient(180deg, rgba(17,17,17,0.98), rgba(36,36,36,0.95))",
                color: "#ffffff",
                boxShadow: "0 18px 40px rgba(17,17,17,0.18)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginBottom: 8 }}>中心主题</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, marginBottom: 10 }}>{lessonTitle}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.7 }}>
                先看 4 个主节点建立框架，再进入课时内容和课堂练习。
              </div>
            </div>

            {layoutNodes.map((item) => (
              <button
                key={`${lessonTitle}-map-${item.index}`}
                type="button"
                onMouseEnter={() => setHoveredIndex(item.index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(item.index)}
                onBlur={() => setHoveredIndex(null)}
                onClick={() => onNodeSelect?.(item.index)}
                style={{
                  position: "absolute",
                  left: item.x,
                  top: item.y,
                  width: 220,
                  padding: 14,
                  borderRadius: 18,
                  background: hoveredIndex === item.index ? "#111111" : "rgba(255,255,255,0.96)",
                  border: hoveredIndex === item.index ? "1px solid #111111" : "1px solid rgba(17,17,17,0.1)",
                  boxShadow: hoveredIndex === item.index ? "0 16px 32px rgba(17,17,17,0.14)" : "0 8px 24px rgba(17,17,17,0.06)",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 999, background: hoveredIndex === item.index ? "#ffffff" : "#111111", color: hoveredIndex === item.index ? "#111111" : "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                    {item.index + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: hoveredIndex === item.index ? "#ffffff" : "#111111", lineHeight: 1.4 }}>{item.h}</div>
                </div>
                <div style={{ fontSize: 12, color: hoveredIndex === item.index ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  {summarize(item.b)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: hoveredIndex === item.index ? "rgba(255,255,255,0.88)" : "#111111", marginTop: 10 }}>
                  点击进入对应课时内容
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LessonView({ lesson, ratings, setRating, scores, setScore }) {
  const [tab, setTab] = useState("learn");
  const [labOpen, setLabOpen] = useState(false);
  const [contentPageHint, setContentPageHint] = useState(null);
  const [bktVersion, setBktVersion] = useState(0);
  const [homeworkGuideOpen, setHomeworkGuideOpen] = useState(false);
  const [homeworkContactOpen, setHomeworkContactOpen] = useState(false);

  const ExComponent = EXERCISE_COMPONENTS[lesson.ex];
  const pptLessonData = getPptLessonData(lesson.id);
  const contentItems = (pptLessonData?.knowledgePoints || []).map((item, index) => ({
    h: item.title || `知识点 ${index + 1}`,
    b: item.detail || "",
  }));
  const handleScore = (v) => setScore(lesson.id, v);
  const displayTabs = [
    { id: "learn", label: "课前预习" },
    { id: "content", label: "内容呈现" },
    { id: "classroom", label: "课堂练习" },
    { id: "homework", label: "课后作业" },
    { id: "tutor", label: "AI 导师" },
  ];
  const lessonKnowledgeSummary = useMemo(() => summarizeLessonKnowledge(getStudentProfile().studentId, lesson.id), [lesson.id, bktVersion]);

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

  useEffect(() => {
    setContentPageHint(null);
  }, [lesson.id]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Tag color="#3C3489" bg="#EEEDFE">{`第${lesson.n}课`}</Tag>
            <Stars value={ratings[lesson.id] || 0} onChange={(v) => setRating(lesson.id, v)} size={16} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>{lesson.t}</h2>
        </div>
        <button
          onClick={() => setTab("tutor")}
          className="support-tile"
          style={{ width: "min(240px, 100%)", textAlign: "left", padding: 14, flexShrink: 0 }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>AI 导师</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
            针对当前课时提问，获得概念讲解、作业答疑与错误纠正建议。
          </div>
        </button>
      </div>

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
        <div className="section-stack">
          <KnowledgeMindMap
            lessonTitle={lesson.t}
            chapterTitle={pptLessonData?.chapter || ""}
            items={contentItems}
            onNodeSelect={(index) => {
              setContentPageHint(index);
              setTab("content");
            }}
          />
          {lesson.id === "L1" && (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>互动预习</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
                先通过交互组件感知音高、频率和振幅，再进入“内容呈现”查看本课 PPT。
              </div>
              <InteractivePitchFrequencyWidgetCn />
              <InteractiveVolumeAmplitudeWidgetCn />
            </div>
          )}
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>预习建议</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                先看导图中的 4 个主节点建立主线，再进入课时内容查看完整 PPT，最后做课堂练习检验理解。
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {[
                  { no: "01", title: "看导图", desc: "先抓住本课主线", active: true },
                  { no: "02", title: "进课时内容", desc: "查看完整 PPT", active: false },
                  { no: "03", title: "做课堂练习", desc: "检验薄弱点", active: false },
                ].map((step) => (
                  <div key={step.no} style={{ border: step.active ? "1px solid rgba(17,17,17,0.18)" : "1px solid rgba(17,17,17,0.08)", background: step.active ? "rgba(17,17,17,0.04)" : "#ffffff", borderRadius: 14, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-tertiary)", marginBottom: 6 }}>{step.no}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{step.title}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{step.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button onClick={() => setTab("content")} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111111", background: "#111111", color: "#ffffff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  进入课时内容
                </button>
                <button onClick={() => setTab("classroom")} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f6f6f6", color: "#111111", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  直接去课堂练习
                </button>
              </div>
            </div>
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>知识点掌握摘要</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              已掌握较好：{lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "尚未形成稳定强项"}
              <br />
              当前薄弱点：{lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "暂无"}
              <br />
              下一步建议：{getRecommendationFromSummary(lessonKnowledgeSummary)}
            </div>
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="section-stack">
          <LessonLearningWorkspace lesson={lesson} section="content" showTabs={false} contentPageHint={contentPageHint} onBktChange={() => setBktVersion((prev) => prev + 1)} />
        </div>
      )}

      {tab === "classroom" && (
        <div className="section-stack">
          {(scores[lesson.id] || 0) > 0 && (
            <div className="section-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>得分</span>
              <div style={{ flex: 1 }}><PBar v={scores[lesson.id]} max={100} color="#534AB7" /></div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#534AB7" }}>{scores[lesson.id]}%</span>
            </div>
          )}
          <LessonLearningWorkspace lesson={lesson} section="practice" showTabs={false} onBktChange={() => setBktVersion((prev) => prev + 1)} />
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>练习说明</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              先完成本节小测与互动练习，再继续下方练习模块。
              <br />
              系统会记录错误类型，供课后作业与教师后台汇总使用。
            </div>
          </div>
          <div className="section-card">
            {ExComponent && <ExComponent onScore={handleScore} />}
          </div>
        </div>
      )}

      {tab === "homework" && (
        <div className="section-stack">
          <div className="section-card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setHomeworkGuideOpen((prev) => !prev)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: homeworkGuideOpen ? "#111111" : "#ffffff", color: homeworkGuideOpen ? "#ffffff" : "#111111", cursor: "pointer" }}
            >
              {homeworkGuideOpen ? "收起作业规范" : "查看作业规范"}
            </button>
            <button
              type="button"
              onClick={() => setHomeworkContactOpen((prev) => !prev)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: homeworkContactOpen ? "#111111" : "#ffffff", color: homeworkContactOpen ? "#ffffff" : "#111111", cursor: "pointer" }}
            >
              {homeworkContactOpen ? "收起联系说明" : "查看联系说明"}
            </button>
            <button
              onClick={() => setTab("lab")}
              className="support-tile"
              style={{ width: "min(320px, 100%)", textAlign: "left", padding: 12, marginLeft: "auto" }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>音乐创作实验室</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                让我们一起来创造音乐吧
              </div>
            </button>
          </div>

          {homeworkGuideOpen ? (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>作业规范</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                建议按“概念解释、示例、错误反思”三部分完成。
                <br />
                提交前检查术语是否准确，示例是否对应本课核心概念。
              </div>
            </div>
          ) : null}

          {homeworkContactOpen ? (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>联系说明</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                如果课堂练习、作业上传或 AI 导师出现问题，先刷新页面并重新进入本课。
                <br />
                若问题仍然存在，请记录课时名称、操作步骤和报错现象，交由教师统一反馈处理。
              </div>
            </div>
          ) : null}

          <LessonLearningWorkspace lesson={lesson} section="homework" showTabs={false} onBktChange={() => setBktVersion((prev) => prev + 1)} />
        </div>
      )}

      {tab === "tutor" && <AITutorV2 lessonId={lesson.id} lessonTitle={lesson.t} />}

      {tab === "lab" && (
        <div>
          <div className="section-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{`音乐创作实验室 · ${lesson.labN}`}</div>
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
    { id: "lab", label: "音乐创作实验室", desc: "进入扩展实验页面，继续做音高、节奏或谱面探索。" },
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

function AITutorV2({ lessonId, lessonTitle }) {
  const studentProfile = useMemo(() => getStudentProfile(), []);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [responseMeta, setResponseMeta] = useState(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const imageStageTimerRef = useRef([]);

  const contentSections = getKnowledgePointsForLesson(lessonId).map((item) => ({
    h: item.title,
    b: item.subConcepts?.join("；") || "",
  }));
  const contextText = lessonId === "L12"
    ? "本课是综合诊断课。请整合前 11 课的核心知识点，重点帮助学生定位薄弱知识点、解释错误原因、给出复习顺序与下一步建议。"
    : contentSections.map((section) => `${section.h}: ${section.b}`).join("\n\n");
  const tutorSystem = lessonId === "L12"
    ? `你是一位大学乐理课程教师。当前课程：${lessonTitle}。\n请始终用中文回复，说明要清楚、准确、简洁。\n这是综合诊断课，不要逐条背诵全部知识点；请优先说明综合诊断目的、如何整合前 11 课知识点、如何定位薄弱项，以及下一步复习建议。\n课程内容：\n${contextText}`
    : `你是一位大学乐理课程教师。当前课程：${lessonTitle}。\n请始终用中文回复，说明要清楚、准确、简洁。\n课程内容：\n${contextText}`;

  useEffect(() => {
    setMsgs([{
      role: "assistant",
      text: `你好，我是你的 AI 乐理导师。当前课程：${lessonTitle}\n\n你可以问我：\n• 解释本课核心概念\n• 某个知识点的详细说明\n• 出一道练习题\n• 这些知识在实际中怎么应用`,
    }]);
  }, [lessonId, lessonTitle]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  useEffect(() => () => {
    imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    imageStageTimerRef.current = [];
  }, []);

  const handlePickImage = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setLoadingStage("正在压缩图片…");
    const dataUrl = await compressImageFileToDataUrl(file);
    setImageDataUrl(dataUrl);
    setImageName(file.name);
    setLoadingStage("");
    event.target.value = "";
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageDataUrl) || loading) return;
    const nextMsgs = [...msgs, { role: "user", text: text || "请结合我上传的图片进行讲解。", imageDataUrl, imageName }];
    setMsgs(nextMsgs);
    setInput("");
    setLoading(true);
    setResponseMeta(null);
    imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    imageStageTimerRef.current = [];
    if (imageDataUrl) {
      setLoadingStage("正在上传并识别图片中的乐谱、题目或课件内容…");
      imageStageTimerRef.current.push(window.setTimeout(() => {
        setLoadingStage("正在结合当前课时内容生成讲解、纠错和复习建议…");
      }, 2200));
      imageStageTimerRef.current.push(window.setTimeout(() => {
        setLoadingStage("图片分析通常比纯文字更慢，请稍候，系统仍在继续处理…");
      }, 6500));
    } else {
      setLoadingStage("正在整理问题并生成解释…");
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), imageDataUrl ? 30000 : 18000);
    try {
      const requestMessages = nextMsgs.slice(-5);
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          maxTokens: imageDataUrl ? 280 : 220,
          system: tutorSystem,
          messages: requestMessages.map((item) => ({
            role: item.role,
            content: item.text,
            imageDataUrl: item.imageDataUrl || undefined,
            imageName: item.imageName || undefined,
          })),
        }),
      });
      const json = await response.json();
      const replyText = response.ok
        ? String(json?.text || "请求失败，请稍后重试。").trim()
        : String(
            (json?.kind === "timeout" ? "AI 导师响应超时。建议先缩短问题，或改成不带图片提问后再继续。" : "")
            || (json?.kind === "upstream_network" ? "AI 服务网络不稳定，请稍后重试。" : "")
            || json?.detail
            || "AI 服务暂时不可用，请稍后重试。"
          ).trim();
      setMsgs((prev) => [...prev, { role: "assistant", text: replyText }]);
      if (response.ok) {
        setResponseMeta({
          elapsedMs: json?.elapsedMs || null,
          cached: Boolean(json?.cached),
          modelUsed: json?.modelUsed || "",
          retried: Boolean(json?.retried),
        });
        setImageDataUrl("");
        setImageName("");
        appendTutorHistory(studentProfile.studentId, {
          lessonId,
          lessonTitle,
          prompt: text || "请结合我上传的图片进行讲解。",
          reply: replyText,
          imageUploaded: Boolean(imageDataUrl),
        });
      }
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "AI 导师响应超时。纯文字提问通常需要 2 到 5 秒，带图片会更慢，请稍后重试。"
        : "无法连接到 AI 服务。请确认当前网页后端已启动，或稍后重试。";
      setMsgs((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      window.clearTimeout(timeoutId);
      imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
      imageStageTimerRef.current = [];
      setLoading(false);
      setLoadingStage("");
    }
  }, [contextText, imageDataUrl, imageName, input, lessonId, lessonTitle, loading, msgs, studentProfile.studentId, tutorSystem]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 460, border: "1px solid rgba(17,17,17,0.08)", borderRadius: 12, overflow: "hidden", background: "#ffffff" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(17,17,17,0.08)", background: "#f8f8f8" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>AI 乐理导师</div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
          {lessonTitle} · 纯文字通常 2 到 5 秒；图片会经过压缩、识别和课时匹配，等待时间会更长
        </div>
        {responseMeta ? (
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            {responseMeta.cached ? "本次回答命中缓存" : "本次回答来自实时生成"}
            {responseMeta.elapsedMs ? ` · ${responseMeta.elapsedMs} ms` : ""}
            {responseMeta.modelUsed ? ` · ${responseMeta.modelUsed}` : ""}
            {responseMeta.retried ? " · 已自动重试一次" : ""}
          </div>
        ) : null}
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((msg, index) => (
          <div key={`${msg.role}-${index}`} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "82%", padding: "10px 12px", borderRadius: 12, background: msg.role === "user" ? "#111111" : "#f5f5f5", color: msg.role === "user" ? "#ffffff" : "#111111", fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {msg.imageDataUrl ? <img src={msg.imageDataUrl} alt={msg.imageName || "上传图片"} style={{ display: "block", maxWidth: 220, borderRadius: 10, marginBottom: 8 }} /> : null}
              {msg.text}
            </div>
          </div>
        ))}
        {loading ? <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{loadingStage || "思考中…"}</div> : null}
      </div>
      <div style={{ padding: 10, borderTop: "1px solid rgba(17,17,17,0.08)", background: "#fafafa" }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePickImage} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePickImage} />
        {imageDataUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: 8, borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <img src={imageDataUrl} alt={imageName || "预览"} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{imageName || "已选择图片"}</div>
            <button onClick={() => { setImageDataUrl(""); setImageName(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.08)", background: "#f5f5f5", cursor: "pointer" }}>移除</button>
          </div>
        ) : null}
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 8, lineHeight: 1.6 }}>
          建议先用一句短问题提问。带图片时系统会依次完成“压缩上传 → 内容识别 → 结合本课讲解”，等待时间会明显长于纯文字。
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="输入你的问题，或拍照上传后提问…"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", fontSize: 12, outline: "none" }}
          />
          <button onClick={() => cameraInputRef.current?.click()} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>拍照</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>相册</button>
          <button onClick={send} disabled={loading || (!input.trim() && !imageDataUrl)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: loading || (!input.trim() && !imageDataUrl) ? "default" : "pointer" }}>发送</button>
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

  const noteInfo = scaleNotes.map((step) => ({ name: NT[step % 12], oct: 4 + Math.floor(step / 12) })).reverse();

  const toggle = useCallback(async (r, c) => {
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
  }, [noteInfo, timbre]);

  const playSeq = useCallback(async () => {
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
      for (let r = 0; r < ROWS; r += 1) {
        if (grid[r][currentCol]) {
          const info = noteInfo[r];
          playTone(nFreq(info.name, info.oct), stepMs / 1000 * 1.5, timbre);
        }
      }
      currentCol = (currentCol + 1) % COLS;
    }, stepMs);
  }, [bpm, grid, isPlaying, noteInfo, timbre]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={playSeq} style={{ padding: "6px 14px", borderRadius: 8, background: isPlaying ? "#b91c1c" : "#111111", color: "#ffffff", border: "none", cursor: "pointer" }}>
            {isPlaying ? "停止" : "播放"}
          </button>
          <button onClick={() => setGrid(Array.from({ length: ROWS }, () => Array(COLS).fill(false)))} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>清空</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>BPM: {bpm}</label>
          <input type="range" min="60" max="200" step="5" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} style={{ width: 80 }} />
          <select value={timbre} onChange={(e) => setTimbre(e.target.value)} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="piano">钢琴</option>
            <option value="sine">正弦波</option>
            <option value="triangle">三角波</option>
            <option value="square">方波</option>
          </select>
        </div>
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
          {noteInfo.map((info, r) => (
            <div key={`${info.name}${info.oct}-${r}`} style={{ display: "flex", alignItems: "center", gap: 1 }}>
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
                    background: grid[r][c] ? (col === c ? "#555555" : "#111111") : col === c ? "rgba(17,17,17,0.12)" : c % 4 === 0 ? "#f3f3f3" : "#ffffff",
                    border: `1px solid ${grid[r][c] ? "#111111" : "rgba(17,17,17,0.08)"}`,
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

function TeacherDashboardPage() {
  const [data, setData] = useState(null);
  const [bktData, setBktData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [deepRunning, setDeepRunning] = useState(false);
  const currentStudentProfile = useMemo(() => getStudentProfile(), []);
  const [selectedPilotTemplateId, setSelectedPilotTemplateId] = useState(REAL_STUDENT_PILOT_TEMPLATES[0]?.id || "");
  const [selectedReportUserId, setSelectedReportUserId] = useState("");
  const [reportPreview, setReportPreview] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportPdfInfo, setReportPdfInfo] = useState(null);

  const reloadDashboard = useCallback(async () => {
    const [analyticsResponse, bktResponse] = await Promise.all([
      fetch("/api/teacher/overview"),
      fetch("/api/teacher/bkt-overview"),
    ]);
    const [analyticsJson, bktJson] = await Promise.all([analyticsResponse.json(), bktResponse.json()]);
    setData(analyticsJson);
    setBktData(bktJson);
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [analyticsResponse, bktResponse] = await Promise.all([
          fetch("/api/teacher/overview"),
          fetch("/api/teacher/bkt-overview"),
        ]);
        const [analyticsJson, bktJson] = await Promise.all([analyticsResponse.json(), bktResponse.json()]);
        if (active) {
          setData(analyticsJson);
          setBktData(bktJson);
        }
      } catch {
        if (active) {
          setData(null);
          setBktData(null);
        }
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

  const regenerateVirtualStudents = async () => {
    setSimulating(true);
    try {
      const localStudents = createVirtualStudents();
      writeVirtualStudentsToLocalStorage(localStudents);
      await fetch("/api/bkt/simulate", { method: "POST" });
      await reloadDashboard();
    } finally {
      setSimulating(false);
    }
  };

  const clearVirtualStudents = async () => {
    setSimulating(true);
    try {
      clearVirtualStudentsFromLocalStorage();
      await fetch("/api/bkt/reset", { method: "POST" });
      await reloadDashboard();
    } finally {
      setSimulating(false);
    }
  };

  const runBktValidation = async () => {
    setTestRunning(true);
    try {
      await fetch("/api/bkt/test/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 120, questionCount: 200 }),
      });
      await reloadDashboard();
    } finally {
      setTestRunning(false);
    }
  };

  const resetBktValidation = async () => {
    setTestRunning(true);
    try {
      await fetch("/api/bkt/test/reset", { method: "POST" });
      await reloadDashboard();
    } finally {
      setTestRunning(false);
    }
  };

  const runDeepSimulation = async () => {
    setDeepRunning(true);
    try {
      await fetch("/api/bkt/test/deep-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentCount: 150 }),
      });
      await reloadDashboard();
    } finally {
      setDeepRunning(false);
    }
  };

  const metricCard = (label, value) => (
    <div className="section-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#111111" }}>{value}</div>
    </div>
  );

  const currentStudentRecord = (bktData?.students || []).find((item) => item.userId === currentStudentProfile.studentId) || null;
  const selectedPilotTemplate = REAL_STUDENT_PILOT_TEMPLATES.find((item) => item.id === selectedPilotTemplateId) || REAL_STUDENT_PILOT_TEMPLATES[0];

  useEffect(() => {
    if (!selectedReportUserId && bktData?.students?.length) {
      setSelectedReportUserId(currentStudentRecord?.userId || bktData.students[0].userId || "");
    }
  }, [bktData, currentStudentRecord, selectedReportUserId]);

  const downloadPilotTemplate = useCallback((format) => {
    if (!selectedPilotTemplate) return;
    const fileNameBase = `${selectedPilotTemplate.id}-${selectedPilotTemplate.studentCount}students`;
    const blob = new Blob(
      [format === "json" ? `${JSON.stringify(buildPilotTemplateJson(selectedPilotTemplate), null, 2)}\n` : buildPilotTemplateCsv(selectedPilotTemplate)],
      { type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileNameBase}.${format === "json" ? "json" : "csv"}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [selectedPilotTemplate]);

  const previewStudentReport = useCallback(async () => {
    if (!selectedReportUserId) return;
    setReportLoading(true);
    setReportPdfInfo(null);
    try {
      const response = await fetch(`/api/reports/student-preview?userId=${encodeURIComponent(selectedReportUserId)}`);
      const json = await response.json();
      setReportPreview(response.ok ? json.report : null);
    } finally {
      setReportLoading(false);
    }
  }, [selectedReportUserId]);

  const generateStudentPdfReport = useCallback(async () => {
    if (!selectedReportUserId) return;
    setReportGenerating(true);
    try {
      const response = await fetch("/api/reports/student-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedReportUserId }),
      });
      const json = await response.json();
      if (response.ok) {
        setReportPreview(json.report);
        setReportPdfInfo(json.pdf);
      } else {
        setReportPdfInfo({ error: json.error || "生成 PDF 失败。" });
      }
    } finally {
      setReportGenerating(false);
    }
  }, [selectedReportUserId]);

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 14px" }}>教师后台</h2>
      <div className="metric-grid" style={{ marginBottom: 18 }}>
        {metricCard("数据记录数", data.summary.totalRecords)}
        {metricCard("学生数", data.summary.totalStudents)}
        {metricCard("平均得分", `${data.summary.averageScore}%`)}
        {metricCard("已提交作业", data.summary.totalHomeworkSubmitted)}
      </div>

      <div className="section-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>10-20 名真实学生试点模板</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              选择试点规模后，可直接导出试点记录模板，供音乐教师记录学生使用过程、困惑点、最好用功能和 bug。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={selectedPilotTemplateId} onChange={(event) => setSelectedPilotTemplateId(event.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff" }}>
              {REAL_STUDENT_PILOT_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button onClick={() => downloadPilotTemplate("json")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>导出 JSON 模板</button>
            <button onClick={() => downloadPilotTemplate("csv")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>导出 CSV 记录表</button>
          </div>
        </div>
        {selectedPilotTemplate ? (
          <div className="lesson-layout" style={{ marginTop: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>试点目标与招募建议</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 8 }}>
                规模：{selectedPilotTemplate.studentCount} 人 · 周期：{selectedPilotTemplate.durationDays} 天
                <br />
                目标：{selectedPilotTemplate.goal}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {selectedPilotTemplate.recruitment.map((item) => (
                  <div key={item} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item}</div>
                ))}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>成功标准</div>
              <div style={{ display: "grid", gap: 6 }}>
                {selectedPilotTemplate.successCriteria.map((item) => (
                  <div key={item} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item}</div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {selectedPilotTemplate ? (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {selectedPilotTemplate.phases.map((item) => (
              <div key={item.phase} className="subtle-card" style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginBottom: 4 }}>{item.phase}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  任务：{item.tasks}
                  <br />
                  证据：{item.evidence}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="section-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>自动导出单个学生 PDF 学习报告</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              这里按单个学生聚合课堂练习、课后作业和知识点 P(L) 生成报告，不是 10-20 人整批导出。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={selectedReportUserId} onChange={(event) => setSelectedReportUserId(event.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", minWidth: 220 }}>
              {(bktData?.students || []).map((item) => (
                <option key={item.userId} value={item.userId}>{item.studentLabel}（{item.userId}）</option>
              ))}
            </select>
            <button onClick={previewStudentReport} disabled={!selectedReportUserId || reportLoading} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: !selectedReportUserId || reportLoading ? "default" : "pointer" }}>
              {reportLoading ? "加载中..." : "预览报告"}
            </button>
            <button onClick={generateStudentPdfReport} disabled={!selectedReportUserId || reportGenerating} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: !selectedReportUserId || reportGenerating ? "default" : "pointer" }}>
              {reportGenerating ? "生成中..." : "生成 PDF"}
            </button>
          </div>
        </div>
        {reportPdfInfo?.url ? (
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--color-text-secondary)" }}>
            PDF 已生成：
            <a href={reportPdfInfo.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>{reportPdfInfo.fileName}</a>
          </div>
        ) : reportPdfInfo?.error ? (
          <div style={{ marginTop: 12, fontSize: 11, color: "#b91c1c" }}>{reportPdfInfo.error}</div>
        ) : null}
        {reportPreview ? (
          <div className="lesson-layout" style={{ marginTop: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>报告摘要</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                学生：{reportPreview.studentLabel}（{reportPreview.userId}）
                <br />
                访问课时数：{reportPreview.lessonsVisited}，平均得分：{reportPreview.averageScore}% ，累计学习时长：{reportPreview.totalStudyMinutes} 分钟
                <br />
                平均掌握度：{reportPreview.averageMastery}，作业提交次数：{reportPreview.homeworkSubmitted}
                <br />
                已掌握较好：{(reportPreview.strongPoints || []).map((item) => item.title).join(" / ") || "暂无"}
                <br />
                当前薄弱点：{(reportPreview.weakPoints || []).map((item) => item.title).join(" / ") || "暂无"}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>知识点 P(L) 预览</div>
              <div style={{ overflowX: "auto", maxHeight: 280 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                      <th style={{ padding: "6px 8px" }}>知识点</th>
                      <th style={{ padding: "6px 8px" }}>P(L)</th>
                      <th style={{ padding: "6px 8px" }}>mastered</th>
                      <th style={{ padding: "6px 8px" }}>difficulty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportPreview.knowledgeStates || []).map((item) => (
                      <tr key={`preview-${item.id}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                        <td style={{ padding: "6px 8px" }}>{item.title}</td>
                        <td style={{ padding: "6px 8px" }}>{Number(item.pL || 0).toFixed(3)}</td>
                        <td style={{ padding: "6px 8px" }}>{item.mastered ? "是" : "否"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.difficulty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="section-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>知识点级 BKT 测试面板</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              可生成 12 名虚拟学生，用于验证 24 个知识点的掌握度分布、自适应推荐和教师后台统计。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={regenerateVirtualStudents} disabled={simulating} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: simulating ? "default" : "pointer" }}>
              {simulating ? "处理中..." : "生成虚拟学生"}
            </button>
            <button onClick={clearVirtualStudents} disabled={simulating} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", color: "#111111", cursor: simulating ? "default" : "pointer" }}>
              清空模拟数据
            </button>
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>2 小时 BKT 验证报告</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              运行 4 类学生轨迹，输出 24 个知识点最终 P(L)、mastered 数量、难度升级次数和异常诊断。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={runBktValidation} disabled={testRunning} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: testRunning ? "default" : "pointer" }}>
              {testRunning ? "验证中..." : "运行 2 小时验证"}
            </button>
            <button onClick={resetBktValidation} disabled={testRunning} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", color: "#111111", cursor: testRunning ? "default" : "pointer" }}>
              清空验证结果
            </button>
          </div>
        </div>
      </div>

      <div className="section-card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>150 名随机学生深度测试</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              随机生成 150 名学生轨迹，统计他们最困惑的知识点、最好用的功能和最常遇到的 bug，用于教师视角的产品诊断。
            </div>
          </div>
          <button onClick={runDeepSimulation} disabled={deepRunning} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: deepRunning ? "default" : "pointer" }}>
            {deepRunning ? "测试中..." : "运行 150 人深度测试"}
          </button>
        </div>
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

      {bktData?.ok ? (
        <div className="lesson-layout" style={{ marginBottom: 18 }}>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>当前学生知识点 P(L) 明细</div>
            {currentStudentRecord ? (
              <>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
                  学生：{currentStudentRecord.studentLabel}（{currentStudentRecord.userId}）
                  <br />
                  课时：{currentStudentRecord.lessonId}，平均掌握度：{currentStudentRecord.averageMastery}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                        <th style={{ padding: "6px 8px" }}>知识点</th>
                        <th style={{ padding: "6px 8px" }}>P(L)</th>
                        <th style={{ padding: "6px 8px" }}>mastered</th>
                        <th style={{ padding: "6px 8px" }}>difficulty</th>
                        <th style={{ padding: "6px 8px" }}>attempts</th>
                        <th style={{ padding: "6px 8px" }}>accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentStudentRecord.knowledgeStates || []).map((item) => {
                        const accuracy = Number(item.totalAttempts || 0) > 0 ? Math.round((Number(item.correctAttempts || 0) / Number(item.totalAttempts || 1)) * 100) : 0;
                        return (
                          <tr key={`current-student-${item.id}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                            <td style={{ padding: "6px 8px" }}>{item.title}</td>
                            <td style={{ padding: "6px 8px" }}>{Number(item.pL || 0).toFixed(3)}</td>
                            <td style={{ padding: "6px 8px" }}>{item.mastered ? "是" : "否"}</td>
                            <td style={{ padding: "6px 8px" }}>{item.difficulty}</td>
                            <td style={{ padding: "6px 8px" }}>{item.totalAttempts || 0}</td>
                            <td style={{ padding: "6px 8px" }}>{accuracy}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                当前浏览器学生尚未完成知识点同步。请先在学生端完成练习后再刷新教师后台。
              </div>
            )}
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>知识点掌握概览</div>
            <div style={{ display: "grid", gap: 8 }}>
              {bktData.students?.slice(0, 12).map((student) => (
                <div key={`${student.userId}-${student.lessonId}`} className="subtle-card" style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{student.studentLabel}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    课时：{student.lessonId}，平均掌握度：{student.averageMastery}
                    <br />
                    薄弱点：{student.weakPoints?.map((item) => item.title).join(" / ") || "暂无"}
                    <br />
                    建议：{student.recommendation || "继续观察"}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>班级薄弱知识点排行</div>
            <div style={{ display: "grid", gap: 8 }}>
              {bktData.weakKnowledgePoints?.slice(0, 12).map((item) => (
                <div key={item.id} className="subtle-card" style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    所属课时：{item.lessonId}，平均掌握度：{item.averageMastery}
                    <br />
                    掌握率：{Math.round(Number(item.masteryRate || 0) * 100)}%，参与学生：{item.learners}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {bktData?.latestTestRun ? (
        <div className="section-card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>最近一次验证结果</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                运行时间：{bktData.latestTestRun.runAt}，时长：{bktData.latestTestRun.params?.durationMinutes || 120} 分钟，题量：{bktData.latestTestRun.params?.questionCount || 200}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: bktData.latestTestRun.judgement?.passed ? "#166534" : "#b91c1c" }}>
              {bktData.latestTestRun.judgement?.passed ? "验证通过" : "存在异常"}
            </div>
          </div>

          <div className="lesson-layout" style={{ marginBottom: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>综合诊断</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                场景平均 P(L) 差异：{bktData.latestTestRun.judgement?.averageSpread ?? "-"}
                <br />
                异常：{bktData.latestTestRun.judgement?.issues?.length ? bktData.latestTestRun.judgement.issues.join("；") : "未发现明显异常"}
                <br />
                建议：{bktData.latestTestRun.judgement?.suggestions?.join("；") || "继续观察"}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>教师视角题库风险</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(bktData.latestTestRun.questionBankRisks || []).filter((item) => item.risks?.length).slice(0, 8).map((item) => (
                  <div key={item.knowledgePointId} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                    <strong style={{ color: "#111111" }}>{item.title}</strong>：{item.risks.join(" / ")}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {(bktData.latestTestRun.results || []).map((scenario) => (
              <div key={scenario.scenarioId} className="subtle-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>{scenario.label}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                      正确率：{Math.round(Number(scenario.accuracyTarget || 0) * 100)}%，平均 P(L)：{scenario.averagePL}，mastered：{scenario.masteredCount}，难度升级：{scenario.difficultyUpgradeCount}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: scenario.passed ? "#166534" : "#b91c1c" }}>
                    {scenario.passed ? "符合预期" : "需调参"}
                  </div>
                </div>

                <div style={{ marginBottom: 10, fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  强项：{scenario.strongPoints?.map((item) => `${item.title} (${item.pL})`).join(" / ") || "暂无"}
                  <br />
                  薄弱点：{scenario.weakPoints?.map((item) => `${item.title} (${item.pL})`).join(" / ") || "暂无"}
                  <br />
                  诊断：{scenario.issues?.length ? scenario.issues.join("；") : "无异常"}
                </div>

                <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                  {(scenario.knowledgeStates || []).map((item) => (
                    <div key={item.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 70px 70px", gap: 8, alignItems: "center", fontSize: 11 }}>
                      <div style={{ color: "#111111", fontWeight: 600 }}>{item.title}</div>
                      <div style={{ height: 10, borderRadius: 999, background: "rgba(17,17,17,0.08)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(Number(item.pL || 0) * 100)}%`, height: "100%", background: Number(item.pL || 0) >= 0.8 ? "#111111" : Number(item.pL || 0) >= 0.45 ? "#555555" : "#bdbdbd" }} />
                      </div>
                      <div style={{ color: "#111111" }}>{item.pL}</div>
                      <div style={{ color: item.mastered ? "#166534" : "var(--color-text-secondary)" }}>{item.mastered ? "mastered" : item.difficulty}</div>
                    </div>
                  ))}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                        <th style={{ padding: "6px 8px" }}>知识点</th>
                        <th style={{ padding: "6px 8px" }}>P(L)</th>
                        <th style={{ padding: "6px 8px" }}>mastered</th>
                        <th style={{ padding: "6px 8px" }}>difficulty</th>
                        <th style={{ padding: "6px 8px" }}>attempts</th>
                        <th style={{ padding: "6px 8px" }}>accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scenario.knowledgeStates || []).map((item) => (
                        <tr key={`${scenario.scenarioId}-${item.id}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                          <td style={{ padding: "6px 8px" }}>{item.title}</td>
                          <td style={{ padding: "6px 8px" }}>{item.pL}</td>
                          <td style={{ padding: "6px 8px" }}>{item.mastered ? "是" : "否"}</td>
                          <td style={{ padding: "6px 8px" }}>{item.difficulty}</td>
                          <td style={{ padding: "6px 8px" }}>{item.totalAttempts}</td>
                          <td style={{ padding: "6px 8px" }}>{Math.round(Number(item.accuracy || 0) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {bktData?.latestDeepRun ? (
        <div className="section-card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>150 名随机学生深度测试结果</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                运行时间：{bktData.latestDeepRun.runAt}，样本数：{bktData.latestDeepRun.studentCount}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>
              平均 P(L)：{bktData.latestDeepRun.summary?.averagePL ?? "-"} · 平均 mastered：{bktData.latestDeepRun.summary?.averageMastered ?? "-"}
            </div>
          </div>

          <div className="metric-grid" style={{ marginBottom: 14 }}>
            {[
              ["优等型", bktData.latestDeepRun.summary?.profileSummary?.excellent || 0],
              ["中等稳定型", bktData.latestDeepRun.summary?.profileSummary?.steady || 0],
              ["偏科型", bktData.latestDeepRun.summary?.profileSummary?.imbalanced || 0],
              ["低参与型", bktData.latestDeepRun.summary?.profileSummary?.lowengage || 0],
            ].map(([label, value]) => (
              <div key={label} className="subtle-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111111" }}>{value}</div>
              </div>
            ))}
          </div>

          <div className="lesson-layout" style={{ marginBottom: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>学生最困惑的内容</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(bktData.latestDeepRun.summary?.topConfusions || []).map((item) => (
                  <div key={item.title} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}>
                    <span style={{ color: "#111111", fontWeight: 600 }}>{item.title}</span>
                    <span style={{ color: "var(--color-text-secondary)" }}>{item.count} 人</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>学生觉得最好用的功能</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(bktData.latestDeepRun.summary?.topPreferredTools || []).map((item) => (
                  <div key={item.tool} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}>
                    <span style={{ color: "#111111", fontWeight: 600 }}>{item.tool}</span>
                    <span style={{ color: "var(--color-text-secondary)" }}>{item.count} 人</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lesson-layout" style={{ marginBottom: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>最常报告的 bug</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(bktData.latestDeepRun.summary?.topReportedBugs || []).map((item) => (
                  <div key={item.bug} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}>
                    <span style={{ color: "#111111", lineHeight: 1.7 }}>{item.bug}</span>
                    <span style={{ color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{item.count} 人</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>产品诊断结论</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                当前样本中，困惑点主要集中在统计结果前列的知识点，说明相关题组和课件解释仍需加强。
                <br />
                若“AI 导师”与“课时内容 PPT”同时高频出现，说明学生最依赖的是即时解释与原课件联动，而不是额外功能。
                <br />
                高频 bug 可直接作为下一轮前端优化优先级。
              </div>
            </div>
          </div>

          <div className="subtle-card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>24 个知识点最终平均 P(L)</div>
            <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              {(bktData.latestDeepRun.summary?.knowledgePointAverages || []).map((item) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 60px 70px", gap: 8, alignItems: "center", fontSize: 11 }}>
                  <div style={{ color: "#111111", fontWeight: 600 }}>{item.title}</div>
                  <div style={{ height: 10, borderRadius: 999, background: "rgba(17,17,17,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.round(Number(item.averagePL || 0) * 100)}%`, height: "100%", background: Number(item.averagePL || 0) >= 0.8 ? "#111111" : Number(item.averagePL || 0) >= 0.45 ? "#555555" : "#bdbdbd" }} />
                  </div>
                  <div style={{ color: "#111111" }}>{item.averagePL}</div>
                  <div style={{ color: "var(--color-text-secondary)" }}>{Math.round(Number(item.masteredRate || 0) * 100)}%</div>
                </div>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                    <th style={{ padding: "6px 8px" }}>知识点</th>
                    <th style={{ padding: "6px 8px" }}>课时</th>
                    <th style={{ padding: "6px 8px" }}>平均 P(L)</th>
                    <th style={{ padding: "6px 8px" }}>mastered 率</th>
                    <th style={{ padding: "6px 8px" }}>样本数</th>
                  </tr>
                </thead>
                <tbody>
                  {(bktData.latestDeepRun.summary?.knowledgePointAverages || []).map((item) => (
                    <tr key={`deep-kp-${item.id}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                      <td style={{ padding: "6px 8px" }}>{item.title}</td>
                      <td style={{ padding: "6px 8px" }}>{item.lessonId}</td>
                      <td style={{ padding: "6px 8px" }}>{item.averagePL}</td>
                      <td style={{ padding: "6px 8px" }}>{Math.round(Number(item.masteredRate || 0) * 100)}%</td>
                      <td style={{ padding: "6px 8px" }}>{item.learners}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-card" style={{ padding: 12, background: "#fafafa", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>样本学生反馈摘录</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(bktData.latestDeepRun.students || []).slice(0, 12).map((student) => (
                <div key={student.userId} className="subtle-card" style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginBottom: 6 }}>
                    {student.studentLabel} · {student.profile} · P(L) {student.averagePL} · mastered {student.masteredCount}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    最困惑：{student.mostConfused?.join(" / ") || "暂无"}
                    <br />
                    最好用：{student.preferredTool}
                    <br />
                    常见 bug：{student.reportedBug}
                    <br />
                    反馈：{student.confusionReport}
                    <br />
                    正向体验：{student.positiveReport}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

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
  return (
    <div>
      <div style={{ textAlign: "center", padding: "30px 16px 22px" }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#534AB7", letterSpacing: 2, marginBottom: 4 }}>AI 驱动 · 自主学习</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>乐理智学平台</h1>
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
              {ch.ls.map((l) => (
                <button key={l.id} onClick={() => setPage(l.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "0.5px solid var(--color-border-tertiary)", background: (scores[l.id] || 0) > 50 ? ch.bg : "var(--color-background-secondary)", color: (scores[l.id] || 0) > 50 ? ch.c : "var(--color-text-secondary)", cursor: "pointer", fontWeight: 500 }}>
                  第{l.n}课{(scores[l.id] || 0) > 0 ? ` ${scores[l.id]}%` : ""}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
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
            每个单元下直接展示课时卡片，点击课时即可进入课前预习、内容呈现、课堂练习与课后作业。
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

