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
import {
  FeedbackBar,
  LessonCharts,
  PBar,
  Stars,
  Tag,
  WeakPointExplanationCards,
} from "./uiBasics";
import { BK, CN, NT, WK, nFreq, playTone, unlockAudioSystem } from "./musicAudio";
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
  const strengths = (evaluation.strengths || []).join("?");
  const issues = (evaluation.issues || []).join("?");
  const suggestions = (evaluation.suggestions || []).join("?");
  return [
    `??????${evaluation.overallComment || "????????"}`,
    `?????${issues || "???????"}`,
    `?????${suggestions || "??????"}${strengths ? `\n???${strengths}` : ""}`,
  ].join("\n");
}

const LESSON_CONTENT = {};
const LESSON_LEARNING_SECTIONS = {};
const LESSON_QUIZ_BANK = {
  L1: { id: "L1-Q1", lessonId: "L1", chapterId: "ch1", knowledgePointId: "L1_K1_pitchProperties", difficulty: "basic", prompt: "A4 的标准频率是多少？", options: ["220Hz", "440Hz", "523Hz"], answer: "440Hz", explanation: "A4=440Hz 是标准音高。" },
  L2: { id: "L2-Q1", lessonId: "L2", chapterId: "ch1", knowledgePointId: "L2_K2_temperamentEnharmonic", difficulty: "medium", prompt: "十二平均律中相邻半音的频率比约是多少？", options: ["1.5", "1.25", "1.0595"], answer: "1.0595", explanation: "十二平均律将八度平均分成 12 份。" },
  L3: { id: "L3-Q1", lessonId: "L3", chapterId: "ch2", knowledgePointId: "L3_K1_trebleClef", difficulty: "basic", prompt: "高音谱号的中心定位在线谱哪一线？", options: ["第二线", "第三线", "第四线"], answer: "第二线", explanation: "高音谱号将第二线定义为 G。" },
  L4: { id: "L4-Q1", lessonId: "L4", chapterId: "ch2", knowledgePointId: "L4_K1_noteValues", difficulty: "basic", prompt: "四分音符通常等于几拍？", options: ["0.5 拍", "1 拍", "2 拍"], answer: "1 拍", explanation: "四分音符常作为一拍的基本单位。" },
  L5: { id: "L5-Q1", lessonId: "L5", chapterId: "ch3", knowledgePointId: "L5_K1_trillMordent", difficulty: "basic", prompt: "颤音通常表现为什么？", options: ["相邻音快速交替", "持续延长同一音", "强拍重音"], answer: "相邻音快速交替", explanation: "颤音的核心特征是主音与邻音快速交替。" },
  L6: { id: "L6-Q1", lessonId: "L6", chapterId: "ch3", knowledgePointId: "L6_K1_dynamics", difficulty: "basic", prompt: "Allegro 通常表示什么速度？", options: ["慢板", "中板", "快板"], answer: "快板", explanation: "Allegro 是常见的快板速度术语。" },
  L7: { id: "L7-Q1", lessonId: "L7", chapterId: "ch4", knowledgePointId: "L7_K1_repeatSigns", difficulty: "basic", prompt: "D.C. 在乐谱中表示什么？", options: ["从头反复", "结束", "跳到尾声"], answer: "从头反复", explanation: "D.C. 即 Da Capo。" },
  L8: { id: "L8-Q1", lessonId: "L8", chapterId: "ch4", knowledgePointId: "L8_K2_expressionTerms", difficulty: "basic", prompt: "Dolce 更接近哪种表情？", options: ["甜美柔和", "强烈激昂", "庄严缓慢"], answer: "甜美柔和", explanation: "Dolce 表示甜美、柔和。" },
  L9: { id: "L9-Q1", lessonId: "L9", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "basic", prompt: "3/4 拍每小节通常有几拍？", options: ["2 拍", "3 拍", "4 拍"], answer: "3 拍", explanation: "3/4 拍表示每小节三拍。" },
  L10: { id: "L10-Q1", lessonId: "L10", chapterId: "ch5", knowledgePointId: "L10_K1_noteGrouping", difficulty: "basic", prompt: "附点会让原音符时值增加多少？", options: ["增加一半", "增加一倍", "减少一半"], answer: "增加一半", explanation: "附点增加原时值的一半。" },
  L11: { id: "L11-Q1", lessonId: "L11", chapterId: "ch5", knowledgePointId: "L11_K1_syncopationTypes", difficulty: "medium", prompt: "切分音最核心的听觉效果是什么？", options: ["重音迁移", "速度变慢", "音高升高"], answer: "重音迁移", explanation: "切分音打破原有强弱关系。" },
  L12: { id: "L12-Q1", lessonId: "L12", chapterId: "ch5", knowledgePointId: "L1_K1_pitchProperties", difficulty: "core", prompt: "综合诊断中最重要的目标是什么？", options: ["只背术语", "整合知识并应用", "只做听辨"], answer: "整合知识并应用", explanation: "综合诊断重在整合知识、定位薄弱点并推动迁移应用。" },
};

const LESSON_PRACTICE_EXTRA = {
  L1: { id: "L1-Q2", lessonId: "L1", chapterId: "ch1", knowledgePointId: "L1_K1_pitchProperties", difficulty: "medium", prompt: "音量变化最直接对应什么？", options: ["频率", "振幅", "谱号"], answer: "振幅", explanation: "音量通常由振幅决定。" },
  L2: { id: "L2-Q2", lessonId: "L2", chapterId: "ch1", knowledgePointId: "L2_K2_temperamentEnharmonic", difficulty: "medium", prompt: "泛音列中第二泛音最接近什么关系？", options: ["八度", "三度", "半音"], answer: "八度", explanation: "第二泛音与基音最接近八度关系。" },
  L3: { id: "L3-Q2", lessonId: "L3", chapterId: "ch2", knowledgePointId: "L3_K2_bassClef", difficulty: "basic", prompt: "低音谱号主要定位哪个音？", options: ["F", "C", "G"], answer: "F", explanation: "低音谱号两点包围 F 所在线。" },
  L4: { id: "L4-Q2", lessonId: "L4", chapterId: "ch2", knowledgePointId: "L4_K2_dotsAndTies", difficulty: "medium", prompt: "附点四分音符等于多少拍？", options: ["1 拍", "1.5 拍", "2 拍"], answer: "1.5 拍", explanation: "附点四分音符等于 1.5 拍。" },
  L5: { id: "L5-Q2", lessonId: "L5", chapterId: "ch3", knowledgePointId: "L5_K2_turnAppoggiatura", difficulty: "medium", prompt: "哪种装饰音最接近主音与邻音往复？", options: ["波音", "颤音", "倚音"], answer: "颤音", explanation: "颤音是主音与邻音快速交替。" },
  L6: { id: "L6-Q2", lessonId: "L6", chapterId: "ch3", knowledgePointId: "L6_K1_dynamics", difficulty: "basic", prompt: "mf 常表示什么力度层级？", options: ["很弱", "中强", "极强"], answer: "中强", explanation: "mf 即 mezzo forte。" },
  L7: { id: "L7-Q2", lessonId: "L7", chapterId: "ch4", knowledgePointId: "L7_K2_dcDsCoda", difficulty: "basic", prompt: "Fine 常表示什么？", options: ["从头开始", "结束处", "跳到尾声"], answer: "结束处", explanation: "Fine 表示乐句或乐曲结束。" },
  L8: { id: "L8-Q2", lessonId: "L8", chapterId: "ch4", knowledgePointId: "L8_K1_tempoTerms", difficulty: "core", prompt: "术语学习最稳的方法是什么？", options: ["一次死记", "分类复现", "只看中文"], answer: "分类复现", explanation: "术语记忆依赖分类和复现。" },
  L9: { id: "L9-Q2", lessonId: "L9", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "basic", prompt: "4/4 拍第一拍通常是什么属性？", options: ["弱拍", "次强拍", "强拍"], answer: "强拍", explanation: "4/4 的第一拍通常是强拍。" },
  L10: { id: "L10-Q2", lessonId: "L10", chapterId: "ch5", knowledgePointId: "L10_K2_crossBarTies", difficulty: "medium", prompt: "连音线连接同音高音符时作用是什么？", options: ["改变音高", "时值相加", "改成休止"], answer: "时值相加", explanation: "连音线会把时值相加。" },
  L11: { id: "L11-Q2", lessonId: "L11", chapterId: "ch5", knowledgePointId: "L11_K2_classicSyncopation", difficulty: "core", prompt: "切分最明显的感受是什么？", options: ["拍感平均", "重音迁移", "音高更高"], answer: "重音迁移", explanation: "切分音最核心的是重音迁移。" },
  L12: { id: "L12-Q2", lessonId: "L12", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "core", prompt: "综合诊断后最有效的复盘方式是什么？", options: ["只做会的题", "按错误类型复盘", "跳过基础"], answer: "按错误类型复盘", explanation: "按错误类型复盘更容易找到薄弱知识点并安排后续练习。" },
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
    ["基础概念辨识题", "术语闪卡", "综合分析题"],
  );

  const exerciseAnswer = point.exerciseTypes?.[0] || "AI 导师问答";
  const exerciseOptions = ensureQuestionOptions(
    [exerciseAnswer, ...exercisePool],
    ["AI 导师问答", "术语闪卡", "记谱练习 (Notation Exercise)", "节奏练习 (Rhythm Exercise)"],
  );

  const easyAnswer = point.easy?.[0] || point.subConcepts?.[0] || point.title;
  const easyOptions = ensureQuestionOptions(
    [easyAnswer, ...easyPool],
    ["基础概念辨识题", "相邻白键判断", "识别基本等音对：C♯=D♭", "什么决定了音的高低？"],
  );

  const mediumAnswer = point.medium?.[0] || point.easy?.[0] || point.title;
  const mediumOptions = ensureQuestionOptions(
    [mediumAnswer, ...mediumPool],
    ["概念应用题", "混合时值识别", "等音的作曲选择原理", "含变化音的复杂识读"],
  );

  const hardAnswer = point.hard?.[0] || point.medium?.[0] || point.title;
  const hardOptions = ensureQuestionOptions(
    [hardAnswer, ...hardPool],
    ["综合分析题", "跨多个音组的快速识别", "复杂节奏型的拍数推算", "大调音阶完整推导"],
  );

  return [
    {
      id: `${point.id}-supplement-1`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "basic",
      prompt: `下列哪一项最直接对应“${point.title}”的核心概念？`,
      options: conceptOptions,
      answer: conceptAnswer,
      explanation: `${point.title}的核心概念包括：${conceptAnswer}。`,
    },
    {
      id: `${point.id}-supplement-2`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "medium",
      prompt: `学习“${point.title}”时，优先匹配哪类练习最合适？`,
      options: exerciseOptions,
      answer: exerciseAnswer,
      explanation: `${point.title}当前优先对应：${exerciseAnswer}。`,
    },
    {
      id: `${point.id}-supplement-3`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "basic",
      prompt: `下列哪一项属于“${point.title}”的基础训练示例？`,
      options: easyOptions,
      answer: easyAnswer,
      explanation: `${point.title}的基础训练示例包括：${easyAnswer}。`,
    },
    {
      id: `${point.id}-supplement-4`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "medium",
      prompt: `针对“${point.title}”的进阶练习，下列哪一项更匹配？`,
      options: mediumOptions,
      answer: mediumAnswer,
      explanation: `${point.title}的进阶训练可对应：${mediumAnswer}。`,
    },
    {
      id: `${point.id}-supplement-5`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "hard",
      prompt: `如果要挑战“${point.title}”的高阶应用，下列哪一项更符合？`,
      options: hardOptions,
      answer: hardAnswer,
      explanation: `${point.title}的高阶应用可对应：${hardAnswer}。`,
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
      prompt: `${lessonTitle} 的核心知识点是什么？`,
      options: [focus, "节拍器", "随机作答"],
      answer: focus,
      explanation: "本题用于回顾当前课时的核心重点。",
    });
  }
  return pool;
}

const HOMEWORK_FOCUS = {
  L1: "音的四种属性与音级关系",
  L2: "律制、泛音与等音概念",
  L3: "谱号与五线谱读写",
  L4: "音符、休止符与附点",
  L5: "装饰音辨认与应用",
  L6: "力度、速度与表情术语",
  L7: "反复与缩写记号",
  L8: "音乐术语记忆与分类",
  L9: "节拍、拍号与强弱规律",
  L10: "音值组合与连音写法",
  L11: "切分音与重音迁移",
  L12: "综合应用与复习提升",
};

function getIntervalInfo(a, b) {
  if (a == null || b == null) return null;
  const raw = Math.abs(a - b) % 12;
  const diff = raw > 6 ? 12 - raw : raw;
  if (diff === 1) return { label: "半音", color: "#1f2937", detail: "这两个音之间是相邻半音关系。" };
  if (diff === 2) return { label: "全音", color: "#111111", detail: "这两个音之间是标准全音关系。" };
  return { label: "其他", color: "#6b7280", detail: "这两个音之间不是全音或半音。", isError: true };
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
    lastExplanation: "\u5148\u70b9\u51fb\u94a2\u7434\u952e\uff0c\u7cfb\u7edf\u4f1a\u6839\u636e\u4e24\u4e2a\u97f3\u7684\u8ddd\u79bb\u7ed9\u51fa\u97f3\u7a0b\u5ea6\u6570\u89e3\u91ca\u3002",
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
      setVoiceError("当前浏览器不支持实时语音识别。");
      return;
    }
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch {}
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
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
      setVoiceError("语音识别失败，请改用录音转写。");
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
      setVoiceError("当前浏览器不支持录音功能。");
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
          setVoiceError("未捕获到录音内容。");
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
            setVoiceError(json?.error || "录音转写失败，请稍后重试。");
          }
        } catch {
          setVoiceError("录音转写失败，请稍后重试。");
        } finally {
          setAudioTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      setVoiceError("无法启动录音，请检查浏览器麦克风权限。");
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    try {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      setVoiceError("结束录音失败，请重试。");
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
      setLabelingState({ pending: true, message: "正在匹配知识点..." });
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
        reason: json?.reason || "知识点已缓存。",
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
          recordError("键盘音程判断", "当前音程跨度较大，建议先从二度、三度这类基础音程开始练习。");
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
      message: ok ? "回答正确。" : `回答不正确，正确答案是 ${currentPractice.answer}。`,
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
        type: "课堂练习题",
        prompt: currentPractice.prompt,
        explanation: currentPractice.explanation,
      });
      recordError("课堂练习题", currentPractice.explanation);
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
      recordError("纠错题", question.explanation);
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
      "复习主题：" + focusTopic +
        (criticalWeak.length > 0 ? " - 重点补弱：" + criticalWeak.map(p => p.title + "(" + Math.round(p.pL*100) + "%)").join(" / ")
        : anyWeak.length > 0 ? " - 巩固：" + weakList
        : "，平均 " + avgPct + "%，掌握良好") + "。",
      "作业说明：" + evalHelper,
      "练习要求：重点检查 " + (weakNames || "各知识点") + "，当前平均掌握度 " + avgPct + "%" + "。",
      "学习追踪：学习 " + studyMinutes + " 分钟，共 " + stats.interactions + " 次交互，平均 " + avgPct + "%。请写下今天最难理解的 1 个知识点。",
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
      setHomeworkFeedback("请先在本页完成作业内容，再提交。");
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkDraft]);

  const confirmHomeworkSubmit = useCallback(() => {
    const feedback = homeworkDraft.length > 80
      ? "已提交。内容较完整，建议下一步重点检查术语准确性以及示例是否对应本课核心概念。"
      : "已提交。当前答案偏简略，建议补充术语解释、例子或节奏/音程分析。";
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
      setHomeworkFeedback("请先补充文字、图片、节奏型、五线谱或钢琴输入中的任一项，再提交作业。");
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
      const feedback = String(json?.text || "系统已记录你的作业，等待教师复核。");
      setHomeworkSubmitted(true);
      setHomeworkRunning(false);
      setHomeworkFeedback(feedback);
      setHomeworkEvaluation(evaluation);
      setStats((prev) => ({ ...prev, interactions: prev.interactions + 1, lastExplanation: "课后作业已提交并完成 AI 初评。" }));
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
        lastExplanation: "课后作业已提交并完成 AI 初评。",
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
        && !/综合复习/.test(matchedKnowledgePoint?.title || "");
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
      setHomeworkFeedback("作业提交失败，请检查网络后重试。");
    } finally {
      setHomeworkReviewing(false);
    }
  }, [lesson.id, lesson.t, lessonHomework, homeworkDraft, homeworkImages, homeworkRhythm, homeworkStaff, homeworkPiano, voiceTranscript, audioSubmission, homeworkRequirement, evaluationDimensions, studyMinutes, stats, homeworkRemaining, submissionTypes, resolveKnowledgePointForText, lessonKnowledgePoints, userId, onBktChange]);

  const openLessonHomeworkSubmit = useCallback(() => {
    if (!homeworkHasContent) {
      setHomeworkFeedback("请先补充本课所需的作业内容，再提交。");
      return;
    }
    const requiredOk = homeworkRequirement.requiredAnyOf.some((type) => homeworkSubmissionState[type]);
    const rhythmNeedsFix = homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete;
    if (!requiredOk) {
      setHomeworkFeedback(`请至少完成以下一种提交方式：${requiredSubmissionLabels}。`);
      return;
    }
    if (rhythmNeedsFix) {
      setHomeworkFeedback(rhythmValidation.issues.join(" "));
      return;
    }
    if (homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete) {
      setHomeworkFeedback("节奏作业尚未完成，请先检查每个小节的拍数是否与拍号一致。")
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkHasContent, homeworkRequirement, homeworkSubmissionState, rhythmMeasuresComplete]);

  return (
    <div style={{ marginTop: 10, marginBottom: 14 }}>
      {showTabs && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => setActiveSection("content")} style={sectionButtonStyle("content")}>内容呈现</button>
        <button onClick={() => setActiveSection("practice")} style={sectionButtonStyle("practice")}>课堂练习</button>
        <button onClick={() => setActiveSection("homework")} style={sectionButtonStyle("homework")}>课后作业</button>
      </div>}

      {activeSection === "content" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>内容呈现</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
          本页先用强化解释卡梳理本课最容易混淆的点，再查看完整 PPT。
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
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{`\u7b2c ${pptLessonData.lessonNumber} \u8bfe\u65f6`}</div>
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
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课堂练习</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          系统会结合你在内容呈现中的互动操作结果，提供 20 题连续课堂练习，并反馈当前掌握情况。
        </div>
        {weakEnhancements.length ? (
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>课堂练习引导</div>
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
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>知识点掌握摘要</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            已掌握较好：{lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "尚未形成稳定强项"}
            <br />
            当前薄弱点：{lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "暂无"}
            <br />
            下一步建议：{getRecommendationFromSummary(lessonKnowledgeSummary)}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>互动检测</div>
          <div style={{ fontSize: 11, color: stats.errors > 0 ? "#b91c1c" : "var(--color-text-secondary)" }}>
            {lastInterval ? `最近一次识别为 ${lastInterval.label}，${lastInterval.detail}` : "请先在内容呈现里完成一次钢琴或互动操作，系统才会生成检测结果。"}
          </div>
        </div>
        <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>课堂练习题</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>第 {practiceIndex + 1} / {practiceQuestions.length} 题</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                {{"concept-recognition":"概念识别","knowledge-point-match":"知识点匹配","exclusion":"排除辨析","application":"应用题","analysis":"分析题","specific-fact":"事实记忆","contrast":"对比辨析"}[currentPractice?.questionType] ?? "综合题"}
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
            <button onClick={nextPracticeQuestion} disabled={!practiceAnswers[practiceIndex] || practiceIndex >= practiceQuestions.length - 1} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#111111", color: "#ffffff", cursor: !practiceAnswers[practiceIndex] || practiceIndex >= practiceQuestions.length - 1 ? "default" : "pointer" }}>下一题</button>
            <button onClick={restartPractice} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>切换到新的 20 题</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-secondary)" }}>
            答对题数/总题数：{correctCount}/{practiceQuestions.length}
          </div>
        </div>
      </div>}

      {activeSection === "homework" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(17,17,17,0.04)", border: "1px solid rgba(17,17,17,0.08)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 8 }}>课后作业</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          系统会依据本课知识点生成作业建议，并记录学习时长、错误类型和交互数据，辅助教师后续复核。
        </div>
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#111111", marginBottom: 6 }}>自适应建议</div>
          已掌握较好：{lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "尚未形成稳定强项"}
          <br />
          当前薄弱点：{lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "暂无"}
          <br />
          下一步建议：{getRecommendationFromSummary(lessonKnowledgeSummary)}
          {labelingState.pending ? <><br />知识点匹配中：{labelingState.message}</> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>课后作业计时</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111111" }}>{formattedHomeworkTime}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button onClick={() => setHomeworkRunning(true)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>继续计时</button>
              <button onClick={() => setHomeworkRunning(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#ffffff", cursor: "pointer" }}>暂停</button>
              <button onClick={() => { setHomeworkRunning(false); setHomeworkRemaining(30 * 60); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.1)", background: "#f5f5f5", cursor: "pointer" }}>重置为 30 分钟</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              进入本页后已自动开始倒计时。
              <br />
              AI 指定任务：{lessonHomework}
              <br />
              当前学习轨迹：约 {studyMinutes} 分钟，互动 {stats.interactions} 次。
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>AI 生成作业</div>
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
          <div style={{ marginBottom: 4 }}>{"\u672c\u8bfe\u63d0\u4ea4\u65b9\u5f0f\uff1a"}{homeworkChannelLabels}</div>
          <div>{"\u4f5c\u4e1a\u8bf4\u660e\uff1a"}{homeworkRequirement.helper}</div>
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
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>文字说明</div>
            <textarea
              value={homeworkDraft}
              onChange={(e) => setHomeworkDraft(e.target.value)}
              placeholder="可在这里补充概念解释、作业思路、节奏分析、音高判断依据，或对拍照上传内容的说明。"
              style={{ width: "100%", minHeight: 140, borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", padding: 12, fontSize: 12, lineHeight: 1.8, resize: "vertical", outline: "none" }}
            />
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111111" }}>提交概览</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                提交类型：{submissionTypes.length ? submissionTypes.join(" / ") : "尚未开始"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>文字说明</div>
                <div style={{ fontSize: 12, color: "#111111" }}>{homeworkDraft.trim() ? `${homeworkDraft.trim().slice(0, 60)}${homeworkDraft.trim().length > 60 ? "..." : ""}` : "未填写"}</div>
              </div>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>节奏编辑</div>
                <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizeRhythmSubmission(homeworkRhythm)}</div>
              </div>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>五线谱修正</div>
                <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizeStaffSubmission(homeworkStaff)}</div>
              </div>
              {homeworkRequirement.channels.includes("piano") ? (
                <div className="subtle-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>钢琴输入</div>
                  <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{summarizePianoSubmission(homeworkPiano)}</div>
                </div>
              ) : null}
              {homeworkRequirement.channels.includes("voice") ? (
                <div className="subtle-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>语音转写</div>
                  <div style={{ fontSize: 12, color: "#111111", lineHeight: 1.7 }}>{voiceTranscript.trim() || "未录入"}</div>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                错误类型：{Object.keys(stats.errorTypes).length ? Object.entries(stats.errorTypes).map(([k, v]) => `${k} x${v}`).join("；") : "当前暂无错误记录"}
              </div>
              <button onClick={openLessonHomeworkSubmit} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>
                提交作业
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
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>确认提交课后作业</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
              当前剩余时间 {formattedHomeworkTime}，提交后将生成 AI 初评结果，并同步到教师后台。
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111" }}>
                <strong>提交类型：</strong>{submissionTypes.join(" / ") || "未填写"}
              </div>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111", lineHeight: 1.8 }}>
                <strong>文字说明：</strong>{homeworkDraft.trim() || "未填写"}
              </div>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "#111111", lineHeight: 1.8 }}>
                <strong>图片数量：</strong>{homeworkImages.length} 张
                <br />
                <strong>节奏摘要：</strong>{summarizeRhythmSubmission(homeworkRhythm)}
                <br />
                <strong>五线谱摘要：</strong>{summarizeStaffSubmission(homeworkStaff)}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowHomeworkDialog(false)} disabled={homeworkReviewing} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: homeworkReviewing ? "default" : "pointer" }}>继续修改</button>
              <button onClick={confirmMixedHomeworkSubmit} disabled={homeworkReviewing} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: homeworkReviewing ? "default" : "pointer" }}>
                {homeworkReviewing ? "AI 初评中..." : "确认提交"}
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
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音高与频率关系互动钢琴</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        点击下方音键，可听到对应音高，并观察频率柱状图与键盘位置同步变化。
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
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>当前选中音</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{noteItems[activeIndex].label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`频率：${noteItems[activeIndex].freq} Hz`}
            <br />
            规律：频率越高，听感中的音高越高。
            <br />
            建议：依次点击 C3、C4、C5，感受八度上行时频率翻倍的关系。
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
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>课时 PPT</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`第 ${lessonData.lessonNumber} 课时 · ${lessonData.lessonTitle}`}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
            disabled={pageIndex === 0}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: pageIndex === 0 ? "default" : "pointer" }}
          >
            上一页
          </button>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`${pageIndex + 1} / ${slideNumbers.length}`}</div>
          <button
            onClick={() => setPageIndex((prev) => Math.min(slideNumbers.length - 1, prev + 1))}
            disabled={pageIndex === slideNumbers.length - 1}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: pageIndex === slideNumbers.length - 1 ? "default" : "pointer" }}
          >
            下一页
          </button>
        </div>
      </div>
      <div className="subtle-card" style={{ padding: 14 }}>
        <img
          src={imageSrc}
          alt={`${lessonData.lessonTitle} - 幻灯片 ${currentSlideNo}`}
          loading="lazy"
          onClick={() => setLightboxOpen(true)}
          style={{ width: "100%", display: "block", borderRadius: 12, border: "1px solid rgba(17,17,17,0.08)", background: "#f6f6f6", cursor: "zoom-in" }}
        />
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>点击当前幻灯片可放大查看</div>
        <a href={sourcePpt} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#185FA5", textDecoration: "none" }}>
          打开原始 PPT
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
              ×
            </button>
            <img
              src={imageSrc}
              alt={`${lessonData.lessonTitle} - 幻灯片 ${currentSlideNo} 放大查看`}
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
    { id: "tutor", label: "AI 导师", desc: "针对当前课时提问，并获取讲解与纠错建议" },
    { id: "lab", label: "音乐创作实验室", desc: "进入音乐创作实验室做扩展探索" },
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
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>知识导图</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{chapterTitle}</div>
        </div>
        <Tag color="#111111" bg="#F3F4F6">{`${nodes.length} 个预习主线`}</Tag>
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
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginBottom: 8 }}>中心主题</div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35, marginBottom: 10 }}>{lessonTitle}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.7 }}>
              先看 4 个主节点建立整体框架，再进入课时内容查看完整 PPT。
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
                    点击进入对应课时内容
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 22, background: "linear-gradient(180deg, #fcfcfc 0%, #f5f5f5 100%)", border: "1px solid rgba(17,17,17,0.08)", overflowX: "auto" }}>
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
                  <stop offset="0%" stopColor="rgba(17,17,17,0.18)" />
                  <stop offset="100%" stopColor="rgba(17,17,17,0.45)" />
                </linearGradient>
              </defs>
              {layoutNodes.map((item) => {
                const centerX = 490;
                const centerY = 235;
                const branchX = item.isLeft ? 380 : 600;
                const branchY = item.anchorY;
                return (
                  <g key={`line-${lessonTitle}-${item.index}`}>
                    <path
                      d={`M ${centerX} ${centerY} C ${item.isLeft ? 450 : 530} ${centerY}, ${item.isLeft ? 420 : 560} ${branchY}, ${branchX} ${branchY}`}
                      fill="none"
                      stroke={hoveredIndex === item.index ? "#111111" : "url(#mind-line-gradient)"}
                      strokeWidth={hoveredIndex === item.index ? "4" : "3"}
                      strokeLinecap="round"
                    />
                    <path
                      d={`M ${branchX} ${branchY} L ${item.anchorX} ${item.anchorY}`}
                      fill="none"
                      stroke={hoveredIndex === item.index ? "rgba(17,17,17,0.82)" : "rgba(17,17,17,0.22)"}
                      strokeWidth={hoveredIndex === item.index ? "3.5" : "2.5"}
                      strokeLinecap="round"
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
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)", marginBottom: 8 }}>中心主题</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, marginBottom: 10 }}>{lessonTitle}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.74)", lineHeight: 1.7 }}>
                先看 4 个主节点建立框架，再进入课时内容和课堂练习。
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
                  点击进入对应课时内容
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
    h: item.title || `知识点 ${index + 1}`,
    b: item.detail || "",
  }));
  const handleScore = (v) => setScore(lesson.id, v);
  const displayTabs = [
    { id: "learn", label: "课前预习" },
    { id: "content", label: "内容呈现" },
    { id: "classroom", label: "课堂练习" },
    { id: "homework", label: "课后作业" },
    { id: "tutor", label: "AI 导师" },
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
            <Tag color="#3C3489" bg="#EEEDFE">{`第${lesson.n}课`}</Tag>
            <Stars value={ratings[lesson.id] || 0} onChange={(v) => setRating(lesson.id, v)} size={16} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>{lesson.t}</h2>
        </div>
        <button
          onClick={() => setTab("tutor")}
          className="support-tile"
          style={{ width: "min(240px, 100%)", textAlign: "left", padding: 14, flexShrink: 0 }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>AI 导师</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
            针对当前课时提问，获得概念讲解、作业答疑与错误纠正建议。
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
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>互动预习</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
                先通过交互组件感知音高、频率和振幅，再进入“内容呈现”查看本课 PPT。
              </div>
              <InteractivePitchFrequencyWidgetCn />
              <InteractiveVolumeAmplitudeWidgetCn />
            </div>
          )}
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>预习建议</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                先看导图中的 4 个主节点建立主线，再进入课时内容查看完整 PPT，最后做课堂练习检验理解。
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                {[
                  { no: "01", title: "看导图", desc: "先抓住本课主线", active: true },
                  { no: "02", title: "进课时内容", desc: "查看完整 PPT", active: false },
                  { no: "03", title: "做课堂练习", desc: "检验薄弱点", active: false },
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
                  进入课时内容
                </button>
                <button onClick={() => setTab("classroom")} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#f6f6f6", color: "#111111", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  直接去课堂练习
                </button>
              </div>
            </div>
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>知识点掌握摘要</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              已掌握较好：{lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "尚未形成稳定强项"}
              <br />
              当前薄弱点：{lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "暂无"}
              <br />
              下一步建议：{getRecommendationFromSummary(lessonKnowledgeSummary)}
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
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>得分</span>
              <div style={{ flex: 1 }}><PBar v={scores[lesson.id]} max={100} color="#534AB7" /></div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#534AB7" }}>{scores[lesson.id]}%</span>
            </div>
          )}
          <LessonLearningWorkspace lesson={lesson} section="practice" showTabs={false} onBktChange={() => setBktVersion((prev) => prev + 1)} />
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>练习说明</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              先完成本节小测与互动练习，再继续下方练习模块。
              <br />
              系统会记录错误类型，供课后作业与教师后台汇总使用。
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
              {homeworkGuideOpen ? "收起作业规范" : "查看作业规范"}
            </button>
            <button
              type="button"
              onClick={() => setHomeworkContactOpen((prev) => !prev)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: homeworkContactOpen ? "#111111" : "#ffffff", color: homeworkContactOpen ? "#ffffff" : "#111111", cursor: "pointer" }}
            >
              {homeworkContactOpen ? "收起联系说明" : "查看联系说明"}
            </button>
            <button
              onClick={() => setTab("lab")}
              className="support-tile"
              style={{ width: "min(320px, 100%)", textAlign: "left", padding: 12, marginLeft: "auto" }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111111", marginBottom: 6 }}>音乐创作实验室</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                让我们一起来创造音乐吧
              </div>
            </button>
          </div>

          {homeworkGuideOpen ? (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>作业规范</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                建议按“概念解释、示例、错误反思”三部分完成。
                <br />
                提交前检查术语是否准确，示例是否对应本课核心概念。
              </div>
            </div>
          ) : null}

          {homeworkContactOpen ? (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>联系说明</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                如果课堂练习、作业上传或 AI 导师出现问题，先刷新页面并重新进入本课。
                <br />
                若问题仍然存在，请记录课时名称、操作步骤和报错现象，交由教师统一反馈处理。
              </div>
            </div>
          ) : null}

          <LessonLearningWorkspace lesson={lesson} section="homework" showTabs={false} onBktChange={() => setBktVersion((prev) => prev + 1)} />
        </div>
      )}

      {tab === "tutor" && (
        <Suspense fallback={<div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>AI 导师加载中...</div>}>
          <LazyAITutorV2 lessonId={lesson.id} lessonTitle={lesson.t} />
        </Suspense>
      )}

      {tab === "lab" && (
        <div>
          <div className="section-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{`音乐创作实验室 · ${lesson.labN}`}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>互动音乐实验页面</div>
              </div>
              <button onClick={() => setLabOpen(!labOpen)} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid var(--color-border-secondary)", background: "var(--color-background-primary)", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>
                {labOpen ? "收起" : "打开"}
              </button>
            </div>
            {labOpen ? (
              <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border-tertiary)" }}>
                <iframe src={lesson.lab} title={lesson.labN} style={{ width: "100%", height: 400, border: "none" }} allow="autoplay; microphone" />
              </div>
            ) : (
              <div style={{ padding: 16, textAlign: "center", border: "1px dashed var(--color-border-secondary)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>点击“打开”加载实验，建议使用 Chrome 浏览器。</div>
              </div>
            )}
          </div>
          <a href={lesson.lab} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", fontSize: 11, color: "#185FA5", padding: 8, textDecoration: "none" }}>新窗口打开</a>
        </div>
      )}

      <div className="section-card" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>课程评价</span>
        <Stars value={ratings[lesson.id] || 0} onChange={(v) => setRating(lesson.id, v)} size={22} />
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{ratings[lesson.id] ? `${ratings[lesson.id]}/5` : ""}</span>
      </div>
    </div>
  );
}

/* Assessment */
function LessonSupportLinksV2({ onOpen }) {
  const items = [
    { id: "tutor", label: "AI 导师", desc: "围绕当前课时提问，获得针对性的概念解释与答疑。" },
    { id: "lab", label: "音乐创作实验室", desc: "进入扩展实验页面，继续做音高、节奏或谱面探索。" },
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
