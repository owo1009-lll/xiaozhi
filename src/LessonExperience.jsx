import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  RHYTHM_SYMBOLS,
  STAFF_ROWS,
  createDefaultPianoSubmission,
  createDefaultRhythmSubmission,
  createDefaultStaffSubmission,
  getEvaluationDimensions,
  getHomeworkRequirement,
  getRhythmValidation,
} from "./homeworkModel";
import { LessonCharts, PBar, Stars, Tag, WeakPointExplanationCards } from "./uiBasics";
import { BK, NT, WK, nFreq, playTone, unlockAudioSystem } from "./musicAudio";
import { LessonRoute, LessonVisualBoard, hasLessonVisuals } from "./LessonVisuals";
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

function createKnowledgeMappingKey(lessonId, signature) {
  return `${lessonId}:${String(signature || "").slice(0, 120)}`;
}

function formatStructuredEvaluation(evaluation) {
  if (!evaluation) return "";
  const strengths = (evaluation.strengths || []).join("; ");
  const issues = (evaluation.issues || []).join("; ");
  const suggestions = (evaluation.suggestions || []).join("; ");
  return [
    `完成情况：${evaluation.overallComment || "作业已提交。"}`,
    `问题记录：${issues || "暂未发现明显错误。"}`,
    `修改建议：${suggestions || "保持当前完成质量。"}${strengths ? `\n优点：${strengths}` : ""}`,
  ].join("\n");
}

const LESSON_CONTENT = {};
const LESSON_LEARNING_SECTIONS = {};
const LESSON_QUIZ_BANK = {
  L1: { id: "L1-Q1", lessonId: "L1", chapterId: "ch1", knowledgePointId: "L1_K1_pitchProperties", difficulty: "basic", prompt: "A4 的标准频率是多少？", options: ["220Hz", "440Hz", "523Hz"], answer: "440Hz", explanation: "A4 = 440Hz 是常用标准音高。" },
  L2: { id: "L2-Q1", lessonId: "L2", chapterId: "ch1", knowledgePointId: "L2_K2_temperamentEnharmonic", difficulty: "medium", prompt: "十二平均律中，相邻半音的频率比约是多少？", options: ["1.5", "1.25", "1.0595"], answer: "1.0595", explanation: "十二平均律把八度平均分成 12 个半音。" },
  L3: { id: "L3-Q1", lessonId: "L3", chapterId: "ch2", knowledgePointId: "L3_K1_trebleClef", difficulty: "basic", prompt: "高音谱号中心定位的是五线谱哪一线？", options: ["第二线", "第三线", "第四线"], answer: "第二线", explanation: "高音谱号把第二线定义为 G。" },
  L4: { id: "L4-Q1", lessonId: "L4", chapterId: "ch2", knowledgePointId: "L4_K1_noteValues", difficulty: "basic", prompt: "在 4/4 拍中，四分音符通常是几拍？", options: ["0.5 拍", "1 拍", "2 拍"], answer: "1 拍", explanation: "四分音符通常作为 4/4 拍的一拍单位。" },
  L5: { id: "L5-Q1", lessonId: "L5", chapterId: "ch3", knowledgePointId: "L5_K1_trillMordent", difficulty: "basic", prompt: "颤音通常表示什么？", options: ["与邻音快速交替", "保持同一个音", "强拍重音"], answer: "与邻音快速交替", explanation: "颤音的核心特征是主音与邻音快速交替。" },
  L6: { id: "L6-Q1", lessonId: "L6", chapterId: "ch3", knowledgePointId: "L6_K1_dynamics", difficulty: "basic", prompt: "Allegro 通常属于哪类速度？", options: ["慢速", "中速", "快速"], answer: "快速", explanation: "Allegro 是常见的快速速度术语。" },
  L7: { id: "L7-Q1", lessonId: "L7", chapterId: "ch4", knowledgePointId: "L7_K1_repeatSigns", difficulty: "basic", prompt: "乐谱中的 D.C. 表示什么？", options: ["从头反复", "结束", "跳到 Coda"], answer: "从头反复", explanation: "D.C. 是 Da Capo，表示回到开头。" },
  L8: { id: "L8-Q1", lessonId: "L8", chapterId: "ch4", knowledgePointId: "L8_K2_expressionTerms", difficulty: "basic", prompt: "Dolce 最接近哪种音乐性格？", options: ["甜美柔和", "强烈火热", "庄严缓慢"], answer: "甜美柔和", explanation: "Dolce 意为甜美、柔和。" },
  L9: { id: "L9-Q1", lessonId: "L9", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "basic", prompt: "3/4 拍每小节通常有几拍？", options: ["2 拍", "3 拍", "4 拍"], answer: "3 拍", explanation: "3/4 表示每小节三拍。" },
  L10: { id: "L10-Q1", lessonId: "L10", chapterId: "ch5", knowledgePointId: "L10_K1_noteGrouping", difficulty: "basic", prompt: "附点会增加原音符多少时值？", options: ["一半", "一个完整时值", "减少一半"], answer: "一半", explanation: "附点增加原时值的一半。" },
  L11: { id: "L11-Q1", lessonId: "L11", chapterId: "ch5", knowledgePointId: "L11_K1_syncopationTypes", difficulty: "medium", prompt: "切分节奏的核心听觉效果是什么？", options: ["重音移位", "速度变慢", "音高变高"], answer: "重音移位", explanation: "切分会打破预期的强弱拍规律。" },
  L12: { id: "L12-Q1", lessonId: "L12", chapterId: "ch5", knowledgePointId: "L1_K1_pitchProperties", difficulty: "core", prompt: "综合诊断最重要的目标是什么？", options: ["只背术语", "连接并应用知识", "只做听辨任务"], answer: "连接并应用知识", explanation: "综合诊断要串联知识、定位薄弱点并促进迁移。" },
};

const LESSON_PRACTICE_EXTRA = {
  L1: { id: "L1-Q2", lessonId: "L1", chapterId: "ch1", knowledgePointId: "L1_K1_pitchProperties", difficulty: "medium", prompt: "音量变化最直接对应什么？", options: ["频率", "振幅", "谱号"], answer: "振幅", explanation: "音量通常由振幅决定。" },
  L2: { id: "L2-Q2", lessonId: "L2", chapterId: "ch1", knowledgePointId: "L2_K2_temperamentEnharmonic", difficulty: "medium", prompt: "基音上方的第二泛音最接近什么关系？", options: ["八度", "三度", "半音"], answer: "八度", explanation: "第二泛音比基音高一个八度。" },
  L3: { id: "L3-Q2", lessonId: "L3", chapterId: "ch2", knowledgePointId: "L3_K2_bassClef", difficulty: "basic", prompt: "低音谱号主要定位哪个音？", options: ["F", "C", "G"], answer: "F", explanation: "低音谱号两个点夹住 F 线。" },
  L4: { id: "L4-Q2", lessonId: "L4", chapterId: "ch2", knowledgePointId: "L4_K2_dotsAndTies", difficulty: "medium", prompt: "附点四分音符是多少拍？", options: ["1 拍", "1.5 拍", "2 拍"], answer: "1.5 拍", explanation: "附点四分音符等于 1.5 拍。" },
  L5: { id: "L5-Q2", lessonId: "L5", chapterId: "ch3", knowledgePointId: "L5_K2_turnAppoggiatura", difficulty: "medium", prompt: "哪种装饰音最直接体现主音与邻音快速交替？", options: ["波音", "颤音", "倚音"], answer: "颤音", explanation: "颤音是在主音与邻音之间快速交替。" },
  L6: { id: "L6-Q2", lessonId: "L6", chapterId: "ch3", knowledgePointId: "L6_K1_dynamics", difficulty: "basic", prompt: "mf 通常表示什么力度？", options: ["很弱", "中强", "极强"], answer: "中强", explanation: "mf 是 mezzo forte，表示中强。" },
  L7: { id: "L7-Q2", lessonId: "L7", chapterId: "ch4", knowledgePointId: "L7_K2_dcDsCoda", difficulty: "basic", prompt: "Fine 通常表示什么？", options: ["从头反复", "结束位置", "跳到 Coda"], answer: "结束位置", explanation: "Fine 标记乐句或乐曲的结束。" },
  L8: { id: "L8-Q2", lessonId: "L8", chapterId: "ch4", knowledgePointId: "L8_K1_tempoTerms", difficulty: "core", prompt: "学习音乐术语最稳定的方法是什么？", options: ["只背一次", "分类并复习", "只看翻译"], answer: "分类并复习", explanation: "术语记忆依赖分类和反复提取。" },
  L9: { id: "L9-Q2", lessonId: "L9", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "basic", prompt: "4/4 拍第一拍通常是什么角色？", options: ["弱拍", "次强拍", "强拍"], answer: "强拍", explanation: "4/4 拍第一拍通常为强拍。" },
  L10: { id: "L10-Q2", lessonId: "L10", chapterId: "ch5", knowledgePointId: "L10_K2_crossBarTies", difficulty: "medium", prompt: "连音线连接同音高音符时起什么作用？", options: ["改变音高", "合并时值", "变成休止符"], answer: "合并时值", explanation: "连音线会把同音高音符的时值相加。" },
  L11: { id: "L11-Q2", lessonId: "L11", chapterId: "ch5", knowledgePointId: "L11_K2_classicSyncopation", difficulty: "core", prompt: "切分节奏最清晰的听感是什么？", options: ["重音均匀", "重音移位", "音高升高"], answer: "重音移位", explanation: "切分的核心是重音移位。" },
  L12: { id: "L12-Q2", lessonId: "L12", chapterId: "ch5", knowledgePointId: "L9_K1_timeSignatureMeter", difficulty: "core", prompt: "综合诊断后最有效的复习方式是什么？", options: ["只做熟悉题", "按错误类型复习", "跳过基础"], answer: "按错误类型复习", explanation: "按错误类型复习更容易定位薄弱点并安排后续练习。" },
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
    ["基础概念辨识", "术语闪卡", "综合分析"],
  );

  const exerciseAnswer = point.exerciseTypes?.[0] || "智能导师问答";
  const exerciseOptions = ensureQuestionOptions(
    [exerciseAnswer, ...exercisePool],
    ["智能导师问答", "术语闪卡", "记谱练习", "节奏练习"],
  );

  const easyAnswer = point.easy?.[0] || point.subConcepts?.[0] || point.title;
  const easyOptions = ensureQuestionOptions(
    [easyAnswer, ...easyPool],
    ["基础概念辨识", "相邻白键判断", "判断 C♯/D♭ 为等音", "什么决定音高？"],
  );

  const mediumAnswer = point.medium?.[0] || point.easy?.[0] || point.title;
  const mediumOptions = ensureQuestionOptions(
    [mediumAnswer, ...mediumPool],
    ["概念应用", "混合时值识别", "创作中的等音记法", "带变化音的复杂识读"],
  );

  const hardAnswer = point.hard?.[0] || point.medium?.[0] || point.title;
  const hardOptions = ensureQuestionOptions(
    [hardAnswer, ...hardPool],
    ["综合分析", "跨音组快速识别", "复杂节奏拍数计算", "完整大调音阶推导"],
  );

  return [
    {
      id: `${point.id}-supplement-1`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "basic",
      prompt: `哪一项最直接对应“${point.title}”的核心概念？`,
      options: conceptOptions,
      answer: conceptAnswer,
      explanation: `${point.title} 的一个核心概念是：${conceptAnswer}。`,
    },
    {
      id: `${point.id}-supplement-2`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "medium",
      prompt: `哪种练习类型最适合“${point.title}”的初步练习？`,
      options: exerciseOptions,
      answer: exerciseAnswer,
      explanation: `${point.title} 当前最适合搭配：${exerciseAnswer}。`,
    },
    {
      id: `${point.id}-supplement-3`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "basic",
      prompt: `哪一项是“${point.title}”的基础训练例子？`,
      options: easyOptions,
      answer: easyAnswer,
      explanation: `${point.title} 的基础训练例子是：${easyAnswer}。`,
    },
    {
      id: `${point.id}-supplement-4`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "medium",
      prompt: `哪一项更适合“${point.title}”的中阶练习？`,
      options: mediumOptions,
      answer: mediumAnswer,
      explanation: `${point.title} 的中阶训练可以使用：${mediumAnswer}。`,
    },
    {
      id: `${point.id}-supplement-5`,
      lessonId: point.lessonId,
      chapterId: point.chapterId,
      knowledgePointId: point.id,
      difficulty: "hard",
      prompt: `哪一项最适合“${point.title}”的进阶应用？`,
      options: hardOptions,
      answer: hardAnswer,
      explanation: `${point.title} 的进阶应用可以使用：${hardAnswer}。`,
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
      options: [focus, "节拍器", "随机猜测"],
      answer: focus,
      explanation: "这道题用于回顾当前课时重点。",
    });
  }
  return pool;
}

const HOMEWORK_FOCUS = {
  L1: "音的四种性质与音高关系",
  L2: "律制、泛音与等音记法",
  L3: "谱号与五线谱读写",
  L4: "音符、休止符与附点时值",
  L5: "装饰音识别与应用",
  L6: "力度、速度与表情术语",
  L7: "反复与略写记号",
  L8: "音乐术语记忆与分类",
  L9: "节拍、拍号与强弱规律",
  L10: "音值组合与连音线记谱",
  L11: "切分节奏与重音移位",
  L12: "综合应用与复习",
};

function getIntervalInfo(a, b) {
  if (a == null || b == null) return null;
  const raw = Math.abs(a - b) % 12;
  const diff = raw > 6 ? 12 - raw : raw;
  if (diff === 1) return { label: "半音", semitones: diff, color: "#1f2937", detail: "这两个音相邻，构成半音关系。" };
  if (diff === 2) return { label: "全音", semitones: diff, color: "var(--color-text-primary)", detail: "这两个音构成标准全音关系。" };
  return { label: "其他", semitones: diff, color: "#6b7280", detail: "这两个音既不是全音，也不是半音。", isError: true };
}

function LessonLearningWorkspaceLegacy() {
  return null;
}

function LessonLearningWorkspace({ lesson, section, showTabs = true, contentPageHint = null, visualFocus = null, onBktChange = null }) {
  const pptLessonData = getPptLessonData(lesson.id);
  const studentProfile = useMemo(() => getStudentProfile(), []);
  const userId = studentProfile.studentId;
  const homeworkFileInputRef = useRef(null);
  const homeworkCameraInputRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [activeSection, setActiveSection] = useState("content");
  const [practiceStatusOpen, setPracticeStatusOpen] = useState(false);
  const [pptPageHint, setPptPageHint] = useState(null);
  const [activeHomeworkEditor, setActiveHomeworkEditor] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeNote, setRecognizeNote] = useState("");
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
    lastExplanation: "请先点击钢琴键。系统会说明两个所选音之间的音程距离。",
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
  const homeworkTools = [
    ...(homeworkRequirement.channels.includes("image") ? [{ id: "image", icon: "📷", label: "拍照" }] : []),
    ...(homeworkRequirement.channels.includes("rhythm") ? [{ id: "rhythm", icon: "🥁", label: "节奏" }] : []),
    ...(homeworkRequirement.channels.includes("staff") ? [{ id: "staff", icon: "🎼", label: "五线谱" }] : []),
    ...(homeworkRequirement.channels.includes("piano") ? [{ id: "piano", icon: "🎹", label: "钢琴" }] : []),
    ...(homeworkRequirement.channels.includes("voice") ? [{ id: "voice", icon: "🎤", label: "语音" }] : []),
    { id: "text", icon: "✍️", label: "文字" },
  ];
  const recognizeTargets = [
    ...(homeworkRequirement.channels.includes("rhythm") ? [{ mode: "rhythm", label: "节奏" }] : []),
    ...(homeworkRequirement.channels.includes("piano") ? [{ mode: "piano", label: "钢琴" }] : []),
    ...(homeworkRequirement.channels.includes("staff") ? [{ mode: "staff", label: "五线谱" }] : []),
  ];
  const recognizeHomework = async (mode) => {
    const latestImage = homeworkImages[homeworkImages.length - 1]?.dataUrl;
    if (!latestImage) {
      setRecognizeNote("请先拍照或上传图片。");
      return;
    }
    const validNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const pitchToRow = (pitch) => {
      const matched = STAFF_ROWS.find((item) => item.label === String(pitch || "").toUpperCase());
      return matched ? matched.row : 5;
    };
    setRecognizing(true);
    setRecognizeNote("正在识别图片...");
    try {
      const response = await fetch("/api/homework/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: latestImage, mode }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "识别失败。");
      const notes = Array.isArray(json.notes) ? json.notes : [];
      if (!notes.length) {
        setRecognizeNote("未识别到记谱内容，请尝试更清晰、更近距离的照片。");
        return;
      }
      if (mode === "piano") {
        const mapped = notes.map((item) => ({
          note: validNotes.includes(String(item.note).toUpperCase()) ? String(item.note).toUpperCase() : "C",
          octave: [3, 4, 5].includes(Number(item.octave)) ? Number(item.octave) : 4,
        })).slice(0, 48);
        setHomeworkPiano((prev) => ({ ...prev, notes: mapped }));
      } else if (mode === "rhythm") {
        const entries = notes.map((item) => {
          const value = String(item.value || "quarter");
          const symbol = (item.rest && RHYTHM_SYMBOLS.find((s) => s.id === `${value}-rest`))
            || RHYTHM_SYMBOLS.find((s) => s.id === value)
            || RHYTHM_SYMBOLS[2];
          const row = item.pitch ? pitchToRow(item.pitch) : undefined;
          return { ...symbol, ...(row != null ? { row } : {}), tieToNext: false };
        }).slice(0, 32);
        setHomeworkRhythm((prev) => normalizeRhythmSubmission({ ...prev, measures: [entries, prev?.measures?.[1] || []], activeMeasure: 0 }));
      } else if (mode === "staff") {
        const mapped = notes.map((item, index) => ({
          slot: index,
          row: pitchToRow(item.pitch),
          pitch: String(item.pitch || ""),
          accidental: ["natural", "sharp", "flat"].includes(item.accidental) ? item.accidental : "natural",
          noteValue: ["whole", "half", "quarter"].includes(item.value) ? item.value : "quarter",
          tieToNext: false,
        })).slice(0, 8);
        setHomeworkStaff((prev) => ({ ...prev, notes: mapped }));
      }
      setActiveHomeworkEditor(mode);
      setRecognizeNote("已自动填入，请复核并修正可能的错误。");
    } catch (error) {
      setRecognizeNote(String(error?.message || "识别失败。"));
    } finally {
      setRecognizing(false);
    }
  };

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
      setVoiceError("当前浏览器不支持录音。");
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
          setVoiceError("未捕捉到录音内容。");
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
      setVoiceError("无法开始录音，请检查麦克风权限。");
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    try {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      setVoiceError("停止录音失败，请重试。");
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
        reason: json?.reason || "知识点匹配已缓存。",
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
          recordError("键盘音程判断", "当前音程较宽。建议先从二度、三度等较小音程开始练习。");
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
      message: ok ? "回答正确。" : `回答错误，正确答案是 ${currentPractice.answer}。`,
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
        (criticalWeak.length > 0 ? "；优先薄弱点：" + criticalWeak.map(p => p.title + "(" + Math.round(p.pL*100) + "%)").join(" / ")
        : anyWeak.length > 0 ? "；重点巩固：" + weakList
        : "；平均掌握度 " + avgPct + "%，当前较稳定") + "。",
      "作业说明：" + evalHelper,
      "练习要求：重点关注 " + (weakNames || "全部知识点") + "；当前平均掌握度为 " + avgPct + "%。",
      "学习轨迹：已学习 " + studyMinutes + " 分钟，产生 " + stats.interactions + " 次互动，平均掌握度 " + avgPct + "%。请写下今天最困难的一个知识点。",
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
    border: "1px solid rgba(120,80,40,0.2)",
    background: activeSection === id ? "var(--gradient-accent)" : "rgba(94,60,28,0.07)",
    color: activeSection === id ? "#fdf6e3" : "var(--color-text-primary)",
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
      setHomeworkFeedback("请先完成本页作业内容再提交。");
      return;
    }
    setShowHomeworkDialog(true);
  }, [homeworkDraft]);

  const confirmHomeworkSubmit = useCallback(() => {
    const feedback = homeworkDraft.length > 80
      ? "已提交。内容较完整，下一步请检查术语准确性，以及例子是否匹配本课核心概念。"
      : "已提交。当前回答较简短，建议补充术语解释、举例或节奏/音程分析。";
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
      setHomeworkFeedback("提交前请至少添加一项内容：文字、图片、节奏、五线谱或钢琴输入。");
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
      setStats((prev) => ({ ...prev, interactions: prev.interactions + 1, lastExplanation: "作业已提交，智能初评已完成。" }));
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
        lastExplanation: "作业已提交，智能初评已完成。",
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
        && !/Integrated Review|综合复习/.test(matchedKnowledgePoint?.title || "");
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
      setHomeworkFeedback("请先添加本课要求的作业内容再提交。");
      return;
    }
    const requiredOk = homeworkRequirement.requiredAnyOf.some((type) => homeworkSubmissionState[type]);
    const rhythmNeedsFix = homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete;
    if (!requiredOk) {
      setHomeworkFeedback(`请至少完成以下提交类型之一：${requiredSubmissionLabels}。`);
      return;
    }
    if (rhythmNeedsFix) {
      setHomeworkFeedback(rhythmValidation.issues.join(" "));
      return;
    }
    if (homeworkRequirement.channels.includes("rhythm") && homeworkSubmissionState.rhythm && !rhythmMeasuresComplete) {
      setHomeworkFeedback("节奏作业尚未完成，请检查每个小节是否符合拍号要求。")
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

      {activeSection === "content" && (() => {
        const summarizeLine = (text) => {
          const clean = String(text || "").replace(/\s+/g, " ").trim();
          return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean;
        };
        const branches = [
          ...lessonContentItems.map((item, index) => ({
            key: `kp-${index}`,
            badge: index + 1,
            title: item.h,
            peek: summarizeLine(item.b),
            body: (
              <>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.85, color: "var(--color-text-secondary)" }}>{item.b || "—"}</p>
                <button type="button" className="kmap-jump" onClick={() => setPptPageHint(index)}>在课时课件中查看 →</button>
              </>
            ),
          })),
          ...(weakEnhancements.length ? [{
            key: "reinforcement",
            badge: "★",
            title: "重点强化",
            body: <WeakPointExplanationCards items={weakEnhancements} titleMap={weakPointTitleMap} />,
          }] : []),
        ];
        return (
          <div className="section-stack">
            {hasLessonVisuals(lesson.id) ? (
              <LessonVisualBoard lessonId={lesson.id} onOpenSlide={(index) => setPptPageHint(index)} focus={visualFocus} />
            ) : (
              <ContentOutline branches={branches} subtitle={`${branches.length} 个板块 · 点击展开`} />
            )}
            {pptLessonData && <PptContentEmbedFixed lessonId={lesson.id} pageHint={pptPageHint ?? contentPageHint} />}
          </div>
        );
      })()}

      {activeSection === "practice" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(94,60,28,0.05)", border: "1px solid rgba(120,80,40,0.22)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 10 }}>课堂练习</div>
        <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>课堂练习题</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>第 {practiceIndex + 1} / {practiceQuestions.length} 题</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>
                {{"concept-recognition":"概念识别","knowledge-point-match":"知识点匹配","exclusion":"排除辨析","application":"应用题","analysis":"分析题","specific-fact":"事实记忆","contrast":"对比辨析"}[currentPractice?.questionType] ?? "综合题"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.7, marginBottom: 8 }}>{currentPractice?.prompt}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {currentPractice?.options.map((option) => (
              <button key={option} onClick={() => answerPractice(option)} disabled={Boolean(practiceAnswers[practiceIndex])} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.18)", background: practiceAnswers[practiceIndex] && option === currentPractice.answer ? "var(--gradient-accent)" : "rgba(94,60,28,0.07)", color: practiceAnswers[practiceIndex] && option === currentPractice.answer ? "#fdf6e3" : "var(--color-text-primary)", cursor: practiceAnswers[practiceIndex] ? "default" : "pointer" }}>
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
            <button onClick={nextPracticeQuestion} disabled={!practiceAnswers[practiceIndex] || practiceIndex >= practiceQuestions.length - 1} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(120,80,40,0.18)", background: "var(--gradient-accent)", color: "#fdf6e3", cursor: !practiceAnswers[practiceIndex] || practiceIndex >= practiceQuestions.length - 1 ? "default" : "pointer" }}>下一题</button>
            <button onClick={restartPractice} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(120,80,40,0.18)", background: "rgba(94,60,28,0.07)", cursor: "pointer" }}>切换到新的 20 题</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "var(--color-text-secondary)" }}>
            答对题数 / 总题数：{correctCount}/{practiceQuestions.length}
          </div>
        </div>

        <button type="button" onClick={() => setPracticeStatusOpen((prev) => !prev)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.22)", background: "rgba(94,60,28,0.06)", color: "var(--color-text-primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          <span>📊 学习状态与练习引导</span>
          <span>{practiceStatusOpen ? "▲" : "▼"}</span>
        </button>

        {practiceStatusOpen && <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {weakEnhancements.length ? (
            <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>练习引导</div>
              <div style={{ display: "grid", gap: 8 }}>
                {weakEnhancements.map((item) => (
                  <div key={`guide-${item.knowledgePointId}`} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(93,143,70,0.1)" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{weakPointTitleMap[item.knowledgePointId] || item.knowledgePointId}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, whiteSpace: "pre-line" }}>
                      {item.practiceGuide.map((line) => `• ${line}`).join("\n")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>知识点掌握摘要</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              已掌握较好：{lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "尚未形成稳定强项"}
              <br />
              当前薄弱点：{lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "暂无"}
              <br />
              下一步建议：{getRecommendationFromSummary(lessonKnowledgeSummary)}
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>互动检测</div>
            <div style={{ fontSize: 11, color: stats.errors > 0 ? "#b91c1c" : "var(--color-text-secondary)" }}>
              {lastInterval ? `最近结果：${lastInterval.label}。${lastInterval.detail}` : "请先在内容呈现中完成一次钢琴或互动操作，系统随后会生成检测结果。"}
            </div>
          </div>
        </div>}
      </div>}

      {activeSection === "homework" && <div style={{ padding: 16, borderRadius: 16, background: "rgba(94,60,28,0.05)", border: "1px solid rgba(120,80,40,0.22)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>课后作业</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
          系统会根据本课知识点生成作业引导，并记录学习时长、错误类型与互动数据，供教师复核。
        </div>
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>自适应建议</div>
          已掌握较好：{lessonKnowledgeSummary.strong.map((item) => item.title).join(" / ") || "尚未形成稳定强项"}
          <br />
          当前薄弱点：{lessonKnowledgeSummary.weak.map((item) => item.title).join(" / ") || "暂无"}
          <br />
          下一步建议：{getRecommendationFromSummary(lessonKnowledgeSummary)}
          {labelingState.pending ? <><br />知识点匹配：{labelingState.message}</> : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>作业计时器</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-text-primary)" }}>{formattedHomeworkTime}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button onClick={() => setHomeworkRunning(true)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(120,80,40,0.18)", background: "var(--gradient-accent)", color: "#fdf6e3", cursor: "pointer" }}>继续计时</button>
              <button onClick={() => setHomeworkRunning(false)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(120,80,40,0.18)", background: "#f6e8c6", cursor: "pointer" }}>暂停</button>
              <button onClick={() => { setHomeworkRunning(false); setHomeworkRemaining(30 * 60); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(120,80,40,0.18)", background: "rgba(94,60,28,0.07)", cursor: "pointer" }}>重置为 30 分钟</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              打开本页后，倒计时会自动开始。
              <br />
              智能分配任务：{lessonHomework}
              <br />
              当前学习轨迹：约 {studyMinutes} 分钟，{stats.interactions} 次互动。
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>智能生成作业</div>
            <div style={{ display: "grid", gap: 8 }}>
              {homeworkItems.map((item) => (
                <div key={item} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.7, padding: "8px 10px", borderRadius: 10, background: "rgba(94,60,28,0.06)" }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)", fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          <div style={{ marginBottom: 4 }}>提交通道：{homeworkChannelLabels}</div>
          <div>作业说明：{homeworkRequirement.helper}</div>
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {homeworkTools.map((tool) => {
              const active = activeHomeworkEditor === tool.id;
              const filled = homeworkSubmissionState?.[tool.id];
              return (
                <button key={tool.id} type="button" onClick={() => setActiveHomeworkEditor(active ? null : tool.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 12, border: active ? "1px solid transparent" : "1px solid rgba(120,80,40,0.2)", background: active ? "var(--gradient-accent)" : "rgba(94,60,28,0.07)", color: active ? "#fdf6e3" : "var(--color-text-primary)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  <span style={{ fontSize: 15 }}>{tool.icon}</span>{tool.label}
                  {filled ? <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? "#fdf6e3" : "#3f6e2f" }} /> : null}
                </button>
              );
            })}
          </div>
          {activeHomeworkEditor === "image" && (
            <>
              <HomeworkImageUploader
                images={homeworkImages}
                onAddFiles={handleHomeworkAddFiles}
                onRemoveImage={removeHomeworkImage}
                fileInputRef={homeworkFileInputRef}
                cameraInputRef={homeworkCameraInputRef}
              />
              {recognizeTargets.length > 0 && (
                <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>📷 → 从照片自动填入</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {recognizeTargets.map((target) => (
                      <button key={target.mode} type="button" disabled={recognizing} onClick={() => recognizeHomework(target.mode)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(93,143,70,0.4)", background: "rgba(93,143,70,0.12)", color: "#3f6e2f", fontWeight: 600, fontSize: 12, cursor: recognizing ? "default" : "pointer" }}>
                        识别 → {target.label}
                      </button>
                    ))}
                  </div>
                  {recognizeNote ? <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 8 }}>{recognizeNote}</div> : null}
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 6, lineHeight: 1.7 }}>
                    智能识别仅作辅助，识别后请务必打开编辑器复核并修正。
                  </div>
                </div>
              )}
            </>
          )}
          {activeHomeworkEditor === "rhythm" && <RhythmHomeworkEditorV2
            rhythmSubmission={homeworkRhythm}
            onChange={(updater) => setHomeworkRhythm((prev) => normalizeRhythmSubmission(typeof updater === "function" ? updater(prev) : updater))}
            onPlay={playRhythmMeasure}
          />}
          {activeHomeworkEditor === "staff" && <StaffHomeworkEditorV2
            staffSubmission={homeworkStaff}
            onChange={(updater) => setHomeworkStaff((prev) => (typeof updater === "function" ? updater(prev) : updater))}
          />}
          {activeHomeworkEditor === "piano" && <HomeworkPianoEditor
            pianoSubmission={homeworkPiano}
            onChange={(updater) => setHomeworkPiano((prev) => (typeof updater === "function" ? updater(prev) : updater))}
          />}
          {activeHomeworkEditor === "voice" && <HomeworkVoiceInput
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
          {activeHomeworkEditor === "text" && <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>文字说明</div>
            <textarea
              value={homeworkDraft}
              onChange={(e) => setHomeworkDraft(e.target.value)}
              placeholder="补充概念解释、作业推理、节奏分析、音高判断依据，或对上传图片的说明。"
              style={{ width: "100%", minHeight: 140, borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", padding: 12, fontSize: 12, lineHeight: 1.8, resize: "vertical", outline: "none" }}
            />
          </div>}
          <div style={{ padding: 12, borderRadius: 12, background: "#f6e8c6", border: "1px solid rgba(120,80,40,0.22)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)" }}>提交概览</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                提交类型：{submissionTypes.length ? submissionTypes.join(" / ") : "未开始"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>文字说明</div>
                <div style={{ fontSize: 12, color: "var(--color-text-primary)" }}>{homeworkDraft.trim() ? `${homeworkDraft.trim().slice(0, 60)}${homeworkDraft.trim().length > 60 ? "..." : ""}` : "未填写"}</div>
              </div>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>节奏编辑器</div>
                <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.7 }}>{summarizeRhythmSubmission(homeworkRhythm)}</div>
              </div>
              <div className="subtle-card" style={{ padding: 10 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>五线谱订正</div>
                <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.7 }}>{summarizeStaffSubmission(homeworkStaff)}</div>
              </div>
              {homeworkRequirement.channels.includes("piano") ? (
                <div className="subtle-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>钢琴输入</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.7 }}>{summarizePianoSubmission(homeworkPiano)}</div>
                </div>
              ) : null}
              {homeworkRequirement.channels.includes("voice") ? (
                <div className="subtle-card" style={{ padding: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>语音转写</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.7 }}>{voiceTranscript.trim() || "未输入"}</div>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                错误类型：{Object.keys(stats.errorTypes).length ? Object.entries(stats.errorTypes).map(([k, v]) => `${k} x${v}`).join("; ") : "暂无错误记录"}
              </div>
              <button onClick={openLessonHomeworkSubmit} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "var(--gradient-accent)", color: "#fdf6e3", cursor: "pointer" }}>
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
          <div onClick={(event) => event.stopPropagation()} style={{ width: "min(640px, 100%)", background: "#f6e8c6", borderRadius: 16, padding: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>确认提交作业</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
              当前剩余时间：{formattedHomeworkTime}。提交后会生成智能初评，并同步到教师后台。
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "var(--color-text-primary)" }}>
                <strong>提交类型：</strong>{submissionTypes.join(" / ") || "未填写"}
              </div>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.8 }}>
                <strong>文字说明：</strong>{homeworkDraft.trim() || "未填写"}
              </div>
              <div className="subtle-card" style={{ padding: 10, fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.8 }}>
                <strong>图片数量：</strong>{homeworkImages.length}
                <br />
                <strong>节奏摘要：</strong>{summarizeRhythmSubmission(homeworkRhythm)}
                <br />
                <strong>五线谱摘要：</strong>{summarizeStaffSubmission(homeworkStaff)}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowHomeworkDialog(false)} disabled={homeworkReviewing} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: homeworkReviewing ? "default" : "pointer" }}>继续编辑</button>
              <button onClick={confirmMixedHomeworkSubmit} disabled={homeworkReviewing} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: "var(--gradient-accent)", color: "#fdf6e3", cursor: homeworkReviewing ? "default" : "pointer" }}>
                {homeworkReviewing ? "智能评阅中..." : "确认提交"}
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
                    border: active ? "1px solid #4f8035" : "1px solid rgba(120,80,40,0.22)",
                    background: active ? "linear-gradient(180deg, rgba(60,52,30,0.6), #f6e8c6)" : "#f6e8c6",
                    cursor: "pointer",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    boxShadow: active ? "inset 0 -16px 28px rgba(120,80,40,0.26)" : "none",
                  }}
                >
                  <div style={{ width: "100%", height, borderRadius: 10, background: active ? "#111111" : "#D1D5DB", transition: "height 0.2s ease" }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", marginTop: 10 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>{`${item.freq} Hz`}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>当前音高</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>{noteItems[activeIndex].label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`频率：${noteItems[activeIndex].freq} Hz`}
            <br />
            规律：频率越高，听起来音越高。
            <br />
            依次试听 C3、C4 和 C5，感受跨八度时频率如何翻倍。
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
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>课时课件</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`第 ${lessonData.lessonNumber} 课 - ${lessonData.lessonTitle}`}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
            disabled={pageIndex === 0}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(120,80,40,0.2)", background: "#f6e8c6", cursor: pageIndex === 0 ? "default" : "pointer" }}
          >
            上一页
          </button>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{`${pageIndex + 1} / ${slideNumbers.length}`}</div>
          <button
            onClick={() => setPageIndex((prev) => Math.min(slideNumbers.length - 1, prev + 1))}
            disabled={pageIndex === slideNumbers.length - 1}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(120,80,40,0.2)", background: "var(--gradient-accent)", color: "#fdf6e3", cursor: pageIndex === slideNumbers.length - 1 ? "default" : "pointer" }}
          >
            下一页
          </button>
        </div>
      </div>
      <div className="subtle-card" style={{ padding: 14 }}>
        <img
          src={imageSrc}
          alt={`${lessonData.lessonTitle} - 第 ${currentSlideNo} 页`}
          loading="lazy"
          onClick={() => setLightboxOpen(true)}
          style={{ width: "100%", display: "block", borderRadius: 12, border: "1px solid rgba(120,80,40,0.22)", background: "rgba(94,60,28,0.07)", cursor: "zoom-in" }}
        />
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>点击当前幻灯片可放大查看。</div>
        <a href={sourcePpt} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#185FA5", textDecoration: "none" }}>
          打开原始课件
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
              alt={`${lessonData.lessonTitle} - 第 ${currentSlideNo} 页放大图`}
              style={{ maxWidth: "100%", maxHeight: "94vh", width: "auto", height: "auto", display: "block", borderRadius: 14, background: "#f6e8c6" }}
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
    { id: "lab", label: "音乐创作实验室", desc: "打开音乐创作实验室，进行延伸探索。" },
  ];

  return (
    <div className="support-grid">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item.id)}
          className="support-tile"
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>{item.desc}</div>
        </button>
      ))}
    </div>
  );
}

function ContentOutline({ branches = [], title = "课时内容", subtitle }) {
  const [open, setOpen] = useState(() => new Set());

  const toggleBranch = (key) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  if (!branches.length) return null;

  return (
    <div className="section-card">
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{subtitle || `${branches.length} 个板块 · 点击展开`}</div>
      </div>
      <div className="kmap-outline">
        {branches.map((branch) => {
          const full = open.has(branch.key);
          return (
            <div className="kmap-branch" key={branch.key}>
              <button type="button" className="kmap-branch-head" onClick={() => toggleBranch(branch.key)}>
                <span className={`kmap-chevron${full ? " is-open" : ""}`}>▶</span>
                <span className="kmap-badge">{branch.badge}</span>
                <span className="kmap-branch-title">{branch.title}</span>
              </button>
              {full && <div className="kmap-branch-body">{branch.body}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VILLAGE_SPOTS = [
  { x: 22, y: 26 }, { x: 50, y: 17 }, { x: 78, y: 26 },
  { x: 33, y: 50 }, { x: 67, y: 50 }, { x: 50, y: 38 },
];

function KnowledgeVillageMap({ lessonTitle, kps = [], onEnterKp, onGoCourseware, onGoPractice }) {
  const houses = [
    ...kps.map((kp, index) => ({ key: kp.id, kind: "kp", icon: "🏠", label: kp.title, spot: VILLAGE_SPOTS[index % VILLAGE_SPOTS.length], onEnter: () => onEnterKp?.(kp) })),
    { key: "courseware", kind: "util", icon: "📚", label: "课件屋", spot: { x: 17, y: 76 }, onEnter: onGoCourseware },
    { key: "practice", kind: "util", icon: "🎯", label: "练习屋", spot: { x: 83, y: 76 }, onEnter: onGoPractice },
  ];
  const [pos, setPos] = useState({ x: 50, y: 90 });
  const [walking, setWalking] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  const goto = (house) => {
    if (walking) return;
    setWalking(true);
    setPos({ x: house.spot.x, y: Math.min(94, house.spot.y + 13) });
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setWalking(false);
      house.onEnter?.();
    }, 780);
  };
  return (
    <div className="section-card">
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>课前预习村 · {lessonTitle}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>点一座小屋，小智走过去带你进门 →</div>
      </div>
      <div className="village">
        {houses.map((house) => (
          <button key={house.key} type="button" className={`village-house village-house--${house.kind}`} style={{ left: `${house.spot.x}%`, top: `${house.spot.y}%` }} onClick={() => goto(house)}>
            <span className="village-icon">{house.icon}</span>
            <span className="village-label">{house.label}</span>
          </button>
        ))}
        <div className="village-hero" style={{ left: `${pos.x}%`, top: `${pos.y}%` }}>
          <span className={walking ? "hero-wobble" : ""}>🧑‍🎓</span>
        </div>
      </div>
    </div>
  );
}

function KnowledgePointDetail({ kp, onBack, onAsk, onPractice, onCourseware }) {
  if (!kp) return null;
  const examples = (kp.examples && kp.examples.length)
    ? kp.examples
    : [...(kp.easy || []).slice(0, 1), ...(kp.medium || []).slice(0, 1), ...(kp.hard || []).slice(0, 1)];
  return (
    <div className="section-card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 26 }}>📖</span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800 }}>{kp.title}</div>
        <button type="button" onClick={onBack} className="kp-back">← 返回导图</button>
      </div>
      {kp.intro ? (
        <div className="kp-block">
          <div className="kp-sec-title">📝 简介</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.85, color: "var(--color-text-secondary)" }}>{kp.intro}</div>
        </div>
      ) : null}
      {kp.subConcepts?.length ? (
        <div className="kp-block">
          <div className="kp-sec-title">📌 要点</div>
          <ul className="kp-list">{kp.subConcepts.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      ) : null}
      {kp.facts?.length ? (
        <div className="kp-block">
          <div className="kp-sec-title">📖 详解</div>
          <ul className="kp-list">{kp.facts.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      ) : null}
      {examples.length ? (
        <div className="kp-block">
          <div className="kp-sec-title">✏️ 例题</div>
          <ul className="kp-list">{examples.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <button type="button" onClick={onAsk} className="kp-cta kp-cta--green">问小智老师</button>
        <button type="button" onClick={onCourseware} className="kp-cta">看课件</button>
        <button type="button" onClick={onPractice} className="kp-cta">去练习</button>
      </div>
    </div>
  );
}

const LESSON_HAS_INTERACTIVE = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11"];

function LessonInteractiveWidgets({ lessonId }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {lessonId === "L1" ? <><InteractivePitchFrequencyWidgetCn /><InteractiveVolumeAmplitudeWidgetCn /></> : null}
      {lessonId === "L2" ? <TemperamentEnharmonicWidgetCn /> : null}
      {lessonId === "L3" ? <><TrebleClefDrillWidgetCn /><BassClefDrillWidgetCn /></> : null}
      {lessonId === "L4" ? <><DotsAndTiesGuideWidgetCn /><NoteValueHierarchyWidgetCn /></> : null}
      {lessonId === "L5" ? <><TrillVsMordentWidgetCn /><OrnamentComparisonWidgetCn /></> : null}
      {lessonId === "L6" ? <><DynamicsScaleWidgetCn /><ArticulationContrastWidgetCn /></> : null}
      {lessonId === "L7" ? <><RepeatPathGuideWidgetCn /><DcDsCodaGuideWidgetCn /></> : null}
      {lessonId === "L8" ? <ExpressionVsTempoCardCn /> : null}
      {lessonId === "L9" ? <MeterAccentGuideWidgetCn /> : null}
      {lessonId === "L10" ? <CrossBarTieGuideWidgetCn /> : null}
      {lessonId === "L11" ? <><SyncopationTypeGuideWidgetCn /><SyncopationPatternWidgetCn /></> : null}
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

  if (!nodes.length) return null;

  const leftCount = Math.ceil(nodes.length / 2);
  const layoutNodes = nodes.map((item, index) => {
    const isLeft = index < leftCount;
    const laneIndex = isLeft ? index : index - leftCount;
    const y = 24 + (isLeft ? 0 : 110) + laneIndex * 200;
    return { ...item, index, isLeft, x: isLeft ? 70 : 690, y, anchorX: isLeft ? 290 : 690, anchorY: y + 44 };
  });

  return (
    <div className="section-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>课前预习 · 知识导图</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{chapterTitle}</div>
        </div>
        <Tag>{`${nodes.length} 个知识点`}</Tag>
      </div>

      {isMobile ? (
        <div className="kmap-canvas" style={{ padding: 14 }}>
          <div style={{ padding: 16, borderRadius: 18, background: "linear-gradient(160deg, #8a5a2b, #6e451f)", color: "#fff4d8", marginBottom: 14, boxShadow: "inset 0 1px 0 rgba(255,250,235,0.2), 0 6px 0 rgba(94,60,28,0.4)" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,244,216,0.8)", marginBottom: 8 }}>本课主题</div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35 }}>{lessonTitle}</div>
          </div>
          <div style={{ position: "relative", paddingLeft: 24, display: "grid", gap: 12 }}>
            <div style={{ position: "absolute", left: 11, top: 6, bottom: 6, width: 2, background: "linear-gradient(180deg, rgba(120,80,40,0.5), rgba(120,80,40,0.12))" }} />
            {nodes.map((item, index) => {
              const active = hoveredIndex === index;
              return (
                <button key={`${lessonTitle}-m-${index}`} type="button" onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} onClick={() => onNodeSelect?.(index)}
                  style={{ position: "relative", padding: 14, borderRadius: 14, background: active ? "linear-gradient(180deg,#7bb45a,#4f8035)" : "linear-gradient(180deg,#fbf0d6,#f3e3bf)", border: active ? "2px solid #4f8035" : "2px solid #9c6b3a", boxShadow: active ? "0 4px 0 rgba(63,110,47,0.35)" : "inset 0 0 0 1px rgba(255,250,235,0.5), 0 3px 0 rgba(94,60,28,0.2)", textAlign: "left", cursor: "pointer" }}>
                  <div style={{ position: "absolute", left: -21, top: 18, width: 12, height: 12, borderRadius: 999, background: active ? "#7bb45a" : "#8a5a2b", border: "2px solid #6e451f" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 999, background: active ? "#fff4d8" : "linear-gradient(135deg,#7bb45a,#4f8035)", color: active ? "#3f6e2f" : "#fff4d8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{index + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#fff4d8" : "#3f2d1c", lineHeight: 1.4 }}>{item.h}</div>
                  </div>
                  <div style={{ fontSize: 12, color: active ? "rgba(255,250,235,0.85)" : "var(--color-text-secondary)", lineHeight: 1.8 }}>{summarize(item.b)}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: active ? "#fff4d8" : "#6e451f", marginTop: 8 }}>查看课件 →</div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="kmap-canvas">
          <div style={{ position: "relative", width: 980, minHeight: 520, margin: "0 auto", padding: "18px 0" }}>
            <svg width="980" height="520" viewBox="0 0 980 520" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
              <defs>
                <linearGradient id="mind-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(120,80,40,0.2)" />
                  <stop offset="100%" stopColor="rgba(93,143,70,0.55)" />
                </linearGradient>
              </defs>
              {layoutNodes.map((item) => {
                const active = hoveredIndex === item.index;
                const curve = `M 490 235 C ${item.isLeft ? 430 : 550} 235, ${item.isLeft ? 360 : 620} ${item.anchorY}, ${item.anchorX} ${item.anchorY}`;
                return (
                  <g key={`line-${item.index}`}>
                    <path className="kmap-link" d={curve} pathLength="1" stroke={active ? "#5d8f46" : "url(#mind-line-gradient)"} strokeWidth={active ? 4 : 2.5} style={{ animationDelay: `${item.index * 0.12}s` }} />
                    <path className="kmap-link is-flow" d={curve} pathLength="1" stroke={active ? "#3f6e2f" : "#8a5a2b"} strokeWidth={active ? 4.5 : 3} style={{ opacity: active ? 0.9 : 0.55 }} />
                    <circle className="kmap-anchor-dot" cx={item.anchorX} cy={item.anchorY} r={active ? 5 : 4} fill={active ? "#5d8f46" : "#8a5a2b"} style={{ animationDelay: `${item.index * 0.3}s` }} />
                  </g>
                );
              })}
            </svg>

            <div className="kmap-center" style={{ position: "absolute", left: 380, top: 150, width: 220, minHeight: 150, padding: 18, borderRadius: 18, background: "linear-gradient(160deg, #8a5a2b, #6e451f)", color: "#fff4d8", border: "2px solid #5e3c1c", boxShadow: "inset 0 1px 0 rgba(255,250,235,0.2), 0 8px 0 rgba(94,60,28,0.4)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span className="motion-bars" style={{ height: 12 }}><span /><span /><span /></span>
                <span style={{ fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,244,216,0.7)" }}>本课主题</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.35, fontFamily: "var(--font-display)" }}>{lessonTitle}</div>
              <div style={{ fontSize: 12, color: "rgba(255,244,216,0.78)", lineHeight: 1.7, marginTop: 8 }}>先看四个主要知识点，再进入内容与课堂练习。</div>
            </div>

            {layoutNodes.map((item) => {
              const active = hoveredIndex === item.index;
              return (
                <button key={`map-${item.index}`} type="button" className="kmap-node" onMouseEnter={() => setHoveredIndex(item.index)} onMouseLeave={() => setHoveredIndex(null)} onFocus={() => setHoveredIndex(item.index)} onBlur={() => setHoveredIndex(null)} onClick={() => onNodeSelect?.(item.index)}
                  style={{ position: "absolute", left: item.x, top: item.y, width: 220, padding: 16, borderRadius: 14, background: active ? "linear-gradient(180deg, #7bb45a, #4f8035)" : "linear-gradient(180deg, #fbf0d6, #f3e3bf)", border: active ? "2px solid #4f8035" : "2px solid #9c6b3a", boxShadow: active ? "0 5px 0 rgba(63,110,47,0.35), inset 0 1px 0 rgba(255,255,255,0.25)" : "inset 0 0 0 1px rgba(255,250,235,0.5), 0 3px 0 rgba(94,60,28,0.2)", textAlign: "left", cursor: "pointer", animationDelay: `${0.15 + item.index * 0.12}s` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 999, background: active ? "#fff4d8" : "linear-gradient(135deg,#7bb45a,#4f8035)", color: active ? "#3f6e2f" : "#fff4d8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, boxShadow: active ? "none" : "0 2px 0 rgba(63,110,47,0.4)", flexShrink: 0 }}>{item.index + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#fff4d8" : "#3f2d1c", lineHeight: 1.4 }}>{item.h}</div>
                  </div>
                  <div style={{ fontSize: 12, color: active ? "rgba(255,250,235,0.85)" : "var(--color-text-secondary)", lineHeight: 1.8 }}>{summarize(item.b)}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: active ? "#fff4d8" : "#6e451f", marginTop: 10 }}>查看课件 →</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LessonView({ lesson, ratings, setRating, scores, setScore, onOpenTutor }) {
  const [tab, setTab] = useState("learn");
  const [labOpen, setLabOpen] = useState(false);
  const [contentPageHint, setContentPageHint] = useState(null);
  const [bktVersion, setBktVersion] = useState(0);
  const [homeworkGuideOpen, setHomeworkGuideOpen] = useState(false);
  const [homeworkContactOpen, setHomeworkContactOpen] = useState(false);
  const [villageDetailKp, setVillageDetailKp] = useState(null);
  const [visualFocus, setVisualFocus] = useState(null);

  const ExComponent = EXERCISE_COMPONENTS[lesson.ex];
  const lessonRichKps = getKnowledgePointsForLesson(lesson.id);
  const pptLessonData = getPptLessonData(lesson.id);
  const contentItems = (pptLessonData?.knowledgePoints || []).map((item, index) => ({
    h: item.title || `知识点 ${index + 1}`,
    b: item.detail || "",
  }));
  const handleScore = (v) => setScore(lesson.id, v);
  const displayTabs = [
    { id: "learn", label: "课前导学" },
    { id: "content", label: "内容学习" },
    { id: "classroom", label: "课堂练习" },
    { id: "homework", label: "课后作业" },
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
            <Tag color="#3f6e2f" bg="#e3efd6">{`第 ${lesson.n} 课`}</Tag>
            <Stars value={ratings[lesson.id] || 0} onChange={(v) => setRating(lesson.id, v)} size={16} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: "4px 0 0" }}>{lesson.t}</h2>
        </div>
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
          {hasLessonVisuals(lesson.id) ? (
            <LessonRoute
              lessonId={lesson.id}
              chapterTitle={pptLessonData?.chapter || ""}
              onSelect={(index) => { setVisualFocus({ index, nonce: Date.now() }); setTab("content"); }}
            />
          ) : (
            <KnowledgeMindMap
              lessonTitle={lesson.t}
              chapterTitle={pptLessonData?.chapter || ""}
              items={contentItems}
              onNodeSelect={(index) => { setContentPageHint(index); setTab("content"); }}
            />
          )}
          {/* lessons with visual cards already carry the hands-on parts inline */}
          {!hasLessonVisuals(lesson.id) && LESSON_HAS_INTERACTIVE.includes(lesson.id) && (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>互动预习</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
                先用互动组件动手感受本课概念，再进入内容学习与课堂练习。
              </div>
              <LessonInteractiveWidgets lessonId={lesson.id} />
            </div>
          )}
        </div>
      )}

      {tab === "content" && (
        <div className="section-stack">
          <LessonLearningWorkspace lesson={lesson} section="content" showTabs={false} contentPageHint={contentPageHint} visualFocus={visualFocus} onBktChange={() => setBktVersion((prev) => prev + 1)} />
        </div>
      )}

      {tab === "classroom" && (
        <div className="section-stack">
          {(scores[lesson.id] || 0) > 0 && (
            <div className="section-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>得分</span>
              <div style={{ flex: 1 }}><PBar v={scores[lesson.id]} max={100} color="#5d8f46" /></div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#5d8f46" }}>{scores[lesson.id]}%</span>
            </div>
          )}
          <LessonLearningWorkspace lesson={lesson} section="practice" showTabs={false} onBktChange={() => setBktVersion((prev) => prev + 1)} />
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>练习说明</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              请先完成课时测验和互动练习，再继续下方练习模块。
              <br />
              系统会记录错误类型，用于作业反馈和教师端汇总。
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
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: homeworkGuideOpen ? "var(--gradient-accent)" : "rgba(94,60,28,0.07)", color: homeworkGuideOpen ? "#fdf6e3" : "var(--color-text-primary)", cursor: "pointer" }}
            >
              {homeworkGuideOpen ? "收起作业指南" : "查看作业指南"}
            </button>
            <button
              type="button"
              onClick={() => setHomeworkContactOpen((prev) => !prev)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(120,80,40,0.2)", background: homeworkContactOpen ? "var(--gradient-accent)" : "rgba(94,60,28,0.07)", color: homeworkContactOpen ? "#fdf6e3" : "var(--color-text-primary)", cursor: "pointer" }}
            >
              {homeworkContactOpen ? "收起支持说明" : "查看支持说明"}
            </button>
            <button
              onClick={() => setTab("lab")}
              className="support-tile"
              style={{ width: "min(320px, 100%)", textAlign: "left", padding: 12, marginLeft: "auto" }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>音乐创作实验室</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                使用互动实验室进行音乐创作。
              </div>
            </button>
          </div>

          {homeworkGuideOpen ? (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>作业指南</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                建议把作业组织为三个部分：概念说明、例题示范和错误反思。
                <br />
                提交前请检查术语是否准确，例子是否对应本课核心概念。
              </div>
            </div>
          ) : null}

          {homeworkContactOpen ? (
            <div className="section-card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>支持说明</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                如果课堂练习、作业上传或智能导师出现问题，请先刷新页面并重新进入该课时。
                <br />
                如果问题仍然存在，请记录课时名称、操作步骤和错误表现，便于教师跟进。
              </div>
            </div>
          ) : null}

          <LessonLearningWorkspace lesson={lesson} section="homework" showTabs={false} onBktChange={() => setBktVersion((prev) => prev + 1)} />
        </div>
      )}

      {tab === "lab" && (
        <div>
          <div className="section-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{`音乐创作实验室 - ${lesson.labN}`}</div>
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
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>点击“打开”加载实验页面，建议使用现代浏览器。</div>
              </div>
            )}
          </div>
          <a href={lesson.lab} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", fontSize: 11, color: "#185FA5", padding: 8, textDecoration: "none" }}>在新窗口打开</a>
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
    { id: "lab", label: "音乐创作实验室", desc: "打开延伸实验页面，探索音高、节奏和记谱。" },
  ];

  return (
    <div className="support-grid">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item.id)}
          className="support-tile"
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>{item.label}</div>
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
