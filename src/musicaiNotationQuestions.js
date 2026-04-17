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
    "识别高音谱表中的音符，这个音是：",
    opts, ans, exp);

const TREBLE_NOTES = [
  tc("L3_K1-QN01", "basic", "G4",
    ["G4", "F4", "A4", "B4"], "G4",
    "该音在高音谱表第二线，高音谱号螺旋中心定位第二线=G4。"),
  tc("L3_K1-QN02", "basic", "C4",
    ["C4", "D4", "B3", "E4"], "C4",
    "该音在高音谱表下加一线，即中央C（c¹=C4）。"),
  tc("L3_K1-QN03", "basic", "B4",
    ["A4", "B4", "C5", "G4"], "B4",
    "该音在高音谱表第三线（中线），第三线=B4。"),
  tc("L3_K1-QN04", "basic", "E4",
    ["E4", "F4", "D4", "G4"], "E4",
    "该音在高音谱表第一线（最低线），第一线=E4。"),
  tc("L3_K1-QN05", "basic", "F5",
    ["E5", "G5", "F5", "D5"], "F5",
    "该音在高音谱表第五线（最高线），第五线=F5。"),
  tc("L3_K1-QN06", "medium", "A4",
    ["G4", "B4", "A4", "F4"], "A4",
    "该音在高音谱表第二间，第二间=A4。"),
  tc("L3_K1-QN07", "medium", "C5",
    ["B4", "D5", "C5", "E5"], "C5",
    "该音在高音谱表第三间，第三间=C5。"),
  tc("L3_K1-QN08", "medium", "D5",
    ["C5", "E5", "D5", "F5"], "D5",
    "该音在高音谱表第四线，第四线=D5。"),
  tc("L3_K1-QN09", "medium", "F4",
    ["E4", "G4", "F4", "A4"], "F4",
    "该音在高音谱表第一间，第一间=F4。"),
  tc("L3_K1-QN10", "hard", "E5",
    ["D5", "F5", "E5", "G5"], "E5",
    "该音在高音谱表第四间，第四间=E5。"),
];

// ── Bass Clef Note Recognition (L3_K2) ───────────────────────────────────────

const BC = "L3_K2_bassClef";
const bc = (id, diff, note, opts, ans, exp) =>
  q(id, BC, "L3", "ch2", diff, "notation-reading",
    generateNoteOnStaff(note, "bass"),
    "识别低音谱表中的音符，这个音是：",
    opts, ans, exp);

const BASS_NOTES = [
  bc("L3_K2-QN01", "basic", "F3",
    ["F3", "G3", "E3", "D3"], "F3",
    "该音在低音谱表第四线，低音谱号两点夹住第四线=F3。"),
  bc("L3_K2-QN02", "basic", "C4",
    ["B3", "A3", "C4", "D4"], "C4",
    "该音在低音谱表上加一线，即中央C（c¹=C4）。"),
  bc("L3_K2-QN03", "basic", "B2",
    ["A2", "C3", "B2", "D3"], "B2",
    "该音在低音谱表第二线，第二线=B2。"),
  bc("L3_K2-QN04", "basic", "G2",
    ["G2", "A2", "F2", "B2"], "G2",
    "该音在低音谱表第一线（最低线），第一线=G2。"),
  bc("L3_K2-QN05", "medium", "A3",
    ["G3", "B3", "A3", "F3"], "A3",
    "该音在低音谱表第五线（最高线），第五线=A3。"),
  bc("L3_K2-QN06", "medium", "D3",
    ["C3", "E3", "D3", "F3"], "D3",
    "该音在低音谱表第三线（中线），第三线=D3。"),
  bc("L3_K2-QN07", "medium", "G3",
    ["F3", "A3", "G3", "E3"], "G3",
    "该音在低音谱表第四间，第四间=G3。"),
  bc("L3_K2-QN08", "hard", "C3",
    ["B2", "D3", "C3", "A2"], "C3",
    "该音在低音谱表第二间，第二间=C3。"),
];

// ── Interval Recognition (L1_K2) ─────────────────────────────────────────────

const IK = "L1_K2_wholeStepHalfStep";
const iv = (id, diff, n1, n2, opts, ans, exp) =>
  q(id, IK, "L1", "ch1", diff, "interval-recognition",
    generateIntervalOnStaff(n1, n2, "treble"),
    `识别高音谱表中两个音（${n1} 到 ${n2}）构成的音程：`,
    opts, ans, exp);

const INTERVALS = [
  iv("L1_K2-QN01", "basic", "C4", "D4",
    ["大二度", "小二度", "大三度", "纯四度"], "大二度",
    "C4到D4相差2个半音，是大二度（全音）。"),
  iv("L1_K2-QN02", "basic", "E4", "F4",
    ["大二度", "小二度", "纯四度", "小三度"], "小二度",
    "E4到F4是天然半音，相差1个半音，是小二度（半音）。"),
  iv("L1_K2-QN03", "basic", "C4", "E4",
    ["小三度", "大三度", "纯四度", "大二度"], "大三度",
    "C4到E4相差4个半音，是大三度。"),
  iv("L1_K2-QN04", "basic", "E4", "G4",
    ["大三度", "小三度", "纯四度", "大二度"], "小三度",
    "E4到G4相差3个半音，是小三度。"),
  iv("L1_K2-QN05", "basic", "G4", "C5",
    ["增四度", "纯四度", "纯五度", "大三度"], "纯四度",
    "G4到C5相差5个半音，是纯四度。"),
  iv("L1_K2-QN06", "medium", "C4", "G4",
    ["增四度", "纯四度", "纯五度", "大六度"], "纯五度",
    "C4到G4相差7个半音，是纯五度。"),
  iv("L1_K2-QN07", "medium", "G4", "D5",
    ["纯四度", "增四度", "纯五度", "大六度"], "纯五度",
    "G4到D5相差7个半音，是纯五度。"),
  iv("L1_K2-QN08", "medium", "C4", "A4",
    ["纯五度", "大六度", "小六度", "大七度"], "大六度",
    "C4到A4相差9个半音，是大六度。"),
  iv("L1_K2-QN09", "medium", "C4", "C5",
    ["大七度", "小七度", "增七度", "纯八度"], "纯八度",
    "C4到C5相差12个半音，是纯八度（同名音高八度）。"),
  iv("L1_K2-QN10", "hard", "F4", "B4",
    ["纯四度", "纯五度", "增四度", "减五度"], "增四度",
    "F4到B4相差6个半音，是增四度（也称三全音/tritone）。"),
];

// ── Rhythm Time Value Questions (L4_K1) ──────────────────────────────────────

const RK = "L4_K1_noteValues";

function rhythmQ(id, diff, prompt, options, answer, explanation) {
  return q(id, RK, "L4", "ch2", diff, "rhythm-calculation",
    null, prompt, options, answer, explanation);
}

const RHYTHM_QUESTIONS = [
  rhythmQ("L4_K1-QN01", "basic",
    "全音符等于几个四分音符？",
    ["2个", "4个", "8个", "3个"], "4个",
    "全音符=4拍，四分音符=1拍，所以全音符=4个四分音符。"),
  rhythmQ("L4_K1-QN02", "basic",
    "二分音符等于几个四分音符？",
    ["1个", "2个", "4个", "3个"], "2个",
    "二分音符=2拍，四分音符=1拍，所以二分音符=2个四分音符。"),
  rhythmQ("L4_K1-QN03", "basic",
    "四分音符等于几个八分音符？",
    ["2个", "4个", "8个", "3个"], "2个",
    "四分音符=1拍，八分音符=1/2拍，所以四分音符=2个八分音符。"),
  rhythmQ("L4_K1-QN04", "medium",
    "1个全音符 + 1个二分音符共几拍？",
    ["4拍", "5拍", "6拍", "8拍"], "6拍",
    "全音符=4拍，二分音符=2拍，合计=6拍。"),
  rhythmQ("L4_K1-QN05", "medium",
    "2个四分音符 + 4个八分音符共几拍？",
    ["4拍", "6拍", "8拍", "3拍"], "4拍",
    "2个四分音符=2拍，4个八分音符=2拍，合计=4拍。"),
  rhythmQ("L4_K1-QN06", "medium",
    "十六分音符的时值是四分音符的多少？",
    ["1/2", "1/4", "1/8", "1/3"], "1/4",
    "四分音符=1拍，十六分音符=1/4拍，所以十六分音符=四分音符的1/4。"),
  rhythmQ("L4_K1-QN07", "hard",
    "3个八分音符 + 1个十六分音符共几拍？",
    ["1.5拍", "1.75拍", "2拍", "1.25拍"], "1.75拍",
    "3个八分音符=1.5拍，1个十六分音符=0.25拍，合计=1.75拍。"),
];

// ── Dotted Note Calculations (L4_K2) ─────────────────────────────────────────

const DK = "L4_K2_dotsAndTies";

function dotQ(id, diff, prompt, options, answer, explanation) {
  return q(id, DK, "L4", "ch2", diff, "rhythm-calculation",
    null, prompt, options, answer, explanation);
}

const DOT_QUESTIONS = [
  dotQ("L4_K2-QN01", "basic",
    "附点四分音符等于几拍？",
    ["1拍", "1.5拍", "2拍", "0.75拍"], "1.5拍",
    "附点增加原时值一半：四分音符1拍 + 0.5拍 = 1.5拍。"),
  dotQ("L4_K2-QN02", "basic",
    "附点二分音符等于几拍？",
    ["2拍", "2.5拍", "3拍", "4拍"], "3拍",
    "附点增加原时值一半：二分音符2拍 + 1拍 = 3拍。"),
  dotQ("L4_K2-QN03", "medium",
    "附点八分音符等于几拍？",
    ["0.5拍", "0.75拍", "1拍", "1.5拍"], "0.75拍",
    "附点增加原时值一半：八分音符0.5拍 + 0.25拍 = 0.75拍。"),
  dotQ("L4_K2-QN04", "medium",
    "连音线连接的两个四分音符，总时值是：",
    ["1拍", "2拍", "1.5拍", "3拍"], "2拍",
    "连音线(tie)将同音高的两个四分音符时值相加：1+1=2拍。"),
  dotQ("L4_K2-QN05", "hard",
    "附点全音符等于几拍？",
    ["4拍", "5拍", "6拍", "7拍"], "6拍",
    "附点增加原时值一半：全音符4拍 + 2拍 = 6拍。"),
];

// ── Export all notation questions ─────────────────────────────────────────────

export const NOTATION_QUESTIONS = [
  ...TREBLE_NOTES,
  ...BASS_NOTES,
  ...INTERVALS,
  ...RHYTHM_QUESTIONS,
  ...DOT_QUESTIONS,
];
