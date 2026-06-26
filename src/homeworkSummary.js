export function decodeEscapedUnicodeText(value) {
  if (typeof value !== "string" || !value.includes("\\u")) {
    return value;
  }
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeEscapedUnicodeDeep(value) {
  if (typeof value === "string") {
    return decodeEscapedUnicodeText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => decodeEscapedUnicodeDeep(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeEscapedUnicodeDeep(item)]));
  }
  return value;
}

function noteValueLabel(value) {
  const labels = {
    whole: "全音符",
    half: "二分音符",
    quarter: "四分音符",
    eighth: "八分音符",
    sixteenth: "十六分音符",
    "dotted-half": "附点二分音符",
    "dotted-quarter": "附点四分音符",
    "dotted-eighth": "附点八分音符",
  };
  return labels[value] || value;
}

export function normalizeRhythmSubmission(rhythmSubmission) {
  if (!rhythmSubmission || typeof rhythmSubmission !== "object") {
    return rhythmSubmission;
  }
  const decoded = decodeEscapedUnicodeDeep(rhythmSubmission);
  return {
    ...decoded,
    measures: (decoded.measures || [[], []]).map((measure = []) => measure.map((item) => (
      item && typeof item === "object" ? { ...item, label: decodeEscapedUnicodeText(item.label) } : item
    ))),
  };
}

export function summarizePianoSubmission(pianoSubmission) {
  if (!pianoSubmission?.notes?.length) return "暂未输入钢琴音高。";
  return pianoSubmission.notes.map((item) => `${item.note}${item.octave}`).join(" - ");
}

export function summarizeRhythmSubmission(rhythmSubmission) {
  const normalizedSubmission = normalizeRhythmSubmission(rhythmSubmission);
  if (!normalizedSubmission?.measures) return "暂未输入节奏。";
  return normalizedSubmission.measures
    .map((measure, index) => `第 ${index + 1} 小节：${(measure || []).map((item) => `${decodeEscapedUnicodeText(item.label)}${item.tieToNext ? "~" : ""}`).join(" / ") || "空"}`)
    .join("；");
}

export function summarizeStaffSubmission(staffSubmission) {
  if (!staffSubmission?.notes?.length) return "暂未输入五线谱记谱。";
  return staffSubmission.notes
    .sort((a, b) => a.slot - b.slot)
    .map((note) => `第 ${note.slot + 1} 位：${note.pitch}${note.accidental === "sharp" ? "#" : note.accidental === "flat" ? "b" : ""}${note.noteValue ? `（${noteValueLabel(note.noteValue)}）` : ""}${note.tieToNext ? "~" : ""}`)
    .join("；");
}
