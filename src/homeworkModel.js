import {
  decodeEscapedUnicodeText,
  normalizeRhythmSubmission,
} from "./homeworkSummary";

export const HOMEWORK_METER_MAP = {
  L4: "4/4",
  L9: "2/4",
  L10: "4/4",
  L11: "4/4",
  L12: "4/4",
};

export const RHYTHM_SYMBOLS = [
  { id: "whole", label: "Whole note", duration: 4, kind: "note" },
  { id: "half", label: "Half note", duration: 2, kind: "note" },
  { id: "quarter", label: "Quarter note", duration: 1, kind: "note" },
  { id: "eighth", label: "Eighth note", duration: 0.5, kind: "note" },
  { id: "sixteenth", label: "Sixteenth note", duration: 0.25, kind: "note" },
  { id: "dotted-half", label: "Dotted half note", duration: 3, kind: "note" },
  { id: "dotted-quarter", label: "Dotted quarter note", duration: 1.5, kind: "note" },
  { id: "dotted-eighth", label: "Dotted eighth note", duration: 0.75, kind: "note" },
  { id: "whole-rest", label: "Whole rest", duration: 4, kind: "rest" },
  { id: "half-rest", label: "Half rest", duration: 2, kind: "rest" },
  { id: "quarter-rest", label: "Quarter rest", duration: 1, kind: "rest" },
  { id: "eighth-rest", label: "Eighth rest", duration: 0.5, kind: "rest" },
  { id: "sixteenth-rest", label: "Sixteenth rest", duration: 0.25, kind: "rest" },
  { id: "tie", label: "Tie", duration: 0, kind: "tie" },
];

export const HOMEWORK_CHANNEL_LABELS = {
  text: "Written explanation",
  image: "Image upload",
  rhythm: "Rhythm editor",
  staff: "Staff correction",
  piano: "Piano input",
  voice: "Voice input",
};

export const STAFF_ROWS = [
  { row: 0, label: "G5" },
  { row: 1, label: "F5" },
  { row: 2, label: "E5" },
  { row: 3, label: "D5" },
  { row: 4, label: "C5" },
  { row: 5, label: "B4" },
  { row: 6, label: "A4" },
  { row: 7, label: "G4" },
  { row: 8, label: "F4" },
  { row: 9, label: "E4" },
  { row: 10, label: "D4" },
  { row: 11, label: "C4" },
  { row: 12, label: "B3" },
];

const BASE_EVALUATION_DIMENSIONS = ["Completion", "Accuracy", "Notation standard", "Clarity", "Submission quality"];

const LESSON_HOMEWORK_MATRIX = {
  L1: { channels: ["text", "image", "piano"], requiredAnyOf: ["text", "image", "piano"], helper: "This lesson focuses on pitch, frequency, and keyboard location.", evaluationType: "pitch", extraDimensions: ["Keyboard location", "Pitch judgment"] },
  L2: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "This lesson focuses on theoretical analysis and comparison.", evaluationType: "theory", extraDimensions: ["Concept understanding", "Analytical depth"] },
  L3: { channels: ["text", "image", "staff"], requiredAnyOf: ["image", "staff"], helper: "This lesson focuses on clefs and staff reading/writing.", evaluationType: "staff", extraDimensions: ["Clef recognition", "Pitch placement", "Notation standard"] },
  L4: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "This lesson focuses on notes, rests, and dotted values.", evaluationType: "rhythm", extraDimensions: ["Meter understanding", "Duration completeness", "Rhythm notation"] },
  L5: { channels: ["text", "image", "staff"], requiredAnyOf: ["text", "image", "staff"], helper: "Ornament homework should combine score examples with written explanation.", evaluationType: "staff", extraDimensions: ["Ornament recognition", "Notation standard", "Score expression"] },
  L6: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "This lesson focuses on term understanding and score analysis.", evaluationType: "theory", extraDimensions: ["Term usage", "Analytical depth"] },
  L7: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "This lesson focuses on repeat and abbreviation sign pathways.", evaluationType: "theory", extraDimensions: ["Structural understanding", "Path judgment"] },
  L8: { channels: ["text", "image", "voice"], requiredAnyOf: ["text", "image", "voice"], helper: "This lesson supports spoken term explanation and written organization.", evaluationType: "theory", extraDimensions: ["Term usage", "Clarity"] },
  L9: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "This lesson focuses on rhythm design under a given meter.", evaluationType: "rhythm", extraDimensions: ["Meter understanding", "Duration completeness", "Accent pattern"] },
  L10: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "This lesson focuses on duration grouping and tie notation.", evaluationType: "rhythm", extraDimensions: ["Grouping standard", "Tie use", "Rhythm notation"] },
  L11: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "This lesson focuses on syncopation and accent displacement.", evaluationType: "rhythm", extraDimensions: ["Accent displacement", "Syncopation notation", "Rhythm notation"] },
  L12: { channels: ["text", "image", "rhythm", "staff", "piano"], requiredAnyOf: ["text", "image", "rhythm", "staff", "piano"], helper: "This integrated review can combine several submission formats.", evaluationType: "mixed", extraDimensions: ["Integrated application", "Knowledge transfer", "Problem diagnosis"] },
};

export function normalizeRhythmEntry(entry = {}) {
  return {
    ...entry,
    id: String(entry.id || ""),
    label: decodeEscapedUnicodeText(entry.label || ""),
    duration: Number(entry.duration || 0),
    kind: entry.kind || "note",
    tieToNext: Boolean(entry.tieToNext),
  };
}

export function normalizeRhythmMeasures(measures = [[], []]) {
  const normalized = Array.isArray(measures) ? measures : [[], []];
  return [0, 1].map((index) => (normalized[index] || []).map((item) => normalizeRhythmEntry(item)));
}

export function createDefaultRhythmSubmission(lessonId) {
  return {
    meter: HOMEWORK_METER_MAP[lessonId] || "4/4",
    measures: [[], []],
    activeMeasure: 0,
  };
}

export function createDefaultStaffSubmission() {
  return {
    clef: "treble",
    activeSlot: 0,
    accidental: "natural",
    noteValue: "quarter",
    dotted: false,
    notes: [],
  };
}

export function createDefaultPianoSubmission() {
  return {
    octave: 4,
    notes: [],
  };
}

export function getMeterBeats(meter) {
  const [top, bottom] = String(meter || "4/4").split("/");
  const numerator = Number(top || 4);
  const denominator = Number(bottom || 4);
  if (!numerator || !denominator) return 4;
  return numerator * (4 / denominator);
}

export function calculateMeasureDuration(measure = []) {
  return measure.reduce((sum, item) => sum + Number(item?.duration || 0), 0);
}

export function getHomeworkRequirement(lessonId, lessonTitle) {
  return LESSON_HOMEWORK_MATRIX[lessonId] || {
    channels: ["text", "image"],
    requiredAnyOf: ["text", "image"],
    evaluationType: "theory",
    extraDimensions: ["Concept understanding", "Analytical depth"],
    helper: `${lessonTitle} should be submitted as a written explanation or photographed work.`,
  };
}

export function getEvaluationDimensions(requirement) {
  return [...BASE_EVALUATION_DIMENSIONS, ...(requirement?.extraDimensions || [])];
}

export function getRhythmValidation(rhythmSubmission) {
  const normalizedSubmission = normalizeRhythmSubmission(rhythmSubmission);
  if (!normalizedSubmission?.measures) {
    return { complete: false, issues: [] };
  }
  const targetBeats = getMeterBeats(normalizedSubmission.meter);
  const issues = [];
  normalizedSubmission.measures.forEach((measure = [], index) => {
    const beats = calculateMeasureDuration(measure);
    if (!measure.length) {
      issues.push(`Measure ${index + 1} is still empty.`);
      return;
    }
    if (beats < targetBeats) issues.push(`Measure ${index + 1} has too few beats.`);
    if (beats > targetBeats) issues.push(`Measure ${index + 1} exceeds the meter.`);
    const lastItem = measure[measure.length - 1];
    if (lastItem?.tieToNext && index === normalizedSubmission.measures.length - 1) {
      issues.push(`The final note in measure ${index + 1} has a tie but no following note.`);
    }
  });
  return { complete: issues.length === 0, issues };
}
