import { useEffect, useState, lazy, Suspense } from "react";
import { PPT_CHAPTERS } from "./pptLessonData";
import { Tag } from "./uiBasics";
import { LessonView } from "./LessonExperience";
import { AssessmentPage, ModernHomePage } from "./AppPages";
import { unlockAudioSystem } from "./musicAudio";

const LazyTeacherDashboardPage = lazy(() => import("./TeacherDashboardPage.jsx"));

const CHAPTERS = PPT_CHAPTERS;
const ALL_LESSONS = CHAPTERS.flatMap((chapter) => chapter.ls);

export default function App() {
  const [page, setPage] = useState("home");
  const [scores, setScores] = useState({});
  const [ratings, setRatings] = useState({});
  const [sideOpen, setSideOpen] = useState(false);

  const handleSetScore = (id, v) => setScores((prev) => ({ ...prev, [id]: Math.max(prev[id] || 0, v) }));
  const handleSetRating = (id, v) => setRatings((prev) => ({ ...prev, [id]: v }));

  const currentLesson = ALL_LESSONS.find((l) => l.id === page);

  useEffect(() => {
    const unlock = () => {
      unlockAudioSystem();
    };
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("click", unlock, { passive: true });
    return () => {
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("click", unlock);
    };
  }, []);

  return (
    <div className="page-shell" style={{ fontFamily: "var(--font-sans, -apple-system, sans-serif)" }}>
      <div style={{ width: sideOpen ? 280 : 0, overflow: "hidden", transition: "width 0.25s", flexShrink: 0 }}>
        <div className="sidebar-shell">
          <div onClick={() => { setPage("home"); setSideOpen(false); }} style={{ padding: "10px 12px", borderRadius: 14, cursor: "pointer", fontSize: 13, fontWeight: 700, marginBottom: 8, color: page === "home" ? "#111111" : "var(--color-text-primary)", background: page === "home" ? "rgba(17,17,17,0.08)" : "transparent" }}>
            首页
          </div>
          {CHAPTERS.map((ch) => (
            <div key={ch.id} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-tertiary)", padding: "4px 12px", letterSpacing: "0.08em" }}>{ch.t}</div>
              {ch.ls.map((l) => (
                <div
                  key={l.id}
                  onClick={() => { setPage(l.id); setSideOpen(false); }}
                  style={{ padding: "9px 12px", borderRadius: 14, cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", background: page === l.id ? "rgba(17,17,17,0.08)" : "transparent", color: page === l.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", marginBottom: 2 }}
                >
                  <span>{`第${l.n}课 ${l.t.length > 6 ? `${l.t.slice(0, 6)}...` : l.t}`}</span>
                  {(scores[l.id] || 0) > 0 && <span style={{ fontSize: 9, color: ch.c, fontWeight: 600 }}>{scores[l.id]}%</span>}
                </div>
              ))}
            </div>
          ))}
          <div onClick={() => { setPage("assessment"); setSideOpen(false); }} style={{ padding: "10px 12px", borderRadius: 14, cursor: "pointer", fontSize: 12, fontWeight: 600, marginTop: 8, color: page === "assessment" ? "#111111" : "var(--color-text-secondary)", background: page === "assessment" ? "rgba(17,17,17,0.08)" : "transparent" }}>
            综合测评
          </div>
          <div onClick={() => { setPage("teacher"); setSideOpen(false); }} style={{ padding: "10px 12px", borderRadius: 14, cursor: "pointer", fontSize: 12, fontWeight: 600, marginTop: 6, color: page === "teacher" ? "#111111" : "var(--color-text-secondary)", background: page === "teacher" ? "rgba(17,17,17,0.08)" : "transparent" }}>
            教师后台
          </div>
        </div>
      </div>

      <div className="main-shell">
        <header className="topbar-shell">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setSideOpen(!sideOpen)} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 14 }}>菜单</button>
            <div style={{ width: 30, height: 30, borderRadius: 10, background: "linear-gradient(135deg,#111,#434343)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>M</div>
            <span style={{ fontSize: 15, fontWeight: 700 }}>乐理智学</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {currentLesson && <Tag color="#3C3489" bg="#EEEDFE">{`第${currentLesson.n}课`}</Tag>}
            {page === "teacher" && <Tag color="#111111" bg="#F3F4F6">教师后台</Tag>}
            <button onClick={() => setPage("assessment")} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>测评</button>
            <button onClick={() => setPage("teacher")} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>教师后台</button>
            <button onClick={() => setPage("home")} style={{ padding: "6px 10px", borderRadius: 12, border: "1px solid var(--color-border-tertiary)", background: "transparent", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>首页</button>
          </div>
        </header>

        <main className="content-shell">
          {page === "home" && <ModernHomePage setPage={setPage} scores={scores} />}
          {page === "assessment" && <AssessmentPage scores={scores} ratings={ratings} />}
          {page === "teacher" && (
            <Suspense fallback={<div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>教师后台加载中...</div>}>
              <LazyTeacherDashboardPage />
            </Suspense>
          )}
          {currentLesson && <LessonView lesson={currentLesson} ratings={ratings} setRating={handleSetRating} scores={scores} setScore={handleSetScore} />}
        </main>

        <footer style={{ textAlign: "center", padding: "16px 14px", borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 0, color: "var(--color-text-tertiary)", background: "rgba(255,255,255,0.56)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", marginTop: 0 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>贡献者：Guan Xingzhi</span>
            <img src="/images/ucsi-logo-user.jpg" alt="UCSI University" style={{ height: 42, width: "auto", objectFit: "contain", display: "block" }} />
          </div>
        </footer>
      </div>
    </div>
  );
}

