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
    "Identify the note in treble clef:",
    opts, ans, exp);

const TREBLE_NOTES = [
  tc("L3_K1-QN01", "basic", "G4",
    ["G4", "F4", "A4", "B4"], "G4",
    "This note is on the second line of the treble staff. The treble-clef spiral locates G4 on that line."),
  tc("L3_K1-QN02", "basic", "C4",
    ["C4", "D4", "B3", "E4"], "C4",
    "This note is on the ledger line below the treble staff, which is middle C (C4)."),
  tc("L3_K1-QN03", "basic", "B4",
    ["A4", "B4", "C5", "G4"], "B4",
    "This note is on the third line of the treble staff, which is B4."),
  tc("L3_K1-QN04", "basic", "E4",
    ["E4", "F4", "D4", "G4"], "E4",
    "This note is on the first line of the treble staff, which is E4."),
  tc("L3_K1-QN05", "basic", "F5",
    ["E5", "G5", "F5", "D5"], "F5",
    "This note is on the fifth line of the treble staff, which is F5."),
  tc("L3_K1-QN06", "medium", "A4",
    ["G4", "B4", "A4", "F4"], "A4",
    "This note is in the second space of the treble staff, which is A4."),
  tc("L3_K1-QN07", "medium", "C5",
    ["B4", "D5", "C5", "E5"], "C5",
    "This note is in the third space of the treble staff, which is C5."),
  tc("L3_K1-QN08", "medium", "D5",
    ["C5", "E5", "D5", "F5"], "D5",
    "This note is on the fourth line of the treble staff, which is D5."),
  tc("L3_K1-QN09", "medium", "F4",
    ["E4", "G4", "F4", "A4"], "F4",
    "This note is in the first space of the treble staff, which is F4."),
  tc("L3_K1-QN10", "hard", "E5",
    ["D5", "F5", "E5", "G5"], "E5",
    "This note is in the fourth space of the treble staff, which is E5."),
];

// ── Bass Clef Note Recognition (L3_K2) ───────────────────────────────────────

const BC = "L3_K2_bassClef";
const bc = (id, diff, note, opts, ans, exp) =>
  q(id, BC, "L3", "ch2", diff, "notation-reading",
    generateNoteOnStaff(note, "bass"),
    "Identify the note in bass clef:",
    opts, ans, exp);

const BASS_NOTES = [
  bc("L3_K2-QN01", "basic", "F3",
    ["F3", "G3", "E3", "D3"], "F3",
    "This note is on the fourth line of the bass staff. The bass-clef dots locate F3 on that line."),
  bc("L3_K2-QN02", "basic", "C4",
    ["B3", "A3", "C4", "D4"], "C4",
    "This note is on the ledger line above the bass staff, which is middle C (C4)."),
  bc("L3_K2-QN03", "basic", "B2",
    ["A2", "C3", "B2", "D3"], "B2",
    "This note is on the second line of the bass staff, which is B2."),
  bc("L3_K2-QN04", "basic", "G2",
    ["G2", "A2", "F2", "B2"], "G2",
    "This note is on the first line of the bass staff, which is G2."),
  bc("L3_K2-QN05", "medium", "A3",
    ["G3", "B3", "A3", "F3"], "A3",
    "This note is on the fifth line of the bass staff, which is A3."),
  bc("L3_K2-QN06", "medium", "D3",
    ["C3", "E3", "D3", "F3"], "D3",
    "This note is on the third line of the bass staff, which is D3."),
  bc("L3_K2-QN07", "medium", "G3",
    ["F3", "A3", "G3", "E3"], "G3",
    "This note is in the fourth space of the bass staff, which is G3."),
  bc("L3_K2-QN08", "hard", "C3",
    ["B2", "D3", "C3", "A2"], "C3",
    "This note is in the second space of the bass staff, which is C3."),
];

// ── Interval Recognition (L1_K2) ─────────────────────────────────────────────

const IK = "L1_K2_wholeStepHalfStep";
const iv = (id, diff, n1, n2, opts, ans, exp) =>
  q(id, IK, "L1", "ch1", diff, "interval-recognition",
    generateIntervalOnStaff(n1, n2, "treble"),
    `Identify the interval formed by the two treble-clef notes (${n1} to ${n2}):`,
    opts, ans, exp);

const INTERVALS = [
  iv("L1_K2-QN01", "basic", "C4", "D4",
    ["Major 2nd", "Minor 2nd", "Major 3rd", "Perfect 4th"], "Major 2nd",
    "C4 to D4 spans two semitones, so it is a major second (a whole step)."),
  iv("L1_K2-QN02", "basic", "E4", "F4",
    ["Major 2nd", "Minor 2nd", "Perfect 4th", "Minor 3rd"], "Minor 2nd",
    "E4 to F4 is a natural half step, so it spans one semitone and forms a minor second."),
  iv("L1_K2-QN03", "basic", "C4", "E4",
    ["Minor 3rd", "Major 3rd", "Perfect 4th", "Major 2nd"], "Major 3rd",
    "C4 to E4 spans four semitones, so it is a major third."),
  iv("L1_K2-QN04", "basic", "E4", "G4",
    ["Major 3rd", "Minor 3rd", "Perfect 4th", "Major 2nd"], "Minor 3rd",
    "E4 to G4 spans three semitones, so it is a minor third."),
  iv("L1_K2-QN05", "basic", "G4", "C5",
    ["Augmented 4th", "Perfect 4th", "Perfect 5th", "Major 3rd"], "Perfect 4th",
    "G4 to C5 spans five semitones, so it is a perfect fourth."),
  iv("L1_K2-QN06", "medium", "C4", "G4",
    ["Augmented 4th", "Perfect 4th", "Perfect 5th", "Major 6th"], "Perfect 5th",
    "C4 to G4 spans seven semitones, so it is a perfect fifth."),
  iv("L1_K2-QN07", "medium", "G4", "D5",
    ["Perfect 4th", "Augmented 4th", "Perfect 5th", "Major 6th"], "Perfect 5th",
    "G4 to D5 spans seven semitones, so it is a perfect fifth."),
  iv("L1_K2-QN08", "medium", "C4", "A4",
    ["Perfect 5th", "Major 6th", "Minor 6th", "Major 7th"], "Major 6th",
    "C4 to A4 spans nine semitones, so it is a major sixth."),
  iv("L1_K2-QN09", "medium", "C4", "C5",
    ["Major 7th", "Minor 7th", "Augmented 7th", "Perfect Octave"], "Perfect Octave",
    "C4 to C5 spans twelve semitones, so it is a perfect octave."),
  iv("L1_K2-QN10", "hard", "F4", "B4",
    ["Perfect 4th", "Perfect 5th", "Augmented 4th", "Diminished 5th"], "Augmented 4th",
    "F4 to B4 spans six semitones, so it is an augmented fourth, also called a tritone."),
];

// ── Rhythm Time Value Questions (L4_K1) ──────────────────────────────────────

const RK = "L4_K1_noteValues";

function rhythmQ(id, diff, prompt, options, answer, explanation) {
  return q(id, RK, "L4", "ch2", diff, "rhythm-calculation",
    null, prompt, options, answer, explanation);
}

const RHYTHM_QUESTIONS = [
  rhythmQ("L4_K1-QN01", "basic",
    "How many quarter notes equal one whole note?",
    ["2", "4", "8", "3"], "4",
    "A whole note equals 4 beats and a quarter note equals 1 beat, so one whole note equals four quarter notes."),
  rhythmQ("L4_K1-QN02", "basic",
    "How many quarter notes equal one half note?",
    ["1", "2", "4", "3"], "2",
    "A half note equals 2 beats and a quarter note equals 1 beat, so one half note equals two quarter notes."),
  rhythmQ("L4_K1-QN03", "basic",
    "How many eighth notes equal one quarter note?",
    ["2", "4", "8", "3"], "2",
    "A quarter note equals 1 beat and an eighth note equals 1/2 beat, so one quarter note equals two eighth notes."),
  rhythmQ("L4_K1-QN04", "medium",
    "How many beats are one whole note plus one half note?",
    ["4 beats", "5 beats", "6 beats", "8 beats"], "6 beats",
    "A whole note equals 4 beats and a half note equals 2 beats, for a total of 6 beats."),
  rhythmQ("L4_K1-QN05", "medium",
    "How many beats are two quarter notes plus four eighth notes?",
    ["4 beats", "6 beats", "8 beats", "3 beats"], "4 beats",
    "Two quarter notes equal 2 beats and four eighth notes equal 2 beats, for a total of 4 beats."),
  rhythmQ("L4_K1-QN06", "medium",
    "A sixteenth note is what fraction of a quarter note?",
    ["1/2", "1/4", "1/8", "1/3"], "1/4",
    "A quarter note equals 1 beat and a sixteenth note equals 1/4 beat, so it is one quarter of a quarter note."),
  rhythmQ("L4_K1-QN07", "hard",
    "How many beats are three eighth notes plus one sixteenth note?",
    ["1.5 beats", "1.75 beats", "2 beats", "1.25 beats"], "1.75 beats",
    "Three eighth notes equal 1.5 beats and one sixteenth note equals 0.25 beat, for a total of 1.75 beats."),
];

// ── Dotted Note Calculations (L4_K2) ─────────────────────────────────────────

const DK = "L4_K2_dotsAndTies";

function dotQ(id, diff, prompt, options, answer, explanation) {
  return q(id, DK, "L4", "ch2", diff, "rhythm-calculation",
    null, prompt, options, answer, explanation);
}

const DOT_QUESTIONS = [
  dotQ("L4_K2-QN01", "basic",
    "How many beats is a dotted quarter note?",
    ["1 beat", "1.5 beats", "2 beats", "0.75 beat"], "1.5 beats",
    "A dot adds half the original value: 1 beat + 0.5 beat = 1.5 beats."),
  dotQ("L4_K2-QN02", "basic",
    "How many beats is a dotted half note?",
    ["2 beats", "2.5 beats", "3 beats", "4 beats"], "3 beats",
    "A dot adds half the original value: 2 beats + 1 beat = 3 beats."),
  dotQ("L4_K2-QN03", "medium",
    "How many beats is a dotted eighth note?",
    ["0.5 beat", "0.75 beat", "1 beat", "1.5 beats"], "0.75 beat",
    "A dot adds half the original value: 0.5 beat + 0.25 beat = 0.75 beat."),
  dotQ("L4_K2-QN04", "medium",
    "What is the total duration of two tied quarter notes?",
    ["1 beat", "2 beats", "1.5 beats", "3 beats"], "2 beats",
    "A tie adds the durations of same-pitch notes: 1 + 1 = 2 beats."),
  dotQ("L4_K2-QN05", "hard",
    "How many beats is a dotted whole note?",
    ["4 beats", "5 beats", "6 beats", "7 beats"], "6 beats",
    "A dot adds half the original value: 4 beats + 2 beats = 6 beats."),
];

// ── Export all notation questions ─────────────────────────────────────────────

export const NOTATION_QUESTIONS = [
  ...TREBLE_NOTES,
  ...BASS_NOTES,
  ...INTERVALS,
  ...RHYTHM_QUESTIONS,
  ...DOT_QUESTIONS,
];
