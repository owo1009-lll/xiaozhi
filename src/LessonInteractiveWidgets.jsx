import { useCallback, useState } from "react";
import { Tag } from "./uiBasics";
import { playTone, unlockAudioSystem } from "./musicAudio";

function InteractivePitchFrequencyWidgetCn() {
  const noteItems = [
    { label: "C3", freq: 130.81, tip: "频率较低，听感较沉稳。" },
    { label: "G3", freq: 196.0, tip: "频率上升，音高更明亮。" },
    { label: "C4", freq: 261.63, tip: "中央 C，常作为参考音。" },
    { label: "G4", freq: 392.0, tip: "高音区更明显，频率继续升高。" },
    { label: "C5", freq: 523.25, tip: "与 C4 构成八度，频率接近翻倍。" },
  ];
  const [activeIndex, setActiveIndex] = useState(2);

  const playInteractiveNote = useCallback(async (index) => {
    const item = noteItems[index];
    if (!item) return;
    setActiveIndex(index);
    await unlockAudioSystem();
    playTone(item.freq, 0.55, "piano", 0.28);
  }, []);

  const activeNote = noteItems[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音高与频率关系互动钢琴</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        点击不同音键试听，并观察频率柱状变化。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
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
                }}
              >
                <div style={{ width: "100%", height, borderRadius: 10, background: active ? "#111111" : "#D1D5DB" }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", marginTop: 10 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>{`${item.freq} Hz`}</div>
              </button>
            );
          })}
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>当前选中音</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{activeNote.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`频率：${activeNote.freq} Hz`}
            <br />
            规律：频率越高，听感中的音高越高。
            <br />
            说明：{activeNote.tip}
          </div>
        </div>
      </div>
    </div>
  );
}

function InteractiveVolumeAmplitudeWidgetCn() {
  const levels = [
    { label: "pp", amp: 0.18, volume: 0.1, desc: "很弱，振幅最小。" },
    { label: "p", amp: 0.3, volume: 0.16, desc: "较弱，保持柔和。" },
    { label: "mp", amp: 0.46, volume: 0.22, desc: "中弱，振幅抬升。" },
    { label: "mf", amp: 0.64, volume: 0.3, desc: "中强，常规演奏力度。" },
    { label: "f", amp: 0.82, volume: 0.4, desc: "较强，听感更饱满。" },
  ];
  const [activeIndex, setActiveIndex] = useState(2);

  const playLevel = useCallback(async (index) => {
    const item = levels[index];
    if (!item) return;
    setActiveIndex(index);
    await unlockAudioSystem();
    playTone(261.63, item.volume, "piano", 0.38);
  }, []);

  const activeLevel = levels[activeIndex];
  const wavePoints = Array.from({ length: 25 }, (_, index) => {
    const x = 12 + index * 11;
    const y = 62 + Math.sin(index / 2) * activeLevel.amp * 28;
    return `${x},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音量与振幅互动示意</div>
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 14 }}>
        <div className="subtle-card" style={{ padding: 14 }}>
          <svg viewBox="0 0 280 130" style={{ width: "100%", height: 130 }}>
            <line x1="10" y1="62" x2="270" y2="62" stroke="#d1d5db" strokeWidth="1.5" strokeDasharray="4 4" />
            <polyline points={wavePoints} fill="none" stroke="#111111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 8 }}>
            {levels.map((level, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={level.label}
                  onClick={() => playLevel(index)}
                  style={{
                    padding: "8px 0",
                    borderRadius: 12,
                    border: active ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                    background: active ? "#111111" : "#ffffff",
                    color: active ? "#ffffff" : "#111111",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {level.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>当前力度</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111111", marginBottom: 6 }}>{activeLevel.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`振幅系数：${activeLevel.amp.toFixed(2)}`}
            <br />
            {`试听音量：${activeLevel.volume.toFixed(2)}`}
            <br />
            说明：{activeLevel.desc}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrebleClefDrillWidgetCn() {
  const targets = [
    { id: "g4", label: "G4", hint: "第二线参照点", lineIndex: 1, isLedger: false, x: 120, y: 132, answer: "第二线" },
    { id: "c4", label: "C4", hint: "中央 C", lineIndex: -1, isLedger: true, x: 190, y: 182, answer: "下加一线" },
    { id: "b4", label: "B4", hint: "第三线", lineIndex: 2, isLedger: false, x: 260, y: 112, answer: "第三线" },
    { id: "a5", label: "A5", hint: "第二间以上区域", lineIndex: 5, isLedger: false, x: 330, y: 72, answer: "第二间" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const active = targets[activeIndex];
  const options = ["下加一线", "第一线", "第二线", "第三线", "第二间"];

  const lineY = [152, 132, 112, 92, 72];
  const ledgerLines = [
    { x1: 170, x2: 210, y: 182 },
  ];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>高音谱号定位训练</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        先固定第二线 G4，再练中央 C 与加线音。点击右侧不同目标音，判断它对应的线或间位置。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
        <div className="subtle-card" style={{ padding: 14 }}>
          <svg viewBox="0 0 420 230" style={{ width: "100%", height: 220 }}>
            {lineY.map((y) => (
              <line key={`staff-${y}`} x1="50" y1={y} x2="380" y2={y} stroke="#111111" strokeWidth="2" opacity="0.78" />
            ))}
            {ledgerLines.map((line, index) => (
              <line key={`ledger-${index}`} x1={line.x1} y1={line.y} x2={line.x2} y2={line.y} stroke="#111111" strokeWidth="2" />
            ))}
            <text x="72" y="120" fontSize="72" fontFamily="serif" fill="#111111">𝄞</text>
            {targets.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <g key={item.id} onClick={() => { setActiveIndex(index); setSelectedAnswer(""); }} style={{ cursor: "pointer" }}>
                  <ellipse cx={item.x} cy={item.y} rx="16" ry="11" fill={isActive ? "#111111" : "#ffffff"} stroke="#111111" strokeWidth="2" />
                  <line x1={item.x + 14} y1={item.y} x2={item.x + 14} y2={item.y - 52} stroke="#111111" strokeWidth="2.5" />
                  {item.id === "g4" ? (
                    <circle cx={item.x} cy={item.y} r="24" fill="none" stroke="rgba(83,74,183,0.32)" strokeWidth="3" />
                  ) : null}
                </g>
              );
            })}
            <text x="102" y="130" fontSize="12" fill="#534AB7" fontWeight="700">第二线 = G4</text>
            <text x="165" y="206" fontSize="12" fill="#111111">中央 C = 下加一线</text>
          </svg>
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>当前目标音</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#111111", marginBottom: 4 }}>{active.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
            提示：{active.hint}
            <br />
            先找最近参照点，再判断它在线上还是间里。
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {options.map((option) => {
              const reveal = Boolean(selectedAnswer);
              const isCorrect = option === active.answer;
              const isSelected = option === selectedAnswer;
              return (
                <button
                  key={`${active.id}-${option}`}
                  type="button"
                  onClick={() => !selectedAnswer && setSelectedAnswer(option)}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(17,17,17,0.1)",
                    background: reveal ? (isCorrect ? "#111111" : isSelected ? "#FDECEC" : "#ffffff") : "#ffffff",
                    color: reveal && isCorrect ? "#ffffff" : "#111111",
                    cursor: selectedAnswer ? "default" : "pointer",
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {selectedAnswer ? (
            <div style={{ marginTop: 10, fontSize: 11, color: selectedAnswer === active.answer ? "#166534" : "#b91c1c", lineHeight: 1.8 }}>
              {selectedAnswer === active.answer ? "判断正确。" : `判断不正确，正确答案是 ${active.answer}。`}
              <br />
              {active.id === "g4" ? "先记住第二线 G4，再向上或向下推其他音。" : active.id === "c4" ? "中央 C 在高音谱表中通常写在下加一线上。" : "识读时先分清在线上还是间里，再从最近参照点外推。"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BassClefDrillWidgetCn() {
  const targets = [
    { id: "f3", label: "F3", hint: "第四线参照点", x: 130, y: 122, answer: "第四线" },
    { id: "c4", label: "C4", hint: "中央 C", x: 205, y: 62, answer: "上加一线" },
    { id: "d3", label: "D3", hint: "第三线", x: 280, y: 142, answer: "第三线" },
    { id: "a3", label: "A3", hint: "第五线", x: 345, y: 102, answer: "第五线" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const active = targets[activeIndex];
  const options = ["第三线", "第四线", "第五线", "上加一线", "第二间"];
  const lineY = [182, 162, 142, 122, 102];
  const ledgerLines = [{ x1: 184, x2: 226, y: 62 }];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>低音谱号定位训练</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        先固定第四线 F3，再用中央 C 的上加一线作为第二参照点。点击目标音，判断它对应的线位。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
        <div className="subtle-card" style={{ padding: 14 }}>
          <svg viewBox="0 0 420 250" style={{ width: "100%", height: 236 }}>
            {lineY.map((y) => (
              <line key={`bass-staff-${y}`} x1="50" y1={y} x2="380" y2={y} stroke="#111111" strokeWidth="2" opacity="0.78" />
            ))}
            {ledgerLines.map((line, index) => (
              <line key={`bass-ledger-${index}`} x1={line.x1} y1={line.y} x2={line.x2} y2={line.y} stroke="#111111" strokeWidth="2" />
            ))}
            <text x="70" y="155" fontSize="72" fontFamily="serif" fill="#111111">𝄢</text>
            {targets.map((item, index) => {
              const isActive = index === activeIndex;
              return (
                <g key={item.id} onClick={() => { setActiveIndex(index); setSelectedAnswer(""); }} style={{ cursor: "pointer" }}>
                  <ellipse cx={item.x} cy={item.y} rx="16" ry="11" fill={isActive ? "#111111" : "#ffffff"} stroke="#111111" strokeWidth="2" />
                  <line x1={item.x + 14} y1={item.y} x2={item.x + 14} y2={item.y - 52} stroke="#111111" strokeWidth="2.5" />
                  {item.id === "f3" ? (
                    <circle cx={item.x} cy={item.y} r="24" fill="none" stroke="rgba(83,74,183,0.32)" strokeWidth="3" />
                  ) : null}
                </g>
              );
            })}
            <text x="110" y="118" fontSize="12" fill="#534AB7" fontWeight="700">第四线 = F3</text>
            <text x="172" y="42" fontSize="12" fill="#111111">中央 C = 上加一线</text>
          </svg>
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>当前目标音</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#111111", marginBottom: 4 }}>{active.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
            提示：{active.hint}
            <br />
            先确认低音谱号，再从第四线 F3 或中央 C 外推。
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {options.map((option) => {
              const reveal = Boolean(selectedAnswer);
              const isCorrect = option === active.answer;
              const isSelected = option === selectedAnswer;
              return (
                <button
                  key={`${active.id}-${option}`}
                  type="button"
                  onClick={() => !selectedAnswer && setSelectedAnswer(option)}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(17,17,17,0.1)",
                    background: reveal ? (isCorrect ? "#111111" : isSelected ? "#FDECEC" : "#ffffff") : "#ffffff",
                    color: reveal && isCorrect ? "#ffffff" : "#111111",
                    cursor: selectedAnswer ? "default" : "pointer",
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
          {selectedAnswer ? (
            <div style={{ marginTop: 10, fontSize: 11, color: selectedAnswer === active.answer ? "#166534" : "#b91c1c", lineHeight: 1.8 }}>
              {selectedAnswer === active.answer ? "判断正确。" : `判断不正确，正确答案是 ${active.answer}。`}
              <br />
              {active.id === "f3" ? "先记住第四线 F3，这是低音谱号最稳定的参照点。" : active.id === "c4" ? "中央 C 在低音谱表中通常写在上加一线上。" : "识读时先分清线与间，再从最近参照点外推。"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ExpressionVsTempoCardCn() {
  const rows = [
    { label: "Allegro", type: "速度术语", note: "强调速度较快" },
    { label: "Andante", type: "速度术语", note: "强调行进般的中速" },
    { label: "Dolce", type: "表情术语", note: "强调甜美柔和的声音" },
    { label: "Cantabile", type: "表情术语", note: "强调如歌的演奏状态" },
  ];
  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>速度术语与表情术语对照</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        先排除速度，再判断情绪风格。不要把“如歌地、甜美地”误判为快慢变化。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "grid", gridTemplateColumns: "120px 110px 1fr", gap: 10, alignItems: "center", padding: 10, borderRadius: 12, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{row.label}</div>
            <Tag color={row.type === "表情术语" ? "#534AB7" : "#111111"} bg={row.type === "表情术语" ? "rgba(83,74,183,0.08)" : "#F5F5F5"}>{row.type}</Tag>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>{row.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DotsAndTiesGuideWidgetCn() {
  const examples = [
    {
      title: "附点四分音符",
      badge: "单个音符延长",
      detail: "一拍 + 半拍 = 一拍半。只作用于一个音符本身的时值。",
    },
    {
      title: "连音线",
      badge: "同音高相连",
      detail: "连接两个同音高音符，把时值合成一个更长的音。",
    },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = examples[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>附点与连音线对照</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        先判断“是不是两个同音高音符连接”，再判断“是不是单个音符自身延长”。这样可以最快区分附点和连音线。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {examples.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 14,
                borderRadius: 14,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{item.title}</div>
                <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 999, background: activeCard ? "rgba(255,255,255,0.16)" : "rgba(17,17,17,0.06)", color: activeCard ? "#ffffff" : "#111111" }}>
                  {item.badge}
                </span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.detail}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {activeIndex === 0
            ? "附点题先算原时值，再加一半；如果题目里没有第二个同音高音符，就优先考虑附点。"
            : "连音线题先看两端音高是否相同；跨拍、跨小节时更常见拆分后用连音线保持节拍结构清晰。"}
        </div>
      </div>
    </div>
  );
}

function NoteValueHierarchyWidgetCn() {
  const rows = [
    { label: "全音符 / 二分 / 四分", note: "先抓倍数关系：全音符通常是四分音符的 4 倍，二分音符是 2 倍。" },
    { label: "四分 / 八分 / 十六分", note: "向下每一层减半：四分一拍，八分半拍，十六分再减半。" },
    { label: "做题抓手", note: "先找题目给的基准拍值，再按乘 2 / 除 2 往上往下推，不要死记每个名字。" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音符时值体系抓手</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        音符时值题先抓“每往下一层减半”的体系关系，再做具体换算。先找基准拍值，比死背所有时值表更稳。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 12,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.note}
        </div>
      </div>
    </div>
  );
}

function OrnamentComparisonWidgetCn() {
  const rows = [
    {
      label: "回音",
      badge: "四音装饰型",
      note: "先还原围绕主音展开的顺序，再判断是正回音还是反向回音。",
    },
    {
      label: "前倚音",
      badge: "主音前装饰",
      note: "先出现小音符，再落到主音；判断它是否占用了主音的一部分时值。",
    },
    {
      label: "后倚音",
      badge: "短促带过",
      note: "常见为符干上带斜线的小音符，速度快，更多是短暂装饰而不是完整占拍。",
    },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>回音与倚音对照</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        先判断题目考的是“演奏顺序”，还是“主音时值是否被占用”。回音更偏固定四音顺序，倚音更偏主音前的装饰与解决。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 14,
                borderRadius: 14,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                <span style={{ fontSize: 10, padding: "4px 8px", borderRadius: 999, background: activeCard ? "rgba(255,255,255,0.16)" : "rgba(17,17,17,0.06)", color: activeCard ? "#ffffff" : "#111111" }}>
                  {item.badge}
                </span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {activeIndex === 0
            ? "回音题先把音序写成“围绕主音的展开”，再判断方向；不要只背中文名称。"
            : activeIndex === 1
              ? "前倚音题先看小音符与主音的连接关系，再判断它是否占了主音的一部分时值。"
              : "后倚音多是短而快的带过装饰，先排除“完整占拍”的长前倚音思路。"}
        </div>
      </div>
    </div>
  );
}

function TrillVsMordentWidgetCn() {
  const rows = [
    { label: "颤音", note: "主音与邻音持续快速交替，强调持续震荡的听感。" },
    { label: "上波音", note: "围绕主音向上邻音做短小装饰性往返，通常不如颤音持续。" },
    { label: "下波音", note: "围绕主音向下邻音做短小装饰性往返，先向下再回主音。" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>颤音与波音对照</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        先判断是“持续快速交替”，还是“短装饰回转”。颤音强调持续震荡，波音更像短促的上/下方回转装饰。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 14,
                borderRadius: 14,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.note}
        </div>
      </div>
    </div>
  );
}

function CrossBarTieGuideWidgetCn() {
  const rows = [
    { label: "先看是否跨小节", note: "如果长音越过了小节线，就要优先考虑拆写，而不是硬写成长附点。" },
    { label: "再看是否同音高", note: "只有同音高拆成两段，才应该用连音线把时值连接起来。" },
    { label: "最后按小节分配拍值", note: "先保证当前小节拍值完整，再把剩余时值写到下一个小节。" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>跨小节连音线抓手</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        跨小节题先判断“有没有越过小节边界”，再判断“是不是同音高需要拆成两段”。真正的重点是保留节拍结构，而不是只会说“时值相加”。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 12,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.note}
        </div>
      </div>
    </div>
  );
}

function ArticulationContrastWidgetCn() {
  const rows = [
    { label: "连奏 Legato", focus: "音与音连贯连接", trap: "不要和“连音线 tie”混淆，连奏更关注演奏方式而非同音高时值相加。" },
    { label: "断奏 Staccato", focus: "音头清楚、时值缩短", trap: "不要只看到圆点就等同于弱奏，它强调短促而不是弱。" },
    { label: "保持音 Tenuto", focus: "音值尽量保持完整", trap: "不要把短横线误判成断奏；tenuto 更接近“压住、撑满”音值。" },
    { label: "重音 Accent", focus: "起音突出、重点强调", trap: "不要把 accent 一律当成 sfz；accent 更偏单次强调，不一定是突强。"},
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>奏法记号对照</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        先判断声音是“连”“断”“撑住”还是“强调起音”，再匹配具体奏法记号。不要只背中文名，不然容易把连音线、断奏和保持音混为一类。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 12,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                关键听感：{item.focus}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前易错提醒</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.trap}
        </div>
      </div>
    </div>
  );
}

function SyncopationPatternWidgetCn() {
  const rows = [
    { label: "弱拍延长到强拍", note: "先在弱拍起音，再用连线或时值延长压到后面的强拍。" },
    { label: "休止后强拍进入", note: "前面留空，后面进入的强拍音会造成切分的听感张力。" },
    { label: "连续切分型", note: "不是单个节奏点，而是一连串重音感被错位的节奏组织。" },
  ];
  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>经典切分型识别抓手</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        判断经典切分型时，先看重音感是不是被“错位”了，而不是只看音符长短。重点盯弱拍起音、跨拍延长和休止后的进入。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item) => (
          <div key={item.label} className="subtle-card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemperamentEnharmonicWidgetCn() {
  const rows = [
    { label: "等音", note: "写法不同、实际音高相同。例如 C# 与 Db 在平均律中听起来相同。" },
    { label: "律制", note: "说明音高体系如何划分，不同律制下同名音和变化音的细微音高关系可能不同。" },
    { label: "做题抓手", note: "先看题目考的是“书写名称”还是“实际音高”；前者偏等音写法，后者偏律制理解。" },
  ];
  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>律制与等音对照</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        不要把“等音”理解成单纯两个名字相似。它的关键是：平均律里听起来相同，但书写与理论来源不同；题目一旦提到律制，就要想到“为什么会等音”。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item) => (
          <div key={item.label} className="subtle-card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{item.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DynamicsScaleWidgetCn() {
  const rows = [
    { label: "固定力度", note: "p / mp / mf / f 这类题，先判断是弱、中弱、中强还是强，不要误判成变化过程。" },
    { label: "渐强渐弱", note: "< / >、cresc. / dim. 更强调一段时间内的变化，而不是单个点的强弱。" },
    { label: "单次强调", note: "sf / sfz / fp 先看是不是瞬间突出，尤其 fp 不是一直强，而是先强后弱。" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>力度记号分类抓手</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        力度题先分三类：固定层级、渐变过程、单次强调。只要先分对类型，再选具体记号，错误率会明显下降。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 12,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.note}
        </div>
      </div>
    </div>
  );
}

function RepeatPathGuideWidgetCn() {
  const rows = [
    { label: "基本反复", note: "先找出 𝄆 和 𝄇 包围的区域，再从结尾回到起点重走一次。" },
    { label: "第一/第二结尾", note: "第一次走 1. 结尾，第二次反复后跳过 1. 改走 2. 结尾。" },
    { label: "百分号与 bis/ter", note: "百分号常表示重复前一小节，bis/ter 则提示重复次数。" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>反复记号路径推导</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        反复题先推演“演奏路径”，不要只背术语。你要先知道从哪开始、回到哪、第二次又该往哪条结尾走。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 12,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.note}
        </div>
      </div>
    </div>
  );
}

function DcDsCodaGuideWidgetCn() {
  const rows = [
    { label: "D.C.", note: "先回到开头，再根据后续 al Fine / al Coda 决定怎么结束。" },
    { label: "D.S.", note: "不是回到开头，而是回到 𝄋 记号，再继续执行后面的路径。" },
    { label: "Coda / Fine", note: "Fine 是结束点，Coda 是尾声入口；见到 al Coda 时要先找 To Coda。" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>D.C. / D.S. / Coda / Fine 路径抓手</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        这类题先推演演奏路径，不要只背术语中文。先判断“回到哪里”，再判断“从哪里继续”，最后判断“在哪里结束或进入尾声”。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 12,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.note}
        </div>
      </div>
    </div>
  );
}

function MeterAccentGuideWidgetCn() {
  const rows = [
    { label: "3/4", note: "三拍子，通常第一拍强，后两拍弱。先认拍数，再看重音。" },
    { label: "4/4", note: "常见规律是 强、弱、次强、弱。第三拍经常被忽略，是典型易错点。" },
    { label: "6/8", note: "不是六个平铺小拍，而是两个大拍，每个大拍再分成三个八分音。" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>拍号与强弱规律抓手</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        拍号题先看“每小节几拍”，再看“每拍单位是什么”，最后分析强弱分布。不要把拍号和速度混在一起。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 14,
                borderRadius: 14,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.note}
        </div>
      </div>
    </div>
  );
}

function SyncopationTypeGuideWidgetCn() {
  const rows = [
    { label: "连音线切分", note: "弱拍起音并延长到后面强拍，重心被“借走”到不该强的地方。" },
    { label: "休止强拍型", note: "强拍位置空出来，后面的音反而承担重心，形成切分感。" },
    { label: "弱位重音型", note: "弱位被强调，听感上重音错位，不再服从原来的强弱格局。" },
  ];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex];

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>切分三种形式抓手</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        不要先看音符外形，先看原本强拍被谁打破了。只要抓住“重音错位”，再去判断它是延长型、休止型还是弱位强调型。
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item, index) => {
          const activeCard = index === activeIndex;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 12,
                border: activeCard ? "1px solid #111111" : "1px solid rgba(17,17,17,0.08)",
                background: activeCard ? "#111111" : "#ffffff",
                color: activeCard ? "#ffffff" : "#111111",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: activeCard ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {active.note}
        </div>
      </div>
    </div>
  );
}

export {
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
};
