import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nFreq, playNoise, playTone, unlockAudioSystem } from "./musicAudio";
import {
  ArticulationDemo,
  CharacterPlayer,
  BarlineRow,
  CompareRows,
  ConductPattern,
  DotCompare,
  DurationTree,
  DynamicTermPlayer,
  ForgettingCurve,
  FrequencyLadder,
  GLYPH_FONT,
  Hairpin,
  HarmonicStack,
  MeterAnatomy,
  MultilingualTempo,
  NotatedVsPlayed,
  NoteAnatomy,
  OrnamentSign,
  OctaveMap,
  PlayPath,
  RestRow,
  RhythmStaff,
  ScaleAxis,
  StaffBoard,
  TempoCharacter,
  TempoCurve,
  TermGrid,
  TuningCompare,
  playNote,
  playSequence,
} from "./LessonVisualParts";

/**
 * Visual-first lesson content.
 *
 * A knowledge point is rendered as a diagram the student can touch and hear,
 * not as a paragraph. Each lesson is a data table of visual specs; the
 * primitives below (keyboard, wave scope) cover every L1 knowledge point.
 */

/* ── shared geometry ─────────────────────────────────────────────────────── */

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK_STEPS = [1, 3, 6, 8, 10];
const WHITE_NAMES = ["C", "D", "E", "F", "G", "A", "B", "C"];
const SOLFEGE = ["do", "re", "mi", "fa", "sol", "la", "si", "do"];
const BLACK_NAMES = { 1: ["C♯", "D♭"], 3: ["D♯", "E♭"], 6: ["F♯", "G♭"], 8: ["G♯", "A♭"], 10: ["A♯", "B♭"] };

const KEY_W = 46;
const KEY_H = 168;
const BLACK_W = 28;
const BLACK_H = 104;
const BOARD_W = WHITE_STEPS.length * KEY_W;

// headroom above the keys, only as much as each preset's annotations need
const HEAD_ROOM = { scale: 14, semitone: 80, accidental: 74, enharmonic: 74 };

const whiteX = (index) => index * KEY_W;
const whiteCenter = (index) => index * KEY_W + KEY_W / 2;
const blackX = (step) => WHITE_STEPS.filter((s) => s < step).length * KEY_W - BLACK_W / 2;
const blackCenter = (step) => blackX(step) + BLACK_W / 2;

function stepFreq(step) {
  return nFreq("C", 4) * Math.pow(2, step / 12);
}

async function strike(step, duration = 0.9) {
  await unlockAudioSystem();
  playTone(stepFreq(step), duration, "piano", 0.24);
}

/* ── primitive 1: piano keyboard ─────────────────────────────────────────── */

function PianoBoard({ preset }) {
  const [pressed, setPressed] = useState(null);
  const [accidental, setAccidental] = useState("natural");
  const [activePair, setActivePair] = useState(null);
  const pressTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(pressTimer.current), []);

  const hit = useCallback((step, duration) => {
    strike(step, duration);
    setPressed(step);
    window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => setPressed(null), 260);
  }, []);

  // accidental preset anchors on D: D♭ and D♯ sit on either side of one white key
  const anchor = 2;
  const accidentalStep = accidental === "sharp" ? 3 : accidental === "flat" ? 1 : anchor;

  const playPair = useCallback(async (pair) => {
    setActivePair(pair.id);
    await strike(pair.from, 0.7);
    window.setTimeout(() => strike(pair.to, 0.9), 420);
  }, []);

  const pairs = useMemo(
    () =>
      WHITE_STEPS.slice(0, -1).map((step, index) => {
        const to = WHITE_STEPS[index + 1];
        return { id: `${step}-${to}`, from: step, to, index, half: to - step === 1 };
      }),
    [],
  );

  // semitone relations live in the brackets above the keys, so the keys stay plain
  const highlighted = new Set();
  if (preset === "accidental") highlighted.add(accidentalStep);
  if (preset === "enharmonic") highlighted.add(1);

  const top = HEAD_ROOM[preset] ?? 74;
  const boardH = top + KEY_H + 14;
  const legBottom = top - 6;

  return (
    <div className="kv-stage">
      <div className="kv-board-scroll">
        <svg viewBox={`0 0 ${BOARD_W} ${boardH}`} className="kv-board" role="group" aria-label="钢琴键盘">
          <defs>
            <linearGradient id="kvWhite" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fffdf6" />
              <stop offset="100%" stopColor="#ece1cc" />
            </linearGradient>
            <linearGradient id="kvWhiteLit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bde3a3" />
              <stop offset="100%" stopColor="#7db158" />
            </linearGradient>
            <linearGradient id="kvBlack" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4a382a" />
              <stop offset="100%" stopColor="#241a12" />
            </linearGradient>
            <linearGradient id="kvBlackLit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6e9c4e" />
              <stop offset="100%" stopColor="#3f6e2f" />
            </linearGradient>
          </defs>

          {/* whole-tone / semitone brackets */}
          {preset === "semitone" &&
            pairs.map((pair) => {
              const x1 = whiteCenter(pair.index);
              const x2 = whiteCenter(pair.index + 1);
              const y = pair.half ? 30 : 50;
              const tint = pair.half ? "#b4472f" : "#5d8f46";
              const on = activePair === pair.id;
              return (
                <g
                  key={pair.id}
                  className="kv-bracket"
                  onClick={() => playPair(pair)}
                  role="button"
                  aria-label={pair.half ? "半音" : "全音"}
                >
                  <rect x={x1 - 4} y={y - 13} width={x2 - x1 + 8} height={26} rx="13" fill="transparent" />
                  <path
                    d={`M ${x1 + 3} ${legBottom} L ${x1 + 3} ${y} L ${x2 - 3} ${y} L ${x2 - 3} ${legBottom}`}
                    fill="none"
                    stroke={tint}
                    strokeWidth={on ? 3.4 : 2.2}
                    strokeLinecap="round"
                    opacity={pair.half ? 1 : 0.62}
                  />
                  <rect x={(x1 + x2) / 2 - 21} y={y - 12} width="42" height="21" rx="10" fill={tint} opacity={on ? 1 : 0.92} />
                  <text x={(x1 + x2) / 2} y={y + 3} className="kv-bracket-text">
                    {pair.half ? "半音" : "全音"}
                  </text>
                </g>
              );
            })}

          {/* enharmonic: two names stacked over the one black key they share */}
          {preset === "enharmonic" && (
            <g>
              <rect x={blackCenter(1) - 28} y="4" width="56" height="22" rx="11" fill="#b4472f" />
              <text x={blackCenter(1)} y="19" className="kv-chip-text">C♯</text>
              <rect x={blackCenter(1) - 28} y="30" width="56" height="22" rx="11" fill="#3f6e2f" />
              <text x={blackCenter(1)} y="45" className="kv-chip-text">D♭</text>
              <path
                d={`M ${blackCenter(1)} 54 L ${blackCenter(1)} ${top - 2}`}
                stroke="#8a5a2b"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              <text x={blackCenter(1) + 62} y="33" className="kv-hint-text" textAnchor="start">
                同一个键
              </text>
            </g>
          )}

          {/* accidental: arc from the natural note to the altered key */}
          {preset === "accidental" && accidental !== "natural" && (
            <g>
              <path
                d={`M ${whiteCenter(1)} ${top - 8} Q ${(whiteCenter(1) + blackCenter(accidentalStep)) / 2} ${top - 46} ${blackCenter(accidentalStep)} ${top - 8}`}
                fill="none"
                stroke={accidental === "sharp" ? "#b4472f" : "#2f6f8a"}
                strokeWidth="2.2"
                markerEnd={accidental === "sharp" ? "url(#kvArrowSharp)" : "url(#kvArrowFlat)"}
              />
              <text x={(whiteCenter(1) + blackCenter(accidentalStep)) / 2} y={top - 52} className="kv-hint-text">
                {accidental === "sharp" ? "升高半音" : "降低半音"}
              </text>
            </g>
          )}
          <defs>
            {[["kvArrowSharp", "#b4472f"], ["kvArrowFlat", "#2f6f8a"]].map(([id, tint]) => (
              <marker
                key={id}
                id={id}
                markerUnits="userSpaceOnUse"
                markerWidth="10"
                markerHeight="10"
                refX="7"
                refY="5"
                orient="auto"
              >
                <path d="M 1 1 L 9 5 L 1 9 z" fill={tint} />
              </marker>
            ))}
          </defs>

          {/* white keys */}
          {WHITE_STEPS.map((step, index) => {
            const lit = highlighted.has(step) || pressed === step;
            return (
              <g key={`w${step}`} className="kv-key" onClick={() => hit(step)} role="button" aria-label={WHITE_NAMES[index]}>
                <rect
                  x={whiteX(index) + 1}
                  y={top}
                  width={KEY_W - 2}
                  height={KEY_H}
                  rx="7"
                  fill={lit ? "url(#kvWhiteLit)" : "url(#kvWhite)"}
                  stroke="#8a5a2b"
                  strokeWidth="1.6"
                />
                {preset !== "plain" && (
                  <text x={whiteCenter(index)} y={top + KEY_H - 40} className={lit ? "kv-key-name is-lit" : "kv-key-name"}>
                    {WHITE_NAMES[index]}
                  </text>
                )}
                {preset === "scale" && (
                  <text x={whiteCenter(index)} y={top + KEY_H - 18} className={lit ? "kv-key-solfege is-lit" : "kv-key-solfege"}>
                    {SOLFEGE[index]}
                  </text>
                )}
              </g>
            );
          })}

          {/* black keys */}
          {BLACK_STEPS.map((step) => {
            const lit = highlighted.has(step) || pressed === step;
            return (
              <g key={`b${step}`} className="kv-key" onClick={() => hit(step)} role="button" aria-label={BLACK_NAMES[step][0]}>
                <rect
                  x={blackX(step)}
                  y={top}
                  width={BLACK_W}
                  height={BLACK_H}
                  rx="5"
                  fill={lit ? "url(#kvBlackLit)" : "url(#kvBlack)"}
                  stroke="#241a12"
                  strokeWidth="1.4"
                />
                {(preset === "enharmonic" || preset === "accidental") && lit && (
                  <text x={blackCenter(step)} y={top + BLACK_H - 12} className="kv-black-name">
                    {BLACK_NAMES[step][accidental === "flat" ? 1 : 0]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {preset === "accidental" && (
        <div className="kv-controls">
          {[
            { id: "flat", label: "♭ 降号", tip: "降低半音" },
            { id: "natural", label: "♮ 还原", tip: "回到本位" },
            { id: "sharp", label: "♯ 升号", tip: "升高半音" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              className={`kv-chip${accidental === option.id ? " is-on" : ""}`}
              onClick={() => {
                setAccidental(option.id);
                hit(option.id === "sharp" ? 3 : option.id === "flat" ? 1 : anchor);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {preset === "enharmonic" && (
        <div className="kv-controls">
          <button type="button" className="kv-chip" onClick={() => hit(1)}>▶ 弹 C♯</button>
          <button type="button" className="kv-chip" onClick={() => hit(1)}>▶ 弹 D♭</button>
          <span className="kv-controls-note">两个按钮响的是同一个声音</span>
        </div>
      )}

      {preset === "semitone" && <div className="kv-controls-note kv-standalone">点上方标记，听两个音接连响起</div>}
      {preset === "scale" && <div className="kv-controls-note kv-standalone">点白键听音</div>}
    </div>
  );
}

/* ── primitive 2: wave scope ─────────────────────────────────────────────── */

const NOISE_SEED = (() => {
  let seed = 20260729;
  return Array.from({ length: 256 }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed / 0x7fffffff) * 2 - 1;
  });
})();

const WAVE_W = 460;
const WAVE_H = 150;

const WAVE_MID = WAVE_H / 2;

// One pass over the curve produces both the stroked line and the area between
// the curve and the centre axis, so the scope can be drawn in layers.
function waveGeometry({ cycles, amp, phase, timbre, noise, span = 1 }) {
  const steps = 300;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps;
    const x = ratio * WAVE_W * span;
    let value;
    if (noise) {
      value = NOISE_SEED[i % NOISE_SEED.length];
    } else {
      const t = ratio * cycles * Math.PI * 2 + phase;
      if (timbre === "square") value = Math.sin(t) >= 0 ? 0.85 : -0.85;
      else if (timbre === "triangle") value = (2 / Math.PI) * Math.asin(Math.sin(t));
      else if (timbre === "piano") value = Math.sin(t) * 0.72 + Math.sin(t * 2) * 0.22 + Math.sin(t * 3) * 0.1;
      else value = Math.sin(t);
    }
    points.push(`${x.toFixed(1)},${(WAVE_MID - value * amp * (WAVE_MID - 14)).toFixed(1)}`);
  }
  const line = `M ${points.join(" L ")}`;
  const right = (WAVE_W * span).toFixed(1);
  return { line, area: `${line} L ${right},${WAVE_MID} L 0,${WAVE_MID} Z` };
}

// A fixed "musical passage" silhouette. Only its overall height tracks the
// amplitude slider, which is exactly what loudness means.
const BAR_COUNT = 48;
const BAR_PATTERN = Array.from({ length: BAR_COUNT }, (_, i) => {
  const a = Math.abs(NOISE_SEED[i]);
  const b = Math.abs(NOISE_SEED[i + 1]);
  const c = Math.abs(NOISE_SEED[i + 2]);
  return 0.3 + 0.7 * ((a + b + c) / 3);
});

function barGeometry(amp) {
  const step = WAVE_W / BAR_COUNT;
  const width = step * 0.6;
  const maxHalf = WAVE_MID - 12;
  return BAR_PATTERN.map((weight, i) => {
    const half = Math.max(1.6, weight * amp * maxHalf);
    return { x: i * step + (step - width) / 2, y: WAVE_MID - half, width, height: half * 2 };
  });
}

const DYNAMIC_MARKS = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"];
function dynamicMark(amp) {
  const index = Math.min(DYNAMIC_MARKS.length - 1, Math.floor(amp * DYNAMIC_MARKS.length));
  return DYNAMIC_MARKS[index];
}

/**
 * The scope draws five layers so the wave reads as an instrument trace rather
 * than a bare polyline: axis, ticks, halo, gradient body, bright edge.
 */
function WaveScope({ uid, ramp, geometry, bars = null, edgeX = null, ariaLabel }) {
  const [light, base, deep] = ramp;
  const fillId = `kvFill-${uid}`;
  const strokeId = `kvStroke-${uid}`;
  const barId = `kvBar-${uid}`;
  const ticks = Array.from({ length: 17 }, (_, i) => (i / 16) * WAVE_W);

  return (
    <div className="kv-scope">
      <svg viewBox={`0 0 ${WAVE_W} ${WAVE_H}`} className="kv-wave" role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={base} stopOpacity="0.05" />
            <stop offset="50%" stopColor={base} stopOpacity="0.44" />
            <stop offset="100%" stopColor={base} stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={light} />
            <stop offset="55%" stopColor={base} />
            <stop offset="100%" stopColor={deep} />
          </linearGradient>
          <linearGradient id={barId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={deep} />
            <stop offset="50%" stopColor={light} />
            <stop offset="100%" stopColor={deep} />
          </linearGradient>
        </defs>

        <line x1="0" y1={WAVE_MID} x2={WAVE_W} y2={WAVE_MID} className="kv-axis" />
        {ticks.map((x) => (
          <line key={x} x1={x} y1={WAVE_MID - 4} x2={x} y2={WAVE_MID + 4} className="kv-tick" />
        ))}

        {bars ? (
          <g className="kv-bars" style={{ filter: `drop-shadow(0 0 5px ${base}66)` }}>
            {bars.map((bar, i) => (
              <rect
                key={i}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={bar.width / 2}
                fill={`url(#${barId})`}
              />
            ))}
          </g>
        ) : (
          <>
            <path d={geometry.line} className="kv-wave-halo" stroke={base} />
            <path d={geometry.area} className="kv-wave-fill" fill={`url(#${fillId})`} fillRule="evenodd" />
            <path
              d={geometry.line}
              className="kv-wave-path"
              stroke={`url(#${strokeId})`}
              style={{ filter: `drop-shadow(0 0 6px ${base}88)` }}
            />
          </>
        )}

        {edgeX != null && <line x1={edgeX} y1="10" x2={edgeX} y2={WAVE_H - 10} className="kv-wave-edge" />}
      </svg>
    </div>
  );
}

const RAMP_TONE = ["#e6f9ae", "#a8e063", "#5d8f46"];
const RAMP_NOISE = ["#f7c6b0", "#e07a5f", "#b4472f"];

function useWaveAnimation() {
  const [phase, setPhase] = useState(0);
  const raf = useRef(null);
  const stopAt = useRef(0);

  const run = useCallback((duration) => {
    stopAt.current = performance.now() + duration * 1000;
    if (raf.current) return;
    const tick = (now) => {
      setPhase((now / 260) % (Math.PI * 2000));
      if (now < stopAt.current) {
        raf.current = requestAnimationFrame(tick);
      } else {
        raf.current = null;
        setPhase(0);
      }
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => raf.current && cancelAnimationFrame(raf.current), []);
  return [phase, run];
}

const PROPERTIES = [
  { id: "pitch", label: "音高", unit: "频率", min: 160, max: 780, step: 2, initial: 262 },
  { id: "duration", label: "音值", unit: "时长", min: 0.2, max: 2, step: 0.05, initial: 0.8 },
  { id: "volume", label: "音量", unit: "振幅", min: 0.08, max: 1, step: 0.02, initial: 0.6 },
  { id: "timbre", label: "音色", unit: "波形", min: 0, max: 3, step: 1, initial: 0 },
];
const TIMBRES = ["sine", "triangle", "square", "piano"];
const TIMBRE_NAMES = ["纯正弦 · 最干净", "三角波 · 柔和", "方波 · 电子感", "钢琴 · 泛音丰富"];

function WaveLab() {
  const [active, setActive] = useState("pitch");
  const [values, setValues] = useState(() =>
    PROPERTIES.reduce((acc, item) => ({ ...acc, [item.id]: item.initial }), {}),
  );
  const [phase, run] = useWaveAnimation();

  const property = PROPERTIES.find((item) => item.id === active);
  const freq = values.pitch;
  const duration = values.duration;
  const amp = values.volume;
  const timbre = TIMBRES[values.timbre];

  const play = useCallback(async () => {
    await unlockAudioSystem();
    playTone(freq, duration, timbre, Math.max(0.05, amp * 0.3));
    run(duration);
  }, [amp, duration, freq, run, timbre]);

  // only the volume view is about loudness; the others keep a readable
  // constant amplitude so frequency, length and shape stay legible
  const displayAmp = active === "volume" ? amp : 0.8;
  const fillPercent = ((values[active] - property.min) / (property.max - property.min)) * 100;
  const cycles = Math.max(1.2, (freq / 262) * 3);
  const span = active === "duration" ? Math.max(0.16, duration / 2) : 1;

  const readout = {
    pitch: `${Math.round(freq)} Hz`,
    duration: `${duration.toFixed(2)} 秒`,
    volume: `${Math.round(amp * 100)} % · ${dynamicMark(amp)}`,
    timbre: TIMBRE_NAMES[values.timbre],
  }[active];

  const explain = {
    pitch: "振动越快，波形越密，听起来越高",
    duration: "振动持续越久，音就越长",
    volume: "振幅越大，声音越响 —— 力度记号 ppp 到 fff 标的就是这个",
    timbre: "波形形状不同，音高一样也能听出是什么乐器",
  }[active];

  return (
    <div className="kv-stage">
      <div className="kv-controls kv-controls-tabs">
        {PROPERTIES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`kv-chip${active === item.id ? " is-on" : ""}`}
            onClick={() => setActive(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <WaveScope
        uid="lab"
        ramp={RAMP_TONE}
        geometry={waveGeometry({ cycles, amp: displayAmp, phase, timbre, span })}
        bars={active === "volume" ? barGeometry(amp) : null}
        edgeX={active === "duration" && span < 1 ? WAVE_W * span : null}
        ariaLabel={`${property.label}波形`}
      />

      <div className="kv-slider-row">
        <span className="kv-slider-label">{property.unit}</span>
        <input
          type="range"
          min={property.min}
          max={property.max}
          step={property.step}
          value={values[active]}
          onChange={(event) => setValues((prev) => ({ ...prev, [active]: Number(event.target.value) }))}
          className="kv-slider"
          aria-label={property.unit}
          style={{
            background: `linear-gradient(90deg, #5d8f46 ${fillPercent}%, rgba(94,60,28,0.16) ${fillPercent}%)`,
          }}
        />
        <span className="kv-readout">{readout}</span>
        <button type="button" className="kv-play" onClick={play}>▶ 听</button>
      </div>
      <div className="kv-insight">{explain}</div>
    </div>
  );
}

function WaveCompare() {
  const [phaseA, runA] = useWaveAnimation();
  const [phaseB, runB] = useWaveAnimation();

  const playTonePanel = useCallback(async () => {
    await unlockAudioSystem();
    playTone(nFreq("A", 4), 1.1, "piano", 0.22);
    runA(1.1);
  }, [runA]);

  const playNoisePanel = useCallback(async () => {
    await unlockAudioSystem();
    playNoise(1.1, 0.16);
    runB(1.1);
  }, [runB]);

  const panels = [
    {
      id: "tone",
      title: "乐音",
      tint: "#3f6e2f",
      ramp: RAMP_TONE,
      note: "振动规则 · 有固定音高",
      geometry: waveGeometry({ cycles: 4, amp: 0.8, phase: phaseA, timbre: "piano" }),
      onPlay: playTonePanel,
      sample: "钢琴 · 小提琴 · 人声",
    },
    {
      id: "noise",
      title: "噪音",
      tint: "#b4472f",
      ramp: RAMP_NOISE,
      note: "振动不规则 · 没有固定音高",
      geometry: waveGeometry({ cycles: 4, amp: 0.8, phase: phaseB, noise: true }),
      onPlay: playNoisePanel,
      sample: "锣 · 镲 · 大鼓",
    },
  ];

  return (
    <div className="kv-compare">
      {panels.map((panel) => (
        <div key={panel.id} className="kv-compare-panel" style={{ "--kv-tint": panel.tint }}>
          <div className="kv-compare-head">
            <span className="kv-compare-title">{panel.title}</span>
            <button type="button" className="kv-play" onClick={panel.onPlay}>▶ 听</button>
          </div>
          <WaveScope uid={panel.id} ramp={panel.ramp} geometry={panel.geometry} ariaLabel={`${panel.title}波形`} />
          <div className="kv-compare-note">{panel.note}</div>
          <div className="kv-compare-sample">{panel.sample}</div>
        </div>
      ))}
    </div>
  );
}

/* ── route thumbnails ────────────────────────────────────────────────────── */

const THUMB_W = 88;
const THUMB_H = 40;

function thumbWavePath(cycles, amp, noise, width = THUMB_W, offsetX = 0) {
  const mid = THUMB_H / 2;
  const steps = 60;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const ratio = i / steps;
    const value = noise ? NOISE_SEED[i * 3] : Math.sin(ratio * cycles * Math.PI * 2);
    points.push(`${(offsetX + ratio * width).toFixed(1)},${(mid - value * amp * (mid - 5)).toFixed(1)}`);
  }
  return `M ${points.join(" L ")}`;
}

// Small stand-ins for each card, so the route is an index of pictures.
// `kind` is either a bare name or a spec object { k, ...params }.
function RouteThumb({ kind: raw }) {
  const spec = typeof raw === "string" ? { k: raw } : raw || { k: "staff" };
  const kind = spec.k;

  // a real rhythm preview: noteheads spaced by their own durations
  if (kind === "rhythm2") {
    const total = spec.p.reduce((a, b) => a + b, 0);
    let at = 0;
    const xs = spec.p.map((beats) => {
      const x = 10 + (at / total) * (THUMB_W - 22);
      at += beats;
      return { x, beats };
    });
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="6" y1={13 + i * 4.4} x2={THUMB_W - 6} y2={13 + i * 4.4} className="kv-thumb-staffline" />
        ))}
        {xs.map((n, i) =>
          (spec.r || []).includes(i) ? (
            <rect key={i} x={n.x - 3} y="19" width="6" height="3" className="kv-thumb-orn-fill" />
          ) : (
            <g key={i}>
              <ellipse cx={n.x} cy="22" rx="3.4" ry="2.4" transform={`rotate(-16 ${n.x} 22)`} className="kv-thumb-note" />
              <line x1={n.x - 3} y1="22" x2={n.x - 3} y2="33" className="kv-thumb-staffline" />
              {(spec.a || []).includes(i) && <text x={n.x} y="9" className="kv-thumb-orn-text" textAnchor="middle">&gt;</text>}
            </g>
          ),
        )}
      </svg>
    );
  }

  // articulation marks
  if (kind === "mark") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="6" y1={14 + i * 4.4} x2={THUMB_W - 6} y2={14 + i * 4.4} className="kv-thumb-staffline" />
        ))}
        {[0.28, 0.5, 0.72].map((r, i) => (
          <g key={r}>
            <ellipse cx={THUMB_W * r} cy="23" rx="3.4" ry="2.4" transform={`rotate(-16 ${THUMB_W * r} 23)`} className="kv-thumb-note" />
            {spec.sign === "staccato" && <circle cx={THUMB_W * r} cy="9" r="1.7" className="kv-thumb-orn-fill" />}
            {spec.sign === "tenuto" && <rect x={THUMB_W * r - 4} y="8" width="8" height="1.8" className="kv-thumb-orn-fill" />}
            {spec.sign === "accent" && i === 0 && <text x={THUMB_W * r} y="11" className="kv-thumb-orn-text" textAnchor="middle">&gt;</text>}
          </g>
        ))}
        {spec.sign === "slur" && (
          <path d={`M ${THUMB_W * 0.28} 10 Q ${THUMB_W * 0.5} 2 ${THUMB_W * 0.72} 10`} className="kv-thumb-orn" />
        )}
      </svg>
    );
  }

  // repeat / navigation signs
  if (kind === "sign") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={9 + i * 24} y="15" width="18" height="12" rx="3" className="kv-thumb-beat" />
        ))}
        <text x={THUMB_W / 2} y="9" className="kv-thumb-orn-text" textAnchor="middle">{spec.label}</text>
      </svg>
    );
  }

  // a dotted note
  if (kind === "dotted") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="6" y1={12 + i * 4.4} x2={THUMB_W - 6} y2={12 + i * 4.4} className="kv-thumb-staffline" />
        ))}
        <ellipse cx={THUMB_W / 2 - 6} cy="21" rx="4" ry="2.8" transform={`rotate(-16 ${THUMB_W / 2 - 6} 21)`} className="kv-thumb-note" />
        <line x1={THUMB_W / 2 - 9} y1="21" x2={THUMB_W / 2 - 9} y2="33" className="kv-thumb-staffline" />
        {[0, 1].slice(0, spec.dots || 1).map((i) => (
          <circle key={i} cx={THUMB_W / 2 + 4 + i * 7} cy="19" r="2.2" className="kv-thumb-orn-fill" />
        ))}
      </svg>
    );
  }

  // a rising or falling ramp (tempo change, dynamics)
  if (kind === "ramp") {
    const n = 8;
    const bw = (THUMB_W - 14) / n;
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => {
          const t = spec.down ? n - 1 - i : i;
          const h = 5 + t * 3.4;
          return <rect key={i} x={7 + i * bw} y={34 - h} width={bw - 2.4} height={h} rx="1.6" className="kv-thumb-beat" />;
        })}
      </svg>
    );
  }

  // grouped word chips
  if (kind === "chips") {
    const rows = spec.rows || 3;
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: spec.cols || 2 }, (_, cIdx) => (
            <rect
              key={`${r}-${cIdx}`}
              x={8 + cIdx * ((THUMB_W - 16) / (spec.cols || 2))}
              y={7 + r * ((THUMB_H - 12) / rows)}
              width={(THUMB_W - 16) / (spec.cols || 2) - 4}
              height={6}
              rx="3"
              className="kv-thumb-beat"
            />
          )),
        )}
      </svg>
    );
  }

  if (kind === "wave") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        <path d={thumbWavePath(2.5, 0.85)} className="kv-thumb-wave" />
      </svg>
    );
  }
  if (kind === "wave-compare") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        <path d={thumbWavePath(2, 0.8, false, 40)} className="kv-thumb-wave" />
        <path d={thumbWavePath(2, 0.8, true, 40, 48)} className="kv-thumb-wave is-noise" />
      </svg>
    );
  }

  if (kind === "octave") {
    const kw = THUMB_W / 21;
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {Array.from({ length: 21 }, (_, i) => (
          <rect key={i} x={i * kw + 0.4} y="10" width={kw - 0.8} height="22" rx="1" className={i === 7 ? "kv-thumb-white is-hot" : "kv-thumb-white"} />
        ))}
        {[0, 7, 14].map((x) => (
          <line key={x} x1={x * kw} y1="6" x2={x * kw} y2="36" className="kv-thumb-divider" />
        ))}
      </svg>
    );
  }

  if (kind === "ladder" || kind === "dynamics" || kind === "tempo") {
    const n = 9;
    const bw = (THUMB_W - 12) / n;
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => {
          const h = 5 + i * 3.2;
          return <rect key={i} x={6 + i * bw} y={34 - h} width={bw - 2.4} height={h} rx="1.6" className="kv-thumb-beat" />;
        })}
      </svg>
    );
  }

  if (kind === "tuning" || kind === "terms") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0.9, 0.66, 0.78].map((w, i) => (
          <rect key={i} x="8" y={8 + i * 10} width={(THUMB_W - 16) * w} height="6" rx="3" className="kv-thumb-beat" />
        ))}
      </svg>
    );
  }

  if (kind === "harmonic") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[1, 2, 4].map((mult, row) => (
          <path
            key={mult}
            d={Array.from({ length: 41 }, (_, i) => {
              const x = 6 + (i / 40) * (THUMB_W - 12);
              const y = 10 + row * 11 - Math.sin((i / 40) * mult * Math.PI * 2) * 4;
              return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
            }).join(" ")}
            className="kv-thumb-wave"
          />
        ))}
      </svg>
    );
  }

  if (kind === "hairpin") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        <line x1="8" y1="20" x2={THUMB_W - 8} y2="7" className="kv-thumb-staffline" />
        <line x1="8" y1="20" x2={THUMB_W - 8} y2="33" className="kv-thumb-staffline" />
        {[0, 1, 2, 3, 4].map((i) => {
          const h = 4 + i * 5;
          const x = 16 + i * 14;
          return <rect key={i} x={x} y={20 - h / 2} width="5" height={h} rx="2" className="kv-thumb-beat" />;
        })}
      </svg>
    );
  }

  if (kind.startsWith("orn-")) {
    const sign = kind.slice(4); // plain | tr | mordent | mordent-lower | turn | grace
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="6" y1={16 + i * 5} x2={THUMB_W - 6} y2={16 + i * 5} className="kv-thumb-staffline" />
        ))}
        {sign === "plain" ? (
          [0.3, 0.5, 0.7].map((r) => (
            <ellipse key={r} cx={THUMB_W * r} cy="26" rx="4" ry="2.8" transform={`rotate(-16 ${THUMB_W * r} 26)`} className="kv-thumb-note" />
          ))
        ) : (
          <>
            <ellipse cx={THUMB_W / 2} cy="26" rx="4" ry="2.8" transform={`rotate(-16 ${THUMB_W / 2} 26)`} className="kv-thumb-note" />
            <OrnamentSign kind={sign} x={THUMB_W / 2} y="8" scale={0.72} className="kv-thumb-orn" />
          </>
        )}
      </svg>
    );
  }

  if (kind === "note" || kind === "tree" || kind === "rest" || kind === "ornament" || kind === "articulation") {
    const glyph = kind === "rest" ? "𝄽" : kind === "ornament" ? "tr" : kind === "tree" ? "𝅗𝅥" : "𝅘𝅥";
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="6" y1={10 + i * 5} x2={THUMB_W - 6} y2={10 + i * 5} className="kv-thumb-staffline" />
        ))}
        <text
          x={THUMB_W / 2}
          y={kind === "ornament" ? 8 : 30}
          className="kv-thumb-clef"
          style={{ fontSize: kind === "ornament" ? 12 : 22, fontFamily: GLYPH_FONT }}
        >
          {glyph}
        </text>
        {kind === "articulation" && <circle cx={THUMB_W / 2} cy="6" r="2" className="kv-thumb-note" />}
      </svg>
    );
  }

  if (kind === "curve") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        <path d="M 8 10 C 22 30, 30 33, 44 34 C 58 35, 68 35, 80 35" className="kv-thumb-wave is-noise" />
        <path d="M 8 10 C 16 22, 20 12, 30 10 C 40 20, 46 14, 56 12 C 68 22, 74 18, 80 16" className="kv-thumb-wave" />
        {[30, 56].map((x) => (
          <circle key={x} cx={x} cy={x === 30 ? 10 : 12} r="2.6" className="kv-thumb-note" />
        ))}
      </svg>
    );
  }

  if (kind === "path") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={10 + i * 24} y="16" width="18" height="14" rx="3" className="kv-thumb-beat" />
        ))}
        <path d={`M 74 16 Q 44 2 16 16`} className="kv-thumb-conduct" />
      </svg>
    );
  }

  if (kind === "rhythm" || kind === "syncopation") {
    const heights = kind === "syncopation" ? [10, 26, 10, 18] : [26, 12, 20, 12];
    const hot = kind === "syncopation" ? 1 : 0;
    const bw = THUMB_W / 4.6;
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        <line x1="4" y1={THUMB_H - 7} x2={THUMB_W - 4} y2={THUMB_H - 7} className="kv-thumb-staffline" />
        {heights.map((h, i) => (
          <rect
            key={i}
            x={7 + i * (bw + 4)}
            y={THUMB_H - 8 - h}
            width={bw}
            height={h}
            rx="2"
            className={i === hot ? "kv-thumb-beat is-hot" : "kv-thumb-beat"}
          />
        ))}
      </svg>
    );
  }

  if (kind === "meter") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        <text x={THUMB_W / 2} y="19" className="kv-thumb-meter">3</text>
        <text x={THUMB_W / 2} y="36" className="kv-thumb-meter is-low">4</text>
      </svg>
    );
  }

  if (kind === "conduct") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        <path d="M 44 8 L 44 32 L 24 20 L 64 20 L 44 8" className="kv-thumb-conduct" />
        <circle cx="44" cy="32" r="3.2" className="kv-thumb-note" />
      </svg>
    );
  }

  if (kind === "barline") {
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="8" y1={11 + i * 4.5} x2={THUMB_W - 8} y2={11 + i * 4.5} className="kv-thumb-staffline" />
        ))}
        <rect x={THUMB_W - 20} y="11" width="4" height="18" className="kv-thumb-note" />
        <line x1={THUMB_W - 24} y1="11" x2={THUMB_W - 24} y2="29" className="kv-thumb-staffline" />
      </svg>
    );
  }

  if (kind.startsWith("staff") || kind.startsWith("grand")) {
    const glyph = kind === "staff-bass" ? "𝄢" : kind === "staff-alto" ? "𝄡" : "𝄞";
    const grand = kind.startsWith("grand");
    const rows = grand ? [6, 24] : [10];
    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
        {rows.map((top) =>
          [0, 1, 2, 3, 4].map((i) => (
            <line key={`${top}-${i}`} x1="6" y1={top + i * 2.6} x2={THUMB_W - 6} y2={top + i * 2.6} className="kv-thumb-staffline" />
          )),
        )}
        {rows.map((top, ri) => (
          <text
            key={top}
            x="12"
            y={top + (grand ? 9 : 15)}
            className="kv-thumb-clef"
            style={{ fontSize: grand ? 13 : 21, fontFamily: GLYPH_FONT }}
          >
            {grand ? (ri === 0 ? "𝄞" : "𝄢") : glyph}
          </text>
        ))}
        {(kind === "staff" || kind === "grand-c") && (
          <ellipse cx={THUMB_W * 0.62} cy={rows[0] + (grand ? 5 : 7.8)} rx="4" ry="3" className="kv-thumb-note" />
        )}
      </svg>
    );
  }

  // mini keyboard variants
  const kw = THUMB_W / 8;
  // match the key each card actually lights: accidental anchors on D♯, enharmonic on C♯
  const litBlack = kind === "accidental" ? 3 : kind === "enharmonic" ? 1 : null;
  const marks = kind === "semitone" ? [2, 6] : [];
  return (
    <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="kv-thumb" aria-hidden="true">
      {WHITE_STEPS.map((step, i) => (
        <rect key={step} x={i * kw + 0.6} y="8" width={kw - 1.2} height="28" rx="2" className="kv-thumb-white" />
      ))}
      {BLACK_STEPS.map((step) => {
        const x = WHITE_STEPS.filter((s) => s < step).length * kw - kw * 0.28;
        return (
          <rect
            key={step}
            x={x}
            y="8"
            width={kw * 0.56}
            height="17"
            rx="1.5"
            className={litBlack === step ? "kv-thumb-black is-lit" : "kv-thumb-black"}
          />
        );
      })}
      {marks.map((i) => (
        <rect key={i} x={i * kw + kw * 0.75} y="2" width={kw * 0.5} height="4" rx="2" className="kv-thumb-mark" />
      ))}
    </svg>
  );
}

/* ── staff-based blocks (L3) ─────────────────────────────────────────────── */

function ClefBoard({ clef, notes, anchor, note }) {
  return (
    <div className="kv-stage">
      <StaffBoard clef={clef} notes={notes} onNoteClick={(item) => playNote(item.name)} />
      {anchor && <div className="kv-insight">{anchor}</div>}
      {note && <div className="kv-controls-note kv-standalone">{note}</div>}
    </div>
  );
}

const STAFF_PARTS_NOTES = [
  { name: "E4", label: "第一线" },
  { name: "F4", label: "第一间" },
  { name: "G4", label: "第二线" },
  { name: "B4", label: "第三线" },
  { name: "F5", label: "第五线" },
  { name: "C4", label: "下加一线" },
  { name: "A5", label: "上加一间" },
];

function GrandStaffBoard({ mode }) {
  const middleC = mode === "middle-c";
  return (
    <div className="kv-stage">
      <div className="kv-grand">
        <svg className="kv-grand-brace" viewBox="0 0 18 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M 14 2 C 4 16, 16 34, 7 50 C 16 66, 4 84, 14 98" className="kv-staff-brace" />
        </svg>
        <StaffBoard
          clef="treble"
          padTop={34}
          padBottom={18}
          notes={middleC ? [{ name: "C4", label: "下加一线" }] : [{ name: "C5" }, { name: "E5" }, { name: "G5" }]}
          onNoteClick={(item) => playNote(item.name)}
        />
        <StaffBoard
          clef="bass"
          padTop={20}
          padBottom={34}
          notes={middleC ? [{ name: "C4", label: "上加一线" }] : [{ name: "C3" }, { name: "E3" }, { name: "G3" }]}
          onNoteClick={(item) => playNote(item.name)}
        />
      </div>
      <div className="kv-insight">
        {middleC
          ? "同一个中央 C：在高音谱表挂在下加一线，在低音谱表挂在上加一线 —— 两处都点一下，声音一样"
          : "钢琴用上下两行谱表：右手看上面的高音谱表，左手看下面的低音谱表"}
      </div>
    </div>
  );
}


/* ── rhythm helpers (L9–L11) ─────────────────────────────────────────────── */

const METER_STAFF = {
  "2/4": {
    total: 2,
    events: [{ beats: 1, accent: true }, { beats: 1 }],
    note: "强 — 弱",
  },
  "3/4": {
    total: 3,
    events: [{ beats: 1, accent: true }, { beats: 1 }, { beats: 1 }],
    note: "强 — 弱 — 弱",
  },
  "4/4": {
    total: 4,
    events: [{ beats: 1, accent: true }, { beats: 1 }, { beats: 1, label: "次强" }, { beats: 1 }],
    note: "强 — 弱 — 次强 — 弱",
  },
  "6/8": {
    total: 6,
    events: [
      { beats: 1, accent: true }, { beats: 1 }, { beats: 1 },
      { beats: 1, label: "次强" }, { beats: 1 }, { beats: 1 },
    ],
    beams: [{ from: 0, to: 2, count: 1 }, { from: 3, to: 5, count: 1 }],
    note: "两大拍，每大拍三个八分音符",
  },
};

function MeterSwitcher() {
  const [meter, setMeter] = useState("4/4");
  const preset = METER_STAFF[meter];
  return (
    <div className="kv-stage">
      <div className="kv-controls kv-controls-tabs">
        {Object.keys(METER_STAFF).map((key) => (
          <button key={key} type="button" className={`kv-chip${meter === key ? " is-on" : ""}`} onClick={() => setMeter(key)}>
            {key}
          </button>
        ))}
      </div>
      <RhythmStaff
        key={meter}
        meter={meter}
        totalBeats={preset.total}
        events={preset.events}
        beams={preset.beams || []}
        note={preset.note}
      />
    </div>
  );
}

function BeatVsRhythm() {
  return (
    <div className="kv-stage">
      <RhythmStaff
        meter="4/4"
        note="拍：四个一样长的脉搏"
        events={[{ beats: 1, accent: true }, { beats: 1 }, { beats: 1 }, { beats: 1 }]}
      />
      <RhythmStaff
        meter="4/4"
        note="节奏：长短不一，但踩在同一条脉搏上"
        events={[{ beats: 2, accent: true }, { beats: 0.5 }, { beats: 0.5 }, { beats: 1 }]}
        beams={[{ from: 1, to: 2, count: 1 }]}
      />
    </div>
  );
}

function SimpleVsCompound() {
  return (
    <div className="kv-stage">
      <RhythmStaff
        meter="2/4"
        totalBeats={2}
        note="单拍子：每一拍分成两半"
        events={[{ beats: 0.5, accent: true }, { beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 }]}
        beams={[{ from: 0, to: 1, count: 1 }, { from: 2, to: 3, count: 1 }]}
      />
      <RhythmStaff
        meter="6/8"
        totalBeats={6}
        note="复拍子：每一大拍分成三份"
        events={[
          { beats: 1, accent: true }, { beats: 1 }, { beats: 1 },
          { beats: 1, label: "次强" }, { beats: 1 }, { beats: 1 },
        ]}
        beams={[{ from: 0, to: 2, count: 1 }, { from: 3, to: 5, count: 1 }]}
      />
      <div className="kv-insight">分成两份的是单拍子，分成三份的是复拍子 —— 听感完全不同</div>
    </div>
  );
}

/* ── ornament helper (L5) ────────────────────────────────────────────────── */

function Ornament({ sign, base, played, note }) {
  return (
    <NotatedVsPlayed
      written={<StaffBoard clef="treble" notes={base} padTop={46} padBottom={22} />}
      played={<StaffBoard clef="treble" notes={played.map((name) => ({ name }))} padTop={30} padBottom={22} />}
      playedNotes={played}
      note={note}
      writtenLabel={`谱面：${sign}`}
      playedLabel="实际弹出来的音"
    />
  );
}

/* ── dynamics + tempo data (L6, L8) ──────────────────────────────────────── */

const DYNAMIC_STOPS = [
  { id: "ppp", label: "ppp", detail: "极弱", vol: 0.04, emoji: "🤫" },
  { id: "pp", label: "pp", detail: "很弱", vol: 0.07, emoji: "🔈" },
  { id: "p", label: "p", detail: "弱", vol: 0.11, emoji: "🔈" },
  { id: "mp", label: "mp", detail: "中弱", vol: 0.16, emoji: "🔉" },
  { id: "mf", label: "mf", detail: "中强", vol: 0.22, emoji: "🔉" },
  { id: "f", label: "f", detail: "强", vol: 0.3, emoji: "🔊" },
  { id: "ff", label: "ff", detail: "很强", vol: 0.38, emoji: "🔊" },
  { id: "fff", label: "fff", detail: "极强", vol: 0.46, emoji: "📢" },
];

function DynamicsAxis() {
  return (
    <ScaleAxis
      items={DYNAMIC_STOPS}
      initial={4}
      unit=""
      note="点任意一档，同一个音会用那一档的力度奏出"
      onPick={(item) => playTone(nFreq("G", 4), 0.9, "piano", item.vol)}
    />
  );
}

/* ── lesson data table ───────────────────────────────────────────────────── */

const LESSON_VISUALS = {
  L1: [
    {
      id: "kp1",
      title: "音的四种性质",
      thumb: "wave",
      // WaveLab prints its own per-property line, so no card caption here
      render: () => <WaveLab />,
    },
    {
      id: "kp2",
      title: "乐音与噪音",
      thumb: "wave-compare",
      caption: "波形规则的能唱出音高，杂乱的只剩节奏和色彩",
      render: () => <WaveCompare />,
    },
    {
      id: "kp3",
      title: "音阶与音级",
      thumb: "scale",
      caption: "七个白键就是七个基本音级，第八个键回到 do",
      render: () => <PianoBoard preset="scale" />,
    },
    {
      id: "kp4",
      title: "变化音级",
      thumb: "accidental",
      caption: "升号往右挪半格，降号往左挪半格，还原号回本位",
      render: () => <PianoBoard preset="accidental" />,
    },
    {
      id: "kp5",
      title: "全音与半音",
      thumb: "semitone",
      caption: "两个白键之间没有黑键的地方 —— E-F 和 B-C —— 就是天然半音",
      render: () => <PianoBoard preset="semitone" />,
    },
    {
      id: "kp6",
      title: "等音",
      thumb: "enharmonic",
      caption: "C♯ 和 D♭ 是同一个键：名字不同，声音完全一样",
      render: () => <PianoBoard preset="enharmonic" />,
    },
  ],
  L3: [
    {
      id: "kp1",
      title: "五线谱基础",
      thumb: "staff",
      caption: "五条线、四个间，从下往上数；不够用就加线加间",
      render: () => (
        <ClefBoard
          clef="treble"
          notes={STAFF_PARTS_NOTES}
          note="点谱上任意一个音符都会响"
        />
      ),
    },
    {
      id: "kp2",
      title: "高音谱号",
      thumb: "staff-treble",
      caption: "谱号的螺旋圈住第二线，那条线就是 G4",
      render: () => (
        <ClefBoard
          clef="treble"
          notes={[{ name: "G4", label: "G4", tone: "target" }, { name: "C4", label: "中央C" }, { name: "B4", label: "B4" }, { name: "F5", label: "F5" }]}
          anchor="先记住第二线 = G4，其余的音从这条线上下数"
        />
      ),
    },
    {
      id: "kp3",
      title: "低音谱号",
      thumb: "staff-bass",
      caption: "谱号的两个点夹住第四线，那条线就是 F3",
      render: () => (
        <ClefBoard
          clef="bass"
          notes={[{ name: "F3", label: "F3", tone: "target" }, { name: "C4", label: "中央C" }, { name: "G2", label: "G2" }, { name: "A3", label: "A3" }]}
          anchor="先记住第四线 = F3，两个点就是在指它"
        />
      ),
    },
    {
      id: "kp4",
      title: "C 谱号",
      thumb: "staff-alto",
      caption: "谱号的中心对准哪条线，哪条线就是中央 C —— 中提琴用中音谱号",
      render: () => (
        <ClefBoard
          clef="alto"
          notes={[{ name: "C4", label: "中央C", tone: "target" }, { name: "F3", label: "F3" }, { name: "A4", label: "A4" }]}
          anchor="中音谱号把中央 C 放在正中间那条线上"
        />
      ),
    },
    {
      id: "kp5",
      title: "大谱表",
      thumb: "grand",
      caption: "钢琴等键盘乐器用上下两行谱表，中间用花括号连起来",
      render: () => <GrandStaffBoard mode="grand" />,
    },
    {
      id: "kp6",
      title: "中央 C 的两种记法",
      thumb: "grand-c",
      caption: "同一个音高，在两行谱表上各有各的位置 —— 位置不同，音一样",
      render: () => <GrandStaffBoard mode="middle-c" />,
    },
  ],
  L9: [
    {
      id: "kp1",
      title: "四个核心概念",
      thumb: { k: "rhythm2", p: [1, 1, 1, 1], a: [0] },
      caption: "拍是均匀的脉搏，节奏是踩在脉搏上的长短花样",
      render: () => <BeatVsRhythm />,
    },
    {
      id: "kp2",
      title: "拍号的含义",
      thumb: "meter",
      caption: "上面的数字管「几拍」，下面的数字管「谁算一拍」",
      render: () => <MeterAnatomy top="3" bottom="4" topNote="强、弱、弱" bottomNote="四分音符" />,
    },
    {
      id: "kp3",
      title: "常见拍号",
      thumb: { k: "rhythm2", p: [1, 1, 1], a: [0] },
      caption: "切换拍号，红色是强拍，绿色是次强拍",
      render: () => <MeterSwitcher />,
    },
    {
      id: "kp4",
      title: "单拍子与复拍子",
      thumb: { k: "rhythm2", p: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], a: [0, 3] },
      caption: "每拍二等分是单拍子，每拍三等分是复拍子",
      render: () => <SimpleVsCompound />,
    },
    {
      id: "kp5",
      title: "小节线",
      thumb: "barline",
      caption: "四种竖线，四种意思",
      render: () => <BarlineRow />,
    },
    {
      id: "kp6",
      title: "指挥图示",
      thumb: "conduct",
      caption: "手在空中画的路线，就是拍子的形状",
      render: () => <ConductPattern meter="4/4" />,
    },
  ],
  L10: [
    {
      id: "kp1",
      title: "音值组合的核心原则",
      thumb: { k: "rhythm2", p: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], a: [0] },
      caption: "一眼要能看出拍在哪里 —— 这就是记谱分组的全部目的",
      render: () => (
        <CompareRows
          rows={[
            {
              id: "clear",
              verdict: "good",
              label: "拍内清晰、拍间分明",
              body: (
                <RhythmStaff
                  meter="4/4"
                  beatMarks
                  events={[
                    { beats: 0.5, accent: true }, { beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 },
                    { beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 },
                  ]}
                  beams={[
                    { from: 0, to: 1, count: 1 }, { from: 2, to: 3, count: 1 },
                    { from: 4, to: 5, count: 1 }, { from: 6, to: 7, count: 1 },
                  ]}
                  note="每一拍自成一组，拍线在哪一眼就看到"
                />
              ),
            },
            {
              id: "muddy",
              verdict: "bad",
              label: "跨过拍子连成一片，看不出拍",
              body: (
                <RhythmStaff
                  meter="4/4"
                  events={[
                    { beats: 0.5, accent: true }, { beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 },
                    { beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 },
                  ]}
                  beams={[{ from: 0, to: 3, count: 1 }, { from: 4, to: 7, count: 1 }]}
                  note="符杠横跨两拍，读谱时要多想一步"
                />
              ),
            },
          ]}
        />
      ),
    },
    {
      id: "kp2",
      title: "单拍子组合",
      thumb: { k: "rhythm2", p: [1, 1, 1, 1], a: [0, 2] },
      caption: "2/4、3/4、4/4 一律按「拍」分组",
      render: () => <MeterSwitcher />,
    },
    {
      id: "kp3",
      title: "4/4 拍特殊规则",
      thumb: { k: "rhythm2", p: [1, 2, 1], a: [0] },
      caption: "4/4 的第二、三拍之间有一条看不见的中线，音符不要跨过去",
      render: () => (
        <CompareRows
          rows={[
            {
              id: "ok",
              verdict: "good",
              label: "在半小节中线处断开",
              body: (
                <RhythmStaff
                  meter="4/4"
                  events={[{ beats: 1, accent: true }, { beats: 1 }, { beats: 1, label: "中线" }, { beats: 1 }]}
                  note="第 2 拍和第 3 拍之间断开"
                />
              ),
            },
            {
              id: "no",
              verdict: "bad",
              label: "跨越中线，读谱要多想一步",
              body: (
                <RhythmStaff
                  meter="4/4"
                  events={[{ beats: 1, accent: true }, { beats: 2, label: "跨中线" }, { beats: 1 }]}
                  note="一个二分音符正好压在半小节中线上"
                />
              ),
            },
          ]}
          note="中线在第 2 拍和第 3 拍之间"
        />
      ),
    },
    {
      id: "kp4",
      title: "复拍子组合",
      thumb: { k: "rhythm2", p: [1, 1, 1, 1, 1, 1], a: [0, 3] },
      caption: "6/8、9/8、12/8 按「大拍」分组，每组三个八分音符",
      render: () => (
        <div className="kv-stage">
          <RhythmStaff
            meter="6/8"
            totalBeats={6}
            note="6/8：两大拍"
            events={Array.from({ length: 6 }, (_, i) => ({ beats: 1, accent: i % 3 === 0 }))}
            beams={[{ from: 0, to: 2, count: 1 }, { from: 3, to: 5, count: 1 }]}
          />
          <RhythmStaff
            meter="9/8"
            totalBeats={9}
            note="9/8：三大拍"
            events={Array.from({ length: 9 }, (_, i) => ({ beats: 1, accent: i % 3 === 0 }))}
            beams={[{ from: 0, to: 2, count: 1 }, { from: 3, to: 5, count: 1 }, { from: 6, to: 8, count: 1 }]}
          />
          <RhythmStaff
            meter="12/8"
            totalBeats={12}
            note="12/8：四大拍"
            events={Array.from({ length: 12 }, (_, i) => ({ beats: 1, accent: i % 3 === 0 }))}
            beams={[
              { from: 0, to: 2, count: 1 }, { from: 3, to: 5, count: 1 },
              { from: 6, to: 8, count: 1 }, { from: 9, to: 11, count: 1 },
            ]}
          />
        </div>
      ),
    },
    {
      id: "kp5",
      title: "连音线跨小节",
      thumb: "staff",
      caption: "音要越过小节线时用连音线接起来，不写成一个超长音符",
      render: () => (
        <StaffBoard
          clef="treble"
          notes={[{ name: "G4", value: "half" }, { name: "G4", value: "half", label: "同一个音继续响" }]}
          extras={({ line1Y, positioned }) =>
            positioned.length === 2 ? (
              <>
                <line
                  x1={(positioned[0].x + positioned[1].x) / 2}
                  y1={line1Y - 48}
                  x2={(positioned[0].x + positioned[1].x) / 2}
                  y2={line1Y}
                  className="kv-bl"
                />
                <path
                  d={`M ${positioned[0].x + 4} ${positioned[0].y + 14} Q ${(positioned[0].x + positioned[1].x) / 2} ${positioned[0].y + 28} ${positioned[1].x - 4} ${positioned[1].y + 14}`}
                  className="kv-tie"
                />
              </>
            ) : null
          }
          onNoteClick={(item) => playNote(item.name)}
        />
      ),
    },
    {
      id: "kp6",
      title: "符尾与符杠",
      thumb: { k: "rhythm2", p: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], a: [0, 2, 4, 6] },
      caption: "同一拍里的短音符用符杠连起来，拍与拍之间断开",
      render: () => (
        <CompareRows
          rows={[
            {
              id: "beam",
              verdict: "good",
              label: "按拍连杠：两两成组，拍一目了然",
              body: (
                <RhythmStaff
                  meter="4/4"
                  events={Array.from({ length: 8 }, (_, i) => ({ beats: 0.5, accent: i === 0 }))}
                  beams={[
                    { from: 0, to: 1, count: 1 }, { from: 2, to: 3, count: 1 },
                    { from: 4, to: 5, count: 1 }, { from: 6, to: 7, count: 1 },
                  ]}
                  note="两两连杠，四拍清清楚楚"
                />
              ),
            },
            {
              id: "flag",
              verdict: "bad",
              label: "全部散开不连杠，节奏结构看不出来",
              body: (
                <RhythmStaff
                  meter="4/4"
                  events={Array.from({ length: 8 }, (_, i) => ({ beats: 0.5, accent: i === 0 }))}
                  note="一根符杠都不连，八个音符平铺，看不出拍在哪"
                />
              ),
            },
          ]}
        />
      ),
    },
  ],
  L11: [
    {
      id: "kp1",
      title: "切分的定义",
      thumb: { k: "rhythm2", p: [1, 1, 1, 1], a: [1] },
      caption: "重音本来在强拍上，切分把它挪到了弱拍或弱位",
      render: () => (
        <div className="kv-stage">
          <RhythmStaff
            meter="4/4"
            note="正常：重音落在第 1 拍"
            events={[
              { beats: 1, accent: true },
              { beats: 1 },
              { beats: 1 },
              { beats: 1 },
            ]}
          />
          <RhythmStaff
            meter="4/4"
            note="切分：重音跑到了第 2 拍"
            events={[
              { beats: 1 },
              { beats: 1, accent: true },
              { beats: 1 },
              { beats: 1 },
            ]}
          />
          <div className="kv-insight">两条都点一下「听」，音符会跟着响到的顺序一个个亮起来</div>
        </div>
      ),
    },
    {
      id: "kp2",
      title: "弱拍延长",
      thumb: { k: "rhythm2", p: [1, 1, 2], a: [1] },
      caption: "用连音线把弱拍的音拖过强拍，强拍就被占住了",
      render: () => (
        <RhythmStaff
          meter="4/4"
          note="第 2 拍的音用连音线拖过第 3 拍"
          events={[
            { beats: 1 },
            { beats: 1, label: "起" },
            { beats: 2, tie: true },
          ]}
        />
      ),
    },
    {
      id: "kp3",
      title: "弱位重音",
      thumb: { k: "rhythm2", p: [1, 1, 1, 1], a: [1, 3] },
      caption: "不改时值，只在弱的位置加一个重音记号 >",
      render: () => (
        <RhythmStaff
          meter="4/4"
          note="时值一点没变，变的只是哪一拍被强调"
          events={[
            { beats: 1 },
            { beats: 1, accent: true },
            { beats: 1 },
            { beats: 1, accent: true },
          ]}
        />
      ),
    },
    {
      id: "kp4",
      title: "休止强拍",
      thumb: { k: "rhythm2", p: [1, 1, 1, 1], a: [1], r: [0] },
      caption: "强拍上什么都不弹，重量自然落到后面",
      render: () => (
        <RhythmStaff
          meter="4/4"
          note="第 1 拍是休止符，第 2 拍反而被听成重的"
          events={[
            { beats: 1, rest: true },
            { beats: 1, accent: true },
            { beats: 1 },
            { beats: 1 },
          ]}
        />
      ),
    },
    {
      id: "kp5",
      title: "短长短切分型",
      thumb: { k: "rhythm2", p: [0.5, 1, 1, 1, 0.5], a: [1] },
      caption: "八分 — 四分 — 四分 — 四分 — 八分：中间的长音骑在拍与拍之间",
      render: () => (
        <RhythmStaff
          meter="4/4"
          note="听中间那个长音是怎么骑过拍线的"
          events={[
            { beats: 0.5 },
            { beats: 1, accent: true },
            { beats: 1 },
            { beats: 1 },
            { beats: 0.5 },
          ]}
        />
      ),
    },
    {
      id: "kp6",
      title: "切分的风格应用",
      thumb: { k: "rhythm2", p: [0.5, 1, 0.5, 1, 1], a: [1, 4] },
      caption: "同一个切分骨架，在不同风格里是完全不同的表情",
      render: () => (
        <div className="kv-stage">
          <RhythmStaff
            meter="4/4"
            tempo={132}
            note="🎷 爵士 —— 轻快、向前推"
            events={[{ beats: 0.5 }, { beats: 1, accent: true }, { beats: 0.5 }, { beats: 1 }, { beats: 1, accent: true }]}
          />
          <RhythmStaff
            meter="4/4"
            tempo={112}
            note="💃 拉丁 —— 重音成对出现"
            events={[{ beats: 1, accent: true }, { beats: 0.5 }, { beats: 0.5, accent: true }, { beats: 1 }, { beats: 1, accent: true }]}
          />
          <RhythmStaff
            meter="4/4"
            tempo={96}
            note="🎸 流行 —— 后半拍撑住律动"
            events={[{ beats: 1 }, { beats: 1, accent: true }, { beats: 1 }, { beats: 1, accent: true }]}
          />
        </div>
      ),
    },
  ],
  L2: [
    {
      id: "kp1",
      title: "音组划分",
      thumb: "octave",
      caption: "整个键盘按八度切成一组一组，从大字组一路数到小字三组",
      render: () => <OctaveMap focusOctave={4} />,
    },
    {
      id: "kp2",
      title: "中央 C 的定位",
      thumb: { k: "chips", rows: 1, cols: 6 },
      caption: "小字一组的 c1，频率约 261.63 Hz —— 所有定位都从它开始数",
      render: () => (
        <div className="kv-stage">
          <OctaveMap focusOctave={4} />
          <div className="kv-insight">中央 C = c1 = C4 ≈ 261.63 Hz，钢琴正中间那个 C</div>
        </div>
      ),
    },
    {
      id: "kp3",
      title: "十二平均律",
      thumb: "ladder",
      caption: "把一个八度平均分成十二份，每份的频率比都是同一个数",
      render: () => <FrequencyLadder />,
    },
    {
      id: "kp4",
      title: "纯律与五度相生律",
      thumb: "tuning",
      caption: "同一个「大三度」，三种律制算出来的高度并不一样",
      render: () => <TuningCompare />,
    },
    {
      id: "kp5",
      title: "等音",
      thumb: "enharmonic",
      caption: "C♯ 和 D♭ 是同一个键：名字不同，声音完全一样",
      render: () => <PianoBoard preset="enharmonic" />,
    },
    {
      id: "kp6",
      title: "泛音列",
      thumb: "harmonic",
      caption: "一个音其实是一摞音：基音 + 2倍 + 3倍…… 比例不同，音色就不同",
      render: () => <HarmonicStack />,
    },
  ],
  L4: [
    {
      id: "kp1",
      title: "音符的构成",
      thumb: "note",
      caption: "符头管音高，符干管方向，符尾管时值",
      render: () => <NoteAnatomy />,
    },
    {
      id: "kp2",
      title: "时值体系",
      thumb: "tree",
      caption: "每往下一层，时值对半砍 —— 点每一行听长短",
      render: () => <DurationTree />,
    },
    {
      id: "kp3",
      title: "符干方向",
      thumb: "staff",
      caption: "第三线以上的音符干朝下，以下的朝上 —— 让符干不会伸出谱表",
      render: () => (
        <StaffBoard
          clef="treble"
          notes={[
            { name: "E4", label: "朝上" },
            { name: "G4", label: "朝上" },
            { name: "B4", label: "第三线" },
            { name: "D5", label: "朝下" },
            { name: "F5", label: "朝下" },
          ]}
          onNoteClick={(item) => playNote(item.name)}
        />
      ),
    },
    {
      id: "kp4",
      title: "附点与复附点",
      thumb: { k: "dotted", dots: 2 },
      caption: "一个附点加一半，两个附点再加四分之一",
      render: () => <DotCompare />,
    },
    {
      id: "kp5",
      title: "休止符",
      thumb: "rest",
      caption: "点任意一个休止符，会听到「响 — 停 — 响」，停多久就是它的时值",
      render: () => <RestRow />,
    },
    {
      id: "kp6",
      title: "三连音与连音",
      thumb: { k: "rhythm2", p: [0.33, 0.33, 0.34, 0.33, 0.33, 0.34], a: [0, 3] },
      caption: "三连音是把一拍平均分成三份，而不是两份",
      render: () => (
        <div className="kv-stage">
          <RhythmStaff
            meter="2/4"
            totalBeats={2}
            note="普通八分音符：一拍分两半"
            events={[{ beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 }, { beats: 0.5 }]}
            beams={[{ from: 0, to: 1, count: 1 }, { from: 2, to: 3, count: 1 }]}
          />
          <RhythmStaff
            meter="2/4"
            totalBeats={2}
            note="三连音：同样一拍，硬塞进三个音"
            events={[
              { beats: 0.3333 }, { beats: 0.3333 }, { beats: 0.3334 },
              { beats: 0.3333 }, { beats: 0.3333 }, { beats: 0.3334 },
            ]}
            beams={[{ from: 0, to: 2, count: 1 }, { from: 3, to: 5, count: 1 }]}
            tuplets={[{ from: 0, to: 2 }, { from: 3, to: 5 }]}
          />
        </div>
      ),
    },
  ],
  L5: [
    {
      id: "kp1",
      title: "装饰音的定义",
      thumb: "orn-plain",
      caption: "装饰音是加在主音周围的小音符，骨架不变，只是把线条修饰得更活",
      render: () => (
        <Ornament
          sign="骨架旋律"
          base={[{ name: "C5" }, { name: "D5" }, { name: "E5" }]}
          played={["C5", "D5", "E5"]}
          note="先记住骨架，再听下面几种装饰怎么加上去"
        />
      ),
    },
    {
      id: "kp2",
      title: "颤音",
      thumb: "orn-tr",
      caption: "tr：主音和上方二度飞快地来回交替",
      render: () => (
        <Ornament
          sign="tr"
          base={[{ name: "C5", ornament: "tr" }]}
          played={["C5", "D5", "C5", "D5", "C5", "D5", "C5"]}
          note="写一个音，实际弹出一长串"
        />
      ),
    },
    {
      id: "kp3",
      title: "上波音",
      thumb: "orn-mordent",
      caption: "主音 → 上方二度 → 回主音，三个音一闪而过",
      render: () => (
        <Ornament sign="上波音记号" base={[{ name: "C5", ornament: "mordent" }]} played={["C5", "D5", "C5"]} note="向上绕一圈再回来" />
      ),
    },
    {
      id: "kp4",
      title: "下波音",
      thumb: "orn-mordent-lower",
      caption: "主音 → 下方二度 → 回主音，方向和上波音相反",
      render: () => (
        <Ornament sign="下波音记号" base={[{ name: "C5", ornament: "mordent-lower" }]} played={["C5", "B4", "C5"]} note="向下绕一圈再回来" />
      ),
    },
    {
      id: "kp5",
      title: "回音",
      thumb: "orn-turn",
      caption: "上方音 → 主音 → 下方音 → 主音，四个音绕一圈",
      render: () => (
        <Ornament sign="回音记号" base={[{ name: "C5", ornament: "turn" }]} played={["D5", "C5", "B4", "C5"]} note="上下各绕一次，回到原点" />
      ),
    },
    {
      id: "kp6",
      title: "前倚音与后倚音",
      thumb: "orn-grace",
      caption: "前倚音抢在主音之前，后倚音跟在主音之后",
      render: () => (
        <div className="kv-stage">
          <Ornament sign="前倚音" base={[{ name: "C5", ornament: "grace" }]} played={["B4", "C5"]} note="小音符先响，主音随后落下" />
          <Ornament sign="后倚音" base={[{ name: "C5", ornament: "grace" }]} played={["C5", "D5"]} note="主音先响，小音符收尾" />
        </div>
      ),
    },
  ],
  L6: [
    {
      id: "kp1",
      title: "力度记号",
      thumb: "dynamics",
      caption: "从 ppp 到 fff 一共八档，管的是同一个音「多响」",
      render: () => <DynamicsAxis />,
    },
    {
      id: "kp2",
      title: "渐强渐弱",
      thumb: "hairpin",
      caption: "开口张开是渐强，收拢是渐弱 —— 记号的形状就是音量的形状",
      render: () => (
        <div className="kv-stage">
          <Hairpin direction="cresc" />
          <Hairpin direction="dim" />
        </div>
      ),
    },
    {
      id: "kp3",
      title: "连奏 Legato",
      thumb: { k: "mark", sign: "slur" },
      caption: "一条弧线罩住几个音，它们之间不留缝隙",
      render: () => <ArticulationDemo kind="legato" />,
    },
    {
      id: "kp4",
      title: "断奏 Staccato",
      thumb: { k: "mark", sign: "staccato" },
      caption: "音符头上一个小点，时值缩短，音与音断开",
      render: () => <ArticulationDemo kind="staccato" />,
    },
    {
      id: "kp5",
      title: "保持音 Tenuto",
      thumb: { k: "mark", sign: "tenuto" },
      caption: "一条短横线：把时值奏满，并且稍稍加重",
      render: () => <ArticulationDemo kind="tenuto" />,
    },
    {
      id: "kp6",
      title: "重音 Accent",
      thumb: { k: "mark", sign: "accent" },
      caption: "一个 > 号：这个音明显重出来，其余不变",
      render: () => <ArticulationDemo kind="accent" />,
    },
  ],
  L7: [
    {
      id: "kp1",
      title: "反复记号",
      thumb: { k: "sign", label: "‖: :‖" },
      caption: "两个点朝哪边，就从哪边返回",
      render: () => (
        <PlayPath
          bars={[
            { name: "A", open: true, pitch: 0 },
            { name: "B", pitch: 2 },
            { name: "C", close: true, pitch: 4 },
            { name: "D", pitch: 5 },
          ]}
          order={[0, 1, 2, 0, 1, 2, 3]}
          note="A–B–C 走两遍，再继续 D"
        />
      ),
    },
    {
      id: "kp2",
      title: "D.C. 与 D.S.",
      thumb: { k: "sign", label: "D.C." },
      caption: "D.C. 从头再来，D.S. 从记号 𝄋 那里再来",
      render: () => (
        <div className="kv-stage">
          <PlayPath
            bars={[{ name: "A", pitch: 0 }, { name: "B", pitch: 2 }, { name: "C", pitch: 4 }, { name: "D", tag: "D.C.", pitch: 5 }]}
            order={[0, 1, 2, 3, 0, 1, 2, 3]}
            note="D.C.（Da Capo）：回到最开头"
          />
          <PlayPath
            bars={[{ name: "A", pitch: 0 }, { name: "B", tag: "𝄋", pitch: 2 }, { name: "C", pitch: 4 }, { name: "D", tag: "D.S.", pitch: 5 }]}
            order={[0, 1, 2, 3, 1, 2, 3]}
            note="D.S.（Dal Segno）：只回到 𝄋 记号处"
          />
        </div>
      ),
    },
    {
      id: "kp3",
      title: "Coda 与 Fine",
      thumb: { k: "sign", label: "Fine" },
      caption: "Fine 是「到此结束」，Coda 是「跳到尾声」",
      render: () => (
        <PlayPath
          bars={[
            { name: "A", pitch: 0 },
            { name: "B", tag: "Fine", pitch: 2 },
            { name: "C", pitch: 4 },
            { name: "D", tag: "D.C. al Fine", pitch: 5 },
          ]}
          order={[0, 1, 2, 3, 0, 1]}
          note="回到开头后，走到 Fine 就停 —— 不再往下"
        />
      ),
    },
    {
      id: "kp4",
      title: "第一与第二结尾",
      thumb: { k: "sign", label: "1. 2." },
      caption: "第一遍走 1. 房子，第二遍跳过它直接进 2.",
      render: () => (
        <PlayPath
          bars={[
            { name: "A", open: true, pitch: 0 },
            { name: "B", pitch: 2 },
            { name: "C1", tag: "1.", close: true, pitch: 4 },
            { name: "C2", tag: "2.", pitch: 7 },
          ]}
          order={[0, 1, 2, 0, 1, 3]}
          note="Volta 括号：同一段落，两个不同的收尾"
        />
      ),
    },
    {
      id: "kp5",
      title: "八度记号",
      thumb: { k: "sign", label: "8va" },
      caption: "8va 写在上方就高八度，8vb 写在下方就低八度 —— 为了少写加线",
      render: () => (
        <NotatedVsPlayed
          written={<StaffBoard clef="treble" notes={[{ name: "C5", mark: "8va" }, { name: "E5", mark: "" }, { name: "G5", mark: "" }]} padTop={46} padBottom={22} />}
          played={<StaffBoard clef="treble" notes={[{ name: "C6" }, { name: "E6" }, { name: "G6" }]} padTop={46} padBottom={22} />}
          playedNotes={["C6", "E6", "G6"]}
          note="写得低，弹得高 —— 谱面清爽多了"
        />
      ),
    },
    {
      id: "kp6",
      title: "震音记号",
      thumb: { k: "sign", label: "⫽" },
      caption: "音符上的斜杠：一根 = 八分，两根 = 十六分，快速重复同一个音",
      render: () => (
        <NotatedVsPlayed
          written={<StaffBoard clef="treble" notes={[{ name: "G4", value: "half", mark: "⫽" }]} padTop={46} padBottom={22} />}
          played={<StaffBoard clef="treble" notes={["G4", "G4", "G4", "G4", "G4", "G4"].map((n) => ({ name: n }))} padTop={30} padBottom={22} />}
          playedNotes={["G4", "G4", "G4", "G4", "G4", "G4"]}
          note="写一个长音，实际是一串快速重复"
        />
      ),
    },
  ],
  L8: [
    {
      id: "kp1",
      title: "速度术语",
      thumb: "tempo",
      caption: "从爬到飞，七档速度 —— 点一张，节拍器和图标一起按那个速度动",
      render: () => <TempoCharacter />,
    },
    {
      id: "kp2",
      title: "速度变化",
      thumb: { k: "ramp" },
      caption: "accel. 越来越快，rit. 越来越慢 —— 柱子的高度就是当时的速度",
      render: () => (
        <div className="kv-stage">
          <TempoCurve mode="accel" />
          <TempoCurve mode="rit" />
        </div>
      ),
    },
    {
      id: "kp3",
      title: "力度术语",
      thumb: { k: "ramp", down: true },
      caption: "每个力度术语都是一条音量曲线：柱子的形状就是它的意思",
      render: () => <DynamicTermPlayer />,
    },
    {
      id: "kp4",
      title: "表情术语",
      thumb: "terms",
      caption: "同一条旋律，八种语气 —— 点一个听，同时看它的「演奏指纹」",
      render: () => <CharacterPlayer />,
    },
    {
      id: "kp5",
      title: "德语与法语术语",
      thumb: { k: "chips", rows: 3, cols: 3 },
      caption: "同一根速度刻度盘，三种语言只是三种叫法",
      render: () => <MultilingualTempo />,
    },
    {
      id: "kp6",
      title: "记忆策略",
      thumb: "curve",
      caption: "术语记不住不是因为笨，是因为没在忘掉之前再看一遍",
      render: () => <ForgettingCurve />,
    },
  ],
};

export function hasLessonVisuals(lessonId) {
  return Boolean(LESSON_VISUALS[lessonId]);
}

/** Pre-class view: the six stops of the lesson, each previewing its own card. */
export function LessonRoute({ lessonId, chapterTitle, onSelect }) {
  const items = LESSON_VISUALS[lessonId];
  if (!items) return null;

  return (
    <section className="kv-route-card">
      <header className="kv-route-head">
        <h3 className="kv-route-heading">本课路线</h3>
        <span className="kv-route-sub">{chapterTitle ? `${chapterTitle} · ` : ""}{items.length} 站</span>
      </header>
      <ol className="kv-route">
        {items.map((item, index) => (
          <li key={item.id} className="kv-route-stop">
            <button type="button" className="kv-route-btn" onClick={() => onSelect(index)}>
              <span className="kv-route-num">{index + 1}</span>
              <span className="kv-route-thumb"><RouteThumb kind={item.thumb} /></span>
              <span className="kv-route-title">{item.title}</span>
              <span className="kv-route-go" aria-hidden="true">→</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function LessonVisualBoard({ lessonId, onOpenSlide, focus = null }) {
  const items = LESSON_VISUALS[lessonId];
  const rootRef = useRef(null);

  useEffect(() => {
    if (!focus || !rootRef.current) return;
    const card = rootRef.current.querySelector(`[data-kv-index="${focus.index}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("is-focused");
    const timer = window.setTimeout(() => card.classList.remove("is-focused"), 1400);
    return () => window.clearTimeout(timer);
  }, [focus]);

  if (!items) return null;

  return (
    <div className="kv-board-stack" ref={rootRef}>
      {items.map((item, index) => (
        <section key={item.id} className="kv-card" data-kv-index={index}>
          <header className="kv-card-head">
            <span className="kv-badge">{index + 1}</span>
            <h3 className="kv-card-title">{item.title}</h3>
            {onOpenSlide && (
              <button type="button" className="kv-slide-link" onClick={() => onOpenSlide(index)}>
                课件第 {index + 1} 页 →
              </button>
            )}
          </header>
          {item.render()}
          {item.caption && <p className="kv-caption">{item.caption}</p>}
        </section>
      ))}
    </div>
  );
}
