import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nFreq, playTone, unlockAudioSystem } from "./musicAudio";

/**
 * Shared drawing primitives for visual-first lesson content.
 *
 * Staff glyphs (clefs, note values, rests) come from the Unicode musical
 * symbols block, the same approach musicaiNotationUtils.js already uses for
 * question images; everything positional is drawn as SVG.
 */

/* ── staff geometry ──────────────────────────────────────────────────────── */

const STAFF_W = 460;
const SPACE = 12; // distance between staff lines
const HALF = SPACE / 2; // one diatonic step
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

// diatonic index sitting on the bottom staff line for each clef
const CLEF_BASE = { treble: 30, bass: 18, alto: 24, tenor: 22 };
const CLEF_GLYPH = { treble: "𝄞", bass: "𝄢", alto: "𝄡", tenor: "𝄡" };
export const NOTE_GLYPH = { whole: "𝅝", half: "𝅗𝅥", quarter: "𝅘𝅥", eighth: "𝅘𝅥𝅮", sixteenth: "𝅘𝅥𝅯" };
export const REST_GLYPH = { whole: "𝄻", half: "𝄼", quarter: "𝄽", eighth: "𝄾", sixteenth: "𝄿" };
export const GLYPH_FONT = "'Bravura','Segoe UI Symbol','Noto Music','Noto Sans Symbols 2','Apple Symbols',serif";

export function parseNote(name) {
  const match = /^([A-G])([#b♯♭]?)(-?\d)$/.exec(String(name).trim());
  if (!match) return null;
  const [, letter, accidental, octave] = match;
  return { letter, accidental, octave: Number(octave) };
}

function diatonicIndex(note) {
  return note.octave * 7 + LETTERS.indexOf(note.letter);
}

export function noteFrequency(name) {
  const note = parseNote(name);
  if (!note) return 440;
  const chromatic = note.accidental === "#" || note.accidental === "♯" ? "#" : "";
  const flat = note.accidental === "b" || note.accidental === "♭";
  const base = nFreq(`${note.letter}${chromatic}`, note.octave);
  return flat ? base * Math.pow(2, -1 / 12) : base;
}

export async function playNote(name, duration = 0.85, volume = 0.24) {
  await unlockAudioSystem();
  playTone(noteFrequency(name), duration, "piano", volume);
}

export async function playSequence(names, gap = 380, duration = 0.7) {
  await unlockAudioSystem();
  names.forEach((name, i) => {
    window.setTimeout(() => playTone(noteFrequency(name), duration, "piano", 0.24), i * gap);
  });
}

/**
 * A five-line staff. `notes` are placed left to right; each note may carry an
 * accidental, a value glyph, a label and a mark drawn above it.
 */
export function StaffBoard({
  clef = "treble",
  notes = [],
  padTop = 40,
  padBottom = 38,
  width = STAFF_W,
  extras = null,
  beams = [],
  noteScale = 1,
  showClef = true,
  startAt = null,
  onNoteClick = null,
  ariaLabel = "五线谱",
}) {
  const line5Y = padTop;
  const line1Y = padTop + 4 * SPACE;
  const height = padTop + 4 * SPACE + padBottom;
  const base = CLEF_BASE[clef] ?? CLEF_BASE.treble;

  const stepOf = (name) => {
    const note = parseNote(name);
    return note ? diatonicIndex(note) - base : 0;
  };
  const yOf = (name) => line1Y - stepOf(name) * HALF;

  const clefFont = clef === "treble" ? SPACE * 3.7 : clef === "bass" ? SPACE * 2.9 : SPACE * 3.2;
  const clefY =
    clef === "treble" ? line1Y - SPACE + 6 : clef === "bass" ? line1Y - 3 * SPACE + 7 : line1Y - 2 * SPACE + 14;

  const startX = startAt ?? (showClef ? 68 : 26);
  const span = width - startX - 26;
  const gap = notes.length > 1 ? span / (notes.length - 1 + 0.6) : 0;

  const lowestStep = notes.length ? Math.min(...notes.map((n) => (parseNote(n.name) ? diatonicIndex(parseNote(n.name)) - base : 0))) : 0;
  const labelY = Math.max(line1Y + 26, line1Y - lowestStep * HALF + 22);

  const positioned = notes.map((note, index) => ({
    ...note,
    x: notes.length > 1 ? startX + index * gap : startX + span / 2,
    y: yOf(note.name),
    step: stepOf(note.name),
  }));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="kv-staff" role="img" aria-label={ariaLabel}>
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1="14" y1={line5Y + i * SPACE} x2={width - 14} y2={line5Y + i * SPACE} className="kv-staff-line" />
      ))}

      {showClef && (
        <text x="22" y={clefY} className="kv-glyph" style={{ fontSize: clefFont, fontFamily: GLYPH_FONT }}>
          {CLEF_GLYPH[clef]}
        </text>
      )}

      {positioned.map((note, index) => {
        const ledgers = [];
        for (let s = -2; s >= note.step; s -= 2) ledgers.push(line1Y - s * HALF);
        for (let s = 10; s <= note.step; s += 2) ledgers.push(line1Y - s * HALF);
        const stemUp = note.step < 4;
        const filled = note.value !== "whole" && note.value !== "half";
        const hollow = note.value === "whole" || note.value === "half";

        return (
          <g
            key={`${note.name}-${index}`}
            className={onNoteClick ? "kv-staff-note is-click" : "kv-staff-note"}
            onClick={onNoteClick ? () => onNoteClick(note, index) : undefined}
          >
            {ledgers.map((ly) => (
              <line key={ly} x1={note.x - 13} y1={ly} x2={note.x + 13} y2={ly} className="kv-staff-line" />
            ))}
            {note.accidental && (
              <text x={note.x - 24} y={note.y + 5} className="kv-accidental" style={{ fontFamily: GLYPH_FONT }}>
                {note.accidental}
              </text>
            )}
            {note.rest ? (
              <text
                x={note.x}
                y={note.restY ?? line1Y - 2 * SPACE + 6}
                className="kv-rest-glyph-staff"
                style={{ fontSize: SPACE * 2.6 * noteScale, fontFamily: GLYPH_FONT }}
              >
                {note.rest}
              </text>
            ) : (
              <>
                <ellipse
                  cx={note.x}
                  cy={note.y}
                  rx={7.6 * noteScale}
                  ry={5.4 * noteScale}
                  transform={`rotate(-16 ${note.x} ${note.y})`}
                  className={hollow ? "kv-notehead is-hollow" : "kv-notehead"}
                  fill={filled ? undefined : "none"}
                />
                {note.value !== "whole" && (
                  <line
                    x1={stemUp ? note.x + 7 * noteScale : note.x - 7 * noteScale}
                    y1={note.y}
                    x2={stemUp ? note.x + 7 * noteScale : note.x - 7 * noteScale}
                    y2={stemUp ? note.y - 3.4 * SPACE : note.y + 3.4 * SPACE}
                    className="kv-stem"
                  />
                )}
              </>
            )}
            {note.tone && (
              <circle cx={note.x} cy={note.y} r="12" className={`kv-note-tone is-${note.tone}`} />
            )}
            {note.ornament && (
              <OrnamentSign kind={note.ornament} x={note.x} y={Math.min(note.y, line5Y) - 18} />
            )}
            {note.mark && (
              <text x={note.x} y={Math.min(note.y, line5Y) - 16} className="kv-staff-mark">
                {note.mark}
              </text>
            )}
            {note.label && (
              <text x={note.x} y={labelY} className="kv-staff-label">
                {note.label}
              </text>
            )}
          </g>
        );
      })}

      {beams.map((group, gi) => {
        const a = positioned[group.from];
        const b = positioned[group.to];
        if (!a || !b) return null;
        const stemUp = a.step < 4;
        const offset = 7 * noteScale;
        const x1 = (stemUp ? a.x + offset : a.x - offset) - 0.8;
        const x2 = (stemUp ? b.x + offset : b.x - offset) + 0.8;
        const yEnd = stemUp ? a.y - 3.4 * SPACE : a.y + 3.4 * SPACE;
        return Array.from({ length: group.count ?? 1 }, (_, k) => (
          <rect
            key={`beam-${gi}-${k}`}
            x={Math.min(x1, x2)}
            y={stemUp ? yEnd + k * 5.4 : yEnd - k * 5.4 - 3.4}
            width={Math.abs(x2 - x1)}
            height="3.4"
            className="kv-beam"
          />
        ));
      })}

      {typeof extras === "function" ? extras({ line1Y, line5Y, yOf, width, height, positioned }) : extras}
    </svg>
  );
}

/* ── labelled axis (dynamics, tempo) ─────────────────────────────────────── */

export function ScaleAxis({ items, initial = 0, onPick = null, unit = "", note = null }) {
  const [index, setIndex] = useState(initial);
  const current = items[index];

  const pick = useCallback(
    async (i) => {
      setIndex(i);
      await unlockAudioSystem();
      if (onPick) onPick(items[i], i);
    },
    [items, onPick],
  );

  return (
    <div className="kv-axis-wrap">
      <div className="kv-axis-track">
        <div className="kv-axis-line" />
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className={`kv-axis-stop${i === index ? " is-on" : ""}`}
            style={{ left: `${(i / (items.length - 1)) * 100}%` }}
            onClick={() => pick(i)}
            aria-label={item.label}
          >
            <span className="kv-axis-dot" />
            <span className="kv-axis-label">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="kv-axis-readout">
        {current.emoji && (
          <span
            className="kv-axis-emoji"
            aria-hidden="true"
            style={{ fontSize: `${20 + index * 3}px` }}
          >
            {current.emoji}
          </span>
        )}
        <strong>{current.label}</strong>
        <span>{current.detail}{unit}</span>
      </div>
      {note && <div className="kv-controls-note kv-standalone">{note}</div>}
    </div>
  );
}

/* ── duration tree ───────────────────────────────────────────────────────── */

const TREE_ROWS = [
  { id: "whole", label: "全音符", count: 1, value: "whole", beat: 4 },
  { id: "half", label: "二分音符", count: 2, value: "half", beat: 2 },
  { id: "quarter", label: "四分音符", count: 4, value: "quarter", beat: 1 },
  { id: "eighth", label: "八分音符", count: 8, value: "eighth", beat: 0.5, beamEvery: 2, beamCount: 1 },
  { id: "sixteenth", label: "十六分音符", count: 16, value: "sixteenth", beat: 0.25, beamEvery: 4, beamCount: 2 },
];

const BAR_SECONDS = 2.6;

function beamGroups(row) {
  if (!row.beamEvery) return [];
  const groups = [];
  for (let i = 0; i < row.count; i += row.beamEvery) {
    groups.push({ from: i, to: i + row.beamEvery - 1, count: row.beamCount });
  }
  return groups;
}

/** The textbook subdivision tree: one bar, split finer and finer. */
export function DurationTree() {
  const [active, setActive] = useState("quarter");
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async (row) => {
    setActive(row.id);
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const step = (BAR_SECONDS / row.count) * 1000;
    for (let i = 0; i < row.count; i += 1) {
      timers.current.push(
        window.setTimeout(
          () => playTone(nFreq("B", 4), Math.min(1.4, (step / 1000) * 0.9), "piano", i === 0 ? 0.28 : 0.22),
          i * step,
        ),
      );
    }
  }, []);

  return (
    <div className="kv-stage">
      <div className="kv-tree">
        {TREE_ROWS.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`kv-tree-row${active === row.id ? " is-on" : ""}`}
            onClick={() => play(row)}
          >
            <span className="kv-tree-name">
              <strong>{row.label}</strong>
              <small>{row.count} 个 = 一小节</small>
            </span>
            <span className="kv-tree-staff">
              <StaffBoard
                clef="treble"
                showClef={false}
                padTop={16}
                padBottom={34}
                width={720}
                noteScale={row.count > 8 ? 0.68 : row.count > 4 ? 0.84 : 1}
                notes={Array.from({ length: row.count }, () => ({ name: "B4", value: row.value }))}
                beams={beamGroups(row)}
                ariaLabel={`${row.label}：一小节 ${row.count} 个`}
              />
            </span>
          </button>
        ))}
      </div>
      <div className="kv-controls-note kv-standalone">
        每一行都是同样长的一小节 —— 点开听，格子越多，每个音就越短
      </div>
    </div>
  );
}

/* ── dotted values on the staff (L4) ─────────────────────────────────────── */

const DOT_STAFF_ROWS = [
  { id: "plain", label: "四分音符", beats: 1, dots: 0, equals: ["四分"], notes: 1 },
  { id: "dot", label: "附点四分音符", beats: 1.5, dots: 1, equals: ["四分", "＋八分"], notes: 2 },
  { id: "double", label: "复附点四分音符", beats: 1.75, dots: 2, equals: ["四分", "＋八分", "＋十六分"], notes: 3 },
];

export function DotCompare() {
  const [active, setActive] = useState("dot");

  const play = useCallback(async (row) => {
    setActive(row.id);
    await unlockAudioSystem();
    playTone(nFreq("B", 4), row.beats * 0.62, "piano", 0.26);
  }, []);

  return (
    <div className="kv-stage">
      <div className="kv-dots">
        {DOT_STAFF_ROWS.map((row) => (
          <button key={row.id} type="button" className={`kv-dot-row${active === row.id ? " is-on" : ""}`} onClick={() => play(row)}>
            <span className="kv-dot-name">
              <strong>{row.label}</strong>
              <small>{row.beats} 拍</small>
            </span>
            <span className="kv-dot-staff">
              <StaffBoard
                clef="treble"
                showClef={false}
                padTop={24}
                padBottom={14}
                width={210}
                notes={[{ name: "B4", value: "quarter" }]}
                extras={({ positioned }) =>
                  positioned.length
                    ? Array.from({ length: row.dots }, (_, i) => (
                        <circle key={i} cx={positioned[0].x + 15 + i * 8} cy={positioned[0].y - 6} r="2.6" className="kv-dot-mark" />
                      ))
                    : null
                }
              />
            </span>
            <span className="kv-dot-equals">
              {row.equals.map((part) => (
                <span key={part} className="kv-dot-part">{part}</span>
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="kv-controls-note kv-standalone">
        第一个附点补一半，第二个附点再补前一个附点的一半
      </div>
    </div>
  );
}

/* ── rests where they actually sit on the staff (L4) ─────────────────────── */

const REST_STAFF_ROWS = [
  { id: "whole", glyph: "𝄻", label: "全休止符", beats: 4, offset: -0.55, tip: "挂在第四线下方" },
  { id: "half", glyph: "𝄼", label: "二分休止符", beats: 2, offset: 0.42, tip: "坐在第三线上方" },
  { id: "quarter", glyph: "𝄽", label: "四分休止符", beats: 1, offset: 0.1, tip: "跨在中间三线上" },
  { id: "eighth", glyph: "𝄾", label: "八分休止符", beats: 0.5, offset: 0.1, tip: "一条小尾巴" },
  { id: "sixteenth", glyph: "𝄿", label: "十六分休止符", beats: 0.25, offset: 0.1, tip: "两条小尾巴" },
];

export function RestRow() {
  const [active, setActive] = useState("quarter");
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // play the bar as note – rest – note, so the gap is the rest's real length
  const play = useCallback(async (row) => {
    setActive(row.id);
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const unit = 520;
    const after = 1 + row.beats;
    [0, after].forEach((pos) => {
      timers.current.push(window.setTimeout(() => playTone(nFreq("B", 4), 0.32, "piano", 0.26), pos * unit));
    });
  }, []);

  return (
    <div className="kv-stage">
      <div className="kv-rests">
        {REST_STAFF_ROWS.map((row) => (
          <button key={row.id} type="button" className={`kv-rest-cell${active === row.id ? " is-on" : ""}`} onClick={() => play(row)}>
            <span className="kv-rest-staff">
              <StaffBoard
                clef="treble"
                showClef={false}
                padTop={22}
                padBottom={16}
                width={150}
                notes={[{ name: "B4", rest: row.glyph, restY: 22 + 4 * SPACE - (2 + row.offset) * SPACE }]}
                ariaLabel={row.label}
              />
            </span>
            <span className="kv-rest-name">{row.label}</span>
            <span className="kv-rest-beats">{row.beats} 拍</span>
            <span className="kv-rest-tip">{row.tip}</span>
          </button>
        ))}
      </div>
      <div className="kv-controls-note kv-standalone">
        点一个：会听到「响 — 停 — 响」，中间停多久就是它的时值
      </div>
    </div>
  );
}

/* ── notated vs played ───────────────────────────────────────────────────── */

/**
 * The heart of ornaments, repeats and syncopation: what the page says on top,
 * what the player actually does underneath.
 */
export function NotatedVsPlayed({ written, played, playedNotes, note = null, writtenLabel = "谱面写的", playedLabel = "实际弹的" }) {
  const [running, setRunning] = useState(false);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async () => {
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setRunning(true);
    const gap = 260;
    playedNotes.forEach((name, i) => {
      timers.current.push(
        window.setTimeout(() => playTone(noteFrequency(name), 0.45, "piano", 0.24), i * gap),
      );
    });
    timers.current.push(window.setTimeout(() => setRunning(false), playedNotes.length * gap + 300));
  }, [playedNotes]);

  return (
    <div className="kv-nvp">
      <div className="kv-nvp-row">
        <span className="kv-nvp-tag">{writtenLabel}</span>
        <div className="kv-nvp-stage">{written}</div>
      </div>
      <div className="kv-nvp-arrow" aria-hidden="true">↓</div>
      <div className="kv-nvp-row">
        <span className="kv-nvp-tag is-played">{playedLabel}</span>
        <div className="kv-nvp-stage">{played}</div>
      </div>
      <div className="kv-controls">
        <button type="button" className="kv-play" onClick={play}>{running ? "▶ 播放中" : "▶ 听实际效果"}</button>
        {note && <span className="kv-controls-note">{note}</span>}
      </div>
    </div>
  );
}

/* ── meter anatomy ───────────────────────────────────────────────────────── */

export function MeterAnatomy({ top, bottom, topNote, bottomNote }) {
  return (
    <div className="kv-meter-anatomy">
      <div className="kv-meter-big">
        <span className="kv-meter-num is-top">{top}</span>
        <span className="kv-meter-num is-bottom">{bottom}</span>
      </div>
      <div className="kv-meter-legend">
        <div className="kv-meter-line">
          <span className="kv-meter-arrow">↑</span>
          <span><strong>上面的 {top}</strong>：每小节有 {top} 拍{topNote ? ` —— ${topNote}` : ""}</span>
        </div>
        <div className="kv-meter-line">
          <span className="kv-meter-arrow">↓</span>
          <span><strong>下面的 {bottom}</strong>：以 {bottom} 分音符为一拍{bottomNote ? ` —— ${bottomNote}` : ""}</span>
        </div>
      </div>
    </div>
  );
}

/* ── conducting pattern ──────────────────────────────────────────────────── */

// one dot per beat the hand actually marks — no extra "preparation" beat
const CONDUCT_PATHS = {
  "2/4": {
    d: "M 62 22 L 62 96 L 112 22",
    stops: [[62, 96], [112, 22]],
    names: ["1 下", "2 上"],
    hint: "两拍：下、上",
  },
  "3/4": {
    d: "M 60 22 L 60 96 L 120 62 L 60 22",
    stops: [[60, 96], [120, 62], [60, 22]],
    names: ["1 下", "2 右", "3 上"],
    hint: "三拍：下、右、上 —— 一个三角形",
  },
  "4/4": {
    d: "M 84 22 L 84 96 L 34 62 L 134 62 L 84 22",
    stops: [[84, 96], [34, 62], [134, 62], [84, 22]],
    names: ["1 下", "2 左", "3 右", "4 上"],
    hint: "四拍：下、左、右、上 —— 一个十字",
  },
  "6/8": {
    d: "M 62 22 L 62 96 L 112 22",
    stops: [[62, 96], [112, 22]],
    names: ["1 下 (1·2·3)", "2 上 (4·5·6)", ],
    hint: "6/8 通常「按两大拍打」，每一大拍里含三个八分音符",
  },
};

export function ConductPattern({ meter = "4/4", tempo = 84 }) {
  const [active, setActive] = useState(meter);
  const [step, setStep] = useState(-1);
  const timers = useRef([]);
  const pattern = CONDUCT_PATHS[active];

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async () => {
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const beatMs = 60000 / tempo;
    pattern.stops.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => {
        setStep(i);
        playTone(i === 0 ? 660 : 460, 0.14, "piano", i === 0 ? 0.3 : 0.16);
      }, i * beatMs));
    });
    timers.current.push(window.setTimeout(() => setStep(-1), pattern.stops.length * beatMs + 220));
  }, [pattern, tempo]);

  return (
    <div className="kv-stage">
      <div className="kv-controls kv-controls-tabs">
        {Object.keys(CONDUCT_PATHS).map((key) => (
          <button key={key} type="button" className={`kv-chip${active === key ? " is-on" : ""}`} onClick={() => { setActive(key); setStep(-1); }}>
            {key}
          </button>
        ))}
      </div>
      <div className="kv-conduct">
        <svg viewBox="0 0 168 116" className="kv-conduct-svg" role="img" aria-label={`${active} 指挥图示`}>
          <path d={pattern.d} className="kv-conduct-path" />
          {pattern.stops.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={step === i ? 10 : 7} className={step === i ? "kv-conduct-dot is-on" : "kv-conduct-dot"} />
              <text x={x} y={y - 14} className="kv-conduct-label">{pattern.names[i]}</text>
            </g>
          ))}
        </svg>
        <button type="button" className="kv-play" onClick={play}>▶ 打拍子</button>
      </div>
      <div className="kv-controls-note kv-standalone">{pattern.hint}</div>
    </div>
  );
}

/* ── barline row ─────────────────────────────────────────────────────────── */

const BARLINES = [
  { id: "single", name: "小节线", desc: "分隔小节", draw: (x) => <line x1={x} y1="8" x2={x} y2="56" className="kv-bl" /> },
  { id: "double", name: "复纵线", desc: "分段落", draw: (x) => (<>
    <line x1={x - 5} y1="8" x2={x - 5} y2="56" className="kv-bl" />
    <line x1={x + 3} y1="8" x2={x + 3} y2="56" className="kv-bl" />
  </>) },
  { id: "final", name: "终止线", desc: "乐曲结束", draw: (x) => (<>
    <line x1={x - 6} y1="8" x2={x - 6} y2="56" className="kv-bl" />
    <rect x={x} y="8" width="5" height="48" className="kv-bl-thick" />
  </>) },
  { id: "repeat", name: "反复线", desc: "从这里返回", draw: (x) => (<>
    <rect x={x - 9} y="8" width="5" height="48" className="kv-bl-thick" />
    <line x1={x} y1="8" x2={x} y2="56" className="kv-bl" />
    <circle cx={x + 8} cy="24" r="2.6" className="kv-bl-dot" />
    <circle cx={x + 8} cy="40" r="2.6" className="kv-bl-dot" />
  </>) },
];

export function BarlineRow() {
  return (
    <div className="kv-barlines">
      {BARLINES.map((item) => (
        <div key={item.id} className="kv-barline-cell">
          <svg viewBox="0 0 60 66" className="kv-barline-svg" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1="6" y1={8 + i * 12} x2="54" y2={8 + i * 12} className="kv-staff-line" />
            ))}
            {item.draw(34)}
          </svg>
          <div className="kv-barline-name">{item.name}</div>
          <div className="kv-barline-desc">{item.desc}</div>
        </div>
      ))}
    </div>
  );
}

/* ── generic two-row comparison ──────────────────────────────────────────── */

export function CompareRows({ rows, note = null }) {
  return (
    <div className="kv-compare-rows">
      {rows.map((row) => (
        <div key={row.id} className={`kv-compare-row is-${row.verdict || "neutral"}`}>
          <div className="kv-compare-row-head">
            <span className="kv-verdict">{row.verdict === "bad" ? "✗" : row.verdict === "good" ? "✓" : "·"}</span>
            <span className="kv-compare-row-label">{row.label}</span>
            {row.onPlay && (
              <button type="button" className="kv-play kv-play-sm" onClick={row.onPlay}>▶ 听</button>
            )}
          </div>
          <div className="kv-compare-row-body">{row.body}</div>
        </div>
      ))}
      {note && <div className="kv-controls-note kv-standalone">{note}</div>}
    </div>
  );
}

/* ── note anatomy (L4) ───────────────────────────────────────────────────── */

const ANATOMY_PARTS = [
  { id: "head", label: "符头", desc: "决定音高：放在哪条线/间上" },
  { id: "stem", label: "符干", desc: "决定方向：第三线以上朝下，以下朝上" },
  { id: "flag", label: "符尾", desc: "决定时值：一条符尾八分，两条十六分" },
];

export function NoteAnatomy() {
  const [active, setActive] = useState("head");
  const current = ANATOMY_PARTS.find((p) => p.id === active);

  return (
    <div className="kv-stage">
      <div className="kv-anatomy">
        <svg viewBox="0 0 200 180" className="kv-anatomy-svg" role="img" aria-label="音符的构成">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1="12" y1={40 + i * 18} x2="188" y2={40 + i * 18} className="kv-staff-line" />
          ))}
          <g className={active === "flag" ? "kv-part is-on" : "kv-part"} onClick={() => setActive("flag")}>
            <path d="M 96 46 C 122 58, 126 76, 110 92 C 120 74, 112 62, 96 56 Z" className="kv-part-fill" />
          </g>
          <g className={active === "stem" ? "kv-part is-on" : "kv-part"} onClick={() => setActive("stem")}>
            <rect x="93" y="44" width="4" height="76" className="kv-part-fill" />
          </g>
          <g className={active === "head" ? "kv-part is-on" : "kv-part"} onClick={() => setActive("head")}>
            <ellipse cx="86" cy="120" rx="12" ry="8.4" transform="rotate(-16 86 120)" className="kv-part-fill" />
          </g>
        </svg>
        <div className="kv-anatomy-side">
          {ANATOMY_PARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              className={`kv-chip${active === part.id ? " is-on" : ""}`}
              onClick={() => setActive(part.id)}
            >
              {part.label}
            </button>
          ))}
        </div>
      </div>
      <div className="kv-insight">{current.label}：{current.desc}</div>
    </div>
  );
}

/* ── articulation (L6) ───────────────────────────────────────────────────── */

const ARTICULATIONS = {
  legato: { mark: "⌒", gap: 420, dur: 0.62, vol: 0.2, desc: "音与音之间不断开，像连成一条线" },
  staccato: { mark: "·", gap: 420, dur: 0.13, vol: 0.24, desc: "每个音都缩短，音与音之间留出空隙" },
  tenuto: { mark: "—", gap: 420, dur: 0.4, vol: 0.3, desc: "保持完整时值，并且略微加重" },
  accent: { mark: ">", gap: 420, dur: 0.34, vol: 0.24, accentFirst: true, desc: "某个音明显重出来，其余保持原样" },
};

export function ArticulationDemo({ kind, notes = ["C5", "D5", "E5", "F5"] }) {
  const config = ARTICULATIONS[kind];
  const [playing, setPlaying] = useState(false);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async () => {
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setPlaying(true);
    notes.forEach((name, i) => {
      timers.current.push(
        window.setTimeout(() => {
          const vol = config.accentFirst && i === 0 ? config.vol * 1.8 : config.vol;
          playTone(noteFrequency(name), config.dur, "piano", Math.min(0.42, vol));
        }, i * config.gap),
      );
    });
    timers.current.push(window.setTimeout(() => setPlaying(false), notes.length * config.gap + 200));
  }, [config, notes]);

  return (
    <div className="kv-stage">
      <StaffBoard
        clef="treble"
        notes={notes.map((name, i) => ({
          name,
          mark: kind === "accent" ? (i === 0 ? ">" : "") : config.mark,
        }))}
        extras={({ positioned, line5Y }) =>
          kind === "legato" && positioned.length > 1 ? (
            <path
              d={`M ${positioned[0].x} ${line5Y - 14} Q ${(positioned[0].x + positioned[positioned.length - 1].x) / 2} ${line5Y - 30} ${positioned[positioned.length - 1].x} ${line5Y - 14}`}
              className="kv-tie"
            />
          ) : null
        }
      />
      <div className="kv-controls">
        <button type="button" className="kv-play" onClick={play}>{playing ? "▶ 播放中" : "▶ 听"}</button>
        <span className="kv-controls-note">{config.desc}</span>
      </div>
    </div>
  );
}

/* ── hairpin (L6) ────────────────────────────────────────────────────────── */

export function Hairpin({ direction = "cresc" }) {
  const timers = useRef([]);
  const [step, setStep] = useState(-1);
  const steps = 8;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async () => {
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    for (let i = 0; i < steps; i += 1) {
      const ratio = direction === "cresc" ? (i + 1) / steps : 1 - i / steps;
      timers.current.push(
        window.setTimeout(() => {
          setStep(i);
          playTone(nFreq("G", 4), 0.3, "piano", 0.06 + ratio * 0.3);
        }, i * 300),
      );
    }
    timers.current.push(window.setTimeout(() => setStep(-1), steps * 300 + 200));
  }, [direction]);

  return (
    <div className="kv-stage">
      <div className="kv-hairpin">
        <svg viewBox="0 0 420 80" className="kv-hairpin-svg" aria-hidden="true">
          {direction === "cresc" ? (
            <>
              <line x1="20" y1="40" x2="400" y2="12" className="kv-hairpin-line" />
              <line x1="20" y1="40" x2="400" y2="68" className="kv-hairpin-line" />
            </>
          ) : (
            <>
              <line x1="20" y1="12" x2="400" y2="40" className="kv-hairpin-line" />
              <line x1="20" y1="68" x2="400" y2="40" className="kv-hairpin-line" />
            </>
          )}
          {Array.from({ length: steps }, (_, i) => {
            const x = 34 + i * ((372 - 20) / (steps - 1));
            const ratio = direction === "cresc" ? (i + 1) / steps : 1 - i / steps;
            const h = 8 + ratio * 44;
            return <rect key={i} x={x - 5} y={40 - h / 2} width="10" height={h} rx="3" className={step === i ? "kv-hairpin-bar is-on" : "kv-hairpin-bar"} />;
          })}
        </svg>
      </div>
      <div className="kv-controls">
        <button type="button" className="kv-play" onClick={play}>▶ 听</button>
        <span className="kv-controls-note">
          {direction === "cresc" ? "crescendo：从弱到强，开口越来越大" : "diminuendo：从强到弱，开口越来越小"}
        </span>
      </div>
    </div>
  );
}

/* ── repeat playback path (L7) ───────────────────────────────────────────── */

export function PlayPath({ bars, order, note = null }) {
  const [cursor, setCursor] = useState(-1);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async () => {
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    order.forEach((barIndex, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setCursor(i);
          playTone(nFreq("C", 5) * Math.pow(2, (bars[barIndex]?.pitch ?? 0) / 12), 0.5, "piano", 0.24);
        }, i * 620),
      );
    });
    timers.current.push(window.setTimeout(() => setCursor(-1), order.length * 620 + 260));
  }, [bars, order]);

  return (
    <div className="kv-stage">
      <div className="kv-path-bars">
        {bars.map((bar, index) => (
          <div
            key={index}
            className={[
              "kv-path-bar",
              bar.tag ? "has-tag" : "",
              cursor >= 0 && order[cursor] === index ? "is-on" : "",
            ].join(" ").trim()}
          >
            {bar.open && <span className="kv-repeat is-open">‖:</span>}
            <span className="kv-path-name">{bar.name}</span>
            {bar.tag && <span className="kv-path-tag">{bar.tag}</span>}
            {bar.close && <span className="kv-repeat is-close">:‖</span>}
          </div>
        ))}
      </div>
      <div className="kv-path-order">
        <span className="kv-path-order-label">实际演奏顺序</span>
        {order.map((barIndex, i) => (
          <span key={i} className={`kv-path-step${cursor === i ? " is-on" : ""}`}>
            {bars[barIndex]?.name}
          </span>
        ))}
      </div>
      <div className="kv-controls">
        <button type="button" className="kv-play" onClick={play}>▶ 按顺序走一遍</button>
        {note && <span className="kv-controls-note">{note}</span>}
      </div>
    </div>
  );
}

/* ── tempo curve (L8) ────────────────────────────────────────────────────── */

export function TempoCurve({ mode = "accel" }) {
  const [step, setStep] = useState(-1);
  const timers = useRef([]);
  const count = 10;

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const bpmAt = useCallback(
    (i) => {
      const ratio = i / (count - 1);
      if (mode === "accel") return 60 + ratio * 100;
      if (mode === "rit") return 160 - ratio * 100;
      return 108;
    },
    [mode],
  );

  const play = useCallback(async () => {
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    let elapsed = 0;
    for (let i = 0; i < count; i += 1) {
      const at = elapsed;
      timers.current.push(
        window.setTimeout(() => {
          setStep(i);
          playTone(560, 0.12, "piano", 0.22);
        }, at),
      );
      elapsed += 60000 / bpmAt(i);
    }
    timers.current.push(window.setTimeout(() => setStep(-1), elapsed + 200));
  }, [bpmAt]);

  return (
    <div className="kv-stage">
      <div className="kv-tempo">
        <svg viewBox="0 0 420 110" className="kv-tempo-svg" aria-hidden="true">
          <line x1="16" y1="94" x2="404" y2="94" className="kv-thumb-staffline" />
          {Array.from({ length: count }, (_, i) => {
            const x = 26 + i * (368 / (count - 1));
            const h = ((bpmAt(i) - 50) / 120) * 74;
            return (
              <g key={i}>
                <rect x={x - 8} y={90 - h} width="16" height={h} rx="4" className={step === i ? "kv-tempo-bar is-on" : "kv-tempo-bar"} />
              </g>
            );
          })}
          <text x="26" y="16" className="kv-tempo-label">{Math.round(bpmAt(0))} BPM</text>
          <text x="394" y="16" className="kv-tempo-label" textAnchor="end">{Math.round(bpmAt(count - 1))} BPM</text>
        </svg>
      </div>
      <div className="kv-controls">
        <button type="button" className="kv-play" onClick={play}>▶ 听</button>
        <span className="kv-controls-note">
          {mode === "accel" ? "accelerando：一点点变快" : mode === "rit" ? "ritardando：一点点变慢" : "a tempo：回到原速"}
        </span>
      </div>
    </div>
  );
}

/* ── grouped terms (L8) ──────────────────────────────────────────────────── */

export function TermGrid({ groups }) {
  return (
    <div className="kv-terms">
      {groups.map((group) => (
        <div key={group.id} className="kv-term-group" style={{ "--kv-tint": group.tint }}>
          <div className="kv-term-head">{group.label}</div>
          <div className="kv-term-chips">
            {group.items.map((item) => (
              <span key={item.term} className="kv-term-chip">
                <strong>{item.term}</strong>
                <span>{item.meaning}</span>
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── octave map (L2) ─────────────────────────────────────────────────────── */

const OCTAVE_GROUPS = [
  { octave: 1, label: "大字一组", cn: "C1" },
  { octave: 2, label: "大字组", cn: "C2" },
  { octave: 3, label: "小字组", cn: "C3" },
  { octave: 4, label: "小字一组", cn: "c1 · 中央C" },
  { octave: 5, label: "小字二组", cn: "c2" },
  { octave: 6, label: "小字三组", cn: "c3" },
];

export function OctaveMap({ focusOctave = null }) {
  const [picked, setPicked] = useState(focusOctave);
  const whiteSteps = [0, 2, 4, 5, 7, 9, 11];
  const blackSteps = [1, 3, 6, 8, 10];
  const perOctave = 7;
  const total = OCTAVE_GROUPS.length * perOctave;
  const kw = 460 / total;

  const strike = useCallback(async (octave, semitone) => {
    await unlockAudioSystem();
    playTone(nFreq("C", octave) * Math.pow(2, semitone / 12), 0.8, "piano", 0.24);
  }, []);

  return (
    <div className="kv-stage">
      <div className="kv-board-scroll">
        <svg viewBox="0 0 460 118" className="kv-octave" role="group" aria-label="音组划分">
          {OCTAVE_GROUPS.map((group, gi) => {
            const x0 = gi * perOctave * kw;
            const on = picked === group.octave;
            return (
              <g key={group.octave} onClick={() => { setPicked(group.octave); strike(group.octave, 0); }} className="kv-octave-group">
                <rect x={x0} y="30" width={perOctave * kw} height="70" className={on ? "kv-octave-zone is-on" : "kv-octave-zone"} />
                {whiteSteps.map((step, wi) => (
                  <rect key={step} x={x0 + wi * kw + 0.5} y="32" width={kw - 1} height="66" rx="2" className={on ? "kv-oct-white is-on" : "kv-oct-white"} />
                ))}
                {blackSteps.map((step) => {
                  const wCount = whiteSteps.filter((w) => w < step).length;
                  return <rect key={step} x={x0 + wCount * kw - kw * 0.3} y="32" width={kw * 0.6} height="40" rx="1.5" className="kv-oct-black" />;
                })}
                <text x={x0 + (perOctave * kw) / 2} y="22" className={on ? "kv-octave-label is-on" : "kv-octave-label"}>
                  {group.label}
                </text>
                <text x={x0 + (perOctave * kw) / 2} y="112" className="kv-octave-sub">{group.cn}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="kv-controls-note kv-standalone">点任意一组，听这一组的 C 有多高</div>
    </div>
  );
}

/* ── equal temperament ladder (L2) ───────────────────────────────────────── */

export function FrequencyLadder() {
  const [picked, setPicked] = useState(0);
  const base = nFreq("C", 4);
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B", "C"];

  const hit = useCallback(async (i) => {
    setPicked(i);
    await unlockAudioSystem();
    playTone(base * Math.pow(2, i / 12), 0.8, "piano", 0.24);
  }, [base]);

  return (
    <div className="kv-stage">
      <div className="kv-ladder">
        {names.map((name, i) => {
          const freq = base * Math.pow(2, i / 12);
          return (
            <button key={i} type="button" className={`kv-ladder-step${picked === i ? " is-on" : ""}`} onClick={() => hit(i)}>
              <span className="kv-ladder-bar" style={{ height: `${18 + i * 6}px` }} />
              <span className="kv-ladder-name">{name}</span>
              <span className="kv-ladder-freq">{freq.toFixed(1)}</span>
            </button>
          );
        })}
      </div>
      <div className="kv-insight">
        每上一个半音，频率乘以 <strong>1.0595</strong>（也就是 <sup>12</sup>√2）；乘满十二次正好翻一倍，回到高八度的 C
      </div>
    </div>
  );
}

/* ── tuning systems (L2) ─────────────────────────────────────────────────── */

const TUNINGS = [
  { id: "equal", label: "十二平均律", third: 400, fifth: 700, note: "把八度平均切成 12 份，转调最方便" },
  { id: "just", label: "纯律", third: 386, fifth: 702, note: "按自然泛音的整数比，和声最干净" },
  { id: "pyth", label: "五度相生律", third: 408, fifth: 702, note: "三分损益法，一路叠纯五度生出各音" },
];

export function TuningCompare() {
  const [interval, setInterval_] = useState("third");
  const [picked, setPicked] = useState("equal");

  const play = useCallback(async (tuning) => {
    setPicked(tuning.id);
    await unlockAudioSystem();
    const root = nFreq("C", 4);
    const cents = interval === "third" ? tuning.third : tuning.fifth;
    playTone(root, 1.3, "piano", 0.2);
    window.setTimeout(() => playTone(root * Math.pow(2, cents / 1200), 1.3, "piano", 0.2), 30);
  }, [interval]);

  return (
    <div className="kv-stage">
      <div className="kv-controls kv-controls-tabs">
        <button type="button" className={`kv-chip${interval === "third" ? " is-on" : ""}`} onClick={() => setInterval_("third")}>大三度</button>
        <button type="button" className={`kv-chip${interval === "fifth" ? " is-on" : ""}`} onClick={() => setInterval_("fifth")}>纯五度</button>
      </div>
      <div className="kv-tunings">
        {TUNINGS.map((tuning) => {
          const cents = interval === "third" ? tuning.third : tuning.fifth;
          const ref = interval === "third" ? 400 : 700;
          const diff = cents - ref;
          return (
            <button key={tuning.id} type="button" className={`kv-tuning${picked === tuning.id ? " is-on" : ""}`} onClick={() => play(tuning)}>
              <span className="kv-tuning-name">{tuning.label}</span>
              <span className="kv-tuning-bar">
                <span className="kv-tuning-fill" style={{ width: `${(cents / 720) * 100}%` }} />
              </span>
              <span className="kv-tuning-cents">{cents} 音分{diff !== 0 ? `（${diff > 0 ? "+" : ""}${diff}）` : "（基准）"}</span>
              <span className="kv-tuning-note">{tuning.note}</span>
            </button>
          );
        })}
      </div>
      <div className="kv-controls-note kv-standalone">点每一行会同时奏响两个音，仔细听「拍音」的快慢</div>
    </div>
  );
}

/* ── harmonic series (L2) ────────────────────────────────────────────────── */

export function HarmonicStack() {
  const [picked, setPicked] = useState(1);
  const root = nFreq("C", 3);
  const partials = [1, 2, 3, 4, 5, 6];

  const hit = useCallback(async (n) => {
    setPicked(n);
    await unlockAudioSystem();
    playTone(root * n, 1, "sine", 0.18);
  }, [root]);

  const all = useCallback(async () => {
    setPicked(0);
    await unlockAudioSystem();
    partials.forEach((n) => playTone(root * n, 1.4, "sine", 0.16 / n));
  }, [root, partials]);

  return (
    <div className="kv-stage">
      <div className="kv-harmonics">
        {partials.map((n) => (
          <button key={n} type="button" className={`kv-harmonic${picked === n ? " is-on" : ""}`} onClick={() => hit(n)}>
            <span className="kv-harmonic-index">{n}</span>
            <svg viewBox="0 0 220 26" className="kv-harmonic-wave" aria-hidden="true">
              <path
                d={Array.from({ length: 121 }, (_, i) => {
                  const x = (i / 120) * 220;
                  const y = 13 - Math.sin((i / 120) * n * Math.PI * 2) * 10;
                  return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
                }).join(" ")}
                className="kv-harmonic-path"
              />
            </svg>
            <span className="kv-harmonic-freq">{Math.round(root * n)} Hz</span>
          </button>
        ))}
      </div>
      <div className="kv-controls">
        <button type="button" className="kv-play" onClick={all}>▶ 一起响</button>
        <span className="kv-controls-note">单独听是「素」的，叠在一起才有音色 —— 泛音的比例决定了乐器听起来像什么</span>
      </div>
    </div>
  );
}

/* ── dynamic-term envelopes (L8) ─────────────────────────────────────────── */

const DYNAMIC_TERMS = [
  { id: "p", term: "p", full: "piano", cn: "弱", env: [0.11, 0.11, 0.11, 0.11, 0.11, 0.11] },
  { id: "f", term: "f", full: "forte", cn: "强", env: [0.33, 0.33, 0.33, 0.33, 0.33, 0.33] },
  { id: "cresc", term: "cresc.", full: "crescendo", cn: "渐强", env: [0.07, 0.13, 0.19, 0.26, 0.33, 0.4] },
  { id: "dim", term: "dim.", full: "diminuendo", cn: "渐弱", env: [0.4, 0.33, 0.26, 0.19, 0.13, 0.07] },
  { id: "sf", term: "sf", full: "sforzando", cn: "突强一个音", env: [0.14, 0.14, 0.48, 0.14, 0.14, 0.14] },
  { id: "fp", term: "fp", full: "forte-piano", cn: "强起即弱", env: [0.46, 0.11, 0.11, 0.11, 0.11, 0.11] },
  { id: "subp", term: "sub. p", full: "subito piano", cn: "突然转弱", env: [0.38, 0.38, 0.38, 0.11, 0.11, 0.11] },
];

export function DynamicTermPlayer() {
  const [picked, setPicked] = useState("cresc");
  const [step, setStep] = useState(-1);
  const timers = useRef([]);
  const melody = ["G4", "G4", "G4", "G4", "G4", "G4"];

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async (item) => {
    setPicked(item.id);
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    item.env.forEach((vol, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setStep(i);
          playTone(noteFrequency(melody[i]), 0.42, "piano", vol);
        }, i * 380),
      );
    });
    timers.current.push(window.setTimeout(() => setStep(-1), item.env.length * 380 + 220));
  }, []);

  return (
    <div className="kv-envelopes">
      {DYNAMIC_TERMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`kv-envelope${picked === item.id ? " is-on" : ""}`}
          onClick={() => play(item)}
        >
          <span className="kv-envelope-head">
            <strong>{item.term}</strong>
            <span className="kv-envelope-full">{item.full}</span>
            <span className="kv-envelope-cn">{item.cn}</span>
          </span>
          <span className="kv-envelope-bars">
            {item.env.map((vol, i) => (
              <span
                key={i}
                className={picked === item.id && step === i ? "kv-envelope-bar is-on" : "kv-envelope-bar"}
                style={{ height: `${10 + (vol / 0.5) * 40}px` }}
              />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ── expression-term fingerprints (L8) ───────────────────────────────────── */

const CHARACTER_TERMS = [
  { id: "dolce", term: "dolce", cn: "甜美地", emoji: "🍬", anim: "sway", gap: 460, dur: 0.52, vol: 0.14, swell: 0.02, tint: "#5d8f46" },
  { id: "cantabile", term: "cantabile", cn: "如歌地", emoji: "🎤", anim: "breathe", gap: 440, dur: 0.5, vol: 0.2, swell: 0.06, tint: "#5d8f46" },
  { id: "tranquillo", term: "tranquillo", cn: "安静地", emoji: "🌙", anim: "drift", gap: 540, dur: 0.62, vol: 0.11, swell: 0, tint: "#5d8f46" },
  { id: "espressivo", term: "espressivo", cn: "有表情地", emoji: "🎭", anim: "emote", gap: 430, dur: 0.44, vol: 0.22, swell: 0.12, tint: "#2f6f8a" },
  { id: "leggiero", term: "leggiero", cn: "轻巧地", emoji: "🪶", anim: "hop", gap: 250, dur: 0.1, vol: 0.13, swell: 0, tint: "#2f6f8a" },
  { id: "agitato", term: "agitato", cn: "激动地", emoji: "⚡", anim: "shake", gap: 210, dur: 0.16, vol: 0.3, swell: 0.06, tint: "#b4472f" },
  { id: "marcato", term: "marcato", cn: "着重地", emoji: "🔨", anim: "stomp", gap: 400, dur: 0.26, vol: 0.34, swell: 0, accent: true, tint: "#b4472f" },
  { id: "risoluto", term: "risoluto", cn: "坚决地", emoji: "✊", anim: "firm", gap: 420, dur: 0.4, vol: 0.34, swell: 0, accent: true, tint: "#b4472f" },
];

const CHARACTER_MELODY = ["C5", "D5", "E5", "G5", "E5", "C5"];

function noteVolume(item, i) {
  const shape = item.swell ? Math.sin((i / (CHARACTER_MELODY.length - 1)) * Math.PI) * item.swell : 0;
  const accent = item.accent && i % 2 === 0 ? item.vol * 0.35 : 0;
  return Math.min(0.46, item.vol + shape + accent);
}

export function CharacterPlayer() {
  const [picked, setPicked] = useState("dolce");
  const [playingId, setPlayingId] = useState(null);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async (item) => {
    setPicked(item.id);
    setPlayingId(item.id);
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    CHARACTER_MELODY.forEach((name, i) => {
      timers.current.push(
        window.setTimeout(() => playTone(noteFrequency(name), item.dur, "piano", noteVolume(item, i)), i * item.gap),
      );
    });
    timers.current.push(
      window.setTimeout(() => setPlayingId(null), CHARACTER_MELODY.length * item.gap + 260),
    );
  }, []);

  const current = CHARACTER_TERMS.find((t) => t.id === picked);

  return (
    <div className="kv-stage">
      <div className="kv-characters">
        {CHARACTER_TERMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={[
              "kv-character",
              `anim-${item.anim}`,
              picked === item.id ? "is-on" : "",
              playingId === item.id ? "is-playing" : "",
            ].join(" ").trim()}
            style={{ "--kv-tint": item.tint }}
            onClick={() => play(item)}
          >
            <span className="kv-character-emoji" aria-hidden="true">{item.emoji}</span>
            <span className="kv-character-head">
              <strong>{item.term}</strong>
              <span>{item.cn}</span>
            </span>
            <span className="kv-character-print" aria-hidden="true">
              {CHARACTER_MELODY.map((name, i) => (
                <span
                  key={i}
                  className="kv-character-note"
                  style={{
                    width: `${(item.dur / 0.62) * 100}%`,
                    height: `${8 + (noteVolume(item, i) / 0.46) * 16}px`,
                    marginRight: `${((item.gap - item.dur * 1000) / 560) * 18}px`,
                  }}
                />
              ))}
            </span>
            <span className="kv-character-play">{playingId === item.id ? "♪ 正在演奏" : "▶ 点我听"}</span>
          </button>
        ))}
      </div>
      <div className="kv-insight">
        八张卡是同一条旋律 —— 换的只是语气。下面那排小格子是它的「演奏指纹」：宽=奏多长，高=奏多响，间距=断多开。
        现在选的是 <strong>{current.term}（{current.cn}）</strong>
      </div>
    </div>
  );
}

/* ── one dial, three languages (L8) ──────────────────────────────────────── */

const MULTILINGUAL_TEMPI = [
  { bpm: 50, it: "Largo", de: "Breit", fr: "Large", cn: "广板" },
  { bpm: 71, it: "Adagio", de: "Langsam", fr: "Lent", cn: "柔板" },
  { bpm: 92, it: "Andante", de: "Gehend", fr: "Allant", cn: "行板" },
  { bpm: 114, it: "Moderato", de: "Mäßig", fr: "Modéré", cn: "中板" },
  { bpm: 144, it: "Allegro", de: "Schnell", fr: "Vite", cn: "快板" },
  { bpm: 184, it: "Presto", de: "Sehr schnell", fr: "Très vite", cn: "急板" },
];

export function MultilingualTempo() {
  const [picked, setPicked] = useState(4);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async (index) => {
    setPicked(index);
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const beatMs = 60000 / MULTILINGUAL_TEMPI[index].bpm;
    for (let i = 0; i < 8; i += 1) {
      timers.current.push(
        window.setTimeout(() => playTone(i % 4 === 0 ? 660 : 480, 0.12, "piano", i % 4 === 0 ? 0.28 : 0.16), i * beatMs),
      );
    }
  }, []);

  return (
    <div className="kv-stage">
      <div className="kv-lang-grid">
        <div className="kv-lang-col is-head">
          <span className="kv-lang-tag">速度</span>
          <span className="kv-lang-tag">意大利语</span>
          <span className="kv-lang-tag">德语</span>
          <span className="kv-lang-tag">法语</span>
        </div>
        {MULTILINGUAL_TEMPI.map((row, i) => (
          <button
            key={row.bpm}
            type="button"
            className={`kv-lang-col${picked === i ? " is-on" : ""}`}
            onClick={() => play(i)}
          >
            <span className="kv-lang-bpm">{row.bpm}<small>BPM</small><em>{row.cn}</em></span>
            <span className="kv-lang-word is-it">{row.it}</span>
            <span className="kv-lang-word">{row.de}</span>
            <span className="kv-lang-word">{row.fr}</span>
          </button>
        ))}
      </div>
      <div className="kv-insight">竖着看是同一个速度 —— 三种语言写的是同一件事，点一列就能听到它有多快</div>
    </div>
  );
}

/* ── forgetting curve (L8) ───────────────────────────────────────────────── */

const CURVE_DAYS = 30;

// Ebbinghaus-shaped decay toward a residual floor, reset and slowed by each review
const RETENTION_FLOOR = 18;

function retentionSeries(reviewDays) {
  const points = [];
  let lastReview = 0;
  let strength = 1.6;
  for (let day = 0; day <= CURVE_DAYS; day += 0.5) {
    if (reviewDays.includes(day)) {
      lastReview = day;
      strength *= 2.1;
      points.push({ day, value: 100, review: true });
      continue;
    }
    const value = RETENTION_FLOOR + (100 - RETENTION_FLOOR) * Math.exp(-(day - lastReview) / strength);
    points.push({ day, value, review: false });
  }
  return points;
}

export function ForgettingCurve() {
  const [reviewed, setReviewed] = useState(true);
  const reviewDays = [1, 3, 7, 14];
  const series = retentionSeries(reviewed ? reviewDays : []);
  const W = 440;
  const H = 170;
  const x = (day) => 34 + (day / CURVE_DAYS) * (W - 54);
  const y = (value) => H - 30 - (value / 100) * (H - 54);

  const path = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.day).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const final = series[series.length - 1].value;

  return (
    <div className="kv-stage">
      <div className="kv-controls kv-controls-tabs">
        <button type="button" className={`kv-chip${reviewed ? " is-on" : ""}`} onClick={() => setReviewed(true)}>
          按间隔复习
        </button>
        <button type="button" className={`kv-chip${!reviewed ? " is-on" : ""}`} onClick={() => setReviewed(false)}>
          学完就不管
        </button>
      </div>
      <div className="kv-curve">
        <svg viewBox={`0 0 ${W} ${H}`} className="kv-curve-svg" role="img" aria-label="遗忘曲线">
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1="34" y1={y(v)} x2={W - 20} y2={y(v)} className="kv-curve-grid" />
              <text x="28" y={y(v) + 4} className="kv-curve-axis" textAnchor="end">{v}</text>
            </g>
          ))}
          {[0, 7, 14, 21, 30].map((d) => (
            <text key={d} x={x(d)} y={H - 10} className="kv-curve-axis" textAnchor="middle">{d}天</text>
          ))}
          <path d={path} className={reviewed ? "kv-curve-path is-good" : "kv-curve-path"} />
          {reviewed &&
            reviewDays.map((d) => (
              <g key={d}>
                <line x1={x(d)} y1={y(100)} x2={x(d)} y2={y(0)} className="kv-curve-mark" />
                <circle cx={x(d)} cy={y(100)} r="4.5" className="kv-curve-dot" />
              </g>
            ))}
        </svg>
      </div>
      <div className="kv-insight">
        30 天后还记得 <strong>{Math.round(final)}%</strong>
        {reviewed ? " —— 每次复习都把曲线拉回顶端，而且下滑得一次比一次慢" : " —— 不复习的话，一周之内就掉得差不多了"}
      </div>
    </div>
  );
}

/* ── tempo terms with a pulse that runs at the real BPM (L8) ─────────────── */

const TEMPO_CHARACTERS = [
  { id: "largo", term: "Largo", cn: "广板", range: "40–60", bpm: 50, emoji: "🐢", tint: "#2f6f8a" },
  { id: "adagio", term: "Adagio", cn: "柔板", range: "66–76", bpm: 71, emoji: "🐘", tint: "#2f6f8a" },
  { id: "andante", term: "Andante", cn: "行板", range: "76–108", bpm: 92, emoji: "🚶", tint: "#5d8f46" },
  { id: "moderato", term: "Moderato", cn: "中板", range: "108–120", bpm: 114, emoji: "🚲", tint: "#5d8f46" },
  { id: "allegro", term: "Allegro", cn: "快板", range: "120–168", bpm: 144, emoji: "🏃", tint: "#b4472f" },
  { id: "presto", term: "Presto", cn: "急板", range: "168–200", bpm: 184, emoji: "🏎️", tint: "#b4472f" },
  { id: "prestissimo", term: "Prestissimo", cn: "最急板", range: "200+", bpm: 208, emoji: "🚀", tint: "#b4472f" },
];

export function TempoCharacter() {
  const [picked, setPicked] = useState("andante");
  const [playingId, setPlayingId] = useState(null);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const play = useCallback(async (item) => {
    setPicked(item.id);
    setPlayingId(item.id);
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const beatMs = 60000 / item.bpm;
    for (let i = 0; i < 12; i += 1) {
      timers.current.push(
        window.setTimeout(
          () => playTone(i % 4 === 0 ? 660 : 480, 0.11, "piano", i % 4 === 0 ? 0.28 : 0.15),
          i * beatMs,
        ),
      );
    }
    timers.current.push(window.setTimeout(() => setPlayingId(null), 12 * beatMs + 200));
  }, []);

  const current = TEMPO_CHARACTERS.find((t) => t.id === picked);

  return (
    <div className="kv-stage">
      <div className="kv-tempo-cards">
        {TEMPO_CHARACTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={[
              "kv-tempo-card",
              picked === item.id ? "is-on" : "",
              playingId === item.id ? "is-playing" : "",
            ].join(" ").trim()}
            style={{ "--kv-tint": item.tint, "--kv-beat": `${60 / item.bpm}s` }}
            onClick={() => play(item)}
          >
            <span className="kv-tempo-emoji" aria-hidden="true">{item.emoji}</span>
            <span className="kv-tempo-term">{item.term}</span>
            <span className="kv-tempo-cn">{item.cn}</span>
            <span className="kv-tempo-range">{item.range} BPM</span>
          </button>
        ))}
      </div>
      <div className="kv-insight">
        点一张卡：节拍器按那个速度敲十二下，图标也跟着<strong>用同样的速度</strong>跳。
        现在是 <strong>{current.term}（{current.cn}）约 {current.bpm} BPM</strong>
      </div>
    </div>
  );
}


/* ── ornament signs ──────────────────────────────────────────────────────── */

/**
 * The real ornament marks, drawn rather than approximated with punctuation, so
 * the sign on the card is the sign the student will meet in a score.
 */
export function OrnamentSign({ kind, x, y, scale = 1, className = "kv-orn" }) {
  // coerce: a string y would turn `y + 4` into string concatenation
  const cx = Number(x);
  const cy = Number(y);
  const t = `translate(${cx} ${cy}) scale(${scale})`;
  if (kind === "tr") {
    return (
      <text x={cx} y={cy + 4} className={`${className}-text`} textAnchor="middle">tr</text>
    );
  }
  if (kind === "mordent" || kind === "mordent-lower") {
    return (
      <g transform={t}>
        <path d="M -10 3 L -5 -3 L 0 3 L 5 -3 L 10 3" className={className} />
        {kind === "mordent-lower" && <path d="M 0 -7 L 0 7" className={className} />}
      </g>
    );
  }
  if (kind === "turn") {
    return (
      <g transform={t}>
        <path d="M -10 2 C -10 -5, -3 -6, 0 0 C 3 6, 10 5, 10 -2" className={className} />
      </g>
    );
  }
  if (kind === "grace") {
    return (
      <g transform={t}>
        <ellipse cx="-4" cy="3" rx="3.4" ry="2.4" transform="rotate(-16 -4 3)" className={`${className}-fill`} />
        <path d="M -1 3 L -1 -7" className={className} />
        <path d="M -5 -2 L 3 -6" className={className} />
      </g>
    );
  }
  return null;
}

/* ── rhythm on a real staff, lighting up as it plays ─────────────────────── */

const RS_SPACE = 12;
const RS_W = 560;

/**
 * One bar of rhythm written on a staff. Notes are spaced in proportion to their
 * length, and each one lights up at the moment it sounds.
 *
 * events: [{ beats, rest?, accent?, tie?, name?, label? }]
 * beams:  [{ from, to, count }]
 */
export function RhythmStaff({
  meter = "4/4",
  totalBeats = 4,
  tempo = 92,
  events,
  beams = [],
  tuplets = [],
  pitch = "B4",
  note = null,
  beatMarks = true,
}) {
  const [active, setActive] = useState(-1);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const padTop = 44;
  const padBottom = 44;
  const line5Y = padTop;
  const line1Y = padTop + 4 * RS_SPACE;
  const height = padTop + 4 * RS_SPACE + padBottom;
  const noteY = line1Y - 4 * (RS_SPACE / 2); // middle line

  const startX = 92;
  const span = RS_W - startX - 34;

  let cursor = 0;
  const laid = events.map((event) => {
    const at = cursor;
    cursor += event.beats;
    return { ...event, at, x: startX + (at / totalBeats) * span };
  });

  const play = useCallback(async () => {
    await unlockAudioSystem();
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    const beatMs = 60000 / tempo;
    laid.forEach((event, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setActive(i);
          if (event.rest || event.tie) return;
          const vol = event.accent ? 0.4 : 0.22;
          playTone(noteFrequency(event.name || pitch), Math.min(1.5, event.beats * 0.55), "piano", vol);
        }, event.at * beatMs),
      );
    });
    timers.current.push(window.setTimeout(() => setActive(-1), totalBeats * beatMs + 260));
  }, [laid, pitch, tempo, totalBeats]);

  const [meterTop, meterBottom] = meter.split("/");

  return (
    <div className="kv-rstaff">
      <div className="kv-rstaff-head">
        <button type="button" className="kv-play" onClick={play}>▶ 听</button>
        {note && <span className="kv-controls-note">{note}</span>}
      </div>
      <svg viewBox={`0 0 ${RS_W} ${height}`} className="kv-rstaff-svg" role="img" aria-label={`${meter} 节奏谱例`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="14" y1={line5Y + i * RS_SPACE} x2={RS_W - 14} y2={line5Y + i * RS_SPACE} className="kv-staff-line" />
        ))}

        <text x="24" y={line1Y - RS_SPACE + 6} className="kv-glyph" style={{ fontSize: RS_SPACE * 3.7, fontFamily: GLYPH_FONT }}>
          𝄞
        </text>
        <text x={meterTop.length > 1 ? 72 : 66} y={line1Y - 2.6 * RS_SPACE} className="kv-rstaff-meter">{meterTop}</text>
        <text x={meterTop.length > 1 ? 72 : 66} y={line1Y - 0.3 * RS_SPACE} className="kv-rstaff-meter">{meterBottom}</text>

        {/* beat ruler under the staff */}
        {beatMarks &&
          Array.from({ length: totalBeats }, (_, i) => {
            const x = startX + (i / totalBeats) * span;
            return (
              <g key={`beat-${i}`}>
                <line x1={x} y1={line1Y + 6} x2={x} y2={line1Y + 13} className="kv-rstaff-tick" />
                <text x={x} y={line1Y + 26} className="kv-rstaff-beat">{i + 1}</text>
              </g>
            );
          })}

        {/* beams */}
        {beams.map((group, gi) => {
          const a = laid[group.from];
          const b = laid[group.to];
          if (!a || !b) return null;
          return Array.from({ length: group.count ?? 1 }, (_, k) => (
            <rect
              key={`beam-${gi}-${k}`}
              x={a.x - 7.8}
              y={noteY + 3.4 * RS_SPACE - k * 5.4 - 3.4}
              width={b.x - a.x + 15.6}
              height="3.4"
              className="kv-beam"
            />
          ));
        })}

        {laid.map((event, i) => {
          const on = active === i;
          const hollow = event.beats >= 2;
          if (event.rest) {
            const glyph = event.beats >= 4 ? "𝄻" : event.beats >= 2 ? "𝄼" : event.beats >= 1 ? "𝄽" : "𝄾";
            return (
              <g key={i} className={on ? "kv-rs-event is-on" : "kv-rs-event"}>
                {on && <rect x={event.x - 14} y={line5Y - 4} width="28" height={4 * RS_SPACE + 8} rx="7" className="kv-rs-glow" />}
                <text x={event.x} y={line1Y - 2 * RS_SPACE + 6} className="kv-rest-glyph-staff" style={{ fontSize: RS_SPACE * 2.6, fontFamily: GLYPH_FONT }}>
                  {glyph}
                </text>
              </g>
            );
          }
          return (
            <g key={i} className={on ? "kv-rs-event is-on" : "kv-rs-event"}>
              {on && <circle cx={event.x} cy={noteY} r="15" className="kv-rs-glow" />}
              <ellipse
                cx={event.x}
                cy={noteY}
                rx="7.6"
                ry="5.4"
                transform={`rotate(-16 ${event.x} ${noteY})`}
                className={hollow ? "kv-notehead is-hollow" : "kv-notehead"}
              />
              {event.beats < 4 && (
                <line x1={event.x - 7} y1={noteY} x2={event.x - 7} y2={noteY + 3.4 * RS_SPACE} className="kv-stem" />
              )}
              {event.accent && (
                <text x={event.x} y={line5Y - 12} className="kv-rs-accent">&gt;</text>
              )}
              {event.label && (
                <text x={event.x} y={line5Y - 12} className="kv-rs-label">{event.label}</text>
              )}
            </g>
          );
        })}

        {/* ties */}
        {laid.map((event, i) =>
          event.tie && laid[i - 1] ? (
            <path
              key={`tie-${i}`}
              d={`M ${laid[i - 1].x + 5} ${noteY + 13} Q ${(laid[i - 1].x + event.x) / 2} ${noteY + 26} ${event.x - 5} ${noteY + 13}`}
              className="kv-tie"
            />
          ) : null,
        )}

        {tuplets.map((group, gi) => {
          const a = laid[group.from];
          const b = laid[group.to];
          if (!a || !b) return null;
          const y = line5Y - 16;
          return (
            <g key={`tup-${gi}`}>
              <path d={`M ${a.x - 8} ${y + 7} L ${a.x - 8} ${y} L ${b.x + 8} ${y} L ${b.x + 8} ${y + 7}`} className="kv-tuplet" />
              <rect x={(a.x + b.x) / 2 - 9} y={y - 8} width="18" height="16" rx="4" className="kv-tuplet-chip" />
              <text x={(a.x + b.x) / 2} y={y + 4} className="kv-tuplet-text">{group.label ?? "3"}</text>
            </g>
          );
        })}

        <line x1={RS_W - 16} y1={line5Y} x2={RS_W - 16} y2={line1Y} className="kv-bl" />
      </svg>
    </div>
  );
}
