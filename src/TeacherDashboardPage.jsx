import { useCallback, useEffect, useMemo, useState } from "react";
import { buildPilotTemplateCsv, buildPilotTemplateJson, REAL_STUDENT_PILOT_TEMPLATES } from "./studentPilotTemplate";
import { clearVirtualStudentsFromLocalStorage, createVirtualStudents, writeVirtualStudentsToLocalStorage } from "./musicaiBkt";
import { KNOWLEDGE_POINTS, getBktKnowledgePoints } from "./musicaiKnowledge";
import { summarizePianoSubmission, summarizeRhythmSubmission, summarizeStaffSubmission } from "./homeworkSummary";
import { getStudentProfile } from "./studentProfile";

const TEACHER_AUTH_STORAGE_KEY = "musicai.teacher.auth";
const TEACHER_LOGIN_USERNAME = "gxz";
const TEACHER_LOGIN_PASSWORD = "19991009";
const TOTAL_KNOWLEDGE_POINT_COUNT = KNOWLEDGE_POINTS.length;
const BKT_TRACKED_KNOWLEDGE_POINT_COUNT = getBktKnowledgePoints().length;
const DIAGNOSTIC_KNOWLEDGE_POINT_COUNT = TOTAL_KNOWLEDGE_POINT_COUNT - BKT_TRACKED_KNOWLEDGE_POINT_COUNT;
const TEACHER_DASHBOARD_TABS = [
  { id: "overview", label: "概览" },
  { id: "rq4", label: "RQ4" },
  { id: "reports", label: "学生报告" },
  { id: "bkt", label: "BKT 验证" },
  { id: "export", label: "样本导出" },
];

export default function TeacherDashboardPage() {
  const [data, setData] = useState(null);
  const [bktData, setBktData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [bktLoadError, setBktLoadError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selfCheck, setSelfCheck] = useState({
    service: { status: "pending", message: "未检测" },
    overview: { status: "pending", message: "未检测" },
    bkt: { status: "pending", message: "未检测" },
  });
  const [simulating, setSimulating] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [deepRunning, setDeepRunning] = useState(false);
  const [seedingSamples, setSeedingSamples] = useState(false);
  const [seedStatusMessage, setSeedStatusMessage] = useState("");
  const currentStudentProfile = useMemo(() => getStudentProfile(), []);
  const [selectedPilotTemplateId, setSelectedPilotTemplateId] = useState(REAL_STUDENT_PILOT_TEMPLATES[0]?.id || "");
  const [selectedReportUserId, setSelectedReportUserId] = useState("");
  const [reportPreview, setReportPreview] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [reportPdfInfo, setReportPdfInfo] = useState(null);
  const [teacherSampleReportPreview, setTeacherSampleReportPreview] = useState(null);
  const [teacherSampleReportLoading, setTeacherSampleReportLoading] = useState(false);
  const [rq4StudentQuery, setRq4StudentQuery] = useState("");
  const [activeDashboardTab, setActiveDashboardTab] = useState("overview");
  const currentStudentRecord = (bktData?.students || []).find((item) => item.userId === currentStudentProfile.studentId) || null;
  const selectedPilotTemplate = REAL_STUDENT_PILOT_TEMPLATES.find((item) => item.id === selectedPilotTemplateId) || REAL_STUDENT_PILOT_TEMPLATES[0];
  const rq4Data = data?.experimentSimulation?.rq4 || null;
  const filteredRq4Students = useMemo(() => {
    const rows = rq4Data?.students || [];
    const keyword = rq4StudentQuery.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((item) => String(item.studentId || "").toLowerCase().includes(keyword));
  }, [rq4Data?.students, rq4StudentQuery]);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.sessionStorage.getItem(TEACHER_AUTH_STORAGE_KEY) : "";
      setAuthenticated(raw === "ok");
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  const parseResponseJson = useCallback(async (response, label) => {
    const raw = await response.text();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      throw new Error(`${label} 返回了非 JSON 内容。`);
    }
    if (!response.ok) {
      throw new Error(json?.error || `${label} 请求失败（${response.status}）`);
    }
    return json;
  }, []);

  const normalizeTeacherDashboardError = useCallback((error) => {
    const message = String(error?.message || error || "");
    if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
      return "无法连接教师后台服务。请先确认本地服务已启动，再刷新页面。";
    }
    return message || "教师后台数据加载失败。";
  }, []);

  const setCheckState = useCallback((key, status, message) => {
    setSelfCheck((current) => ({
      ...current,
      [key]: { status, message },
    }));
  }, []);

  const loadTeacherHealth = useCallback(async () => {
    const healthResponse = await fetch("/api/health");
    const healthJson = await parseResponseJson(healthResponse, "教师后台服务自检");
    setCheckState("service", "success", `在线（${healthJson.provider || "unknown"} / ${healthJson.model || "unknown"}）`);
    return healthJson;
  }, [parseResponseJson, setCheckState]);

  const loadTeacherOverview = useCallback(async () => {
    const analyticsResponse = await fetch("/api/teacher/overview");
    const analyticsJson = await parseResponseJson(analyticsResponse, "教师后台概览");
    setCheckState("overview", "success", `成功（学生 ${analyticsJson.summary?.totalStudents ?? 0} 人）`);
    return analyticsJson;
  }, [parseResponseJson, setCheckState]);

  const loadTeacherBktOverview = useCallback(async () => {
    const bktResponse = await fetch("/api/teacher/bkt-overview");
    const bktJson = await parseResponseJson(bktResponse, "教师后台 BKT 概览");
    const trackedCount = bktJson.summary?.totalKnowledgePoints ?? BKT_TRACKED_KNOWLEDGE_POINT_COUNT;
    setCheckState(
      "bkt",
      "success",
      `成功（BKT 追踪 ${trackedCount} 个；综合诊断 ${DIAGNOSTIC_KNOWLEDGE_POINT_COUNT} 个；总计 ${TOTAL_KNOWLEDGE_POINT_COUNT} 个）`,
    );
    return bktJson;
  }, [parseResponseJson, setCheckState]);

  const reloadDashboard = useCallback(async () => {
    setCheckState("service", "pending", "检测中...");
    setCheckState("overview", "pending", "检测中...");
    setCheckState("bkt", "pending", "检测中...");
    setDashboardError("");
    try {
      await loadTeacherHealth();
    } catch (error) {
      setCheckState("service", "error", normalizeTeacherDashboardError(error));
      throw error;
    }
    let analyticsJson = null;
    try {
      analyticsJson = await loadTeacherOverview();
      setData(analyticsJson);
    } catch (error) {
      setCheckState("overview", "error", normalizeTeacherDashboardError(error));
      throw error;
    }
    try {
      const bktJson = await loadTeacherBktOverview();
      setBktData(bktJson);
      setBktLoadError("");
    } catch (error) {
      setBktData(null);
      const normalized = normalizeTeacherDashboardError(error);
      setCheckState("bkt", "error", normalized);
      setBktLoadError(normalized);
    }
  }, [loadTeacherBktOverview, loadTeacherHealth, loadTeacherOverview, normalizeTeacherDashboardError, setCheckState]);

  useEffect(() => {
    if (!authChecked || !authenticated) return undefined;
    let active = true;
    const load = async () => {
      setLoading(true);
      setCheckState("service", "pending", "检测中...");
      setCheckState("overview", "pending", "检测中...");
      setCheckState("bkt", "pending", "检测中...");
      try {
        await loadTeacherHealth();
        const analyticsJson = await loadTeacherOverview();
        if (active) {
          setData(analyticsJson);
          setDashboardError("");
        }
        try {
          const bktJson = await loadTeacherBktOverview();
          if (active) {
            setBktData(bktJson);
            setBktLoadError("");
          }
        } catch (error) {
          if (active) {
            setBktData(null);
            const normalized = normalizeTeacherDashboardError(error);
            setCheckState("bkt", "error", normalized);
            setBktLoadError(normalized);
          }
        }
      } catch (error) {
        if (active) {
          setData(null);
          setBktData(null);
          const normalized = normalizeTeacherDashboardError(error);
          setDashboardError(normalized);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [authChecked, authenticated, loadTeacherBktOverview, loadTeacherHealth, loadTeacherOverview, normalizeTeacherDashboardError, setCheckState]);

  const handleTeacherLogin = useCallback((event) => {
    event.preventDefault();
    if (loginUsername.trim() !== TEACHER_LOGIN_USERNAME || loginPassword !== TEACHER_LOGIN_PASSWORD) {
      setLoginError("账号或密码错误。");
      return;
    }
    try {
      window.sessionStorage.setItem(TEACHER_AUTH_STORAGE_KEY, "ok");
    } catch {}
    setLoginError("");
    setAuthenticated(true);
  }, [loginPassword, loginUsername]);

  const handleTeacherLogout = useCallback(() => {
    try {
      window.sessionStorage.removeItem(TEACHER_AUTH_STORAGE_KEY);
    } catch {}
    setAuthenticated(false);
    setData(null);
    setBktData(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedReportUserId && bktData?.students?.length) {
      setSelectedReportUserId(currentStudentRecord?.userId || bktData.students[0].userId || "");
    }
  }, [bktData, currentStudentRecord, selectedReportUserId]);

  const regenerateVirtualStudents = async () => {
    setSimulating(true);
    try {
      const localStudents = createVirtualStudents();
      writeVirtualStudentsToLocalStorage(localStudents);
      await fetch("/api/bkt/simulate", { method: "POST" });
      await reloadDashboard();
    } finally {
      setSimulating(false);
    }
  };

  const clearVirtualStudents = async () => {
    setSimulating(true);
    try {
      clearVirtualStudentsFromLocalStorage();
      await fetch("/api/bkt/reset", { method: "POST" });
      await reloadDashboard();
    } finally {
      setSimulating(false);
    }
  };

  const initializeTeacherSamples = async () => {
    setSeedingSamples(true);
    setSeedStatusMessage("");
    try {
      const response = await fetch("/api/teacher/init-samples", { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "初始化教师样本数据失败。");
      }
      setSeedStatusMessage(
        json.mode === "seed-fallback"
          ? `已加载部署样本数据（运行时写入受限，当前使用内置样本）。学生 ${json.summary?.simulatedStudents || 0} 人。`
          : `已初始化教师样本数据。学生 ${json.summary?.simulatedStudents || 0} 人。`,
      );
      await reloadDashboard();
    } catch (error) {
      setSeedStatusMessage(normalizeTeacherDashboardError(error));
    } finally {
      setSeedingSamples(false);
    }
  };

  const runBktValidation = async () => {
    setTestRunning(true);
    try {
      await fetch("/api/bkt/test/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes: 120, questionCount: 200 }),
      });
      await reloadDashboard();
    } finally {
      setTestRunning(false);
    }
  };

  const resetBktValidation = async () => {
    setTestRunning(true);
    try {
      await fetch("/api/bkt/test/reset", { method: "POST" });
      await reloadDashboard();
    } finally {
      setTestRunning(false);
    }
  };

  const runDeepSimulation = async () => {
    setDeepRunning(true);
    try {
      await fetch("/api/bkt/test/deep-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentCount: 150 }),
      });
      await reloadDashboard();
    } finally {
      setDeepRunning(false);
    }
  };

  const metricCard = (label, value) => (
    <div className="section-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#111111" }}>{value}</div>
    </div>
  );

  const downloadPilotTemplate = useCallback((format) => {
    if (!selectedPilotTemplate) return;
    const fileNameBase = `${selectedPilotTemplate.id}-${selectedPilotTemplate.studentCount}students`;
    const blob = new Blob(
      [format === "json" ? `${JSON.stringify(buildPilotTemplateJson(selectedPilotTemplate), null, 2)}\n` : buildPilotTemplateCsv(selectedPilotTemplate)],
      { type: format === "json" ? "application/json;charset=utf-8" : "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileNameBase}.${format === "json" ? "json" : "csv"}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [selectedPilotTemplate]);

  const previewStudentReport = useCallback(async () => {
    if (!selectedReportUserId) return;
    setReportLoading(true);
    setReportPdfInfo(null);
    try {
      const response = await fetch(`/api/reports/student-preview?userId=${encodeURIComponent(selectedReportUserId)}`);
      const json = await response.json();
      setReportPreview(response.ok ? json.report : null);
    } finally {
      setReportLoading(false);
    }
  }, [selectedReportUserId]);

  const generateStudentPdfReport = useCallback(async () => {
    if (!selectedReportUserId) return;
    setReportGenerating(true);
    try {
      const response = await fetch("/api/reports/student-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedReportUserId }),
      });
      const json = await response.json();
      if (response.ok) {
        setReportPreview(json.report);
        setReportPdfInfo(json.pdf);
      } else {
        setReportPdfInfo({ error: json.error || "生成 PDF 失败。" });
      }
    } finally {
      setReportGenerating(false);
    }
  }, [selectedReportUserId]);

  const previewTeacherSampleReport = useCallback(async () => {
    setTeacherSampleReportLoading(true);
    try {
      const response = await fetch("/api/reports/teacher-samples-preview");
      const json = await response.json();
      setTeacherSampleReportPreview(response.ok ? json.report : null);
    } finally {
      setTeacherSampleReportLoading(false);
    }
  }, []);

  const downloadTeacherSampleReport = useCallback((format) => {
    const anchor = document.createElement("a");
    anchor.href = `/api/reports/teacher-samples-export?format=${encodeURIComponent(format)}`;
    anchor.download = format === "json" ? "teacher-sample-report.json" : format === "csv" ? "teacher-sample-report.csv" : "teacher-sample-report.html";
    anchor.click();
  }, []);

  const tabPanelStyle = (tabId, baseStyle = {}) => ({
    ...baseStyle,
    display: activeDashboardTab === tabId ? baseStyle.display : "none",
  });

  if (!authChecked) {
    return <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>正在校验教师后台权限...</div>;
  }

  if (!authenticated) {
    return (
      <div className="section-card" style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>教师后台登录</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 14 }}>
          请使用教师账号登录后再查看 BKT 概览、学生报告和试点数据。
        </div>
        <form onSubmit={handleTeacherLogin} style={{ display: "grid", gap: 10 }}>
          <input value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} placeholder="账号" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }} />
          <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="密码" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)" }} />
          {loginError ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{loginError}</div> : null}
          <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>
            登录
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>教师后台加载中...</div>;
  }

  if (!data?.ok) {
    return (
      <div style={{ fontSize: 13, color: "#b91c1c", lineHeight: 1.8 }}>
        教师后台数据加载失败。
        <br />
        {dashboardError || "请先确认本地服务已启动，然后刷新页面。"}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>教师后台</h2>
        <button onClick={handleTeacherLogout} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>退出登录</button>
      </div>

      <div className="section-card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>教师后台自检状态</div>
        <div className="metric-grid">
          {[
            ["服务是否在线", selfCheck.service],
            ["概览接口是否成功", selfCheck.overview],
            ["BKT 接口是否成功", selfCheck.bkt],
          ].map(([label, item]) => {
            const color = item.status === "success" ? "#166534" : item.status === "error" ? "#b91c1c" : "#555555";
            return (
              <div key={label} className="subtle-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color }}>{item.status === "success" ? "正常" : item.status === "error" ? "失败" : "检测中"}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.6, marginTop: 6 }}>{item.message}</div>
              </div>
            );
          })}
          <div className="subtle-card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>知识点口径</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>
              BKT {bktData?.summary?.totalKnowledgePoints ?? BKT_TRACKED_KNOWLEDGE_POINT_COUNT} / 全部 {TOTAL_KNOWLEDGE_POINT_COUNT}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.6, marginTop: 6 }}>
              BKT 只追踪 L1-L11 的 {BKT_TRACKED_KNOWLEDGE_POINT_COUNT} 个过程性知识点；L12 的 {DIAGNOSTIC_KNOWLEDGE_POINT_COUNT} 个综合复习点用于诊断展示，不计入自适应掌握度更新。
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            如果公网教师后台为空，可点击右侧按钮将随部署一起上传的样本数据加载到当前后台。
          </div>
          <button
            onClick={initializeTeacherSamples}
            disabled={seedingSamples}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: seedingSamples ? "default" : "pointer" }}
          >
            {seedingSamples ? "初始化中..." : "一键初始化教师样本数据"}
          </button>
        </div>
        {seedStatusMessage ? (
          <div style={{ marginTop: 10, fontSize: 11, color: /失败|无法|error/i.test(seedStatusMessage) ? "#b91c1c" : "#166534", lineHeight: 1.8 }}>
            {seedStatusMessage}
          </div>
        ) : null}
      </div>

      <div className="section-card" style={{ marginBottom: 18, padding: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TEACHER_DASHBOARD_TABS.map((tab) => {
            const active = activeDashboardTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveDashboardTab(tab.id)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid rgba(17,17,17,0.12)",
                  background: active ? "#111111" : "#ffffff",
                  color: active ? "#ffffff" : "#111111",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="section-card" style={tabPanelStyle("export", { marginBottom: 18 })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>导出教师样本报告</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              聚合当前教师后台样本数据，导出为 `JSON / CSV / HTML`，用于团队验收、试点说明或人工复核。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={previewTeacherSampleReport} disabled={teacherSampleReportLoading} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: teacherSampleReportLoading ? "default" : "pointer" }}>
              {teacherSampleReportLoading ? "加载中..." : "预览样本报告"}
            </button>
            <button onClick={() => downloadTeacherSampleReport("json")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>导出 JSON</button>
            <button onClick={() => downloadTeacherSampleReport("csv")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>导出 CSV</button>
            <button onClick={() => downloadTeacherSampleReport("html")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>导出 HTML</button>
          </div>
        </div>
        {teacherSampleReportPreview ? (
          <div className="lesson-layout" style={{ marginTop: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>样本报告摘要</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                样本记录：{teacherSampleReportPreview.summary?.totalRecords || 0}
                <br />
                学生数：{teacherSampleReportPreview.summary?.totalStudents || 0}，平均得分：{teacherSampleReportPreview.summary?.averageScore || 0}% ，平均掌握度：{Number(teacherSampleReportPreview.summary?.averageMastery || 0).toFixed(3)}
                <br />
                低掌握学生：{teacherSampleReportPreview.summary?.lowMasteryStudents || 0}，已提交作业：{teacherSampleReportPreview.summary?.totalHomeworkSubmitted || 0}
                <br />
                当前最弱知识点：{(teacherSampleReportPreview.weakKnowledgePoints || []).slice(0, 3).map((item) => item.title).join(" / ") || "暂无"}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>样本画像分布</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(teacherSampleReportPreview.profileDistribution || []).map((item) => (
                  <div key={`profile-${item.label}`} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    {item.label}：{item.count} 人
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="metric-grid" style={tabPanelStyle("overview", { marginBottom: 18 })}>
        {metricCard("数据记录数", data.summary.totalRecords)}
        {metricCard("学生数", data.summary.totalStudents)}
        {metricCard("平均得分", `${data.summary.averageScore}%`)}
        {metricCard("已提交作业", data.summary.totalHomeworkSubmitted)}
      </div>

      {activeDashboardTab === "rq4" && rq4Data ? (
        <div className="section-card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>RQ4 深度使用实验组数据</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                来源：{data.experimentSimulation?.source === "seed-json" ? "随部署样本" : "本地 experiment-sim-package-v2.xlsx"}
                <br />
                样本：实验组 {rq4Data.sampleCount || 0} 人，低参与学生 {rq4Data.lowParticipationCount || 0} 人，Pearson 达标 {rq4Data.significantPearsons || 0} 项，强预测因子 {rq4Data.strongPredictors || 0} 个。
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: rq4Data.overallPass ? "#166534" : "#b91c1c" }}>
              {rq4Data.overallPass ? "RQ4 达标" : "RQ4 未达标"}
            </div>
          </div>

          <div className="metric-grid" style={{ marginBottom: 14 }}>
            {(rq4Data.summaryMetrics || []).filter((item) => !["low_participation_count", "significant_pearsons", "strong_predictors", "overall_pass"].includes(item.metric)).map((item) => (
              <div key={`rq4-metric-${item.metric}`} className="subtle-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>{item.metric}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111111" }}>
                  {typeof item.mean === "number" ? Number(item.mean).toFixed(item.metric.includes("accuracy") || item.metric.includes("pL") ? 3 : 1) : item.mean}
                </div>
                <div style={{ fontSize: 11, color: item.pass ? "#166534" : "#b91c1c", marginTop: 6 }}>
                  目标：{item.target || "-"} · {item.pass ? "通过" : "未通过"}
                </div>
              </div>
            ))}
          </div>

          <div className="lesson-layout" style={{ marginBottom: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>与后测成绩的 Pearson 相关</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(rq4Data.correlations || []).map((item) => (
                  <div key={`rq4-corr-${item.variableY}`} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 90px", gap: 8, fontSize: 11, alignItems: "center" }}>
                    <div style={{ color: "#111111", fontWeight: 600 }}>{item.variableY}</div>
                    <div>r={Number(item.r || 0).toFixed(3)}</div>
                    <div>p={Number(item.p || 0).toFixed(4)}</div>
                    <div style={{ color: item.pass ? "#166534" : "#b91c1c" }}>{item.pass ? "达标" : "未达标"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>逻辑一致性检查</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(rq4Data.logicChecks || []).map((item) => (
                  <div key={`rq4-logic-${item.check}`} style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 90px", gap: 8, fontSize: 11, alignItems: "center" }}>
                    <div style={{ color: "#111111", fontWeight: 600 }}>{item.check}</div>
                    <div>r={Number(item.r || 0).toFixed(3)}</div>
                    <div>p={Number(item.p || 0).toFixed(4)}</div>
                    <div style={{ color: item.pass ? "#166534" : "#b91c1c" }}>{item.pass ? "通过" : "失败"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lesson-layout" style={{ marginBottom: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>层级回归摘要</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 8 }}>
                Block 1 R²：{Number(rq4Data.regression?.block1?.rSquared || 0).toFixed(4)}
                <br />
                Block 2 R²：{Number(rq4Data.regression?.block2?.rSquared || 0).toFixed(4)}
                <br />
                ΔR²：{Number(rq4Data.regression?.block2?.deltaRSquared || 0).toFixed(4)}，F change：{Number(rq4Data.regression?.block2?.fChange || 0).toFixed(4)}，p：{Number(rq4Data.regression?.block2?.pChange || 0).toFixed(4)}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                      <th style={{ padding: "6px 8px" }}>预测变量</th>
                      <th style={{ padding: "6px 8px" }}>β</th>
                      <th style={{ padding: "6px 8px" }}>p</th>
                      <th style={{ padding: "6px 8px" }}>Tolerance</th>
                      <th style={{ padding: "6px 8px" }}>VIF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rq4Data.regression?.coefficients || []).map((item) => (
                      <tr key={`rq4-beta-${item.predictor}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                        <td style={{ padding: "6px 8px" }}>{item.predictor}</td>
                        <td style={{ padding: "6px 8px" }}>{Number(item.standardizedBeta || 0).toFixed(3)}</td>
                        <td style={{ padding: "6px 8px" }}>{Number(item.p || 0).toFixed(4)}</td>
                        <td style={{ padding: "6px 8px" }}>{Number(item.tolerance || 0).toFixed(3)}</td>
                        <td style={{ padding: "6px 8px" }}>{Number(item.vif || 0).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>实验组 150 人完整数据</div>
                <input
                  value={rq4StudentQuery}
                  onChange={(event) => setRq4StudentQuery(event.target.value)}
                  placeholder="按学生 ID 搜索"
                  style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", minWidth: 180 }}
                />
              </div>
              <div style={{ overflowX: "auto", maxHeight: 420 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                      <th style={{ padding: "6px 8px" }}>学生</th>
                      <th style={{ padding: "6px 8px" }}>前测</th>
                      <th style={{ padding: "6px 8px" }}>后测</th>
                      <th style={{ padding: "6px 8px" }}>前测 IMMS</th>
                      <th style={{ padding: "6px 8px" }}>后测 IMMS</th>
                      <th style={{ padding: "6px 8px" }}>PU</th>
                      <th style={{ padding: "6px 8px" }}>PEU</th>
                      <th style={{ padding: "6px 8px" }}>时长</th>
                      <th style={{ padding: "6px 8px" }}>题量</th>
                      <th style={{ padding: "6px 8px" }}>正确率</th>
                      <th style={{ padding: "6px 8px" }}>P(L)</th>
                      <th style={{ padding: "6px 8px" }}>mastered</th>
                      <th style={{ padding: "6px 8px" }}>导师提问</th>
                      <th style={{ padding: "6px 8px" }}>错误数</th>
                      <th style={{ padding: "6px 8px" }}>A/R/C/S 后测</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRq4Students.map((item) => (
                      <tr key={`rq4-student-${item.studentId}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                        <td style={{ padding: "6px 8px" }}>{item.studentId}</td>
                        <td style={{ padding: "6px 8px" }}>{item.preMte ?? "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.postMte ?? "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{typeof item.preImmsTotal === "number" ? item.preImmsTotal.toFixed(3) : "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{typeof item.postImmsTotal === "number" ? item.postImmsTotal.toFixed(3) : "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{typeof item.puMean === "number" ? item.puMean.toFixed(3) : "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{typeof item.peuMean === "number" ? item.peuMean.toFixed(3) : "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.totalTimeMin ?? "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.totalExercises ?? "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{typeof item.overallAccuracy === "number" ? item.overallAccuracy.toFixed(3) : "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{typeof item.avgPL === "number" ? item.avgPL.toFixed(3) : "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.masteredCount ?? "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.tutorQueries ?? "-"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.errorCount ?? "-"}</td>
                        <td style={{ padding: "6px 8px" }}>
                          {[
                            typeof item.postAttention === "number" ? item.postAttention.toFixed(2) : "-",
                            typeof item.postRelevance === "number" ? item.postRelevance.toFixed(2) : "-",
                            typeof item.postConfidence === "number" ? item.postConfidence.toFixed(2) : "-",
                            typeof item.postSatisfaction === "number" ? item.postSatisfaction.toFixed(2) : "-",
                          ].join(" / ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--color-text-secondary)" }}>
                当前显示 {filteredRq4Students.length} / {rq4Data.students?.length || 0} 名实验组学生的完整数据，教师后台已接入全部 150 名学生。
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeDashboardTab === "bkt" && bktLoadError ? (
        <div className="section-card" style={{ marginBottom: 18, borderColor: "rgba(185,28,28,0.18)", background: "rgba(254,242,242,0.9)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#991b1b", marginBottom: 6 }}>BKT 面板加载失败</div>
          <div style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.8 }}>
            {bktLoadError}
            <br />
            当前仍可查看基础教师后台数据；BKT 概览恢复后会自动显示。
          </div>
        </div>
      ) : null}

      <div className="section-card" style={tabPanelStyle("reports", { marginBottom: 18 })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>10-20 名真实学生试点模板</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              选择试点规模后，可直接导出试点记录模板，供音乐教师记录学生使用过程、困惑点、最好用功能和 bug。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={selectedPilotTemplateId} onChange={(event) => setSelectedPilotTemplateId(event.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff" }}>
              {REAL_STUDENT_PILOT_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button onClick={() => downloadPilotTemplate("json")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>导出 JSON 模板</button>
            <button onClick={() => downloadPilotTemplate("csv")} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: "pointer" }}>导出 CSV 记录表</button>
          </div>
        </div>
        {selectedPilotTemplate ? (
          <div className="lesson-layout" style={{ marginTop: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>试点目标与招募建议</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 8 }}>
                规模：{selectedPilotTemplate.studentCount} 人 · 周期：{selectedPilotTemplate.durationDays} 天
                <br />
                目标：{selectedPilotTemplate.goal}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {selectedPilotTemplate.recruitment.map((item) => (
                  <div key={item} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item}</div>
                ))}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>成功标准</div>
              <div style={{ display: "grid", gap: 6 }}>
                {selectedPilotTemplate.successCriteria.map((item) => (
                  <div key={item} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item}</div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {selectedPilotTemplate ? (
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {selectedPilotTemplate.phases.map((item) => (
              <div key={item.phase} className="subtle-card" style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginBottom: 4 }}>{item.phase}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  任务：{item.tasks}
                  <br />
                  证据：{item.evidence}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="section-card" style={tabPanelStyle("reports", { marginBottom: 18 })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>自动导出单个学生 PDF 学习报告</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              这里按单个学生聚合课堂练习、课后作业和知识点 P(L) 生成报告，不是 10-20 人整批导出。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={selectedReportUserId} onChange={(event) => setSelectedReportUserId(event.target.value)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", minWidth: 220 }}>
              {(bktData?.students || []).map((item) => (
                <option key={item.userId} value={item.userId}>{item.studentLabel}（{item.userId}）</option>
              ))}
            </select>
            <button onClick={previewStudentReport} disabled={!selectedReportUserId || reportLoading} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: !selectedReportUserId || reportLoading ? "default" : "pointer" }}>
              {reportLoading ? "加载中..." : "预览报告"}
            </button>
            <button onClick={generateStudentPdfReport} disabled={!selectedReportUserId || reportGenerating} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: !selectedReportUserId || reportGenerating ? "default" : "pointer" }}>
              {reportGenerating ? "生成中..." : "生成 PDF"}
            </button>
          </div>
        </div>
        {reportPdfInfo?.url ? (
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--color-text-secondary)" }}>
            PDF 已生成：
            <a href={reportPdfInfo.url} target="_blank" rel="noreferrer" style={{ marginLeft: 6 }}>{reportPdfInfo.fileName}</a>
          </div>
        ) : reportPdfInfo?.error ? (
          <div style={{ marginTop: 12, fontSize: 11, color: "#b91c1c" }}>{reportPdfInfo.error}</div>
        ) : null}
        {reportPreview ? (
          <div className="lesson-layout" style={{ marginTop: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>报告摘要</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                学生：{reportPreview.studentLabel}（{reportPreview.userId}）
                <br />
                访问课时数：{reportPreview.lessonsVisited}，平均得分：{reportPreview.averageScore}% ，累计学习时长：{reportPreview.totalStudyMinutes} 分钟
                <br />
                平均掌握度：{reportPreview.averageMastery}，作业提交次数：{reportPreview.homeworkSubmitted}
                <br />
                已掌握较好：{(reportPreview.strongPoints || []).map((item) => item.title).join(" / ") || "暂无"}
                <br />
                当前薄弱点：{(reportPreview.weakPoints || []).map((item) => item.title).join(" / ") || "暂无"}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>知识点 P(L) 预览</div>
              <div style={{ overflowX: "auto", maxHeight: 280 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                      <th style={{ padding: "6px 8px" }}>知识点</th>
                      <th style={{ padding: "6px 8px" }}>P(L)</th>
                      <th style={{ padding: "6px 8px" }}>mastered</th>
                      <th style={{ padding: "6px 8px" }}>difficulty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportPreview.knowledgeStates || []).map((item) => (
                      <tr key={`preview-${item.id}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                        <td style={{ padding: "6px 8px" }}>{item.title}</td>
                        <td style={{ padding: "6px 8px" }}>{Number(item.pL || 0).toFixed(3)}</td>
                        <td style={{ padding: "6px 8px" }}>{item.mastered ? "是" : "否"}</td>
                        <td style={{ padding: "6px 8px" }}>{item.difficulty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="section-card" style={tabPanelStyle("bkt", { marginBottom: 18 })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>知识点级 BKT 测试面板</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              可生成 12 名虚拟学生，用于验证 24 个知识点的掌握度分布、自适应推荐和教师后台统计。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={regenerateVirtualStudents} disabled={simulating} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: simulating ? "default" : "pointer" }}>
              {simulating ? "处理中..." : "生成虚拟学生"}
            </button>
            <button onClick={clearVirtualStudents} disabled={simulating} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", color: "#111111", cursor: simulating ? "default" : "pointer" }}>
              清空模拟数据
            </button>
          </div>
        </div>
      </div>

      <div className="section-card" style={tabPanelStyle("bkt", { marginBottom: 18 })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>2 小时 BKT 验证报告</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              运行 4 类学生轨迹，输出 24 个知识点最终 P(L)、mastered 数量、难度升级次数和异常诊断。
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={runBktValidation} disabled={testRunning} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: testRunning ? "default" : "pointer" }}>
              {testRunning ? "验证中..." : "运行 2 小时验证"}
            </button>
            <button onClick={resetBktValidation} disabled={testRunning} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", color: "#111111", cursor: testRunning ? "default" : "pointer" }}>
              清空验证结果
            </button>
          </div>
        </div>
      </div>

      <div className="section-card" style={tabPanelStyle("bkt", { marginBottom: 18 })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>150 名随机学生深度测试</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              随机生成 150 名学生轨迹，统计他们最困惑的知识点、最好用的功能和最常遇到的 bug，用于教师视角的产品诊断。
            </div>
          </div>
          <button onClick={runDeepSimulation} disabled={deepRunning} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: deepRunning ? "default" : "pointer" }}>
            {deepRunning ? "测试中..." : "运行 150 人深度测试"}
          </button>
        </div>
      </div>

      <div className="lesson-layout" style={tabPanelStyle("overview", { marginBottom: 18 })}>
        <div className="section-card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>学生学习概览</div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.students.map((student) => (
              <div key={student.studentId} className="subtle-card" style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{student.studentLabel}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  访问课时：{student.lessonsVisited}，平均得分：{student.averageScore}%
                  <br />
                  学习时长：{student.totalStudyMinutes} 分钟，错误数：{student.totalErrors}，作业提交：{student.homeworkSubmitted}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="section-card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>课时数据概览</div>
          <div style={{ display: "grid", gap: 8 }}>
            {data.lessons.map((lesson) => (
              <div key={lesson.lessonId} className="subtle-card" style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{lesson.lessonTitle || lesson.lessonId}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  参与学生：{lesson.activeStudents}，平均得分：{lesson.averageScore}%，累计错误：{lesson.totalErrors}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activeDashboardTab === "bkt" && bktData?.ok ? (
        <div className="lesson-layout" style={{ marginBottom: 18 }}>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>当前学生知识点 P(L) 明细</div>
            {currentStudentRecord ? (
              <>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
                  学生：{currentStudentRecord.studentLabel}（{currentStudentRecord.userId}）
                  <br />
                  课时：{currentStudentRecord.lessonId}，平均掌握度：{currentStudentRecord.averageMastery}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                        <th style={{ padding: "6px 8px" }}>知识点</th>
                        <th style={{ padding: "6px 8px" }}>P(L)</th>
                        <th style={{ padding: "6px 8px" }}>mastered</th>
                        <th style={{ padding: "6px 8px" }}>difficulty</th>
                        <th style={{ padding: "6px 8px" }}>attempts</th>
                        <th style={{ padding: "6px 8px" }}>accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentStudentRecord.knowledgeStates || []).map((item) => {
                        const accuracy = Number(item.totalAttempts || 0) > 0 ? Math.round((Number(item.correctAttempts || 0) / Number(item.totalAttempts || 1)) * 100) : 0;
                        return (
                          <tr key={`current-student-${item.id}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                            <td style={{ padding: "6px 8px" }}>{item.title}</td>
                            <td style={{ padding: "6px 8px" }}>{Number(item.pL || 0).toFixed(3)}</td>
                            <td style={{ padding: "6px 8px" }}>{item.mastered ? "是" : "否"}</td>
                            <td style={{ padding: "6px 8px" }}>{item.difficulty}</td>
                            <td style={{ padding: "6px 8px" }}>{item.totalAttempts || 0}</td>
                            <td style={{ padding: "6px 8px" }}>{accuracy}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                当前浏览器学生尚未完成知识点同步。请先在学生端完成练习后再刷新教师后台。
              </div>
            )}
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>知识点掌握概览</div>
            <div style={{ display: "grid", gap: 8 }}>
              {bktData.students?.slice(0, 12).map((student) => (
                <div key={`${student.userId}-${student.lessonId}`} className="subtle-card" style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{student.studentLabel}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    课时：{student.lessonId}，平均掌握度：{student.averageMastery}
                    <br />
                    薄弱点：{student.weakPoints?.map((item) => item.title).join(" / ") || "暂无"}
                    <br />
                    建议：{student.recommendation || "继续观察"}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="section-card">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>班级薄弱知识点排行</div>
            <div style={{ display: "grid", gap: 8 }}>
              {bktData.weakKnowledgePoints?.slice(0, 12).map((item) => (
                <div key={item.id} className="subtle-card" style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    所属课时：{item.lessonId}，平均掌握度：{item.averageMastery}
                    <br />
                    掌握率：{Math.round(Number(item.masteryRate || 0) * 100)}%，参与学生：{item.learners}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeDashboardTab === "bkt" && bktData?.latestTestRun ? (
        <div className="section-card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>最近一次验证结果</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                运行时间：{bktData.latestTestRun.runAt}，时长：{bktData.latestTestRun.params?.durationMinutes || 120} 分钟，题量：{bktData.latestTestRun.params?.questionCount || 200}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: bktData.latestTestRun.judgement?.passed ? "#166534" : "#b91c1c" }}>
              {bktData.latestTestRun.judgement?.passed ? "验证通过" : "存在异常"}
            </div>
          </div>

          <div className="lesson-layout" style={{ marginBottom: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>综合诊断</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                场景平均 P(L) 差异：{bktData.latestTestRun.judgement?.averageSpread ?? "-"}
                <br />
                异常：{bktData.latestTestRun.judgement?.issues?.length ? bktData.latestTestRun.judgement.issues.join("；") : "未发现明显异常"}
                <br />
                建议：{bktData.latestTestRun.judgement?.suggestions?.join("；") || "继续观察"}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>教师视角题库风险</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(bktData.latestTestRun.questionBankRisks || []).filter((item) => item.risks?.length).slice(0, 8).map((item) => (
                  <div key={item.knowledgePointId} style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
                    <strong style={{ color: "#111111" }}>{item.title}</strong>：{item.risks.join(" / ")}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {(bktData.latestTestRun.results || []).map((scenario) => (
              <div key={scenario.scenarioId} className="subtle-card" style={{ padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>{scenario.label}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                      正确率：{Math.round(Number(scenario.accuracyTarget || 0) * 100)}%，平均 P(L)：{scenario.averagePL}，mastered：{scenario.masteredCount}，难度升级：{scenario.difficultyUpgradeCount}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: scenario.passed ? "#166534" : "#b91c1c" }}>
                    {scenario.passed ? "符合预期" : "需调参"}
                  </div>
                </div>

                <div style={{ marginBottom: 10, fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                  强项：{scenario.strongPoints?.map((item) => `${item.title} (${item.pL})`).join(" / ") || "暂无"}
                  <br />
                  薄弱点：{scenario.weakPoints?.map((item) => `${item.title} (${item.pL})`).join(" / ") || "暂无"}
                  <br />
                  诊断：{scenario.issues?.length ? scenario.issues.join("；") : "无异常"}
                </div>

                <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                  {(scenario.knowledgeStates || []).map((item) => (
                    <div key={item.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 70px 70px", gap: 8, alignItems: "center", fontSize: 11 }}>
                      <div style={{ color: "#111111", fontWeight: 600 }}>{item.title}</div>
                      <div style={{ height: 10, borderRadius: 999, background: "rgba(17,17,17,0.08)", overflow: "hidden" }}>
                        <div style={{ width: `${Math.round(Number(item.pL || 0) * 100)}%`, height: "100%", background: Number(item.pL || 0) >= 0.8 ? "#111111" : Number(item.pL || 0) >= 0.45 ? "#555555" : "#bdbdbd" }} />
                      </div>
                      <div style={{ color: "#111111" }}>{item.pL}</div>
                      <div style={{ color: item.mastered ? "#166534" : "var(--color-text-secondary)" }}>{item.mastered ? "mastered" : item.difficulty}</div>
                    </div>
                  ))}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                        <th style={{ padding: "6px 8px" }}>知识点</th>
                        <th style={{ padding: "6px 8px" }}>P(L)</th>
                        <th style={{ padding: "6px 8px" }}>mastered</th>
                        <th style={{ padding: "6px 8px" }}>difficulty</th>
                        <th style={{ padding: "6px 8px" }}>attempts</th>
                        <th style={{ padding: "6px 8px" }}>accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(scenario.knowledgeStates || []).map((item) => (
                        <tr key={`${scenario.scenarioId}-${item.id}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                          <td style={{ padding: "6px 8px" }}>{item.title}</td>
                          <td style={{ padding: "6px 8px" }}>{item.pL}</td>
                          <td style={{ padding: "6px 8px" }}>{item.mastered ? "是" : "否"}</td>
                          <td style={{ padding: "6px 8px" }}>{item.difficulty}</td>
                          <td style={{ padding: "6px 8px" }}>{item.totalAttempts}</td>
                          <td style={{ padding: "6px 8px" }}>{Math.round(Number(item.accuracy || 0) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activeDashboardTab === "bkt" && bktData?.latestDeepRun ? (
        <div className="section-card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>150 名随机学生深度测试结果</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                运行时间：{bktData.latestDeepRun.runAt}，样本数：{bktData.latestDeepRun.studentCount}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>
              平均 P(L)：{bktData.latestDeepRun.summary?.averagePL ?? "-"} · 平均 mastered：{bktData.latestDeepRun.summary?.averageMastered ?? "-"}
            </div>
          </div>

          <div className="metric-grid" style={{ marginBottom: 14 }}>
            {[
              ["优等型", bktData.latestDeepRun.summary?.profileSummary?.excellent || 0],
              ["中等稳定型", bktData.latestDeepRun.summary?.profileSummary?.steady || 0],
              ["偏科型", bktData.latestDeepRun.summary?.profileSummary?.imbalanced || 0],
              ["低参与型", bktData.latestDeepRun.summary?.profileSummary?.lowengage || 0],
            ].map(([label, value]) => (
              <div key={label} className="subtle-card" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#111111" }}>{value}</div>
              </div>
            ))}
          </div>

          <div className="lesson-layout" style={{ marginBottom: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>学生最困惑的内容</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(bktData.latestDeepRun.summary?.topConfusions || []).map((item) => (
                  <div key={item.title} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}>
                    <span style={{ color: "#111111", fontWeight: 600 }}>{item.title}</span>
                    <span style={{ color: "var(--color-text-secondary)" }}>{item.count} 人</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>学生觉得最好用的功能</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(bktData.latestDeepRun.summary?.topPreferredTools || []).map((item) => (
                  <div key={item.tool} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}>
                    <span style={{ color: "#111111", fontWeight: 600 }}>{item.tool}</span>
                    <span style={{ color: "var(--color-text-secondary)" }}>{item.count} 人</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lesson-layout" style={{ marginBottom: 14 }}>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>最常报告的 bug</div>
              <div style={{ display: "grid", gap: 6 }}>
                {(bktData.latestDeepRun.summary?.topReportedBugs || []).map((item) => (
                  <div key={item.bug} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11 }}>
                    <span style={{ color: "#111111", lineHeight: 1.7 }}>{item.bug}</span>
                    <span style={{ color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{item.count} 人</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="subtle-card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>产品诊断结论</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                当前样本中，困惑点主要集中在统计结果前列的知识点，说明相关题组和课件解释仍需加强。
                <br />
                若“AI 导师”与“课时内容 PPT”同时高频出现，说明学生最依赖的是即时解释与原课件联动，而不是额外功能。
                <br />
                高频 bug 可直接作为下一轮前端优化优先级。
              </div>
            </div>
          </div>

          <div className="subtle-card" style={{ padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>24 个知识点最终平均 P(L)</div>
            <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              {(bktData.latestDeepRun.summary?.knowledgePointAverages || []).map((item) => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr 60px 70px", gap: 8, alignItems: "center", fontSize: 11 }}>
                  <div style={{ color: "#111111", fontWeight: 600 }}>{item.title}</div>
                  <div style={{ height: 10, borderRadius: 999, background: "rgba(17,17,17,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.round(Number(item.averagePL || 0) * 100)}%`, height: "100%", background: Number(item.averagePL || 0) >= 0.8 ? "#111111" : Number(item.averagePL || 0) >= 0.45 ? "#555555" : "#bdbdbd" }} />
                  </div>
                  <div style={{ color: "#111111" }}>{item.averagePL}</div>
                  <div style={{ color: "var(--color-text-secondary)" }}>{Math.round(Number(item.masteredRate || 0) * 100)}%</div>
                </div>
              ))}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--color-text-secondary)" }}>
                    <th style={{ padding: "6px 8px" }}>知识点</th>
                    <th style={{ padding: "6px 8px" }}>课时</th>
                    <th style={{ padding: "6px 8px" }}>平均 P(L)</th>
                    <th style={{ padding: "6px 8px" }}>mastered 率</th>
                    <th style={{ padding: "6px 8px" }}>样本数</th>
                  </tr>
                </thead>
                <tbody>
                  {(bktData.latestDeepRun.summary?.knowledgePointAverages || []).map((item) => (
                    <tr key={`deep-kp-${item.id}`} style={{ borderTop: "1px solid rgba(17,17,17,0.08)" }}>
                      <td style={{ padding: "6px 8px" }}>{item.title}</td>
                      <td style={{ padding: "6px 8px" }}>{item.lessonId}</td>
                      <td style={{ padding: "6px 8px" }}>{item.averagePL}</td>
                      <td style={{ padding: "6px 8px" }}>{Math.round(Number(item.masteredRate || 0) * 100)}%</td>
                      <td style={{ padding: "6px 8px" }}>{item.learners}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-card" style={{ padding: 12, background: "#fafafa", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>样本学生反馈摘录</div>
            <div style={{ display: "grid", gap: 8 }}>
              {(bktData.latestDeepRun.students || []).slice(0, 12).map((student) => (
                <div key={student.userId} className="subtle-card" style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginBottom: 6 }}>
                    {student.studentLabel} · {student.profile} · P(L) {student.averagePL} · mastered {student.masteredCount}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    最困惑：{student.mostConfused?.join(" / ") || "暂无"}
                    <br />
                    最好用：{student.preferredTool}
                    <br />
                    常见 bug：{student.reportedBug}
                    <br />
                    反馈：{student.confusionReport}
                    <br />
                    正向体验：{student.positiveReport}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="section-card" style={tabPanelStyle("overview")}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>最近学习记录</div>
        <div style={{ display: "grid", gap: 8 }}>
          {data.records.map((record, index) => (
            <div key={`${record.studentId}-${record.lessonId}-${index}`} className="subtle-card" style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>
                {record.studentLabel} · {record.lessonTitle || record.lessonId} · {record.section || record.source}
              </div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                得分：{record.score || 0}% ，评分：{record.rating || 0}，学习时长：{record.studyMinutes || 0} 分钟，互动：{record.interactions || 0}
                <br />
                错误：{record.errors || 0}，作业：{record.homeworkSubmitted ? "已提交" : "未提交"}，更新时间：{record.updatedAt}
                <br />
                提交类型：{Array.isArray(record.submissionTypes) && record.submissionTypes.length ? record.submissionTypes.join(" / ") : "无"}，图片：{record.homeworkImageCount || 0} 张，节奏：{record.homeworkRhythmData ? "已提交" : "无"}，五线谱：{record.homeworkStaffData ? "已提交" : "无"}
                <br />
                AI 初评：{record.aiHomeworkFeedback ? `${String(record.aiHomeworkFeedback).slice(0, 80)}${String(record.aiHomeworkFeedback).length > 80 ? "..." : ""}` : "暂无"}
              </div>
              {(record.homeworkLength || record.homeworkRhythmData || record.homeworkStaffData || record.homeworkPianoData || record.homeworkVoiceTranscript || record.evaluationScores || (Array.isArray(record.homeworkImages) && record.homeworkImages.length > 0)) && (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {record.homeworkText ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>文字说明：</strong>{`${String(record.homeworkText).slice(0, 120)}${String(record.homeworkText).length > 120 ? "..." : ""}`}
                    </div>
                  ) : null}
                  {record.homeworkRhythmData ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>节奏摘要：</strong>{summarizeRhythmSubmission(record.homeworkRhythmData)}
                    </div>
                  ) : null}
                  {record.homeworkStaffData ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>五线谱摘要：</strong>{summarizeStaffSubmission(record.homeworkStaffData)}
                    </div>
                  ) : null}
                  {record.homeworkPianoData ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>钢琴输入：</strong>{summarizePianoSubmission(record.homeworkPianoData)}
                    </div>
                  ) : null}
                  {record.homeworkVoiceTranscript ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>语音转写：</strong>{`${String(record.homeworkVoiceTranscript).slice(0, 120)}${String(record.homeworkVoiceTranscript).length > 120 ? "..." : ""}`}
                    </div>
                  ) : null}
                  {record.evaluationScores ? (
                    <div style={{ fontSize: 11, color: "#111111", lineHeight: 1.8, padding: "8px 10px", borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
                      <strong>课程评价：</strong>{Object.entries(record.evaluationScores).map(([label, value]) => `${label} ${value}`).join(" / ")}
                      {Array.isArray(record.evaluationTags) && record.evaluationTags.length ? <><br /><strong>评价标签：</strong>{record.evaluationTags.join(" / ")}</> : null}
                      {record.evaluationComment ? <><br /><strong>评价评语：</strong>{record.evaluationComment}</> : null}
                    </div>
                  ) : null}
                  {Array.isArray(record.homeworkImages) && record.homeworkImages.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: 8 }}>
                      {record.homeworkImages.slice(0, 4).map((image, imageIndex) => (
                        <img
                          key={`${record.studentId}-${record.lessonId}-${imageIndex}`}
                          src={image.dataUrl}
                          alt={image.name || `作业图片${imageIndex + 1}`}
                          style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(17,17,17,0.08)", background: "#ffffff" }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
