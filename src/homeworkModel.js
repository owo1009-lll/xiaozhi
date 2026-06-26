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
  { id: "whole", label: "全音符", duration: 4, kind: "note" },
  { id: "half", label: "二分音符", duration: 2, kind: "note" },
  { id: "quarter", label: "四分音符", duration: 1, kind: "note" },
  { id: "eighth", label: "八分音符", duration: 0.5, kind: "note" },
  { id: "sixteenth", label: "十六分音符", duration: 0.25, kind: "note" },
  { id: "dotted-half", label: "附点二分音符", duration: 3, kind: "note" },
  { id: "dotted-quarter", label: "附点四分音符", duration: 1.5, kind: "note" },
  { id: "dotted-eighth", label: "附点八分音符", duration: 0.75, kind: "note" },
  { id: "whole-rest", label: "全休止符", duration: 4, kind: "rest" },
  { id: "half-rest", label: "二分休止符", duration: 2, kind: "rest" },
  { id: "quarter-rest", label: "四分休止符", duration: 1, kind: "rest" },
  { id: "eighth-rest", label: "八分休止符", duration: 0.5, kind: "rest" },
  { id: "sixteenth-rest", label: "十六分休止符", duration: 0.25, kind: "rest" },
  { id: "tie", label: "连音线", duration: 0, kind: "tie" },
];

export const HOMEWORK_CHANNEL_LABELS = {
  text: "文字说明",
  image: "图片上传",
  rhythm: "节奏编辑器",
  staff: "五线谱订正",
  piano: "钢琴输入",
  voice: "语音输入",
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

const BASE_EVALUATION_DIMENSIONS = ["完成度", "准确性", "记谱规范", "表达清晰度", "提交质量"];

const LESSON_HOMEWORK_MATRIX = {
  L1: { channels: ["text", "image", "piano"], requiredAnyOf: ["text", "image", "piano"], helper: "本课重点检查音高、频率与键盘位置。", evaluationType: "pitch", extraDimensions: ["键盘位置", "音高判断"] },
  L2: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "本课重点检查理论分析与概念比较。", evaluationType: "theory", extraDimensions: ["概念理解", "分析深度"] },
  L3: { channels: ["text", "image", "staff"], requiredAnyOf: ["image", "staff"], helper: "本课重点检查谱号与五线谱读写。", evaluationType: "staff", extraDimensions: ["谱号识别", "音高位置", "记谱规范"] },
  L4: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "本课重点检查音符、休止符与附点时值。", evaluationType: "rhythm", extraDimensions: ["拍号理解", "时值完整性", "节奏记谱"] },
  L5: { channels: ["text", "image", "staff"], requiredAnyOf: ["text", "image", "staff"], helper: "装饰音作业应结合乐谱示例与文字说明。", evaluationType: "staff", extraDimensions: ["装饰音识别", "记谱规范", "谱例表达"] },
  L6: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "本课重点检查术语理解与乐谱分析。", evaluationType: "theory", extraDimensions: ["术语使用", "分析深度"] },
  L7: { channels: ["text", "image"], requiredAnyOf: ["text", "image"], helper: "本课重点检查反复与略写记号的演奏路径。", evaluationType: "theory", extraDimensions: ["结构理解", "路径判断"] },
  L8: { channels: ["text", "image", "voice"], requiredAnyOf: ["text", "image", "voice"], helper: "本课支持口述术语解释与书面整理。", evaluationType: "theory", extraDimensions: ["术语使用", "表达清晰度"] },
  L9: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "本课重点检查指定拍号下的节奏设计。", evaluationType: "rhythm", extraDimensions: ["拍号理解", "时值完整性", "强弱规律"] },
  L10: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "本课重点检查音值组合与连音线记谱。", evaluationType: "rhythm", extraDimensions: ["组合规范", "连音线使用", "节奏记谱"] },
  L11: { channels: ["text", "image", "rhythm"], requiredAnyOf: ["image", "rhythm"], helper: "本课重点检查切分节奏与重音移位。", evaluationType: "rhythm", extraDimensions: ["重音移位", "切分记谱", "节奏记谱"] },
  L12: { channels: ["text", "image", "rhythm", "staff", "piano"], requiredAnyOf: ["text", "image", "rhythm", "staff", "piano"], helper: "综合复习可以组合多种提交形式。", evaluationType: "mixed", extraDimensions: ["综合应用", "知识迁移", "问题诊断"] },
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
    extraDimensions: ["概念理解", "分析深度"],
    helper: `${lessonTitle} 可提交文字说明或拍照作业。`,
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
      issues.push(`第 ${index + 1} 小节仍为空。`);
      return;
    }
    if (beats < targetBeats) issues.push(`第 ${index + 1} 小节拍数不足。`);
    if (beats > targetBeats) issues.push(`第 ${index + 1} 小节超出拍号要求。`);
    const lastItem = measure[measure.length - 1];
    if (lastItem?.tieToNext && index === normalizedSubmission.measures.length - 1) {
      issues.push(`第 ${index + 1} 小节最后一个音带有连音线，但后面没有被连接的音。`);
    }
  });
  return { complete: issues.length === 0, issues };
}
