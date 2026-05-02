import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PPT_CHAPTERS } from "./pptLessonData";
import { PBar, Stars } from "./uiBasics";
import { NT, nFreq, playTone, unlockAudioSystem } from "./musicAudio";

const CHAPTERS = PPT_CHAPTERS;
const ALL_LESSONS = CHAPTERS.flatMap((chapter) => chapter.ls);

function AssessmentPage({ scores, ratings }) {
  const done = ALL_LESSONS.filter(l => (scores[l.id] || 0) > 0).length;
  const avg = ALL_LESSONS.length > 0 ? Math.round(ALL_LESSONS.reduce((s, l) => s + (scores[l.id] || 0), 0) / ALL_LESSONS.length) : 0;
  const rated = ALL_LESSONS.filter(l => (ratings[l.id] || 0) > 0);
  const avgR = rated.length > 0 ? (rated.reduce((s, l) => s + ratings[l.id], 0) / rated.length).toFixed(1) : "--";
  const lv = (s) => s >= 80 ? "优秀" : s >= 60 ? "良好" : s >= 30 ? "一般" : s > 0 ? "需加强" : "未开始";

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 14px" }}>综合测评报告</h2>
      <div className="metric-grid" style={{ marginBottom: 20 }}>
        {[{ l: "综合得分", v: `${avg}%`, c: "#534AB7" }, { l: "已完成", v: `${done}/12`, c: "#0F6E56" }, { l: "平均评分", v: avgR, c: "#EF9F27" }, { l: "等级", v: lv(avg), c: "#993556" }].map((m, i) => (
          <div key={i} className="section-card" style={{ padding: "16px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>{m.l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: m.c }}>{m.v}</div>
          </div>
        ))}
      </div>
      {CHAPTERS.map(ch => {
        const ca = Math.round(ch.ls.reduce((s, l) => s + (scores[l.id] || 0), 0) / ch.ls.length);
        return (
          <div key={ch.id} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{ch.t}</div>
            {ch.ls.map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, paddingLeft: 8 }}>
                <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 60, flexShrink: 0 }}>{`第${l.n}课`}</span>
                <div style={{ flex: 1 }}><PBar v={scores[l.id] || 0} max={100} color={ch.c} /></div>
                <span style={{ fontSize: 11, fontWeight: 500, width: 32, textAlign: "right" }}>{scores[l.id] || 0}%</span>
                <Stars value={ratings[l.id] || 0} size={10} />
              </div>
            ))}
          </div>
        );
      })}
      <div className="section-card" style={{ marginTop: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>智能学习建议</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {avg === 0 ? "开始任意课时后，系统会根据你的表现生成个性化建议。"
            : avg < 40 ? "建议每天进行 15-20 分钟短时练习，重点巩固基础概念，并结合 AI 导师查漏补缺。"
            : avg < 70 ? "基础掌握较好，建议重点突破薄弱章节，并在创作与实验模块中实践乐理知识。"
            : "当前表现优秀，建议挑战综合题，并把所学知识迁移到创作与分析任务中。"}
        </div>
      </div>
    </div>
  );
}


function MusicCreatorV2() {
  const COLS = 16;
  const ROWS = 12;
  const scaleNotes = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
  const [grid, setGrid] = useState(() => Array.from({ length: ROWS }, () => Array(COLS).fill(false)));
  const [isPlaying, setIsPlaying] = useState(false);
  const [col, setCol] = useState(-1);
  const [bpm, setBpm] = useState(140);
  const [timbre, setTimbre] = useState("piano");
  const timerRef = useRef(null);

  const noteInfo = scaleNotes.map((step) => ({ name: NT[step % 12], oct: 4 + Math.floor(step / 12) })).reverse();

  const toggle = useCallback(async (r, c) => {
    await unlockAudioSystem();
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      next[r][c] = !next[r][c];
      if (next[r][c]) {
        const info = noteInfo[r];
        playTone(nFreq(info.name, info.oct), 0.25, timbre);
      }
      return next;
    });
  }, [noteInfo, timbre]);

  const playSeq = useCallback(async () => {
    await unlockAudioSystem();
    if (isPlaying) {
      clearInterval(timerRef.current);
      setIsPlaying(false);
      setCol(-1);
      return;
    }
    setIsPlaying(true);
    let currentCol = 0;
    const stepMs = 60000 / bpm / 2;
    timerRef.current = setInterval(() => {
      setCol(currentCol);
      for (let r = 0; r < ROWS; r += 1) {
        if (grid[r][currentCol]) {
          const info = noteInfo[r];
          playTone(nFreq(info.name, info.oct), stepMs / 1000 * 1.5, timbre);
        }
      }
      currentCol = (currentCol + 1) % COLS;
    }, stepMs);
  }, [bpm, grid, isPlaying, noteInfo, timbre]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={playSeq} style={{ padding: "6px 14px", borderRadius: 8, background: isPlaying ? "#b91c1c" : "#111111", color: "#ffffff", border: "none", cursor: "pointer" }}>
            {isPlaying ? "停止" : "播放"}
          </button>
          <button onClick={() => setGrid(Array.from({ length: ROWS }, () => Array(COLS).fill(false)))} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>清空</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>BPM: {bpm}</label>
          <input type="range" min="60" max="200" step="5" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} style={{ width: 80 }} />
          <select value={timbre} onChange={(e) => setTimbre(e.target.value)} style={{ fontSize: 11, padding: "4px 6px", borderRadius: 6, border: "1px solid rgba(17,17,17,0.12)" }}>
            <option value="piano">钢琴</option>
            <option value="sine">正弦波</option>
            <option value="triangle">三角波</option>
            <option value="square">方波</option>
          </select>
        </div>
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <div style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
          {noteInfo.map((info, r) => (
            <div key={`${info.name}${info.oct}-${r}`} style={{ display: "flex", alignItems: "center", gap: 1 }}>
              <div style={{ width: 32, fontSize: 9, color: "var(--color-text-tertiary)", textAlign: "right", paddingRight: 3, flexShrink: 0 }}>{info.name}{info.oct}</div>
              {Array.from({ length: COLS }, (_, c) => (
                <div
                  key={c}
                  onClick={() => toggle(r, c)}
                  style={{
                    width: 26,
                    height: 22,
                    borderRadius: 3,
                    cursor: "pointer",
                    background: grid[r][c] ? (col === c ? "#555555" : "#111111") : col === c ? "rgba(17,17,17,0.12)" : c % 4 === 0 ? "#f3f3f3" : "#ffffff",
                    border: `1px solid ${grid[r][c] ? "#111111" : "rgba(17,17,17,0.08)"}`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Home */
function HomePage({ setPage, scores }) {
  return (
    <div>
      <div style={{ textAlign: "center", padding: "30px 16px 22px" }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: "#534AB7", letterSpacing: 2, marginBottom: 4 }}>AI 驱动 · 自主学习</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>乐理智学平台</h1>
      </div>
      {CHAPTERS.map((ch, ci) => {
        const ca = Math.round(ch.ls.reduce((s, l) => s + (scores[l.id] || 0), 0) / ch.ls.length);
        return (
          <div key={ch.id} style={{ marginBottom: 8, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 7, background: ch.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: ch.c }}>{ci + 1}</div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{ch.t}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: ch.c }}>{ca}%</span>
            </div>
            <PBar v={ca} max={100} color={ch.c} />
            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {ch.ls.map((l) => (
                <button key={l.id} onClick={() => setPage(l.id)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: "0.5px solid var(--color-border-tertiary)", background: (scores[l.id] || 0) > 50 ? ch.bg : "var(--color-background-secondary)", color: (scores[l.id] || 0) > 50 ? ch.c : "var(--color-text-secondary)", cursor: "pointer", fontWeight: 500 }}>
                  第{l.n}课{(scores[l.id] || 0) > 0 ? ` ${scores[l.id]}%` : ""}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* App Shell */
function ModernHomePage({ setPage, scores }) {
  return (
    <div>
      <section className="home-hero">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <div className="motion-chip">
              <span className="motion-dot" />
              <span>智能引导学习</span>
            </div>
            <div className="motion-chip">
              <span className="motion-bars"><span /><span /><span /></span>
              <span>互动音乐工作台</span>
            </div>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 800, margin: "0 0 10px", letterSpacing: "-0.03em" }}>音乐理论智能学习平台</h1>
          <div style={{ maxWidth: 680, fontSize: 14, lineHeight: 1.85, color: "rgba(255,255,255,0.72)" }}>
            每个单元下直接展示课时卡片，点击课时即可进入课前预习、内容呈现、课堂练习与课后作业。
          </div>
        </div>
      </section>

      {CHAPTERS.map((ch, ci) => {
        const ca = Math.round(ch.ls.reduce((s, l) => s + (scores[l.id] || 0), 0) / ch.ls.length);
        return (
          <section key={ch.id} className="chapter-panel">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                  {`第 ${String(ci + 1).padStart(2, "0")} 单元`}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)" }}>{ch.t}</div>
              </div>
              <div style={{ minWidth: 160 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  <span>学习进度</span>
                  <strong style={{ color: "#111" }}>{ca}%</strong>
                </div>
                <PBar v={ca} max={100} color="#171717" />
              </div>
            </div>

            <div className="lesson-grid-modern">
              {ch.ls.map((l) => (
                <button key={l.id} className="lesson-card-modern" onClick={() => setPage(l.id)}>
                  <div className="lesson-card-top">
                    <span className="lesson-no">{`第 ${String(l.n).padStart(2, "0")} 课`}</span>
                    <span className="lesson-status">{(scores[l.id] || 0) > 0 ? `已完成 ${scores[l.id]}%` : "未开始"}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 8, lineHeight: 1.45 }}>
                    {l.t}
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export { AssessmentPage, ModernHomePage };
