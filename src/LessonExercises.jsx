import { useCallback, useEffect, useRef, useState } from "react";
import { FeedbackBar, Tag } from "./uiBasics";
import { BK, NT, WK, nFreq, playTone, unlockAudioSystem } from "./musicAudio";

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

export { EXERCISE_COMPONENTS };
