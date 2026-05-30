import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPptLessonData } from "./pptLessonData";
import { getKnowledgePointsForLesson } from "./musicaiKnowledge";
import { getQuestionsForLesson } from "./musicaiQuestionBank";
import { getWeakEnhancementsForLesson } from "./weakKnowledgeEnhancements";
import {
  appendErrorRecord,
  appendSessionRecord,
  chooseAdaptivePracticeQuestions,
  getKnowledgeMapping,
  getRecommendationFromSummary,
  initializeKnowledgeStore,
  setKnowledgeMapping,
  summarizeLessonKnowledge,
  updateKnowledgePointEvidence,
} from "./musicaiBkt";
import { fileToDataUrl } from "./fileUtils";
import { getStudentProfile } from "./studentProfile";
import {
  normalizeRhythmSubmission,
  summarizePianoSubmission,
  summarizeRhythmSubmission,
  summarizeStaffSubmission,
} from "./homeworkSummary";
import {
  HOMEWORK_CHANNEL_LABELS,
  createDefaultPianoSubmission,
  createDefaultRhythmSubmission,
  createDefaultStaffSubmission,
  getEvaluationDimensions,
  getHomeworkRequirement,
  getRhythmValidation,
} from "./homeworkModel";
import { LessonCharts, PBar, Stars, Tag, WeakPointExplanationCards } from "./uiBasics";
import { BK, NT, WK, nFreq, playTone, unlockAudioSystem } from "./musicAudio";
import {
  HomeworkEvaluationCard,
  HomeworkImageUploader,
  HomeworkPianoEditor,
  HomeworkVoiceInput,
  RhythmHomeworkEditorV2,
  StaffHomeworkEditorV2,
} from "./homeworkEditors";
import { reportStudentAnalytics, syncKnowledgeSummary } from "./learningAnalytics";
import {
  ArticulationContrastWidgetCn,
  BassClefDrillWidgetCn,
  CrossBarTieGuideWidgetCn,
  DcDsCodaGuideWidgetCn,
  DotsAndTiesGuideWidgetCn,
  DynamicsScaleWidgetCn,
  ExpressionVsTempoCardCn,
  InteractivePitchFrequencyWidgetCn,
  InteractiveVolumeAmplitudeWidgetCn,
  MeterAccentGuideWidgetCn,
  NoteValueHierarchyWidgetCn,
  OrnamentComparisonWidgetCn,
  RepeatPathGuideWidgetCn,
  SyncopationPatternWidgetCn,
  SyncopationTypeGuideWidgetCn,
  TemperamentEnharmonicWidgetCn,
  TrebleClefDrillWidgetCn,
  TrillVsMordentWidgetCn,
} from "./LessonInteractiveWidgets";
import { EXERCISE_COMPONENTS } from "./LessonExercises";

const LazyAITutorV2 = lazy(() => import("./AITutorV2.jsx"));

function createKnowledgeMappingKey(lessonId, signature) {
  return `${lessonId}:${String(signature || "").slice(0, 120)}`;
}

function formatStructuredEvaluation(evaluation) {
  if (!evaluation) return "";
  const strengths = (evaluation.strengths || []).join("; ");
  const issues = (evaluation.issues || []).join("; ");
  const suggestions = (evaluation.suggestions || []).join("; ");
  return [
    `Completion review: ${evaluation.overallComment || "Homework submission completed."}`,
    `Issue notes: ${issues || "No obvious errors found."}`,
    `Revision advice: ${suggestions || "Keep the current quality."}${strengths ? `\nStrengths: ${strengths}` : ""}`,
  ].join("\n");
}

const LESSON_CONTENT = {};
const LESSON_LEARNING_SECTIONS = {};
const LESSON_QUIZ_BANK = {
  L1: { id: "L1-Q1", lessonId: "L1", chapterId: "ch1", knowledgePointId: "L1_K1_pitchProperties", difficulty: "basic", prompt: "What is the standard frequency of A4?", options: ["220Hz", "440Hz", "523Hz"], answer: "440Hz", explanation: "A4 = 440Hz is the standard reference pitch." },
  L2: { id: "L2-Q1", lessonId: "L2", chapterId: "ch1", knowledgePointId: "L2_K2_temperamentEnharmonic", difficulty: "medium", prompt: "In equal temperament, what is the approximate ratio between adjacent semitones?", options: ["1.5", "1.25", "1.0595"], answer: "1.0595", explanation: "Equal temperament divides the octave into 12 equal parts." },
  L3: { id: "L3-Q1", lessonId: "L3", chapterId: "ch2", knowledgePointId: "L3_K1_trebleClef", difficulty: "basic", prompt: "Which staff line is located by the center of the treble clef?", options: ["Second line", "Third line", "Fourth line"], answer: "Second line", explanation: "The treble clef defines the second line as G." },
  L4: { id: "L4-Q1", lessonId: "L4", chapterId: "ch2", knowledgePointId: "L4_K1_noteValues", difficulty: "basic", prompt: "How many beats is a quarter note usually worth in 4/4?", options: ["0.5 beat", "1 beat", "2 beats"], answer: "1 beat", explanation: "A quarter note commonly functions as the basic one-beat unit." },
  L5: { id: "L5-Q1", lessonId: "L5", chapterId: "ch3", knowledgePointId: "L5_K1_trillMordent", difficulty: "basic", prompt: "What does a trill usually indicate?", options: ["Rapid alternation with a neighbor note", "Sustaining the same note", "A strong-beat accent"], answer: "Rapid alternation with a neighbor note", explanation: "The core feature of a trill is rapid alternation between the main note and a neighbor note." },
  L6: { id: "L6-Q1", lessonId: "L6", chapterId: "ch3", knowledgePointId: "L6_K1_dynamics", difficulty: "basic", prompt: "What tempo category does Allegro usually indicate?", options: ["Slow", "Moderate", "Fast"], answer: "Fast", explanation: "Allegro is a common fast tempo term." },
  L7: { id: "L7-Q1", lessonId: "L7", chapterId: "ch4", knowledgePointId: "L7_K1_repeatSigns", difficulty: "basic", prompt: "What does D.C. mean in a score?", options: ["Return to the beginning", "End", "Jump to the coda"], answer: "Return to the beginning", explanation: "D.C. means Da Capo." },
  L8: { id: "L8-Q1", lessonId: "L8", chapterId: "ch4", knowledgePointId: "L8_K2_expressionTerms", difficulty: "basic", prompt: "Which character is closest to Dolce?", options: ["Sweet and gentle", "Strong and fiery", "Majestic and slow"], answer: "Sweet and gentle", explanation: "Dolce means sweetly or gently." },
  L9: { id: "L9-Q1", lessonId: "L9", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "basic", prompt: "How many beats are usually in each measure of 3/4?", options: ["2 beats", "3 beats", "4 beats"], answer: "3 beats", explanation: "3/4 means three beats per measure." },
  L10: { id: "L10-Q1", lessonId: "L10", chapterId: "ch5", knowledgePointId: "L10_K1_noteGrouping", difficulty: "basic", prompt: "How much does a dot add to the original note value?", options: ["One half", "One full value", "One half less"], answer: "One half", explanation: "A dot adds half of the original value." },
  L11: { id: "L11-Q1", lessonId: "L11", chapterId: "ch5", knowledgePointId: "L11_K1_syncopationTypes", difficulty: "medium", prompt: "What is the core aural effect of syncopation?", options: ["Accent displacement", "Slower tempo", "Higher pitch"], answer: "Accent displacement", explanation: "Syncopation disrupts the expected strong-weak accent pattern." },
  L12: { id: "L12-Q1", lessonId: "L12", chapterId: "ch5", knowledgePointId: "L1_K1_pitchProperties", difficulty: "core", prompt: "What is the most important goal in integrated diagnosis?", options: ["Memorize terms only", "Connect and apply knowledge", "Do listening tasks only"], answer: "Connect and apply knowledge", explanation: "Integrated diagnosis connects knowledge, locates weak points, and supports transfer." },
};

const LESSON_PRACTICE_EXTRA = {
  L1: { id: "L1-Q2", lessonId: "L1", chapterId: "ch1", knowledgePointId: "L1_K1_pitchProperties", difficulty: "medium", prompt: "What does a change in loudness most directly correspond to?", options: ["Frequency", "Amplitude", "Clef"], answer: "Amplitude", explanation: "Loudness is usually determined by amplitude." },
  L2: { id: "L2-Q2", lessonId: "L2", chapterId: "ch1", knowledgePointId: "L2_K2_temperamentEnharmonic", difficulty: "medium", prompt: "What relationship is closest to the second harmonic above a fundamental?", options: ["Octave", "Third", "Half step"], answer: "Octave", explanation: "The second harmonic is one octave above the fundamental." },
  L3: { id: "L3-Q2", lessonId: "L3", chapterId: "ch2", knowledgePointId: "L3_K2_bassClef", difficulty: "basic", prompt: "Which note does the bass clef primarily locate?", options: ["F", "C", "G"], answer: "F", explanation: "The two bass-clef dots surround the F line." },
  L4: { id: "L4-Q2", lessonId: "L4", chapterId: "ch2", knowledgePointId: "L4_K2_dotsAndTies", difficulty: "medium", prompt: "How many beats is a dotted quarter note?", options: ["1 beat", "1.5 beats", "2 beats"], answer: "1.5 beats", explanation: "A dotted quarter note equals 1.5 beats." },
  L5: { id: "L5-Q2", lessonId: "L5", chapterId: "ch3", knowledgePointId: "L5_K2_turnAppoggiatura", difficulty: "medium", prompt: "Which ornament most directly involves rapid alternation between the main note and a neighbor?", options: ["Mordent", "Trill", "Appoggiatura"], answer: "Trill", explanation: "A trill rapidly alternates between the main note and a neighbor note." },
  L6: { id: "L6-Q2", lessonId: "L6", chapterId: "ch3", knowledgePointId: "L6_K1_dynamics", difficulty: "basic", prompt: "What dynamic level does mf usually indicate?", options: ["Very soft", "Moderately loud", "Extremely loud"], answer: "Moderately loud", explanation: "mf means mezzo forte." },
  L7: { id: "L7-Q2", lessonId: "L7", chapterId: "ch4", knowledgePointId: "L7_K2_dcDsCoda", difficulty: "basic", prompt: "What does Fine usually indicate?", options: ["Return to the beginning", "Ending point", "Jump to the coda"], answer: "Ending point", explanation: "Fine marks the end of a phrase or piece." },
  L8: { id: "L8-Q2", lessonId: "L8", chapterId: "ch4", knowledgePointId: "L8_K1_tempoTerms", difficulty: "core", prompt: "What is the most stable way to learn musical terms?", options: ["Memorize once", "Classify and review", "Look only at translation"], answer: "Classify and review", explanation: "Term memory depends on classification and repeated retrieval." },
  L9: { id: "L9-Q2", lessonId: "L9", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "basic", prompt: "What is the usual metric role of beat 1 in 4/4?", options: ["Weak beat", "Secondary strong beat", "Strong beat"], answer: "Strong beat", explanation: "The first beat of 4/4 is usually strong." },
  L10: { id: "L10-Q2", lessonId: "L10", chapterId: "ch5", knowledgePointId: "L10_K2_crossBarTies", difficulty: "medium", prompt: "What does a tie do when it connects same-pitch notes?", options: ["Changes pitch", "Adds durations", "Turns them into rests"], answer: "Adds durations", explanation: "A tie adds the durations of same-pitch notes." },
  L11: { id: "L11-Q2", lessonId: "L11", chapterId: "ch5", knowledgePointId: "L11_K2_classicSyncopation", difficulty: "core", prompt: "What is the clearest feeling created by syncopation?", options: ["Even accents", "Accent displacement", "Higher pitch"], answer: "Accent displacement", explanation: "The core of syncopation is displaced accent." },
  L12: { id: "L12-Q2", lessonId: "L12", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "core", prompt: "What is the most effective review method after integrated diagnosis?", options: ["Only do familiar questions", "Review by error type", "Skip fundamentals"], answer: "Review by error type", explanation: "Reviewing by error type makes it easier to identify weak points and plan follow-up practice." },
};

function ensureQuestionOptions(values = [], fallbackValues = []) {
  const merged = [...values, ...fallbackValues].filter((item, index, array) => item && array.indexOf(item) === index);
  return merged.slice(0, 4);
}

function buildKnowledgePointQuestionSet(point, lessonPoints = []) {
  const siblingPoints = lessonPoints.filter((item) => item.id !== point.id);
  const conceptPool = siblingPoints.flatMap((item) => item.subConcepts || []);
  const exercisePool = siblingPoints.flatMap((item) => item.exerciseTypes || []);
  const easyPool = siblingPoints.flatMap((item) => item.easy || []);
  const mediumPool = siblingPoints.flatMap((item) => item.medium || []);
  const hardPool = siblingPoints.flatMap((item) => item.hard || []);

  const conceptAnswer = point.subConcepts?.[0] || point.title;
  const conceptOptions = ensureQuestionOptions(
    [conceptAnswer, ...conceptPool],
    ["Basic concept recognition", "Term flashcards", "Integrated analysis"],
  );

  const exerciseAnswer = point.exerciseTypes?.[0] || "AI Tutor Q&A";
  const exerciseOptions = ensureQuestionOptions(
    [exerciseAnswer, ...exercisePool],
    ["AI Tutor Q&A", "Term flashcards", "Notation exercise", "Rhythm exercise"],
  );

  const easyAnswer = point.easy?.[0] || point.subConcepts?.[0] || point.title;
  const easyOptions = ensureQuestionOptions(
    [easyAnswer, ...easyPool],
    ["Basic concept recognition", "Adjacent white-key judgment", "Identify C-sharp/D-flat as enharmonic", "What determines pitch?"],
  );

  const mediumAnswer = point.medium?.[0] || point.easy?.[0] || point.title;
  const mediumOptions = ensureQuestionOptions(
    [mediumAnswer, ...mediumPool],
    ["Concept application", "Mixed duration recognition", "Enharmonic spelling in composition", "Complex reading with accidentals"],
  );

  const hardAnswer = point.hard?.[0] || point.medium?.[0] || point.title;
  const hardOptions = ensureQuestionOptions(
    [hardAnswer, ...hardPool],
    ["Integrated analysis", "Fast recognition across registers", "Complex rhythm beat calculation", "Full major-scale derivation"],
  );

  return [
    {
      id: `${point.id}-supplement-1`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "basic",
      prompt: `Which option most directly matches the core concept of "${point.title}"?`,
      options: conceptOptions,
      answer: conceptAnswer,
      explanation: `A core concept of ${point.title} is: ${conceptAnswer}.`,
    },
    {
      id: `${point.id}-supplement-2`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "medium",
      prompt: `Which exercise type best fits early practice for "${point.title}"?`,
      options: exerciseOptions,
      answer: exerciseAnswer,
      explanation: `${point.title} is currently best matched with: ${exerciseAnswer}.`,
    },
    {
      id: `${point.id}-supplement-3`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "basic",
      prompt: `Which option is a basic training example for "${point.title}"?`,
      options: easyOptions,
      answer: easyAnswer,
      explanation: `A basic training example for ${point.title} is: ${easyAnswer}.`,
    },
    {
      id: `${point.id}-supplement-4`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "medium",
      prompt: `Which option better matches intermediate practice for "${point.title}"?`,
      options: mediumOptions,
      answer: mediumAnswer,
      explanation: `Intermediate training for ${point.title} can use: ${mediumAnswer}.`,
    },
    {
      id: `${point.id}-supplement-5`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "hard",
      prompt: `Which option best fits advanced application of "${point.title}"?`,
      options: hardOptions,
      answer: hardAnswer,
      explanation: `Advanced application for ${point.title} can use: ${hardAnswer}.`,
    },
  ].filter((item) => Array.isArray(item.options) && item.options.length >= 3);
}

function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createLessonPracticePool(lessonId, lessonTitle) {
  const lessonPoints = getKnowledgePointsForLesson(lessonId);
  const focus = HOMEWORK_FOCUS[lessonId] || lessonTitle;
  const formalQuestions = getQuestionsForLesson(lessonId);
  const pool = formalQuestions.length ? shuffleArray(formalQuestions) : [];
  if (!pool.length) {
    pool.push({
      id: `${lessonId}-fallback`,
      lessonId,
      chapterId: "",
      knowledgePointId: lessonPoints[0]?.id || "",
      difficulty: "basic",
      prompt: `What is the core knowledge point of ${lessonTitle}?`,
      options: [focus, "Metronome", "Random guessing"],
      answer: focus,
      explanation: "This question reviews the current lesson focus.",
    });
  }
  return pool;
}

const HOMEWORK_FOCUS = {
  L1: "Four properties of sound and pitch relationships",
  L2: "Temperament, harmonics, and enharmonic spelling",
  L3: "Clefs and staff reading/writing",
  L4: "Notes, rests, and dotted values",
  L5: "Ornament recognition and application",
  L6: "Dynamics, tempo, and expression terms",
  L7: "Repeats and abbreviation signs",
  L8: "Musical term memory and classification",
  L9: "Meter, time signatures, and accent patterns",
  L10: "Duration grouping and tie notation",
  L11: "Syncopation and accent displacement",
  L12: "Integrated application and review",
};

function getIntervalInfo(a, b) {
  if (a == null || b == null) return null;
  const raw = Math.abs(a - b) % 12;
  const diff = raw > 6 ? 12 - raw : raw;
  if (diff === 1) return { label: "Half step", semitones: diff, color: "#1f2937", detail: "These two notes are adjacent half steps." };
  if (diff === 2) return { label: "Whole step", semitones: diff, color: "#111111", detail: "These two notes form a standard whole step." };
  return { label: "Other", semitones: diff, color: "#6b7280", detail: "These two notes are neither a whole step nor a half step.", isError: true };
}

function LessonLearningWorkspaceLegacy() {
  return null;
}

function LessonLearningWorkspace({ lesson, section, showTabs = true, contentPageHint = null, onBktChange = null }) {
  const pptLessonData = getPptLessonData(lesson.id);
  const studentProfile = useMemo(() => getStudentProfile(), []);
  const userId = studentProfile.studentId;
  const homeworkFileInputRef = useRef(null);
  const homeworkCameraInputRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [activeSection, setActiveSection] = useState("content");
  const [selectedNotes, setSelectedNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [lastInterval, setLastInterval] = useState(null);
  const [practiceRound, setPracticeRound] = useState(0);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceAnswers, setPracticeAnswers] = useState([]);
  const [practiceResult, setPracticeResult] = useState(null);
  const [weakCorrectionAnswers, setWeakCorrectionAnswers] = useState({});
  const [homeworkRemaining, setHomeworkRemaining] = useState(30 * 60);
  const [homeworkRunning, setHomeworkRunning] = useState(false);
  const [homeworkDraft, setHomeworkDraft] = useState("");
  const [homeworkImages, setHomeworkImages] = useState([]);
  const [homeworkRhythm, setHomeworkRhythm] = useState(() => createDefaultRhythmSubmission(lesson.id));
  const [homeworkStaff, setHomeworkStaff] = useState(() => createDefaultStaffSubmission());
  const [homeworkPiano, setHomeworkPiano] = useState(() => createDefaultPianoSubmission());
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [audioSubmission, setAudioSubmission] = useState(null);
  const [audioTranscribing, setAudioTranscribing] = useState(false);
  const [homeworkSubmitted, setHomeworkSubmitted] = useState(false);
  const [homeworkFeedback, setHomeworkFeedback] = useState("");
  const [homeworkEvaluation, setHomeworkEvaluation] = useState(null);
  const [homeworkReviewing, setHomeworkReviewing] = useState(false);
  const [showHomeworkDialog, setShowHomeworkDialog] = useState(false);
  const [labelingState, setLabelingState] = useState({ pending: false, message: "" });
  const [stats, setStats] = useState(() => ({
    startedAt: Date.now(),
    interactions: 0,
    errors: 0,
    errorTypes: {},
    lastExplanation: "Click piano keys first. The system explains the interval distance between two selected notes.",
  }));

  useEffect(() => {
    initializeKnowledgeStore(userId);
  }, [userId]);

  const practicePool = useMemo(() => createLessonPracticePool(lesson.id, lesson.t), [lesson.id, lesson.t]);
  const adaptivePool = useMemo(() => chooseAdaptivePracticeQuestions(userId, lesson.id, practicePool), [userId, lesson.id, practicePool]);
  const practiceQuestions = useMemo(
    () => {
      const source = adaptivePool.length ? adaptivePool : practicePool;
      return Array.from({ length: 20 }, (_, idx) => source[(practiceRound * 20 + idx) % source.length]);
    },
    [adaptivePool, practicePool, practiceRound],
  );
  const currentPractice = practiceQuestions[practiceIndex];
  const correctCount = practiceAnswers.filter((item) => item.correct).length;
  const lessonKnowledgeSummary = useMemo(() => summarizeLessonKnowledge(userId, lesson.id), [userId, lesson.id, practiceAnswers, homeworkEvaluation, homeworkSubmitted]);
  const lessonSections = LESSON_LEARNING_SECTIONS[lesson.id] || [];
  const lessonContentItems = (pptLessonData?.knowledgePoints || []).map((item) => ({ h: item.title, b: item.detail })).filter((item) => item.h || item.b).length ? (pptLessonData?.knowledgePoints || []).map((item) => ({ h: item.title, b: item.detail })) : (LESSON_CONTENT[lesson.id] || []);
  const homeworkRequirement = getHomeworkRequirement(lesson.id, lesson.t);
  const lessonHomework = homeworkRequirement.helper;
  const studyMinutes = Math.max(1, Math.ceil((Date.now() - stats.startedAt) / 60000));
  const evaluationDimensions = getEvaluationDimensions(homeworkRequirement);
  const homeworkChannelLabels = homeworkRequirement.channels.map((channel) => HOMEWORK_CHANNEL_LABELS[channel] || channel).join(" / ");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(Boolean(Recognition));
  }, []);

  const startSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError("This browser does not support live speech recognition.");
      return;
    }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onstart = () => {
      setVoiceError("");
      setVoiceListening(true);
    };
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || "")
        .join("")
        .trim();
      if (transcript) {
        setVoiceTranscript((prev) => prev ? `${prev}\n${transcript}` : transcript);
      }
    };
    recognition.onerror = () => {
      setVoiceError("Speech recognition failed. Please use recording transcription instead.");
      setVoiceListening(false);
    };
    recognition.onend = () => {
      setVoiceListening(false);
      speechRecognitionRef.current = null;
    };
    speechRecognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    try {
      speechRecognitionRef.current?.stop();
    } catch {}
    setVoiceListening(false);
  }, []);

  const startAudioRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceError("This browser does not support recording.");
      return;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new window.MediaRecorder(stream);
      audioChunksRef.current = [];
      setVoiceError("");
      recorder.ondataavailable = (event) => {
        if (event.data?.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        if (!audioChunksRef.current.length) {
          setVoiceError("No recording content was captured.");
          return;
        }
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `homework-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
        const audioDataUrl = await fileToDataUrl(file);
        setAudioSubmission({ name: file.name, mimeType: file.type, size: file.size, duration: null });
        setAudioTranscribing(true);
        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioDataUrl,
              fileName: file.name,
              mimeType: file.type,
            }),
          });
          const json = await response.json();
          if (response.ok && json.text) {
            setVoiceTranscript((prev) => prev ? `${prev}\n${json.text}` : json.text);
          } else {
            setVoiceError(json?.error || "Recording transcription failed. Please try again later.");
          }
        } catch {
          setVoiceError("Recording transcription failed. Please try again later.");
        } finally {
          setAudioTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      setVoiceError("Could not start recording. Please check microphone permission.");
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    try {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      setVoiceError("Stopping the recording failed. Please try again.");
    }
  }, []);

  const applyTranscriptToDraft = useCallback(() => {
    const trimmed = voiceTranscript.trim();
    if (!trimmed) return;
    setHomeworkDraft((prev) => prev.trim() ? `${prev.trim()}\n${trimmed}` : trimmed);
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1 }));
  }, [voiceTranscript]);

  const recordError = useCallback((type, explanation) => {
    setStats((prev) => ({
      ...prev,
      errors: prev.errors + 1,
      errorTypes: { ...prev.errorTypes, [type]: (prev.errorTypes[type] || 0) + 1 },
      lastExplanation: explanation,
    }));
  }, []);

  const lessonKnowledgePoints = useMemo(() => getKnowledgePointsForLesson(lesson.id), [lesson.id]);
  const weakEnhancements = useMemo(() => getWeakEnhancementsForLesson(lessonKnowledgePoints.map((item) => item.id)), [lessonKnowledgePoints]);
  const weakPointTitleMap = useMemo(
    () => Object.fromEntries(lessonKnowledgePoints.map((item) => [item.id, item.title])),
    [lessonKnowledgePoints],
  );

  const resolveKnowledgePointForText = useCallback(async (signature, fallbackId = lessonKnowledgePoints[0]?.id || "") => {
    const mappingKey = createKnowledgeMappingKey(lesson.id, signature);
    const cached = getKnowledgeMapping(mappingKey);
    if (cached?.knowledgePointId) return cached.knowledgePointId;
    try {
      setLabelingState({ pending: true, message: "Matching knowledge point..." });
      const response = await fetch("/api/bkt/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          content: signature,
          candidates: lessonKnowledgePoints.map((item) => ({ id: item.id, title: item.title })),
        }),
      });
      const json = await response.json();
      const knowledgePointId = json?.knowledgePointId || fallbackId;
      setKnowledgeMapping(mappingKey, {
        knowledgePointId,
        confidence: Number(json?.confidence || 0.35),
        reason: json?.reason || "Knowledge point cached.",
      });
      return knowledgePointId;
    } catch {
      return fallbackId;
    } finally {
      setLabelingState({ pending: false, message: "" });
    }
  }, [lesson.id, lessonKnowledgePoints]);

  const handleKeyPress = useCallback(async (idx) => {
    await unlockAudioSystem();
    playTone(nFreq(NT[idx], 4), 0.45, "piano", 0.26);
    setActiveNote(idx);
    setTimeout(() => setActiveNote(null), 180);
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1 }));

    setSelectedNotes((prev) => {
      const next = [...prev.slice(-1), idx];
      if (next.length === 2) {
        const interval = getIntervalInfo(next[0], next[1]);
        setLastInterval(interval);
        setStats((prevStats) => ({ ...prevStats, lastExplanation: interval.detail }));
        if (interval.semitones > 7) {
          recordError("Keyboard interval judgment", "The current interval is wide. Start with smaller intervals such as seconds and thirds.");
        }
      }
      return next;
    });
  }, [recordError]);

  const answerPractice = useCallback(async (option) => {
    if (!currentPractice || practiceAnswers[practiceIndex]) return;
    const ok = option === currentPractice.answer;
    const nextAnswers = [...practiceAnswers];
    nextAnswers[practiceIndex] = {
      selected: option,
      correct: ok,
      answer: currentPractice.answer,
      explanation: currentPractice.explanation,
    };
    setPracticeAnswers(nextAnswers);
    setPracticeResult({
      ok,
      message: ok ? "Correct." : `Incorrect. The correct answer is ${currentPractice.answer}.`,
      explanation: currentPractice.explanation,
    });
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1, lastExplanation: currentPractice.explanation }));

    let knowledgePointId = currentPractice.knowledgePointId || "";
    if (!knowledgePointId) {
      knowledgePointId = await resolveKnowledgePointForText(currentPractice.prompt);
    }
    const shouldUpdateBkt = knowledgePointId && currentPractice.evidenceWeight === "strong";
    if (shouldUpdateBkt) {
      updateKnowledgePointEvidence(userId, knowledgePointId, ok ? "correct" : "incorrect", {
        lessonId: lesson.id,
        source: "classroom-practice",
        prompt: currentPractice.prompt,
        difficulty: currentPractice.difficulty || "medium",
      });
      appendSessionRecord(userId, {
        lessonId: lesson.id,
        chapterId: lessonKnowledgePoints[0]?.chapterId || "",
        action: "classroom-practice",
        knowledgePointId,
        correct: ok,
        prompt: currentPractice.prompt,
      });
      await syncKnowledgeSummary(lesson.id);
      onBktChange?.();
    }

    if (!ok) {
      appendErrorRecord(userId, {
        lessonId: lesson.id,
        knowledgePointId,
        type: "Classroom practice question",
        prompt: currentPractice.prompt,
        explanation: currentPractice.explanation,
      });
      recordError("Classroom practice question", currentPractice.explanation);
    }
  }, [currentPractice, practiceAnswers, practiceIndex, recordError, resolveKnowledgePointForText, userId, lesson.id, lessonKnowledgePoints, onBktChange]);

  const answerWeakCorrection = useCallback((answerKey, selected, question) => {
    const correct = selected === question.answer;
    setWeakCorrectionAnswers((prev) => ({
      ...prev,
      [answerKey]: {
        selected,
        correct,
      },
    }));
    setStats((prev) => ({
      ...prev,
      interactions: prev.interactions + 1,
      lastExplanation: question.explanation,
    }));
    if (!correct) {
      recordError("Correction question", question.explanation);
    }
  }, [recordError]);

  const nextPracticeQuestion = useCallback(() => {
    setPracticeResult(null);
    setPracticeIndex((prev) => Math.min(prev + 1, practiceQuestions.length - 1));
  }, [practiceQuestions.length]);

  const restartPractice = useCallback(() => {
    setPracticeRound((prev) => prev + 1);
    setPracticeIndex(0);
    setPracticeAnswers([]);
    setPracticeResult(null);
  }, []);

  const handleHomeworkAddFiles = useCallback(async (event) => {
    const files = Array.from(event.target.files || []).slice(0, 4);
    if (!files.length) return;
    const prepared = await Promise.all(files.map(async (file) => ({
      name: file.name,
      dataUrl: await fileToDataUrl(file),
    })));
    setHomeworkImages((prev) => [...prev, ...prepared].slice(0, 4));
    event.target.value = "";
  }, []);

  const removeHomeworkImage = useCallback((index) => {
    setHomeworkImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const playRhythmMeasure = useCallback(async (measure) => {
    if (!Array.isArray(measure) || !measure.length) return;
    await unlockAudioSystem();
    let offset = 0;
    measure.forEach((item) => {
      if (item.kind === "note") {
        window.setTimeout(() => {
          playTone(392, 0.4, "piano", Math.max(0.12, Math.min(0.35, item.duration * 0.18)));
        }, offset);
      }
      offset += Math.max(180, item.duration * 380) + (item.tieToNext ? 120 : 0);
    });
  }, []);

  const hasRhythmContent = homeworkRhythm.measures.some((measure) => measure.length > 0);
  const hasStaffContent = homeworkStaff.notes.length > 0;
  const hasPianoContent = homeworkPiano.notes.length > 0;
  const hasVoiceContent = Boolean(voiceTranscript.trim() || audioSubmission?.name);
  const rhythmValidation = getRhythmValidation(homeworkRhythm);
  const rhythmMeasuresComplete = rhythmValidation.complete;
  const homeworkSubmissionState = {
    text: Boolean(homeworkDraft.trim()),
    image: homeworkImages.length > 0,
    rhythm: hasRhythmContent,
    staff: hasStaffContent,
    piano: hasPianoContent,
    voice: hasVoiceContent,
  };
  const submissionTypes = [];
  submissionTypes.splice(
    0,
    submissionTypes.length,
    ...(homeworkSubmissionState.text ? [HOMEWORK_CHANNEL_LABELS.text] : []),
    ...(homeworkSubmissionState.image ? [HOMEWORK_CHANNEL_LABELS.image] : []),
    ...(homeworkSubmissionState.rhythm ? [HOMEWORK_CHANNEL_LABELS.rhythm] : []),
    ...(homeworkSubmissionState.staff ? [HOMEWORK_CHANNEL_LABELS.staff] : []),
    ...(homeworkSubmissionState.piano ? [HOMEWORK_CHANNEL_LABELS.piano] : []),
    ...(homeworkSubmissionState.voice ? [HOMEWORK_CHANNEL_LABELS.voice] : []),
  );
  const homeworkHasContent = submissionTypes.length > 0;
  const requiredSubmissionLabels = homeworkRequirement.requiredAnyOf.map((item) => HOMEWORK_CHANNEL_LABELS[item] || item).join(" / ");

  const homeworkItems = (() => {
    const bkt = lessonKnowledgeSummary;
    const criticalWeak = bkt.weak.filter(p => p.pL < 0.45);
    const anyWeak = bkt.weak.filter(p => p.pL < 0.75).slice(0, 2);
    const avgPct = Math.round(bkt.averageMastery * 100);
    const weakList = anyWeak.map(p => p.title + "(" + Math.round(p.pL * 100) + "%)").join(" / ");
    const weakNames = anyWeak.map(p => p.title).join(" / ");
    const focusTopic = HOMEWORK_FOCUS[lesson.id] || lesson.t;
    const evalHelper = homeworkRequirement.helper;
    return [
      "Review topic: " + focusTopic +
        (criticalWeak.length > 0 ? " - priority weak points: " + criticalWeak.map(p => p.title + "(" + Math.round(p.pL*100) + "%)").join(" / ")
        : anyWeak.length > 0 ? " - reinforce: " + weakList
        : ", average mastery " + avgPct + "%, currently stable") + ".",
      "Homework note: " + evalHelper,
      "Practice requirement: focus on " + (weakNames || "all knowledge points") + "; current average mastery is " + avgPct + "%.",
      "Learning trace: studied for " + studyMinutes + " minutes, with " + stats.interactions + " interactions and an average of " + avgPct + "%. Write down the one knowledge point that was hardest today.",
    ];
  })();

  const getKeyCenterX = useCallback((noteIndex) => {
    if (BK.includes(noteIndex)) {
      const wPos = WK.filter((w) => w < noteIndex).length;
      return wPos * 36;
    }
    const whiteIndex = WK.indexOf(noteIndex);
    return whiteIndex * 36 + 17;
  }, []);

  const relationPoints = selectedNotes.length === 2
    ? selectedNotes.map((note) => ({ note, x: getKeyCenterX(note), y: BK.includes(note) ? 40 : 76 }))
    : [];

  const sectionButtonStyle = (id) => ({
    padding: "9px 14px",
    borderRadius: 12,
    border: "1px solid rgba(17,17,17,0.12)",
    background: activeSection === id ? "#111111" : "#ffffff",
    color: activeSection === id ? "#ffffff" : "#111111",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
  });

  useEffect(() => {
    if (section && section !== activeSection) {
      setActiveSection(section);
    }
  }, [section, activeSection]);

  useEffect(() => {
    setHomeworkImages([]);
    setHomeworkRhythm(createDefaultRhythmSubmission(lesson.id));
    setHomeworkStaff(createDefaultStaffSubmission());
    setHomeworkPiano(createDefaultPianoSubmission());
    setHomeworkDraft("");
    setVoiceTranscript("");
    setVoiceError("");
    setAudioSubmission(null);
    setHomeworkSubmitted(false);
    setHomeworkFeedback("");
    setHomeworkEvaluation(null);
    setHomeworkReviewing(false);
    setShowHomeworkDialog(false);
    setHomeworkRemaining(30 * 60);
    setHomeworkRunning(false);
    setWeakCorrectionAnswers({});
  }, [lesson.id]);

  useEffect(() => {
    syncKnowledgeSummary(lesson.id);
    appendSessionRecord(userId, {
      lessonId: lesson.id,
      chapterId: lessonKnowledgePoints[0]?.chapterId || "",
      action: "lesson-open",
    });
  }, [lesson.id, userId, lessonKnowledgePoints]);

  useEffect(() => {
    if (activeSection === "homework" && !homeworkSubmitted && homeworkRemaining > 0) {
      setHomeworkRunning(true);
    }
  }, [activeSection, homeworkSubmitted, homeworkRemaining]);

  useEffect(() => {
    if (!homeworkRunning || homeworkRemaining <= 0) return undefined;
    const timer = window.setInterval(() => {
      setHomeworkRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [homeworkRunning, homeworkRemaining]);

  useEffect(() => {
    if (!showHomeworkDialog || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !homeworkReviewing) {
        setShowHomeworkDialog(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showHomeworkDialog, homeworkReviewing]);

  const formattedHomeworkTime = `${String(Math.floor(homeworkRemaining / 60)).padStart(2, "0")}:${String(homeworkRemaining % 60).padStart(2, "0")}`;

  const openHomeworkSubmit = useCallback(() => {
    if (!homeworkDraft.trim()) {
      setHomeworkFeedback("Complete the homework content on this page before submitting.");
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkDraft]);

  const confirmHomeworkSubmit = useCallback(() => {
    const feedback = homeworkDraft.length > 80
      ? "Submitted. The content is fairly complete. Next, check term accuracy and whether examples match the lesson's core concepts."
      : "Submitted. The current answer is brief. Add term explanations, examples, or rhythm/interval analysis.";
    setHomeworkSubmitted(true);
    setHomeworkRunning(false);
    setHomeworkFeedback(feedback);
    setStats((prev) => ({ ...prev, interactions: prev.interactions + 1 }));
    setShowHomeworkDialog(false);
  }, [homeworkDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      reportStudentAnalytics({
        lessonId: lesson.id,
        lessonTitle: lesson.t,
        source: "learning-workspace",
        section: activeSection,
        studyMinutes,
        interactions: stats.interactions,
        errors: stats.errors,
        errorTypes: stats.errorTypes,
        homeworkRemaining,
        homeworkSubmitted,
        homeworkLength: homeworkDraft.length,
        homeworkText: homeworkDraft,
        homeworkImages,
        homeworkImageCount: homeworkImages.length,
        homeworkRhythmData: normalizeRhythmSubmission(homeworkRhythm),
        homeworkStaffData: homeworkStaff,
        homeworkPianoData: homeworkPiano,
        homeworkVoiceTranscript: voiceTranscript,
        homeworkAudioMeta: audioSubmission ? { name: audioSubmission.name, mimeType: audioSubmission.mimeType, size: audioSubmission.size, duration: audioSubmission.duration } : null,
        evaluationScores: homeworkEvaluation?.scores || null,
        evaluationTags: homeworkEvaluation?.tags || [],
        evaluationComment: homeworkEvaluation?.overallComment || "",
        submissionTypes,
        lastExplanation: stats.lastExplanation,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [lesson.id, lesson.t, activeSection, studyMinutes, stats, homeworkRemaining, homeworkSubmitted, homeworkDraft.length, homeworkImages, homeworkRhythm, homeworkStaff, homeworkPiano, voiceTranscript, audioSubmission, homeworkEvaluation, submissionTypes]);

  const openMixedHomeworkSubmit = useCallback(() => {
    if (!homeworkHasContent) {
      setHomeworkFeedback("Add at least one item before submitting: text, image, rhythm, staff notation, or piano input.");
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkHasContent]);

  const confirmMixedHomeworkSubmit = useCallback(async () => {
    setHomeworkReviewing(true);
    try {
      const response = await fetch("/api/homework-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          lessonTitle: lesson.t,
          homeworkPrompt: lessonHomework,
          text: homeworkDraft,
          images: homeworkImages,
          rhythmSubmission: normalizeRhythmSubmission(homeworkRhythm),
          staffSubmission: homeworkStaff,
          pianoSubmission: homeworkPiano,
          voiceTranscript,
          audioSubmission,
          evaluationContext: {
            evaluationType: homeworkRequirement.evaluationType,
            dimensions: evaluationDimensions,
          },
        }),
      });
      const json = await response.json();
      const evaluation = json?.evaluation || null;
      const feedback = String(json?.text || "The system recorded your homework and is waiting for teacher review.");
      setHomeworkSubmitted(true);
      setHomeworkRunning(false);
      setHomeworkFeedback(feedback);
      setHomeworkEvaluation(evaluation);
      setStats((prev) => ({ ...prev, interactions: prev.interactions + 1, lastExplanation: "Homework was submitted and the AI first review is complete." }));
      setShowHomeworkDialog(false);
      reportStudentAnalytics({
        lessonId: lesson.id,
        lessonTitle: lesson.t,
        source: "learning-workspace",
        section: "homework",
        studyMinutes,
        interactions: stats.interactions + 1,
        errors: stats.errors,
        errorTypes: stats.errorTypes,
        homeworkSeconds: 30 * 60 - homeworkRemaining,
        homeworkRemaining,
        homeworkSubmitted: true,
        homeworkLength: homeworkDraft.length,
        homeworkText: homeworkDraft,
        homeworkImages,
        homeworkImageCount: homeworkImages.length,
        homeworkRhythmData: normalizeRhythmSubmission(homeworkRhythm),
        homeworkStaffData: homeworkStaff,
        homeworkPianoData: homeworkPiano,
        homeworkVoiceTranscript: voiceTranscript,
        homeworkAudioMeta: audioSubmission ? { name: audioSubmission.name, mimeType: audioSubmission.mimeType, size: audioSubmission.size, duration: audioSubmission.duration } : null,
        aiHomeworkFeedback: feedback,
        evaluationScores: evaluation?.scores || null,
        evaluationTags: evaluation?.tags || [],
        evaluationComment: evaluation?.overallComment || "",
        submissionTypes,
        lastExplanation: "Homework was submitted and the AI first review is complete.",
      });

      const scoreValues = Object.values(evaluation?.scores || {}).map((value) => Number(value || 0));
      const averageEvaluationScore = scoreValues.length
        ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length
        : 75;
      const homeworkObservation = averageEvaluationScore >= 80 ? "correct" : averageEvaluationScore < 65 ? "incorrect" : "neutral";
      const matchedKnowledgePointId = await resolveKnowledgePointForText(
        `${lessonHomework}\n${homeworkDraft}\n${voiceTranscript}`.trim(),
        lessonKnowledgePoints[0]?.id || "",
      );
      const matchedKnowledgePoint = lessonKnowledgePoints.find((item) => item.id === matchedKnowledgePointId);
      const shouldUpdateHomeworkBkt = matchedKnowledgePointId
        && homeworkObservation !== "neutral"
        && !/Integrated Review/.test(matchedKnowledgePoint?.title || "");
      if (shouldUpdateHomeworkBkt) {
        updateKnowledgePointEvidence(userId, matchedKnowledgePointId, homeworkObservation, {
          lessonId: lesson.id,
          source: "homework-review",
          prompt: lessonHomework,
          score: averageEvaluationScore,
          difficulty: averageEvaluationScore >= 80 ? "hard" : "medium",
        });
        await syncKnowledgeSummary(lesson.id);
        onBktChange?.();
      }
      appendSessionRecord(userId, {
        lessonId: lesson.id,
        chapterId: lessonKnowledgePoints[0]?.chapterId || "",
        action: "homework-submit",
        knowledgePointId: matchedKnowledgePointId,
        score: Number(averageEvaluationScore.toFixed(1)),
        submissionTypes,
      });
    } catch {
      setHomeworkFeedback("Homework submission failed. Check the network and try again.");
    } finally {
      setHomeworkReviewing(false);
    }
  }, [lesson.id, lesson.t, lessonHomework, homeworkDraft, homeworkImages, homeworkRhythm, homeworkStaff, homeworkPiano, voiceTranscript, audioSubmission, homeworkRequirement, evaluationDimensions, studyMinutes, stats, homeworkRemaining, submissionTypes, resolveKnowledgePointForText, lessonKnowledgePoints, userId, onBktChange]);

  const openLessonHomeworkSubmit = useCallback(() => {
    if (!homeworkHasContent) {
      setHomeworkFeedback("Add the required homework content for this lesson before submitting.");
      return;
    }
    const requiredOk = homeworkRequirement.requiredAnyOf.some((type) => homeworkSubmissionState[type]);
    const rhythmNeedsFix = homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete;
    if (!requiredOk) {
      setHomeworkFeedback(`Complete at least one of these submission types: ${requiredSubmissionLabels}.`);
      return;
    }
    if (rhythmNeedsFix) {
      setHomeworkFeedback(rhythmValidation.issues.join(" "));
      return;
    }
    if (homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete) {
      setHomeworkFeedback("The rhythm homework is incomplete. Check whether each measure matches the meter.")
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkHasContent, homeworkRequirement, homeworkSubmissionState, rhythmMeasuresComplete]);

  return (
    <div style={{ marginTop: 10, marginBottom: 14 }}>
      {showTabs && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setActiveSection("content")} style={sectionButtonStyle("content")}>Content</button>
        <button onClick={() => setActiveSection("practice")} style={sectionButtonStyle("practice")}>Classroom Practice</button>
        <button onClick={() => setActiveSection("homework")} style={sectionButtonStyle("homework")}>Homework</button>
      </div>}

      {activeSection === "content" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>Content</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
          Start with reinforcement cards for the most confusing points, then review the full lesson PPT.
        </div>
        <WeakPointExplanationCards items={weakEnhancements} titleMap={weakPointTitleMap} />
        {lesson.id === "L2" ? <TemperamentEnharmonicWidgetCn /> : null}
        {lesson.id === "L3" ? <TrebleClefDrillWidgetCn /> : null}
        {lesson.id === "L3" ? <BassClefDrillWidgetCn /> : null}
        {lesson.id === "L4" ? <DotsAndTiesGuideWidgetCn /> : null}
        {lesson.id === "L4" ? <NoteValueHierarchyWidgetCn /> : null}
        {lesson.id === "L5" ? <TrillVsMordentWidgetCn /> : null}
        {lesson.id === "L5" ? <OrnamentComparisonWidgetCn /> : null}
        {lesson.id === "L6" ? <DynamicsScaleWidgetCn /> : null}
        {lesson.id === "L6" ? <ArticulationContrastWidgetCn /> : null}
        {lesson.id === "L7" ? <RepeatPathGuideWidgetCn /> : null}
        {lesson.id === "L7" ? <DcDsCodaGuideWidgetCn /> : null}
        {lesson.id === "L8" ? <ExpressionVsTempoCardCn /> : null}
        {lesson.id === "L9" ? <MeterAccentGuideWidgetCn /> : null}
        {lesson.id === "L10" ? <CrossBarTieGuideWidgetCn /> : null}
        {lesson.id === "L11" ? <SyncopationTypeGuideWidgetCn /> : null}
        {lesson.id === "L11" ? <SyncopationPatternWidgetCn /> : null}
        {pptLessonData && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{`Lesson ${pptLessonData.lessonNumber}`}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              {pptLessonData.chapter}
              <br />
              {pptLessonData.lessonTitle}
            </div>
          </div>
        )}
        {pptLessonData && <PptContentEmbedFixed lessonId={lesson.id} pageHint={contentPageHint} />}
      </div>}

      {activeSection === "practice" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>Classroom Practice</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          The system combines your content interactions with a 20-question practice set and reports the current mastery state.
        </div>
        {weakEnhancements.length ? (
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Practice Guidance</div>
            <div style={{ display: "grid", gap: 8 }}>
              {weakEnhancements.map((item) => (
                <div key={`guide-${item.knowledgePointId}`} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(83,74,183,0.05)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{weakPointTitleMap[item.knowledgePointId] || item.knowledgePointId}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, whiteSpace: "pre-line" }}>
                    {item.practiceGuide.map((line) => `• ${line}`).join("\n")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Knowledge Mastery Summary</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            Stronger points: {lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "No stable strength yet"}
            <br />
            Current weak points: {lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "None"}
            <br />
            Next recommendation: {getRecommendationFromSummary(lessonKnowledgeSummary)}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Interactive Check</div>
          <div style={{ fontSize: 11, color: stats.errors > 0 ? "#b91c1c" : "var(--color-text-secondary)" }}>
            {lastInterval ? `Most recent result: ${lastInterval.label}. ${lastInterval.detail}` : "Complete one piano or interactive action in Content first, then the system will generate a check result."}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Practice Question</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Question {practiceIndex + 1} / {practiceQuestions.length}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                {{"concept-recognition":"Concept Recognition","knowledge-point-match":"Knowledge-Point Match","exclusion":"Exclusion","application":"Application","analysis":"Analysis","specific-fact":"Specific Fact","contrast":"Contrast"}[currentPractice?.questionType] ?? "Integrated Question"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7, marginBottom: 8 }}>{currentPractice?.prompt}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {currentPractice?.options.map((option) => (
              <button key={option} onClick={() => answerPractice(option)} disabled={Boolean(practiceAnswers[practiceIndex])} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.1)", background: practiceAnswers[practiceIndex] && option === currentPractice.answer ? "#111111" : "#ffffff", color: practiceAnswers[practiceIndex] && option === currentPractice.answer ? "#ffffff" : "#111111", cursor: practiceAnswers[practiceIndex] ? "default" : "pointer" }}>
                {option}
              </button>
            ))}
          </div>
          {practiceResult && <div style={{ marginTop: 8, fontSize: 11, color: practiceResult.ok ? "#166534" : "#b91c1c", lineHeight: 1.8 }}>
            {practiceResult.message}
            <br />
            {practiceResult.explanation}
          </div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={nextPracticeQuestion} disabled={!practiceAnswers[practiceIndex] || practiceIndex >= practiceQuestions.length - 1} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#111111", color: "#ffffff", cursor: !practiceAnswers[practiceIndex] || practiceIndex >= practiceQuestions.length - 1 ? "default" : "pointer" }}>Next Question</button>
            <button onClick={restartPractice} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>Generate a New 20-Question Set</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-secondary)" }}>
            Correct / Total: {correctCount}/{practiceQuestions.length}
          </div>
        </div>
      </div>}

      {activeSection === "homework" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>Homework</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          The system generates homework guidance from this lesson's knowledge points and records study time, error types, and interaction data for teacher review.
        </div>
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111", marginBottom: 6 }}>Adaptive Recommendation</div>
          Stronger points: {lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "No stable strength yet"}
          <br />
          Current weak points: {lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "None"}
          <br />
          Next recommendation: {getRecommendationFromSummary(lessonKnowledgeSummary)}
          {labelingState.pending ? <><br />Knowledge-point matching: {labelingState.message}</> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Homework Timer</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111111" }}>{formattedHomeworkTime}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button onClick={() => setHomeworkRunning(true)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>Resume Timer</button>
              <button onClick={() => setHomeworkRunning(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#ffffff", cursor: "pointer" }}>Pause</button>
              <button onClick={() => { setHomeworkRunning(false); setHomeworkRemaining(30 * 60); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>Reset to 30 Minutes</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              The countdown starts automatically when this page opens.
              <br />
              AI assigned task: {lessonHomework}
              <br />
              Current learning trace: about {studyMinutes} minutes, {stats.interactions} interactions.
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>AI-Generated Homework</div>
            <div style={{ display: "grid", gap: 8 }}>
              {homeworkItems.map((item) => (
                <div key={item} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.7, padding: "8px 10px", borderRadius: 10, background: "#f8f8f8" }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          <div style={{ marginBottom: 4 }}>Submission channels: {homeworkChannelLabels}</div>
          <div>Homework note: {homeworkRequirement.helper}</div>
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {homeworkRequirement.channels.includes("image") && <HomeworkImageUploader
            images={homeworkImages}
            onAddFiles={handleHomeworkAddFiles}
            onRemoveImage={removeHomeworkImage}
            fileInputRef={homeworkFileInputRef}
            cameraInputRef={homeworkCameraInputRef}
          />}
          {homeworkRequirement.channels.includes("rhythm") && <RhythmHomeworkEditorV2
            rhythmSubmission={homeworkRhythm}
            onChange={(updater) => setHomeworkRhythm((prev) => normalizeRhythmSubmission(typeof updater === "function" ? updater(prev) : updater))}
            onPlay={playRhythmMeasure}
          />}
          {homeworkRequirement.channels.includes("staff") && <StaffHomeworkEditorV2
            staffSubmission={homeworkStaff}
            onChange={(updater) => setHomeworkStaff((prev) => (typeof updater === "function" ? updater(prev) : updater))}
          />}
          {homeworkRequirement.channels.includes("piano") && <HomeworkPianoEditor
            pianoSubmission={homeworkPiano}
            onChange={(updater) => setHomeworkPiano((prev) => (typeof updater === "function" ? updater(prev) : updater))}
          />}
          {homeworkRequirement.channels.includes("voice") && <HomeworkVoiceInput
            transcript={voiceTranscript}
            audioSubmission={audioSubmission}
            voiceSupported={voiceSupported}
            listening={voiceListening}
            transcribing={audioTranscribing}
            error={voiceError}
            onStartListening={startSpeechRecognition}
            onStopListening={stopSpeechRecognition}
            onStartRecording={startAudioRecording}
            onStopRecording={stopAudioRecording}
            onApplyTranscript={applyTranscriptToDraft}
          />}
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Written Explanation</div>
            <textarea
              value={homeworkDraft}
              onChange={(e) => setHomeworkDraft(e.target.value)}
              placeholder="Add concept explanations, homework reasoning, rhythm analysis, pitch-judgment evidence, or notes about uploaded photos."
              style={{ width: "100%", minHeight: 140, borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", padding: 12, fontSize: 12, lineHeight: 1.8, resize: "vertical", outline: "none" }}
            />
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>Submission Overview</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                Submission type: {submissionTypes.length ? submissionTypes.join(" / ") : "Not started"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Written Explanation</div>
                <div style={{ fontSize: 12, color: "#111111" }}>{homeworkDraft.trim() ? `${homeworkDraft.trim().slice(0, 60)}${homeworkDraft.trim().length > 60 ? "..." : ""}` : "Not filled"}</div>
              </div>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Rhythm Editor</div>
                <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizeRhythmSubmission(homeworkRhythm)}</div>
              </div>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Staff Correction</div>
                <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizeStaffSubmission(homeworkStaff)}</div>
              </div>
              {homeworkRequirement.channels.includes("piano") ? (
                <div className="subtle-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Piano Input</div>
                  <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizePianoSubmission(homeworkPiano)}</div>
                </div>
              ) : null}
              {homeworkRequirement.channels.includes("voice") ? (
                <div className="subtle-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Voice Transcript</div>
                  <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{voiceTranscript.trim() || "Not entered"}</div>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                Error types: {Object.keys(stats.errorTypes).length ? Object.entries(stats.errorTypes).map(([k, v]) => `${k} x${v}`).join("; ") : "No error records yet"}
              </div>
              <button onClick={openLessonHomeworkSubmit} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>
                Submit Homework
              </button>
            </div>
            {homeworkFeedback && <div style={{ marginTop: 10, fontSize: 11, color: homeworkSubmitted ? "#166534" : "#b91c1c", whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{homeworkFeedback}</div>}
            <div style={{ marginTop: 10 }}>
              <HomeworkEvaluationCard evaluation={homeworkEvaluation} />
            </div>
          </div>
        </div>
        {showHomeworkDialog && <div onClick={() => { if (!homeworkReviewing) setShowHomeworkDialog(false); }} style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.36)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: "min(640px, 100%)", background: "#ffffff", borderRadius: 16, padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Confirm Homework Submission</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
              Time remaining: {formattedHomeworkTime}. After submission, the AI first review will be generated and synced to the teacher dashboard.
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111" }}>
                <strong>Submission type: </strong>{submissionTypes.join(" / ") || "Not filled"}
              </div>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111", lineHeight: 1.8 }}>
                <strong>Written explanation: </strong>{homeworkDraft.trim() || "Not filled"}
              </div>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111", lineHeight: 1.8 }}>
                <strong>Image count: </strong>{homeworkImages.length}
                <br />
                <strong>Rhythm summary: </strong>{summarizeRhythmSubmission(homeworkRhythm)}
                <br />
                <strong>Staff summary: </strong>{summarizeStaffSubmission(homeworkStaff)}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowHomeworkDialog(false)} disabled={homeworkReviewing} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: homeworkReviewing ? "default" : "pointer" }}>Keep Editing</button>
              <button onClick={confirmMixedHomeworkSubmit} disabled={homeworkReviewing} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: homeworkReviewing ? "default" : "pointer" }}>
                {homeworkReviewing ? "AI Reviewing..." : "Confirm Submit"}
              </button>
            </div>
          </div>
        </div>}
      </div>}
    </div>
  );
}

function LessonSectionCharts({ lessonId }) {
  if (lessonId !== "L1") return null;
  return (
    <div style={{ marginTop: 14 }}>
      <LessonCharts lessonId={lessonId} />
    </div>
  );
}

function InteractivePitchFrequencyWidget() {
  const noteItems = [
    { label: "C3", freq: 130.81 },
    { label: "G3", freq: 196.0 },
    { label: "C4", freq: 261.63 },
    { label: "G4", freq: 392.0 },
    { label: "C5", freq: 523.25 },
  ];
  const [activeIndex, setActiveIndex] = useState(2);

  const playInteractiveNote = useCallback(async (index) => {
    const item = noteItems[index];
    if (!item) return;
    setActiveIndex(index);
    await unlockAudioSystem();
    playTone(item.freq, 0.55, "piano", 0.28);
  }, []);

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Interactive Pitch and Frequency Piano</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        Click the keys below to hear pitch and watch frequency bars change with keyboard position.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 146 }}>
            {noteItems.map((item, index) => {
              const height = Math.max(36, Math.round(item.freq / 4));
              const active = index === activeIndex;
              return (
                <button
                  key={item.label}
                  onClick={() => playInteractiveNote(index)}
                  style={{
                    flex: 1,
                    height: 140,
                    borderRadius: 14,
                    border: active ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                    background: "#ffffff",
                    cursor: "pointer",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    boxShadow: active ? "inset 0 -16px 28px rgba(17,17,17,0.08)" : "none",
                  }}
                >
                  <div style={{ width: "100%", height, borderRadius: 10, background: active ? "#111111" : "#D1D5DB", transition: "height 0.2s ease" }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginTop: 10 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>{`${item.freq} Hz`}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Selected Note</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{noteItems[activeIndex].label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`Frequency: ${noteItems[activeIndex].freq} Hz`}
            <br />
            Rule: higher frequency sounds like higher pitch.
            <br />
            Try C3, C4, and C5 in order to feel how frequency doubles across octaves.
          </div>
        </div>
      </div>
    </div>
  );
}

function PptContentEmbed({ lessonId, pageHint }) {
  return <PptContentEmbedFixed lessonId={lessonId} pageHint={pageHint} />;
}

function PptContentEmbedCn({ lessonId, pageHint }) {
  return <PptContentEmbedFixed lessonId={lessonId} pageHint={pageHint} />;
}

function PptContentEmbedFixed({ lessonId, pageHint = null }) {
  const lessonData = getPptLessonData(lessonId);
  const [pageIndex, setPageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const slideNumbers = useMemo(() => {
    if (!lessonData?.lessonNumber) return [];
    if (lessonId === "L1") return [1, 2, 3, 4, 5, 6];
    if (lessonId === "L2") return [1, 2, 3, 4, 5, 6];
    if (lessonId === "L3") return [7, 8, 9, 10, 11, 12];
    if (lessonId === "L4") return [13, 14, 15, 16, 17, 18];
    if (lessonId === "L5") return [1, 2, 3, 4, 5];
    if (lessonId === "L6") return [6, 7, 8, 9, 10];
    if (lessonId === "L7") return [11, 12, 13, 14, 15];
    if (lessonId === "L8") return [16, 17, 18, 19, 20];
    if (lessonId === "L9") return [1, 2, 3, 4, 5];
    if (lessonId === "L10") return [6, 7, 8, 9, 10];
    if (lessonId === "L11") return [11, 12, 13, 14, 15];
    if (lessonId === "L12") return [16, 17, 18, 19, 20];
    const lessonNo = lessonData.lessonNumber;
    const start = 2 + (lessonNo - 1) * 4;
    return [start, start + 1, start + 2];
  }, [lessonData, lessonId]);

  useEffect(() => {
    setPageIndex(0);
  }, [lessonId]);

  useEffect(() => {
    if (pageHint == null || Number.isNaN(Number(pageHint))) return;
    const nextIndex = Math.max(0, Math.min(slideNumbers.length - 1, Number(pageHint)));
    setPageIndex(nextIndex);
  }, [pageHint, slideNumbers.length]);

  useEffect(() => {
    if (!lightboxOpen || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen]);

  if (!lessonData || slideNumbers.length === 0) return null;

  const currentSlideNo = slideNumbers[pageIndex];
  const imageRoot =
    lessonId === "L1"
      ? "/ppt-images-l1"
      : (lessonId === "L2" || lessonId === "L3" || lessonId === "L4")
        ? "/ppt-images-l234"
        : (lessonId === "L5" || lessonId === "L6" || lessonId === "L7" || lessonId === "L8")
          ? "/ppt-images-l5678"
          : (lessonId === "L9" || lessonId === "L10" || lessonId === "L11" || lessonId === "L12")
            ? "/ppt-images-l912"
            : "/ppt-images";
  const sourcePpt =
    lessonId === "L1"
      ? "/ppt/MusicAI_L1_Sample.pptx"
      : (lessonId === "L2" || lessonId === "L3" || lessonId === "L4")
        ? "/ppt/MusicAI_L2_L3_L4.pptx"
        : (lessonId === "L5" || lessonId === "L6" || lessonId === "L7" || lessonId === "L8")
          ? "/ppt/MusicAI_L5_L6_L7_L8.pptx"
          : (lessonId === "L9" || lessonId === "L10" || lessonId === "L11" || lessonId === "L12")
            ? "/ppt/MusicAI_L9_L10_L11_L12.pptx"
            : "/ppt/MusicAI_12_Lessons.pptx";
  const imageSrc = `${imageRoot}/slide-${currentSlideNo}.png`;

  return (
    <div className="section-card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Lesson PPT</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`Lesson ${lessonData.lessonNumber} - ${lessonData.lessonTitle}`}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
            disabled={pageIndex === 0}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: pageIndex === 0 ? "default" : "pointer" }}
          >
            Previous
          </button>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`${pageIndex + 1} / ${slideNumbers.length}`}</div>
          <button
            onClick={() => setPageIndex((prev) => Math.min(slideNumbers.length - 1, prev + 1))}
            disabled={pageIndex === slideNumbers.length - 1}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: pageIndex === slideNumbers.length - 1 ? "default" : "pointer" }}
          >
            Next
          </button>
        </div>
      </div>
      <div className="subtle-card" style={{ padding: 14 }}>
        <img
          src={imageSrc}
          alt={`${lessonData.lessonTitle} - slide ${currentSlideNo}`}
          loading="lazy"
          onClick={() => setLightboxOpen(true)}
          style={{ width: "100%", display: "block", borderRadius: 12, border: "1px solid rgba(17,17,17,0.08)", background: "#f6f6f6", cursor: "zoom-in" }}
        />
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Click the current slide to enlarge it.</div>
        <a href={sourcePpt} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#185FA5", textDecoration: "none" }}>
          Open Original PPT
        </a>
      </div>
      {lightboxOpen ? (
        <div
          onClick={() => setLightboxOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(10,10,10,0.86)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ position: "relative", width: "min(1200px, 100%)", maxHeight: "94vh", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              style={{ position: "absolute", top: -8, right: -8, width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(255,255,255,0.22)", background: "rgba(17,17,17,0.88)", color: "#ffffff", cursor: "pointer", fontSize: 16, zIndex: 2 }}
            >
              x
            </button>
            <img
              src={imageSrc}
              alt={`${lessonData.lessonTitle} - slide ${currentSlideNo} enlarged view`}
              style={{ maxWidth: "100%", maxHeight: "94vh", width: "auto", height: "auto", display: "block", borderRadius: 14, background: "#ffffff" }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LessonMediaHub({ lesson }) {
  return null;
}

function LessonSupportLinks({ onOpen }) {
  const items = [
    { id: "tutor", label: "AI Tutor", desc: "Ask about the current lesson and get explanations, correction, and review advice." },
    { id: "lab", label: "Music Creation Lab", desc: "Open the music creation lab for extended exploration." },
  ];

  return (
    <div className="support-grid">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item.id)}
          className="support-tile"
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>{item.desc}</div>
        </button>
      ))}
    </div>
  );
}

function KnowledgeMindMap({ lessonTitle, chapterTitle, items = [], onNodeSelect }) {
  const nodes = items.slice(0, 4);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 860 : false));
  const summarize = (text) => String(text || "").split(/\n+/).filter(Boolean).join(" ").slice(0, isMobile ? 18 : 24);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setIsMobile(window.innerWidth <= 860);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const layoutNodes = nodes.map((item, index) => {
    const isLeft = index < Math.ceil(nodes.length / 2);
    const leftPositions = [70, 180, 290];
    const rightPositions = [95, 220, 345];
    const laneIndex = isLeft ? index : index - Math.ceil(nodes.length / 2);
    return {
      ...item,
      index,
      isLeft,
      x: isLeft ? 70 : 690,
      y: (isLeft ? leftPositions : rightPositions)[laneIndex] || (90 + laneIndex * 120),
      anchorX: isLeft ? 290 : 690,
      anchorY: ((isLeft ? leftPositions : rightPositions)[laneIndex] || (90 + laneIndex * 120)) + 44,
    };
  });

  return (
    <div className="section-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Knowledge Map</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{chapterTitle}</div>
        </div>
        <Tag color="#111111" bg="#F3F4F6">{`${nodes.length} preview strands`}</Tag>
      </div>

      {isMobile ? (
        <div style={{ borderRadius: 22, background: "linear-gradient(180deg, #fcfcfc 0%, #f5f5f5 100%)", border: "1px solid rgba(17,17,17,0.08)", padding: 14 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 18,
              background: "linear-gradient(180deg, rgba(17,17,17,0.98), rgba(36,36,36,0.95))",
              color: "#ffffff",
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginBottom: 8 }}>Central Topic</div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35, marginBottom: 10 }}>{lessonTitle}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.7 }}>
              Review the four main nodes first, then open the complete lesson PPT.
            </div>
          </div>

          <div style={{ position: "relative", paddingLeft: 24, display: "grid", gap: 12 }}>
            <div style={{ position: "absolute", left: 11, top: 6, bottom: 6, width: 2, background: "rgba(17,17,17,0.12)" }} />
            {nodes.map((item, index) => {
              const active = hoveredIndex === index;
              return (
                <button
                  key={`${lessonTitle}-mobile-map-${index}`}
                  type="button"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(index)}
                  onBlur={() => setHoveredIndex(null)}
                  onClick={() => onNodeSelect?.(index)}
                  style={{
                    position: "relative",
                    padding: 14,
                    borderRadius: 16,
                    background: active ? "#111111" : "rgba(255,255,255,0.96)",
                    border: active ? "1px solid #111111" : "1px solid rgba(17,17,17,0.1)",
                    boxShadow: active ? "0 12px 28px rgba(17,17,17,0.14)" : "0 8px 20px rgba(17,17,17,0.06)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ position: "absolute", left: -21, top: 18, width: 12, height: 12, borderRadius: 999, background: active ? "#111111" : "#ffffff", border: "2px solid #111111" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 999, background: active ? "#ffffff" : "#111111", color: active ? "#111111" : "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                      {index + 1}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#ffffff" : "#111111", lineHeight: 1.4 }}>{item.h}</div>
                  </div>
                  <div style={{ fontSize: 12, color: active ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    {summarize(item.b)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: active ? "rgba(255,255,255,0.88)" : "#111111", marginTop: 8 }}>
                    Open the related lesson content
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="kmap-canvas">
          <div style={{ position: "relative", width: 980, minHeight: 470, margin: "0 auto", padding: "18px 0" }}>
            <svg
              width="980"
              height="470"
              viewBox="0 0 980 470"
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="mind-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(83,74,183,0.16)" />
                  <stop offset="100%" stopColor="rgba(83,74,183,0.55)" />
                </linearGradient>
              </defs>
              {layoutNodes.map((item) => {
                const active = hoveredIndex === item.index;
                const curve = `M 490 235 C ${item.isLeft ? 430 : 550} 235, ${item.isLeft ? 360 : 620} ${item.anchorY}, ${item.anchorX} ${item.anchorY}`;
                return (
                  <g key={`line-${lessonTitle}-${item.index}`}>
                    <path
                      className="kmap-link"
                      d={curve}
                      pathLength="1"
                      stroke={active ? "#111111" : "url(#mind-line-gradient)"}
                      strokeWidth={active ? 4 : 2.5}
                      style={{ animationDelay: `${item.index * 0.12}s` }}
                    />
                    <path
                      className="kmap-link is-flow"
                      d={curve}
                      pathLength="1"
                      stroke={active ? "rgba(255,255,255,0.92)" : "#534AB7"}
                      strokeWidth={active ? 4.5 : 3}
                      style={{ opacity: active ? 0.9 : 0.55 }}
                    />
                    <circle
                      className="kmap-anchor-dot"
                      cx={item.anchorX}
                      cy={item.anchorY}
                      r={active ? 5 : 4}
                      fill={active ? "#111111" : "#534AB7"}
                      style={{ animationDelay: `${item.index * 0.3}s` }}
                    />
                  </g>
                );
              })}
            </svg>

            <div
              style={{
                position: "absolute",
                left: 380,
                top: 150,
                width: 220,
                minHeight: 150,
                padding: 18,
                borderRadius: 24,
                background: "linear-gradient(180deg, rgba(17,17,17,0.98), rgba(36,36,36,0.95))",
                color: "#ffffff",
                boxShadow: "0 18px 40px rgba(17,17,17,0.18)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginBottom: 8 }}>Central Topic</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, marginBottom: 10 }}>{lessonTitle}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.7 }}>
                Review the four main nodes first, then move to content and classroom practice.
              </div>
            </div>

            {layoutNodes.map((item) => (
              <button
                key={`${lessonTitle}-map-${item.index}`}
                type="button"
                onMouseEnter={() => setHoveredIndex(item.index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(item.index)}
                onBlur={() => setHoveredIndex(null)}
                onClick={() => onNodeSelect?.(item.index)}
                style={{
                  position: "absolute",
                  left: item.x,
                  top: item.y,
                  width: 220,
                  padding: 14,
                  borderRadius: 18,
                  background: hoveredIndex === item.index ? "#111111" : "rgba(255,255,255,0.96)",
                  border: hoveredIndex === item.index ? "1px solid #111111" : "1px solid rgba(17,17,17,0.1)",
                  boxShadow: hoveredIndex === item.index ? "0 16px 32px rgba(17,17,17,0.14)" : "0 8px 24px rgba(17,17,17,0.06)",
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 999, background: hoveredIndex === item.index ? "#ffffff" : "#111111", color: hoveredIndex === item.index ? "#111111" : "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
                    {item.index + 1}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: hoveredIndex === item.index ? "#ffffff" : "#111111", lineHeight: 1.4 }}>{item.h}</div>
                </div>
                <div style={{ fontSize: 12, color: hoveredIndex === item.index ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  {summarize(item.b)}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: hoveredIndex === item.index ? "rgba(255,255,255,0.88)" : "#111111", marginTop: 10 }}>
                  Open the related lesson content
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LessonView({ lesson, ratings, setRating, scores, setScore }) {
  const [tab, setTab] = useState("learn");
  const [labOpen, setLabOpen] = useState(false);
  const [contentPageHint, setContentPageHint] = useState(null);
  const [bktVersion, setBktVersion] = useState(0);
  const [homeworkGuideOpen, setHomeworkGuideOpen] = useState(false);
  const [homeworkContactOpen, setHomeworkContactOpen] = useState(false);

  const ExComponent = EXERCISE_COMPONENTS[lesson.ex];
  const pptLessonData = getPptLessonData(lesson.id);
  const contentItems = (pptLessonData?.knowledgePoints || []).map((item, index) => ({
    h: item.title || `Knowledge Point ${index + 1}`,
    b: item.detail || "",
  }));
  const handleScore = (v) => setScore(lesson.id, v);
  const displayTabs = [
    { id: "learn", label: "Pre-Lesson" },
    { id: "content", label: "Content" },
    { id: "classroom", label: "Classroom Practice" },
    { id: "homework", label: "Homework" },
    { id: "tutor", label: "AI Tutor" },
  ];
  const lessonKnowledgeSummary = useMemo(() => summarizeLessonKnowledge(getStudentProfile().studentId, lesson.id), [lesson.id, bktVersion]);

  useEffect(() => {
    reportStudentAnalytics({
      lessonId: lesson.id,
      lessonTitle: lesson.t,
      source: "lesson-summary",
      section: tab,
      score: scores[lesson.id] || 0,
      rating: ratings[lesson.id] || 0,
    });
  }, [lesson.id, lesson.t, tab, scores, ratings]);

  useEffect(() => {
    setContentPageHint(null);
  }, [lesson.id]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Tag color="#3C3489" bg="#EEEDFE">{`Lesson ${lesson.n}`}</Tag>
            <Stars value={ratings[lesson.id] || 0} onChange={(v) => setRating(lesson.id, v)} size={16} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>{lesson.t}</h2>
        </div>
        <button
          onClick={() => setTab("tutor")}
          className="support-tile"
          style={{ width: "min(240px, 100%)", textAlign: "left", padding: 14, flexShrink: 0 }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>AI Tutor</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
            Ask about the current lesson to get concept explanations, homework help, and error correction.
          </div>
        </button>
      </div>

      <div className="chip-tabs">
        {displayTabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`chip-tab${tab === item.id ? " is-active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "learn" && (
        <div className="section-stack">
          <KnowledgeMindMap
            lessonTitle={lesson.t}
            chapterTitle={pptLessonData?.chapter || ""}
            items={contentItems}
            onNodeSelect={(index) => {
              setContentPageHint(index);
              setTab("content");
            }}
          />
          {lesson.id === "L1" && (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Interactive Preview</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
                Use the interactive components to feel pitch, frequency, and amplitude, then open Content to review the lesson PPT.
              </div>
              <InteractivePitchFrequencyWidgetCn />
              <InteractiveVolumeAmplitudeWidgetCn />
            </div>
          )}
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Preview Plan</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                Review the four main map nodes first, open the full lesson PPT, then use classroom practice to check understanding.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {[
                  { no: "01", title: "Review Map", desc: "Identify the lesson structure", active: true },
                  { no: "02", title: "Open Content", desc: "View the full PPT", active: false },
                  { no: "03", title: "Practice", desc: "Check weak points", active: false },
                ].map((step) => (
                  <div key={step.no} style={{ border: step.active ? "1px solid rgba(17,17,17,0.18)" : "1px solid rgba(17,17,17,0.08)", background: step.active ? "rgba(17,17,17,0.04)" : "#ffffff", borderRadius: 14, padding: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-tertiary)", marginBottom: 6 }}>{step.no}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{step.title}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>{step.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button onClick={() => setTab("content")} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #111111", background: "#111111", color: "#ffffff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Open Lesson Content
                </button>
                <button onClick={() => setTab("classroom")} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f6f6f6", color: "#111111", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Go to Practice
                </button>
              </div>
            </div>
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Knowledge Mastery Summary</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              Stronger points: {lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "No stable strength yet"}
              <br />
              Current weak points: {lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "None"}
              <br />
              Next recommendation: {getRecommendationFromSummary(lessonKnowledgeSummary)}
            </div>
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="section-stack">
          <LessonLearningWorkspace lesson={lesson} section="content" showTabs={false} contentPageHint={contentPageHint} onBktChange={() => setBktVersion((prev) => prev + 1)} />
        </div>
      )}

      {tab === "classroom" && (
        <div className="section-stack">
          {(scores[lesson.id] || 0) > 0 && (
            <div className="section-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Score</span>
              <div style={{ flex: 1 }}><PBar v={scores[lesson.id]} max={100} color="#534AB7" /></div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#534AB7" }}>{scores[lesson.id]}%</span>
            </div>
          )}
          <LessonLearningWorkspace lesson={lesson} section="practice" showTabs={false} onBktChange={() => setBktVersion((prev) => prev + 1)} />
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Practice Notes</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              Complete the lesson quiz and interactive practice before continuing with the exercise module below.
              <br />
              The system records error types for homework and teacher-dashboard summaries.
            </div>
          </div>
          <div className="section-card">
            {ExComponent && <ExComponent onScore={handleScore} />}
          </div>
        </div>
      )}

      {tab === "homework" && (
        <div className="section-stack">
          <div className="section-card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setHomeworkGuideOpen((prev) => !prev)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: homeworkGuideOpen ? "#111111" : "#ffffff", color: homeworkGuideOpen ? "#ffffff" : "#111111", cursor: "pointer" }}
            >
              {homeworkGuideOpen ? "Hide Homework Guidelines" : "Show Homework Guidelines"}
            </button>
            <button
              type="button"
              onClick={() => setHomeworkContactOpen((prev) => !prev)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: homeworkContactOpen ? "#111111" : "#ffffff", color: homeworkContactOpen ? "#ffffff" : "#111111", cursor: "pointer" }}
            >
              {homeworkContactOpen ? "Hide Support Notes" : "Show Support Notes"}
            </button>
            <button
              onClick={() => setTab("lab")}
              className="support-tile"
              style={{ width: "min(320px, 100%)", textAlign: "left", padding: 12, marginLeft: "auto" }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>Music Creation Lab</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                Create music with the interactive lab.
              </div>
            </button>
          </div>

          {homeworkGuideOpen ? (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Homework Guidelines</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                Organize the work into three parts: concept explanation, examples, and error reflection.
                <br />
                Before submitting, check term accuracy and whether examples match the lesson's core concepts.
              </div>
            </div>
          ) : null}

          {homeworkContactOpen ? (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Support Notes</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                If classroom practice, homework upload, or the AI Tutor has an issue, refresh the page and re-enter the lesson first.
                <br />
                If the issue remains, record the lesson name, steps, and error behavior for teacher follow-up.
              </div>
            </div>
          ) : null}

          <LessonLearningWorkspace lesson={lesson} section="homework" showTabs={false} onBktChange={() => setBktVersion((prev) => prev + 1)} />
        </div>
      )}

      {tab === "tutor" && (
        <Suspense fallback={<div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Loading AI Tutor...</div>}>
          <LazyAITutorV2 lessonId={lesson.id} lessonTitle={lesson.t} />
        </Suspense>
      )}

      {tab === "lab" && (
        <div>
          <div className="section-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{`Music Creation Lab - ${lesson.labN}`}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Interactive music lab page</div>
              </div>
              <button onClick={() => setLabOpen(!labOpen)} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>
                {labOpen ? "Collapse" : "Open"}
              </button>
            </div>
            {labOpen ? (
              <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border-tertiary)" }}>
                <iframe src={lesson.lab} title={lesson.labN} style={{ width: "100%", height: 400, border: "none" }} allow="autoplay; microphone" />
              </div>
            ) : (
              <div style={{ padding: 16, textAlign: "center", border: "1px dashed var(--color-border-secondary)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>Click Open to load the lab. Chrome is recommended.</div>
              </div>
            )}
          </div>
          <a href={lesson.lab} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", fontSize: 11, color: "#185FA5", padding: 8, textDecoration: "none" }}>Open in New Window</a>
        </div>
      )}

      <div className="section-card" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Course Evaluation</span>
        <Stars value={ratings[lesson.id] || 0} onChange={(v) => setRating(lesson.id, v)} size={22} />
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{ratings[lesson.id] ? `${ratings[lesson.id]}/5` : ""}</span>
      </div>
    </div>
  );
}

/* Assessment */
function LessonSupportLinksV2({ onOpen }) {
  const items = [
    { id: "tutor", label: "AI Tutor", desc: "Ask about the current lesson and get targeted concept explanations." },
    { id: "lab", label: "Music Creation Lab", desc: "Open the extended lab page for pitch, rhythm, and notation exploration." },
  ];

  return (
    <div className="support-grid">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item.id)}
          className="support-tile"
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>{item.desc}</div>
        </button>
      ))}
    </div>
  );
}

function LessonLearningWorkspaceV2() {
  return null;
}

function LessonViewV2() {
  return null;
}

export { LessonView };
