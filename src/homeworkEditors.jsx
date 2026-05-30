import { useCallback, useMemo } from "react";
import { Tag } from "./uiBasics";
import { nFreq, playTone, unlockAudioSystem } from "./musicAudio";
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
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>Photo Upload and Image Attachments</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            On mobile, students can photograph worksheets, rhythm patterns, or staff notation directly.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => cameraInputRef.current?.click()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>
            Take Photo
          </button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", color: "#111111", cursor: "pointer" }}>
            Upload Image
          </button>
        </div>
      </div>
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onAddFiles} />
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onAddFiles} />
      {images.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {images.map((image, index) => (
            <div key={`${image.name}-${index}`} style={{ position: "relative", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(17,17,17,0.1)", background: "#f8f8f8" }}>
              <img src={image.dataUrl} alt={image.name || `Homework image ${index + 1}`} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
              <div style={{ padding: 8, fontSize: 10, color: "var(--color-text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {image.name || `Image ${index + 1}`}
              </div>
              <button onClick={() => onRemoveImage(index)} style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: 999, border: "1px solid rgba(17,17,17,0.16)", background: "rgba(255,255,255,0.96)", cursor: "pointer", fontSize: 12 }}>
                x
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 14, borderRadius: 10, background: "#f8f8f8", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          No images uploaded yet. If the assignment requires rhythm writing, staff notation, or handwritten analysis, take a photo and submit it here.
        </div>
      )}
    </div>
  );
}

function RhythmHomeworkEditorV2({ rhythmSubmission, onChange, onPlay }) {
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
    <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>Rhythm Editor</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Enter rhythm measure by measure. The system checks whether each measure has the required number of beats.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={normalizedSubmission?.meter || "4/4"} onChange={(e) => onChange((prev) => ({ ...prev, meter: e.target.value }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff" }}>
            {["2/4", "3/4", "4/4", "6/8"].map((meter) => <option key={meter} value={meter}>{meter}</option>)}
          </select>
          {[0, 1].map((measureIndex) => (
            <button key={measureIndex} onClick={() => onChange((prev) => ({ ...prev, activeMeasure: measureIndex }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(17,17,17,0.12)", background: activeMeasure === measureIndex ? "#111111" : "#ffffff", color: activeMeasure === measureIndex ? "#ffffff" : "#111111", cursor: "pointer" }}>
              Measure {measureIndex + 1}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginBottom: 10 }}>
        {rhythmSymbols.map((symbol) => (
          <button key={symbol.id} onClick={() => appendSymbol(symbol)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.1)", background: "#f8f8f8", cursor: "pointer", textAlign: "left" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>{symbol.label}</div>
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>{symbol.kind === "tie" ? "Connect adjacent notes" : `${symbol.duration} beats`}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {measures.map((measure, index) => {
          const currentBeats = calculateMeasureDuration(measure);
          const status = currentBeats === targetBeats ? "Complete" : currentBeats < targetBeats ? "Short" : "Overfull";
          const statusColor = currentBeats === targetBeats ? "#166534" : currentBeats < targetBeats ? "#92400e" : "#b91c1c";
          return (
            <div key={`measure-v2-${index}`} style={{ padding: 10, borderRadius: 10, border: activeMeasure === index ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)", background: activeMeasure === index ? "#fafafa" : "#ffffff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#111111" }}>Measure {index + 1}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: statusColor }}>{`${currentBeats}/${targetBeats} beats - ${status}`}</div>
              </div>
              <div style={{ minHeight: 58, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {measure.length ? measure.map((item, itemIndex) => (
                  <span key={`${item.id}-${itemIndex}`} style={{ padding: "6px 8px", borderRadius: 999, background: "#111111", color: "#ffffff", fontSize: 10 }}>
                    {item.label}{item.tieToNext ? "~" : ""}
                  </span>
                )) : <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>This measure is empty.</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button onClick={() => onPlay?.(measures[activeMeasure] || [])} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>Play Current Measure</button>
        <button onClick={toggleTieOnLast} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>Tie Last Note</button>
        <button onClick={removeLastSymbol} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>Undo Last Step</button>
        <button onClick={clearMeasure} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>Clear Current Measure</button>
        <button onClick={resetAll} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>Reset Two Measures</button>
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
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>Staff Correction Editor</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Adjust clef, accidentals, note values, and ties for college-level music theory homework.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={staffSubmission?.clef || "treble"} onChange={(e) => onChange((prev) => ({ ...prev, clef: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="treble">Treble Clef</option>
            <option value="bass">Bass Clef</option>
          </select>
          <select value={staffSubmission?.accidental || "natural"} onChange={(e) => onChange((prev) => ({ ...prev, accidental: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="natural">Natural</option>
            <option value="sharp">Sharp</option>
            <option value="flat">Flat</option>
          </select>
          <select value={staffSubmission?.noteValue || "quarter"} onChange={(e) => onChange((prev) => ({ ...prev, noteValue: e.target.value }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="whole">Whole note</option>
            <option value="half">Half note</option>
            <option value="quarter">Quarter note</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {noteSlots.map((item, slot) => (
          <button key={`slot-v2-${slot}`} onClick={() => onChange((prev) => ({ ...prev, activeSlot: slot }))} style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(17,17,17,0.12)", background: staffSubmission?.activeSlot === slot ? "#111111" : "#ffffff", color: staffSubmission?.activeSlot === slot ? "#ffffff" : "#111111", cursor: "pointer" }}>
            Slot {slot + 1}{item ? ` - ${item.pitch}` : ""}
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
        <button onClick={toggleTieForCurrent} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>Toggle Tie for Current Slot</button>
        <button onClick={removeCurrentSlot} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>Delete Current Slot</button>
        <button onClick={resetAll} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>Reset Staff</button>
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
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>Piano Input</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Click piano keys to enter a pitch sequence for pitch, scale-degree, and keyboard-location homework.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={octave} onChange={(e) => onChange((prev) => ({ ...prev, octave: Number(e.target.value) }))} style={{ padding: "7px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }}>
            {[3, 4, 5].map((value) => <option key={value} value={value}>Octave {value}</option>)}
          </select>
          <button onClick={() => onChange((prev) => ({ ...prev, notes: (prev.notes || []).slice(0, -1) }))} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>
            Undo
          </button>
          <button onClick={() => onChange((prev) => ({ ...prev, notes: [] }))} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>
            Clear
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
        {notes.length ? notes.map((item) => `${item.note}${item.octave}`).join(" - ") : "No piano pitches entered yet."}
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
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>Voice Input</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
            Use live browser recognition or recording transcription for term explanations, oral analysis, and homework notes.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {voiceSupported ? (
            <>
              <button onClick={onStartListening} disabled={listening} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: listening ? "#f1f1f1" : "#111111", color: listening ? "#666666" : "#ffffff", cursor: listening ? "default" : "pointer" }}>
                Start Live Recognition
              </button>
              <button onClick={onStopListening} disabled={!listening} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: !listening ? "default" : "pointer" }}>
                Stop Recognition
              </button>
            </>
          ) : (
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>This browser does not support live speech recognition.</span>
          )}
          <button onClick={onStartRecording} disabled={transcribing} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: transcribing ? "default" : "pointer" }}>
            Start Recording
          </button>
          <button onClick={onStopRecording} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f5f5f5", cursor: "pointer" }}>
            Stop and Transcribe
          </button>
        </div>
      </div>
      <div style={{ padding: 10, borderRadius: 10, background: "#f8f8f8", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        <div><strong>Transcript: </strong>{transcript.trim() || "No transcript generated yet."}</div>
        <div style={{ marginTop: 6 }}><strong>Audio file: </strong>{audioSubmission?.name || "No recording yet"}</div>
        {transcribing ? <div style={{ marginTop: 6, color: "#92400e" }}>Transcribing the recording. Please wait...</div> : null}
        {error ? <div style={{ marginTop: 6, color: "#b91c1c" }}>{error}</div> : null}
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onApplyTranscript} disabled={!transcript.trim()} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: !transcript.trim() ? "default" : "pointer" }}>
          Apply Transcript to Written Explanation
        </button>
      </div>
    </div>
  );
}

function HomeworkEvaluationCard({ evaluation }) {
  if (!evaluation) {
    return (
      <div style={{ padding: 12, borderRadius: 12, background: "#f8f8f8", border: "1px solid rgba(17,17,17,0.08)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
        After submission, structured course feedback and the AI first review will appear here.
      </div>
    );
  }

  const scoreEntries = Object.entries(evaluation.scores || {});
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "#f8f8f8", border: "1px solid rgba(17,17,17,0.08)" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#111111", marginBottom: 8 }}>Course Evaluation</div>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
        {evaluation.overallComment || "No evaluation yet."}
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
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Strengths</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{evaluation.strengths.join("; ")}</div>
          </div>
        ) : null}
        {Array.isArray(evaluation.issues) && evaluation.issues.length ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Issues to Fix</div>
            <div style={{ fontSize: 11, color: "#b91c1c", lineHeight: 1.8 }}>{evaluation.issues.join("; ")}</div>
          </div>
        ) : null}
        {Array.isArray(evaluation.suggestions) && evaluation.suggestions.length ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Revision Suggestions</div>
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
