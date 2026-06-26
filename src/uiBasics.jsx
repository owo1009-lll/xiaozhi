export function Tag({ children, color = "#f0d68a", bg = "rgba(212,177,94,0.12)" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {children}
    </span>
  );
}

export function PBar({ v = 0, max = 100, color = "var(--gradient-accent)" }) {
  const safeMax = Math.max(1, Number(max) || 100);
  const percent = Math.max(0, Math.min(100, ((Number(v) || 0) / safeMax) * 100));
  return (
    <div
      style={{
        width: "100%",
        height: 8,
        borderRadius: 999,
        background: "rgba(255,255,255,0.1)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${percent}%`,
          height: "100%",
          borderRadius: 999,
          background: color,
          boxShadow: "0 0 12px rgba(212,177,94,0.4)",
          transition: "width 0.25s ease",
        }}
      />
    </div>
  );
}

export function Stars({ value = 0, onChange, size = 16 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange?.(star)}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              margin: 0,
              cursor: onChange ? "pointer" : "default",
              fontSize: size,
              lineHeight: 1,
              color: active ? "#e6c878" : "rgba(255,255,255,0.22)",
            }}
            aria-label={`评分 ${star} 星`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

export function FeedbackBar({ ok, msg, onNext }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        border: `1px solid ${ok ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
        marginTop: 10,
      }}
    >
      <span style={{ fontSize: 12, color: ok ? "#7ee2a8" : "#f6a6a6", fontWeight: 600 }}>
        {ok ? "回答正确：" : "需要修正："}
        {msg}
      </span>
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.06)", color: "var(--color-text-primary)", cursor: "pointer", fontSize: 12 }}
        >
          下一题
        </button>
      ) : null}
    </div>
  );
}

export function LessonCharts({ lessonId }) {
  const lessonsWithCharts = new Set(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12"]);
  if (!lessonsWithCharts.has(lessonId)) return null;

  const barSets = {
    L1: [26, 39, 52, 78, 100],
    L2: [22, 31, 48, 66, 84],
    L3: [18, 30, 45, 63, 82],
    L4: [25, 40, 58, 74, 92],
    L5: [24, 36, 51, 68, 88],
    L6: [28, 41, 57, 73, 90],
    L7: [19, 34, 49, 62, 81],
    L8: [23, 38, 54, 70, 86],
    L9: [20, 37, 55, 72, 91],
    L10: [21, 35, 53, 69, 87],
    L11: [24, 42, 59, 76, 94],
    L12: [30, 45, 60, 80, 100],
  };
  const bars = barSets[lessonId] || [30, 48, 66, 84, 100];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="subtle-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>知识点分布图</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 124 }}>
          {bars.map((value, index) => (
            <div key={`${lessonId}-bar-${index}`} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 96, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                <div style={{ width: "100%", maxWidth: 34, height: `${value}%`, borderRadius: 10, background: "linear-gradient(180deg,#f0d68a,#b8902f)", boxShadow: "0 0 14px rgba(212,177,94,0.3)" }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 6 }}>{`知识点 ${index + 1}`}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="subtle-card" style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>学习重点提示</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          先通过图表定位本课主要知识重点，再查看课前导图，并结合课堂练习完成视觉化巩固。
        </div>
      </div>
    </div>
  );
}

export function WeakPointExplanationCards({ items = [], titleMap = {} }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
      {items.map((item) => (
        <div key={item.knowledgePointId} style={{ padding: 14, borderRadius: 14, background: "linear-gradient(180deg, rgba(34,31,42,0.78), rgba(24,22,30,0.64))", border: "1px solid rgba(212,177,94,0.14)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {titleMap[item.knowledgePointId] || item.knowledgePointId}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 10 }}>
            {item.explanation}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>易错点</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, whiteSpace: "pre-line" }}>
                {item.misunderstandings.map((line) => `• ${line}`).join("\n")}
              </div>
            </div>
            <div style={{ padding: 10, borderRadius: 12, background: "rgba(212,177,94,0.08)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>做题抓手</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.8, whiteSpace: "pre-line" }}>
                {item.practiceGuide.map((line) => `• ${line}`).join("\n")}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
