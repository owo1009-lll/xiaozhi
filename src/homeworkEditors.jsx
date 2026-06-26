import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tag } from "./uiBasics";
import { BK, NT, WK, nFreq, playTone, unlockAudioSystem } from "./musicAudio";
import { normalizeRhythmSubmission } from "./homeworkSummary";
import {
  RHYTHM_SYMBOLS,
  STAFF_ROWS,
  calculateMeasureDuration,
  getMeterBeats,
  normalizeRhythmEntry,
  normalizeRhythmMeasures,
} from "./homeworkModel";

function HomeworkImageUploader({
  images,
  onAddFiles,
  onRemoveImage,
  fileInputRef,
  cameraInputRef,
}) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>拍照上传与图片附件</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            移动端可直接拍摄练习纸、节奏型或五线谱作业。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => cameraInputRef.current?.click()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "var(--gradient-accent)", color: "#fdf6e3", cursor: "pointer" }}>
            拍照上传
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", color: "var(--color-text-primary)", cursor: "pointer" }}>
            相册上传
          </button>
        </div>
      </div>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onAddFiles} />
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onAddFiles} />
      {images.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {images.map((image, index) => (
            <div key={`${image.name}-${index}`} style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(120,80,40,0.18)", background: "rgba(94,60,28,0.06)" }}>
              <img src={image.dataUrl} alt={image.name || `作业图片 ${index + 1}`} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
              <div style={{ padding: 8, fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {image.name || `图片 ${index + 1}`}
              </div>
              <button onClick={() => onRemoveImage(index)} style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.96)", cursor: "pointer", fontSize: 12 }}>
                x
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 14, borderRadius: 10, background: "rgba(94,60,28,0.06)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          暂未上传图片。如作业需要节奏书写、五线谱记谱或手写分析，请拍照后在此提交。
        </div>
      )}
    </div>
  );
}

const GLYPH_SPEC = {
  whole: { filled: false, stem: false, flags: 0, dot: false },
  half: { filled: false, stem: true, flags: 0, dot: false },
  quarter: { filled: true, stem: true, flags: 0, dot: false },
  eighth: { filled: true, stem: true, flags: 1, dot: false },
  sixteenth: { filled: true, stem: true, flags: 2, dot: false },
  "dotted-half": { filled: false, stem: true, flags: 0, dot: true },
  "dotted-quarter": { filled: true, stem: true, flags: 0, dot: true },
  "dotted-eighth": { filled: true, stem: true, flags: 1, dot: true },
};
const RHYTHM_NOTE_SYMBOLS = RHYTHM_SYMBOLS.filter((symbol) => symbol.kind === "note");

function NoteGlyph({ x, y, id, color = "#3f6e2f", scale = 1 }) {
  const spec = GLYPH_SPEC[id] || GLYPH_SPEC.quarter;
  const rx = 6.4 * scale;
  const ry = 4.8 * scale;
  const stemX = x + 5.6 * scale;
  const stemTop = y - 30 * scale;
  return (
    <g>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={spec.filled ? color : "none"} stroke={color} strokeWidth={1.7 * scale} transform={`rotate(-15 ${x} ${y})`} />
      {spec.stem ? <line x1={stemX} y1={y - 1} x2={stemX} y2={stemTop} stroke={color} strokeWidth={1.8 * scale} /> : null}
      {Array.from({ length: spec.flags }, (_, flagIndex) => (
        <path key={flagIndex} d={`M ${stemX} ${stemTop + flagIndex * 8 * scale} q ${11 * scale} ${5 * scale} ${8 * scale} ${15 * scale}`} fill="none" stroke={color} strokeWidth={1.8 * scale} strokeLinecap="round" />
      ))}
      {spec.dot ? <circle cx={x + 12 * scale} cy={y} r={2 * scale} fill={color} /> : null}
    </g>
  );
}

function RhythmPadModal({ rhythmSubmission, onChange, onPlay, onClose }) {
  const measure = useMemo(() => normalizeRhythmMeasures(rhythmSubmission?.measures || [[], []])[0] || [], [rhythmSubmission?.measures]);
  const [selectedId, setSelectedId] = useState("quarter");

  const placeAtRow = useCallback((row) => {
    const symbol = RHYTHM_SYMBOLS.find((item) => item.id === selectedId) || RHYTHM_SYMBOLS[2];
    onChange((prev) => {
      const next = (prev.measures || [[], []]).map((entryRow) => [...entryRow]);
      next[0].push({ ...normalizeRhythmEntry(symbol), row, tieToNext: false });
      return { ...prev, measures: next, activeMeasure: 0 };
    });
  }, [onChange, selectedId]);
  const undo = () => onChange((prev) => {
    const next = (prev.measures || [[], []]).map((entryRow) => [...entryRow]);
    next[0].pop();
    return { ...prev, measures: next };
  });
  const clear = () => onChange((prev) => {
    const next = (prev.measures || [[], []]).map((entryRow) => [...entryRow]);
    next[0] = [];
    return { ...prev, measures: next };
  });

  const startX = 96;
  const spacing = 60;
  const rowY = (row) => 70 + (Number(row ?? 5) - 1) * 10;
  const staffWidth = Math.max(660, startX + measure.length * spacing + 60);
  const iconBtn = { width: 52, height: 52, borderRadius: 999, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", color: "#3f6e2f", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <FullscreenInputModal onClose={onClose}>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${staffWidth} 200`} style={{ width: "100%", minWidth: 660, height: "auto", background: "rgba(94,60,28,0.05)", borderRadius: 12, border: "1px solid rgba(120,80,40,0.24)" }}>
          {[1, 3, 5, 7, 9].map((row) => <line key={row} x1="44" y1={rowY(row)} x2={staffWidth - 24} y2={rowY(row)} stroke="rgba(63,45,28,0.5)" strokeWidth="1.3" />)}
          <text x="52" y={rowY(7) + 16} fontSize="54" fill="#3f2d1c">𝄞</text>
          {STAFF_ROWS.map((item) => (
            <rect key={`band-${item.row}`} x="44" y={rowY(item.row) - 5} width={staffWidth - 68} height="10" fill="transparent" style={{ cursor: "pointer" }} onClick={() => placeAtRow(item.row)} />
          ))}
          {measure.map((entry, index) => (
            <g key={`${entry.id}-${index}`} style={{ pointerEvents: "none" }}>
              {Number(entry.row ?? 5) >= 11 ? <line x1={startX + index * spacing - 11} y1={rowY(11)} x2={startX + index * spacing + 11} y2={rowY(11)} stroke="rgba(63,45,28,0.5)" strokeWidth="1.3" /> : null}
              <NoteGlyph x={startX + index * spacing} y={rowY(entry.row)} id={entry.id} />
            </g>
          ))}
        </svg>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {RHYTHM_NOTE_SYMBOLS.map((symbol) => {
          const active = selectedId === symbol.id;
          return (
            <button key={symbol.id} onClick={() => setSelectedId(symbol.id)} style={{ width: 58, height: 68, borderRadius: 12, border: active ? "1px solid #4f8035" : "1px solid rgba(120,80,40,0.3)", background: active ? "rgba(120,80,40,0.24)" : "#f6e8c6", cursor: "pointer", padding: 0 }}>
              <svg viewBox="0 0 58 68" width="58" height="68"><NoteGlyph x={26} y={46} id={symbol.id} color={active ? "#3f2d1c" : "#3f6e2f"} scale={1.1} /></svg>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button onClick={() => onPlay?.(measure)} style={iconBtn}>▶</button>
        <button onClick={undo} style={iconBtn}>↶</button>
        <button onClick={clear} style={iconBtn}>✕</button>
      </div>
    </FullscreenInputModal>
  );
}

function RhythmHomeworkEditorV2({ rhythmSubmission, onChange, onPlay }) {
  const [rhythmPadOpen, setRhythmPadOpen] = useState(false);
  const normalizedSubmission = useMemo(() => normalizeRhythmSubmission(rhythmSubmission), [rhythmSubmission]);
  const activeMeasure = normalizedSubmission?.activeMeasure || 0;
  const measures = useMemo(() => normalizeRhythmMeasures(normalizedSubmission?.measures || [[], []]), [normalizedSubmission?.measures]);
  const rhythmSymbols = useMemo(() => RHYTHM_SYMBOLS.map((symbol) => normalizeRhythmEntry(symbol)), []);
  const targetBeats = getMeterBeats(normalizedSubmission?.meter);

  const appendSymbol = useCallback((symbol) => {
    onChange((prev) => {
      const nextMeasures = (prev.measures || [[], []]).map((measure) => [...measure]);
      nextMeasures[prev.activeMeasure || 0].push({ ...normalizeRhythmEntry(symbol), tieToNext: false });
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
    <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>节奏编辑器</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            按小节输入节奏，系统会检查每小节是否达到拍号要求的拍数。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={normalizedSubmission?.meter || "4/4"} onChange={(e) => onChange((prev) => ({ ...prev, meter: e.target.value }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6" }}>
            {["2/4", "3/4", "4/4", "6/8"].map((meter) => <option key={meter} value={meter}>{meter}</option>)}
          </select>
          {[0, 1].map((measureIndex) => (
            <button key={measureIndex} onClick={() => onChange((prev) => ({ ...prev, activeMeasure: measureIndex }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(120,80,40,0.2)", background: activeMeasure === measureIndex ? "var(--gradient-accent)" : "rgba(94,60,28,0.07)", color: activeMeasure === measureIndex ? "#fdf6e3" : "var(--color-text-primary)", cursor: "pointer" }}>
              第 {measureIndex + 1} 小节
            </button>
          ))}
        </div>
      </div>
      <button onClick={() => setRhythmPadOpen(true)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "none", background: "var(--gradient-accent)", color: "#fdf6e3", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10, boxShadow: "0 8px 20px rgba(93,143,70,0.35)" }}>
        🥁 打开节奏板（全屏 · 点击记录）
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 10 }}>
        {rhythmSymbols.map((symbol) => (
          <button key={symbol.id} onClick={() => appendSymbol(symbol)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.18)", background: "rgba(94,60,28,0.06)", cursor: "pointer", textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>{symbol.label}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>{symbol.kind === "tie" ? "连接相邻同音" : `${symbol.duration} 拍`}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {measures.map((measure, index) => {
          const currentBeats = calculateMeasureDuration(measure);
          const status = currentBeats === targetBeats ? "完整" : currentBeats < targetBeats ? "不足" : "超出";
          const statusColor = currentBeats === targetBeats ? "#7ee2a8" : currentBeats < targetBeats ? "#e0a955" : "#f6a6a6";
          return (
            <div key={`measure-v2-${index}`} style={{ padding: 10, borderRadius: 10, border: activeMeasure === index ? "1px solid rgba(93,143,70,0.5)" : "1px solid rgba(120,80,40,0.22)", background: activeMeasure === index ? "rgba(93,143,70,0.12)" : "#f6e8c6" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-primary)" }}>第 {index + 1} 小节</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>{`${currentBeats}/${targetBeats} 拍 - ${status}`}</div>
              </div>
              <div style={{ minHeight: 58, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {measure.length ? measure.map((item, itemIndex) => (
                  <span key={`${item.id}-${itemIndex}`} style={{ padding: "6px 8px", borderRadius: 999, background: "var(--gradient-accent)", color: "#fdf6e3", fontSize: 10 }}>
                    {item.label}{item.tieToNext ? "~" : ""}
                  </span>
                )) : <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>本小节为空。</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={() => onPlay?.(measures[activeMeasure] || [])} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "var(--gradient-accent)", color: "#fdf6e3", cursor: "pointer" }}>播放当前小节</button>
        <button onClick={toggleTieOnLast} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: "pointer" }}>最后一音加连音线</button>
        <button onClick={removeLastSymbol} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: "pointer" }}>撤销上一步</button>
        <button onClick={clearMeasure} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: "pointer" }}>清空当前小节</button>
        <button onClick={resetAll} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", cursor: "pointer" }}>重置两个小节</button>
      </div>
      {rhythmPadOpen && <RhythmPadModal rhythmSubmission={normalizedSubmission} onChange={onChange} onPlay={onPlay} onClose={() => setRhythmPadOpen(false)} />}
    </div>
  );
}

function StaffPadModal({ staffSubmission, onChange, onClose }) {
  const clef = staffSubmission?.clef || "treble";
  const accidental = staffSubmission?.accidental || "natural";
  const noteValue = staffSubmission?.noteValue || "quarter";
  const notes = staffSubmission?.notes || [];

  const slotX = (slot) => 140 + slot * 78;
  const rowY = (row) => 48 + row * 16;
  const selStyle = { padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", fontSize: 12 };
  const ctrlBtn = { padding: "7px 14px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", color: "var(--color-text-primary)", cursor: "pointer" };

  const setField = (field, value) => onChange((prev) => ({ ...prev, [field]: value }));
  const placeAt = (slot, row) => {
    const pitch = STAFF_ROWS.find((item) => item.row === row)?.label;
    onChange((prev) => {
      const nextNotes = (prev.notes || []).filter((item) => item.slot !== slot);
      nextNotes.push({ slot, row, pitch, accidental: prev.accidental || "natural", noteValue: prev.noteValue || "quarter", tieToNext: false });
      return { ...prev, notes: nextNotes, activeSlot: slot };
    });
  };
  const undo = () => onChange((prev) => {
    const list = prev.notes || [];
    if (!list.length) return prev;
    const maxSlot = Math.max(...list.map((item) => item.slot));
    return { ...prev, notes: list.filter((item) => item.slot !== maxSlot) };
  });
  const clear = () => onChange((prev) => ({ ...prev, notes: [] }));
  const accGlyph = (acc) => (acc === "sharp" ? "♯" : acc === "flat" ? "♭" : "");

  return (
    <FullscreenInputModal title="五线谱输入" subtitle="点击谱表放置音符 · 上方选择谱号、变音记号与时值" onClose={onClose}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select value={clef} onChange={(e) => setField("clef", e.target.value)} style={selStyle}><option value="treble">高音谱号</option><option value="bass">低音谱号</option></select>
        <select value={accidental} onChange={(e) => setField("accidental", e.target.value)} style={selStyle}><option value="natural">还原</option><option value="sharp">升号</option><option value="flat">降号</option></select>
        <select value={noteValue} onChange={(e) => setField("noteValue", e.target.value)} style={selStyle}><option value="whole">全音符</option><option value="half">二分音符</option><option value="quarter">四分音符</option></select>
        <button onClick={undo} style={ctrlBtn}>撤销</button>
        <button onClick={clear} style={ctrlBtn}>清空</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", overflowX: "auto" }}>
        <svg viewBox="0 0 760 290" style={{ width: "100%", minWidth: 680, height: "auto", background: "rgba(94,60,28,0.05)", borderRadius: 12, border: "1px solid rgba(120,80,40,0.24)" }}>
          {[1, 3, 5, 7, 9].map((row) => <line key={`line-${row}`} x1="96" y1={rowY(row)} x2="710" y2={rowY(row)} stroke="rgba(63,45,28,0.55)" strokeWidth="1.4" />)}
          <text x="56" y={rowY(7) + 14} fontSize="58" fill="#3f2d1c">{clef === "bass" ? "𝄢" : "𝄞"}</text>
          {Array.from({ length: 8 }, (_, slot) => (
            <g key={`slot-${slot}`}>
              <line x1={slotX(slot)} y1="40" x2={slotX(slot)} y2="248" stroke="rgba(94,60,28,0.07)" strokeWidth="1" />
              <text x={slotX(slot)} y="270" textAnchor="middle" fontSize="11" fill="rgba(63,45,28,0.45)">{slot + 1}</text>
            </g>
          ))}
          {Array.from({ length: 8 }, (_, slot) => STAFF_ROWS.map((item) => (
            <rect key={`cell-${slot}-${item.row}`} x={slotX(slot) - 34} y={rowY(item.row) - 8} width="68" height="16" fill="transparent" style={{ cursor: "pointer" }} onClick={() => placeAt(slot, item.row)} />
          )))}
          {notes.map((note) => {
            const x = slotX(note.slot);
            const y = rowY(note.row);
            const filled = note.noteValue === "quarter";
            const stem = note.noteValue !== "whole";
            const glyph = accGlyph(note.accidental);
            return (
              <g key={`note-${note.slot}`}>
                {glyph ? <text x={x - 18} y={y + 5} fontSize="15" fill="#3f6e2f">{glyph}</text> : null}
                <ellipse cx={x} cy={y} rx="9" ry="6.5" fill={filled ? "#3f6e2f" : "#f6e8c6"} stroke="#3f6e2f" strokeWidth="1.6" transform={`rotate(-10 ${x} ${y})`} />
                {stem ? <line x1={x + 8} y1={y} x2={x + 8} y2={y - 30} stroke="#3f6e2f" strokeWidth="1.8" /> : null}
              </g>
            );
          })}
          {STAFF_ROWS.map((item) => <text key={`lab-${item.row}`} x="722" y={rowY(item.row) + 4} fontSize="10" fill="rgba(244,239,227,0.4)">{item.label}</text>)}
        </svg>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center" }}>点击位置即可在该格放置音符 · 再次点击已填写位置会替换原音符。</div>
    </FullscreenInputModal>
  );
}

function StaffHomeworkEditorV2({ staffSubmission, onChange }) {
  const [staffPadOpen, setStaffPadOpen] = useState(false);
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
    <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>五线谱订正编辑器</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            调整谱号、变音记号、音符时值与连音线，用于大学乐理作业订正。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={staffSubmission?.clef || "treble"} onChange={(e) => onChange((prev) => ({ ...prev, clef: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)" }}>
            <option value="treble">高音谱号</option>
            <option value="bass">低音谱号</option>
          </select>
          <select value={staffSubmission?.accidental || "natural"} onChange={(e) => onChange((prev) => ({ ...prev, accidental: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)" }}>
            <option value="natural">还原</option>
            <option value="sharp">升号</option>
            <option value="flat">降号</option>
          </select>
          <select value={staffSubmission?.noteValue || "quarter"} onChange={(e) => onChange((prev) => ({ ...prev, noteValue: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)" }}>
            <option value="whole">全音符</option>
            <option value="half">二分音符</option>
            <option value="quarter">四分音符</option>
          </select>
        </div>
      </div>
      <button onClick={() => setStaffPadOpen(true)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "none", background: "var(--gradient-accent)", color: "#fdf6e3", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10, boxShadow: "0 8px 20px rgba(93,143,70,0.35)" }}>
        🎼 打开五线谱（全屏 · 点击放置音符）
      </button>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {noteSlots.map((item, slot) => (
          <button key={`slot-v2-${slot}`} onClick={() => onChange((prev) => ({ ...prev, activeSlot: slot }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(120,80,40,0.2)", background: staffSubmission?.activeSlot === slot ? "var(--gradient-accent)" : "rgba(94,60,28,0.07)", color: staffSubmission?.activeSlot === slot ? "#fdf6e3" : "var(--color-text-primary)", cursor: "pointer" }}>
            第 {slot + 1} 格{item ? ` - ${item.pitch}` : ""}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 360 220" style={{ width: "100%", maxWidth: 540, height: "auto", display: "block", margin: "0 auto", background: "rgba(94,60,28,0.05)", borderRadius: 12, border: "1px solid rgba(120,80,40,0.22)" }}>
        {[0, 1, 2, 3, 4].map((line) => {
          const y = 54 + line * 22;
          return <line key={`staff-line-v2-${line}`} x1="32" y1={y} x2="328" y2={y} stroke="rgba(63,45,28,0.6)" strokeWidth="1.3" />;
        })}
        <text x="20" y="68" fontSize="28" fill="#3f2d1c">{staffSubmission?.clef === "bass" ? "𝄢" : "𝄞"}</text>
        {Array.from({ length: 8 }, (_, slot) => {
          const x = 78 + slot * 30;
          return <g key={`guide-v2-${slot}`}><line x1={x} y1="38" x2={x} y2="170" stroke="rgba(120,80,40,0.14)" strokeWidth="1" /><text x={x} y="192" textAnchor="middle" fontSize="10" fill={staffSubmission?.activeSlot === slot ? "#3f6e2f" : "rgba(63,45,28,0.5)"}>{slot + 1}</text></g>;
        })}
        {STAFF_ROWS.map((item) => {
          const y = 32 + item.row * 12;
          return <g key={`row-v2-${item.row}`} onClick={() => placeNote(item.row)} style={{ cursor: "pointer" }}><rect x="58" y={y - 6} width="250" height="12" fill="transparent" /><text x="332" y={y + 4} fontSize="10" fill="rgba(63,45,28,0.5)">{item.label}</text></g>;
        })}
        {sortedNotes.map((note) => {
          const x = 78 + note.slot * 30;
          const y = 32 + note.row * 12;
          const accidentalLabel = note.accidental === "sharp" ? "#" : note.accidental === "flat" ? "b" : "";
          const isFilled = note.noteValue === "quarter";
          const showStem = note.noteValue !== "whole";
          return (
            <g key={`note-v2-${note.slot}-${note.pitch}`}>
              {accidentalLabel ? <text x={x - 14} y={y + 5} fontSize="13" fill="#3f2d1c">{accidentalLabel}</text> : null}
              <ellipse cx={x} cy={y} rx="8" ry="6" fill={isFilled ? "#3f6e2f" : "#f6e8c6"} stroke="rgba(63,45,28,0.6)" strokeWidth="1.3" />
              {showStem ? <line x1={x + 7} y1={y} x2={x + 7} y2={y - 28} stroke="rgba(63,45,28,0.6)" strokeWidth="1.4" /> : null}
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
          return <path key={`tie-v2-${note.slot}`} d={`M ${x1 - 4} ${y} Q ${(x1 + x2) / 2} ${y + 14} ${x2 + 4} ${y}`} fill="none" stroke="rgba(63,45,28,0.6)" strokeWidth="1.3" />;
        })}
      </svg>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={toggleTieForCurrent} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: "pointer" }}>切换当前格连音线</button>
        <button onClick={removeCurrentSlot} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: "pointer" }}>删除当前格</button>
        <button onClick={resetAll} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", cursor: "pointer" }}>重置五线谱</button>
      </div>
      {staffPadOpen && <StaffPadModal staffSubmission={staffSubmission} onChange={onChange} onClose={() => setStaffPadOpen(false)} />}
    </div>
  );
}

const PIANO_OCTAVES = [3, 4, 5];
const BLACK_WHITE_POS = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
const WHITE_KEY_W = 46;

function useIsPortraitPhone() {
  const read = () => (typeof window !== "undefined" && window.innerHeight > window.innerWidth && Math.min(window.innerWidth, window.innerHeight) < 560);
  const [portrait, setPortrait] = useState(read);
  useEffect(() => {
    const onResize = () => setPortrait(read());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return portrait;
}

function FullscreenInputModal({ title, subtitle, onClose, children }) {
  const portrait = useIsPortraitPhone();
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(8,7,12,0.96)", backdropFilter: "blur(10px)", display: "flex", flexDirection: "column", padding: 14, gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          {title ? <div style={{ fontSize: 15, fontWeight: 800, color: "#3f2d1c" }}>{title}</div> : null}
          {subtitle ? <div style={{ fontSize: 11, color: "rgba(63,45,28,0.6)", marginTop: 2 }}>{subtitle}</div> : null}
        </div>
        <button onClick={onClose} aria-label="完成" style={{ width: 44, height: 44, borderRadius: 999, border: "none", background: "var(--gradient-accent)", color: "#fdf6e3", fontWeight: 800, fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</button>
      </div>
      {portrait ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "6px 12px", borderRadius: 10, background: "rgba(120,80,40,0.2)", border: "1px solid rgba(93,143,70,0.4)", color: "#3f6e2f", fontSize: 20 }}>
          📱 ↻
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function MobilePianoModal({ pianoSubmission, onChange, onClose }) {
  const notes = pianoSubmission?.notes || [];
  const [playing, setPlaying] = useState(false);
  const [pressed, setPressed] = useState("");

  const press = useCallback(async (name, octave) => {
    await unlockAudioSystem();
    playTone(nFreq(name, octave), 0.5, "piano", 0.24);
    const id = `${name}${octave}`;
    setPressed(id);
    setTimeout(() => setPressed((curr) => (curr === id ? "" : curr)), 160);
    onChange((prev) => ({ ...prev, notes: [...(prev.notes || []), { note: name, octave }].slice(-48) }));
  }, [onChange]);

  const undo = () => onChange((prev) => ({ ...prev, notes: (prev.notes || []).slice(0, -1) }));
  const clear = () => onChange((prev) => ({ ...prev, notes: [] }));

  const play = useCallback(async () => {
    if (!notes.length) return;
    await unlockAudioSystem();
    setPlaying(true);
    notes.forEach((n, index) => setTimeout(() => {
      playTone(nFreq(n.note, n.octave), 0.42, "piano", 0.2);
      if (index === notes.length - 1) setTimeout(() => setPlaying(false), 420);
    }, index * 360));
  }, [notes]);

  const whiteKeys = [];
  PIANO_OCTAVES.forEach((oct) => WK.forEach((semi) => whiteKeys.push({ name: NT[semi], octave: oct })));
  const blackKeys = [];
  PIANO_OCTAVES.forEach((oct, oi) => BK.forEach((semi) => {
    blackKeys.push({ name: NT[semi], octave: oct, left: (oi * 7 + BLACK_WHITE_POS[semi] + 1) * WHITE_KEY_W - 14 });
  }));

  return (
    <FullscreenInputModal title="钢琴输入" subtitle="点击琴键记录旋律 · 键盘可横向滚动" onClose={onClose}>
      <div style={{ padding: 10, borderRadius: 12, background: "rgba(94,60,28,0.06)", border: "1px solid rgba(120,80,40,0.24)", minHeight: 44, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {notes.length ? notes.map((n, index) => (
          <span key={`${n.note}${n.octave}-${index}`} style={{ padding: "4px 8px", borderRadius: 8, background: "rgba(120,80,40,0.22)", color: "#3f6e2f", fontSize: 12, fontWeight: 600 }}>{n.note}{n.octave}</span>
        )) : <span style={{ fontSize: 12, color: "rgba(63,45,28,0.5)" }}>暂未输入音符，请点击下方琴键。</span>}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={play} disabled={playing || !notes.length} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(93,143,70,0.4)", background: "rgba(93,143,70,0.12)", color: "#3f6e2f", fontWeight: 600, cursor: playing || !notes.length ? "default" : "pointer" }}>{playing ? "播放中..." : "▶ 播放"}</button>
        <button onClick={undo} disabled={!notes.length} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", color: "var(--color-text-primary)", cursor: notes.length ? "pointer" : "default" }}>撤销</button>
        <button onClick={clear} disabled={!notes.length} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", color: "var(--color-text-primary)", cursor: notes.length ? "pointer" : "default" }}>清空</button>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ position: "relative", height: 220, width: whiteKeys.length * WHITE_KEY_W, margin: "0 auto", flexShrink: 0 }}>
          {whiteKeys.map((k, index) => {
            const id = `${k.name}${k.octave}`;
            const active = pressed === id;
            return (
              <button key={`w-${id}-${index}`} onClick={() => press(k.name, k.octave)} style={{ position: "absolute", left: index * WHITE_KEY_W, top: 0, width: WHITE_KEY_W - 2, height: 220, borderRadius: "0 0 8px 8px", border: "1px solid rgba(0,0,0,0.45)", background: active ? "linear-gradient(180deg,#f6e6b4,#e9cf86)" : "linear-gradient(180deg,#faf7f0,#e9e4d8)", color: "#4a4651", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{k.name}{k.octave}</button>
            );
          })}
          {blackKeys.map((k, index) => {
            const id = `${k.name}${k.octave}`;
            const active = pressed === id;
            return (
              <button key={`b-${id}-${index}`} onClick={() => press(k.name, k.octave)} style={{ position: "absolute", left: k.left, top: 0, width: 28, height: 134, borderRadius: "0 0 6px 6px", border: "1px solid #000", background: active ? "linear-gradient(180deg,#3f6e2f,#8a6c1f)" : "linear-gradient(180deg,#2a2730,#16141c)", color: "#6e451f", zIndex: 2, fontSize: 8, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6, cursor: "pointer" }}>{k.name}{k.octave}</button>
            );
          })}
        </div>
      </div>
    </FullscreenInputModal>
  );
}

function HomeworkPianoEditor({ pianoSubmission, onChange }) {
  const octave = pianoSubmission?.octave || 4;
  const notes = pianoSubmission?.notes || [];
  const [pianoOpen, setPianoOpen] = useState(false);

  const addNote = useCallback(async (note) => {
    await unlockAudioSystem();
    playTone(nFreq(note, octave), 0.42, "piano", 0.24);
    onChange((prev) => ({
      ...prev,
      notes: [...(prev.notes || []), { note, octave }].slice(-48),
    }));
  }, [octave, onChange]);

  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>钢琴输入</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            点击完整键盘记录旋律，也可使用单个八度的快捷琴键。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => onChange((prev) => ({ ...prev, notes: (prev.notes || []).slice(0, -1) }))} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", cursor: "pointer" }}>
            撤销
          </button>
          <button onClick={() => onChange((prev) => ({ ...prev, notes: [] }))} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", cursor: "pointer" }}>
            清空
          </button>
        </div>
      </div>
      <button onClick={() => setPianoOpen(true)} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "none", background: "var(--gradient-accent)", color: "#fdf6e3", fontWeight: 700, fontSize: 13, cursor: "pointer", marginBottom: 10, boxShadow: "0 8px 20px rgba(93,143,70,0.35)" }}>
        🎹 打开钢琴键盘
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <select value={octave} onChange={(e) => onChange((prev) => ({ ...prev, octave: Number(e.target.value) }))} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", fontSize: 11 }}>
          {[3, 4, 5].map((value) => <option key={value} value={value}>第 {value} 组</option>)}
        </select>
        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>快捷琴键</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
        {["C", "D", "E", "F", "G", "A", "B"].map((note) => (
          <button key={note} onClick={() => addNote(note)} style={{ padding: "12px 8px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.18)", background: "rgba(94,60,28,0.05)", color: "var(--color-text-primary)", cursor: "pointer", fontWeight: 600 }}>
            {note}{octave}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(94,60,28,0.06)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        {notes.length ? notes.map((item) => `${item.note}${item.octave}`).join(" - ") : "暂未输入钢琴音高。"}
      </div>
      {pianoOpen && <MobilePianoModal pianoSubmission={pianoSubmission} onChange={onChange} onClose={() => setPianoOpen(false)} />}
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
    <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>语音输入</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            可使用浏览器实时识别或录音转写，用于术语解释、口头分析和作业记录。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {voiceSupported ? (
            <>
              <button onClick={onStartListening} disabled={listening} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: listening ? "rgba(94,60,28,0.07)" : "var(--gradient-accent)", color: listening ? "var(--color-text-tertiary)" : "#fdf6e3", cursor: listening ? "default" : "pointer" }}>
                开始实时识别
              </button>
              <button onClick={onStopListening} disabled={!listening} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: !listening ? "default" : "pointer" }}>
                停止识别
              </button>
            </>
          ) : (
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>当前浏览器不支持实时语音识别。</span>
          )}
          <button onClick={onStartRecording} disabled={transcribing} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: transcribing ? "default" : "pointer" }}>
            开始录音
          </button>
          <button onClick={onStopRecording} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "rgba(94,60,28,0.07)", cursor: "pointer" }}>
            停止并转写
          </button>
        </div>
      </div>
      <div style={{ padding: 10, borderRadius: 10, background: "rgba(94,60,28,0.06)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        <div><strong>转写文本：</strong>{transcript.trim() || "暂未生成转写文本。"}</div>
        <div style={{ marginTop: 6 }}><strong>音频文件：</strong>{audioSubmission?.name || "暂未录音"}</div>
        {transcribing ? <div style={{ marginTop: 6, color: "#e0a955" }}>正在转写录音，请稍候...</div> : null}
        {error ? <div style={{ marginTop: 6, color: "#f6a6a6" }}>{error}</div> : null}
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onApplyTranscript} disabled={!transcript.trim()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "var(--gradient-accent)", color: "#fdf6e3", cursor: !transcript.trim() ? "default" : "pointer" }}>
          应用到文字说明
        </button>
      </div>
    </div>
  );
}

function HomeworkEvaluationCard({ evaluation }) {
  if (!evaluation) {
    return (
      <div style={{ padding: 12, borderRadius: 12, background: "rgba(94,60,28,0.06)", border: "1px solid rgba(120,80,40,0.22)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        提交后，结构化课程反馈和智能初评会显示在这里。
      </div>
    );
  }

  const scoreEntries = Object.entries(evaluation.scores || {});
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "rgba(94,60,28,0.06)", border: "1px solid rgba(120,80,40,0.22)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 8 }}>课程评价</div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
        {evaluation.overallComment || "暂无评价。"}
      </div>
      {scoreEntries.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 10 }}>
          {scoreEntries.map(([label, value]) => (
            <div key={label} style={{ padding: 10, borderRadius: 10, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)" }}>{value}</div>
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
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{evaluation.strengths.join("; ")}</div>
          </div>
        ) : null}
        {Array.isArray(evaluation.issues) && evaluation.issues.length ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>需要修正</div>
            <div style={{ fontSize: 11, color: "#f6a6a6", lineHeight: 1.8 }}>{evaluation.issues.join("; ")}</div>
          </div>
        ) : null}
        {Array.isArray(evaluation.suggestions) && evaluation.suggestions.length ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>修改建议</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{evaluation.suggestions.join("; ")}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export {
  HomeworkEvaluationCard,
  HomeworkImageUploader,
  HomeworkPianoEditor,
  HomeworkVoiceInput,
  RhythmHomeworkEditorV2,
  StaffHomeworkEditorV2,
};
