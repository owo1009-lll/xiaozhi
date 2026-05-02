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
  if (!pianoSubmission?.notes?.length) return "未录入钢琴音高。";
  return pianoSubmission.notes.map((item) => `${item.note}${item.octave}`).join(" - ");
}

export function summarizeRhythmSubmission(rhythmSubmission) {
  const normalizedSubmission = normalizeRhythmSubmission(rhythmSubmission);
  if (!normalizedSubmission?.measures) return "未填写节奏。";
  return normalizedSubmission.measures
    .map((measure, index) => `第 ${index + 1} 小节：${(measure || []).map((item) => `${decodeEscapedUnicodeText(item.label)}${item.tieToNext ? "~" : ""}`).join(" / ") || "空"}`)
    .join("；");
}

export function summarizeStaffSubmission(staffSubmission) {
  if (!staffSubmission?.notes?.length) return "未填写五线谱。";
  return staffSubmission.notes
    .sort((a, b) => a.slot - b.slot)
    .map((note) => `位置${note.slot + 1}:${note.pitch}${note.accidental === "sharp" ? "#" : note.accidental === "flat" ? "b" : ""}${note.noteValue ? `(${note.noteValue})` : ""}${note.tieToNext ? "~" : ""}`)
    .join("；");
}
