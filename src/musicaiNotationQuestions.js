/**
 * Notation-based questions with inline SVG (imageData field).
 * Covers: treble/bass clef note recognition, interval recognition.
 * These are added to FORMAL_QUESTION_BANK via musicaiQuestionBank.js.
 */
import { generateNoteOnStaff, generateIntervalOnStaff } from "./musicaiNotationUtils.js";

function q(id, kpId, lessonId, chapterId, diff, type, img, prompt, options, answer, explanation) {
  return {
    id,
    lessonId,
    chapterId,
    knowledgePointId: kpId,
    difficulty: diff,
    questionType: type,
    evidenceWeight: "strong",
    source: "notation-generated-v1",
    reviewStatus: "pending",
    reviewNotes: "",
    imageData: img,
    prompt,
    options,
    answer,
    explanation,
  };
}

// ── Treble Clef Note Recognition (L3_K1) ─────────────────────────────────────

const TC = "L3_K1_trebleClef";
const tc = (id, diff, note, opts, ans, exp) =>
  q(id, TC, "L3", "ch2", diff, "notation-reading",
    generateNoteOnStaff(note, "treble"),
    "识别高音谱号中的音：",
    opts, ans, exp);

const TREBLE_NOTES = [
  tc("L3_K1-QN01", "basic", "G4",
    ["G4", "F4", "A4", "B4"], "G4",
    "这个音在高音谱表第二线上。高音谱号的旋涡定位的就是这条线上的 G4。"),
  tc("L3_K1-QN02", "basic", "C4",
    ["C4", "D4", "B3", "E4"], "C4",
    "这个音在高音谱表下加一线上，也就是中央 C（C4）。"),
  tc("L3_K1-QN03", "basic", "B4",
    ["A4", "B4", "C5", "G4"], "B4",
    "这个音在高音谱表第三线上，是 B4。"),
  tc("L3_K1-QN04", "basic", "E4",
    ["E4", "F4", "D4", "G4"], "E4",
    "这个音在高音谱表第一线上，是 E4。"),
  tc("L3_K1-QN05", "basic", "F5",
    ["E5", "G5", "F5", "D5"], "F5",
    "这个音在高音谱表第五线上，是 F5。"),
  tc("L3_K1-QN06", "medium", "A4",
    ["G4", "B4", "A4", "F4"], "A4",
    "这个音在高音谱表第二间内，是 A4。"),
  tc("L3_K1-QN07", "medium", "C5",
    ["B4", "D5", "C5", "E5"], "C5",
    "这个音在高音谱表第三间内，是 C5。"),
  tc("L3_K1-QN08", "medium", "D5",
    ["C5", "E5", "D5", "F5"], "D5",
    "这个音在高音谱表第四线上，是 D5。"),
  tc("L3_K1-QN09", "medium", "F4",
    ["E4", "G4", "F4", "A4"], "F4",
    "这个音在高音谱表第一间内，是 F4。"),
  tc("L3_K1-QN10", "hard", "E5",
    ["D5", "F5", "E5", "G5"], "E5",
    "这个音在高音谱表第四间内，是 E5。"),
];

// ── Bass Clef Note Recognition (L3_K2) ───────────────────────────────────────

const BC = "L3_K2_bassClef";
const bc = (id, diff, note, opts, ans, exp) =>
  q(id, BC, "L3", "ch2", diff, "notation-reading",
    generateNoteOnStaff(note, "bass"),
    "识别低音谱号中的音：",
    opts, ans, exp);

const BASS_NOTES = [
  bc("L3_K2-QN01", "basic", "F3",
    ["F3", "G3", "E3", "D3"], "F3",
    "这个音在低音谱表第四线上。低音谱号的两个点标示的就是这条线上的 F3。"),
  bc("L3_K2-QN02", "basic", "C4",
    ["B3", "A3", "C4", "D4"], "C4",
    "这个音在低音谱表上加一线上，也就是中央 C（C4）。"),
  bc("L3_K2-QN03", "basic", "B2",
    ["A2", "C3", "B2", "D3"], "B2",
    "这个音在低音谱表第二线上，是 B2。"),
  bc("L3_K2-QN04", "basic", "G2",
    ["G2", "A2", "F2", "B2"], "G2",
    "这个音在低音谱表第一线上，是 G2。"),
  bc("L3_K2-QN05", "medium", "A3",
    ["G3", "B3", "A3", "F3"], "A3",
    "这个音在低音谱表第五线上，是 A3。"),
  bc("L3_K2-QN06", "medium", "D3",
    ["C3", "E3", "D3", "F3"], "D3",
    "这个音在低音谱表第三线上，是 D3。"),
  bc("L3_K2-QN07", "medium", "G3",
    ["F3", "A3", "G3", "E3"], "G3",
    "这个音在低音谱表第四间内，是 G3。"),
  bc("L3_K2-QN08", "hard", "C3",
    ["B2", "D3", "C3", "A2"], "C3",
    "这个音在低音谱表第二间内，是 C3。"),
];

// ── Interval Recognition (L1_K2) ─────────────────────────────────────────────

const IK = "L1_K2_wholeStepHalfStep";
const iv = (id, diff, n1, n2, opts, ans, exp) =>
  q(id, IK, "L1", "ch1", diff, "interval-recognition",
    generateIntervalOnStaff(n1, n2, "treble"),
    `识别两个高音谱号音（${n1} 到 ${n2}）构成的音程：`,
    opts, ans, exp);

const INTERVALS = [
  iv("L1_K2-QN01", "basic", "C4", "D4",
    ["大二度", "小二度", "大三度", "纯四度"], "大二度",
    "C4 到 D4 相隔两个半音，因此是大二度，也就是一个全音。"),
  iv("L1_K2-QN02", "basic", "E4", "F4",
    ["大二度", "小二度", "纯四度", "小三度"], "小二度",
    "E4 到 F4 是自然半音，相隔一个半音，因此构成小二度。"),
  iv("L1_K2-QN03", "basic", "C4", "E4",
    ["小三度", "大三度", "纯四度", "大二度"], "大三度",
    "C4 到 E4 相隔四个半音，因此是大三度。"),
  iv("L1_K2-QN04", "basic", "E4", "G4",
    ["大三度", "小三度", "纯四度", "大二度"], "小三度",
    "E4 到 G4 相隔三个半音，因此是小三度。"),
  iv("L1_K2-QN05", "basic", "G4", "C5",
    ["增四度", "纯四度", "纯五度", "大三度"], "纯四度",
    "G4 到 C5 相隔五个半音，因此是纯四度。"),
  iv("L1_K2-QN06", "medium", "C4", "G4",
    ["增四度", "纯四度", "纯五度", "大六度"], "纯五度",
    "C4 到 G4 相隔七个半音，因此是纯五度。"),
  iv("L1_K2-QN07", "medium", "G4", "D5",
    ["纯四度", "增四度", "纯五度", "大六度"], "纯五度",
    "G4 到 D5 相隔七个半音，因此是纯五度。"),
  iv("L1_K2-QN08", "medium", "C4", "A4",
    ["纯五度", "大六度", "小六度", "大七度"], "大六度",
    "C4 到 A4 相隔九个半音，因此是大六度。"),
  iv("L1_K2-QN09", "medium", "C4", "C5",
    ["大七度", "小七度", "增七度", "纯八度"], "纯八度",
    "C4 到 C5 相隔十二个半音，因此是纯八度。"),
  iv("L1_K2-QN10", "hard", "F4", "B4",
    ["纯四度", "纯五度", "增四度", "减五度"], "增四度",
    "F4 到 B4 相隔六个半音，因此是增四度，也常称为三全音。"),
];

// ── Rhythm Time Value Questions (L4_K1) ──────────────────────────────────────

const RK = "L4_K1_noteValues";

function rhythmQ(id, diff, prompt, options, answer, explanation) {
  return q(id, RK, "L4", "ch2", diff, "rhythm-calculation",
    null, prompt, options, answer, explanation);
}

const RHYTHM_QUESTIONS = [
  rhythmQ("L4_K1-QN01", "basic",
    "一个全音符等于几个四分音符？",
    ["2", "4", "8", "3"], "4",
    "一个全音符等于 4 拍，一个四分音符等于 1 拍，所以一个全音符等于四个四分音符。"),
  rhythmQ("L4_K1-QN02", "basic",
    "一个二分音符等于几个四分音符？",
    ["1", "2", "4", "3"], "2",
    "一个二分音符等于 2 拍，一个四分音符等于 1 拍，所以一个二分音符等于两个四分音符。"),
  rhythmQ("L4_K1-QN03", "basic",
    "一个四分音符等于几个八分音符？",
    ["2", "4", "8", "3"], "2",
    "一个四分音符等于 1 拍，一个八分音符等于 1/2 拍，所以一个四分音符等于两个八分音符。"),
  rhythmQ("L4_K1-QN04", "medium",
    "一个全音符加一个二分音符一共几拍？",
    ["4 拍", "5 拍", "6 拍", "8 拍"], "6 拍",
    "全音符等于 4 拍，二分音符等于 2 拍，合计 6 拍。"),
  rhythmQ("L4_K1-QN05", "medium",
    "两个四分音符加四个八分音符一共几拍？",
    ["4 拍", "6 拍", "8 拍", "3 拍"], "4 拍",
    "两个四分音符等于 2 拍，四个八分音符等于 2 拍，合计 4 拍。"),
  rhythmQ("L4_K1-QN06", "medium",
    "一个十六分音符是一个四分音符的几分之几？",
    ["1/2", "1/4", "1/8", "1/3"], "1/4",
    "四分音符等于 1 拍，十六分音符等于 1/4 拍，所以它是四分音符的四分之一。"),
  rhythmQ("L4_K1-QN07", "hard",
    "三个八分音符加一个十六分音符一共几拍？",
    ["1.5 拍", "1.75 拍", "2 拍", "1.25 拍"], "1.75 拍",
    "三个八分音符等于 1.5 拍，一个十六分音符等于 0.25 拍，合计 1.75 拍。"),
];

// ── Dotted Note Calculations (L4_K2) ─────────────────────────────────────────

const DK = "L4_K2_dotsAndTies";

function dotQ(id, diff, prompt, options, answer, explanation) {
  return q(id, DK, "L4", "ch2", diff, "rhythm-calculation",
    null, prompt, options, answer, explanation);
}

const DOT_QUESTIONS = [
  dotQ("L4_K2-QN01", "basic",
    "附点四分音符是几拍？",
    ["1 拍", "1.5 拍", "2 拍", "0.75 拍"], "1.5 拍",
    "附点增加原音符时值的一半：1 拍 + 0.5 拍 = 1.5 拍。"),
  dotQ("L4_K2-QN02", "basic",
    "附点二分音符是几拍？",
    ["2 拍", "2.5 拍", "3 拍", "4 拍"], "3 拍",
    "附点增加原音符时值的一半：2 拍 + 1 拍 = 3 拍。"),
  dotQ("L4_K2-QN03", "medium",
    "附点八分音符是几拍？",
    ["0.5 拍", "0.75 拍", "1 拍", "1.5 拍"], "0.75 拍",
    "附点增加原音符时值的一半：0.5 拍 + 0.25 拍 = 0.75 拍。"),
  dotQ("L4_K2-QN04", "medium",
    "两个用连音线连接的四分音符总时值是多少？",
    ["1 拍", "2 拍", "1.5 拍", "3 拍"], "2 拍",
    "连音线把同音高音符的时值相加：1 + 1 = 2 拍。"),
  dotQ("L4_K2-QN05", "hard",
    "附点全音符是几拍？",
    ["4 拍", "5 拍", "6 拍", "7 拍"], "6 拍",
    "附点增加原音符时值的一半：4 拍 + 2 拍 = 6 拍。"),
];

// ── Export all notation questions ─────────────────────────────────────────────

export const NOTATION_QUESTIONS = [
  ...TREBLE_NOTES,
  ...BASS_NOTES,
  ...INTERVALS,
  ...RHYTHM_QUESTIONS,
  ...DOT_QUESTIONS,
];
