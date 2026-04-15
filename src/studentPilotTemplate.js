const EMPTY_STUDENT_ROW = {
  studentName: "",
  studentId: "",
  className: "",
  deviceType: "",
  browser: "",
  networkType: "",
  dailyMinutes: "",
  mostConfusedPoint: "",
  bestFeature: "",
  reportedBug: "",
  teacherReview: "",
};

export const REAL_STUDENT_PILOT_TEMPLATES = [
  {
    id: "pilot-10",
    label: "10 名真实学生试点",
    studentCount: 10,
    durationDays: 5,
    goal: "验证课堂练习、AI 导师、图片问答和课后作业链路在小样本真实教学中的稳定性。",
    recruitment: [
      "优先覆盖不同基础层次：优秀 3 人，中等 4 人，基础薄弱 3 人。",
      "至少包含 2 名经常使用手机完成作业的学生。",
      "至少包含 2 名对五线谱或节奏明显薄弱的学生，便于观察 AI 辅导效果。",
    ],
    phases: [
      { phase: "第 1 天：基线测评", tasks: "完成 1 次课堂练习、2 次 AI 导师提问、1 次课后作业草稿。", evidence: "记录初始 P(L)、首轮错题和导师响应时间。" },
      { phase: "第 2-4 天：连续使用", tasks: "每天 15-20 分钟，完成课前预习、课堂练习、至少 1 次 AI 导师问答。", evidence: "记录最困惑知识点、最好用功能和遇到的 bug。" },
      { phase: "第 5 天：总结访谈", tasks: "完成 1 次综合课后作业并提交反馈问卷。", evidence: "导出学生学习报告，人工核对知识点掌握度变化。" },
    ],
    successCriteria: [
      "AI 导师文字问答成功率 ≥ 90%",
      "图片问答成功率 ≥ 80%",
      "课后作业提交完成率 ≥ 85%",
      "至少 70% 学生能明确说出自己最困惑的知识点和最有帮助的功能",
    ],
    observationFields: [
      "学生姓名 / 学号 / 班级",
      "设备类型（手机 / 平板 / 电脑）",
      "网络环境（校园网 / 家庭 Wi‑Fi / 移动网络）",
      "每天实际使用时长",
      "最困惑知识点",
      "最好用功能",
      "遇到的 bug",
      "教师复核意见",
    ],
  },
  {
    id: "pilot-20",
    label: "20 名真实学生试点",
    studentCount: 20,
    durationDays: 7,
    goal: "验证平台在更接近真实班级使用负载下的稳定性、自适应分层和作业评阅质量。",
    recruitment: [
      "优先按 4 类学生结构抽样：优秀型 5 人，中等稳定型 7 人，偏科型 4 人，基础薄弱型 4 人。",
      "确保至少 5 名学生主要使用手机端完成 AI 导师和拍照作业。",
      "每一章至少有 2 名学生完成完整学习链路，保证章节覆盖。",
    ],
    phases: [
      { phase: "第 1-2 天：适应期", tasks: "熟悉课前预习、内容呈现、课堂练习、AI 导师和课后作业入口。", evidence: "记录入口理解难点和页面切换问题。" },
      { phase: "第 3-5 天：高频使用期", tasks: "每天完成 1 次课堂练习、2 次 AI 导师问答、1 次作业提交。", evidence: "记录 BKT 掌握度变化、图片问答成功率和作业提交质量。" },
      { phase: "第 6-7 天：总结评估", tasks: "抽查 5 名学生进行半结构化访谈，并导出全体 PDF 学习报告。", evidence: "教师比对 P(L) 与实际表现是否一致。" },
    ],
    successCriteria: [
      "AI 导师整体通过率 ≥ 90%",
      "并发使用时页面与接口无明显卡顿或报错",
      "BKT 对不同水平学生的掌握度差异明显",
      "教师可用 PDF 学习报告完成课后复核",
    ],
    observationFields: [
      "学生姓名 / 学号 / 班级",
      "设备类型与浏览器",
      "是否主要使用手机端",
      "AI 导师使用次数",
      "图片问答次数",
      "课后作业提交次数",
      "最困惑知识点",
      "最好用功能",
      "遇到的 bug",
      "教师复核意见",
    ],
  },
];

export function buildPilotTemplateJson(template) {
  return {
    id: template.id,
    label: template.label,
    studentCount: template.studentCount,
    durationDays: template.durationDays,
    goal: template.goal,
    recruitment: template.recruitment,
    phases: template.phases,
    successCriteria: template.successCriteria,
    observationFields: template.observationFields,
    students: Array.from({ length: template.studentCount }, () => ({ ...EMPTY_STUDENT_ROW })),
  };
}

export function buildPilotTemplateCsv(template) {
  const header = Object.keys(EMPTY_STUDENT_ROW);
  const rows = [header.join(",")];
  for (let index = 0; index < template.studentCount; index += 1) {
    rows.push(header.map(() => "").join(","));
  }
  return `\uFEFF${rows.join("\n")}\n`;
}
