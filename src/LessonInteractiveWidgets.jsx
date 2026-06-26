import { useCallback, useState } from "react";
import { Tag } from "./uiBasics";
import { playTone, unlockAudioSystem } from "./musicAudio";

function SectionWidget({ title, intro, rows = [], accent = "#111111" }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = rows[activeIndex] || rows[0] || {};

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        {intro}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((item, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={`${title}-${item.label}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              style={{
                textAlign: "left",
                padding: 12,
                borderRadius: 12,
                border: selected ? `1px solid ${accent}` : "1px solid rgba(212,177,94,0.14)",
                background: selected ? accent : "rgba(38,34,46,0.85)",
                color: selected ? "#ffffff" : "var(--color-text-primary)",
                cursor: "pointer",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 12, lineHeight: 1.8, color: selected ? "rgba(255,255,255,0.82)" : "var(--color-text-secondary)" }}>
                {item.note}
              </div>
            </button>
          );
        })}
      </div>
      {active.note ? (
        <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前抓手</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{active.note}</div>
        </div>
      ) : null}
    </div>
  );
}

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

  const active = noteItems[activeIndex];
  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音高与频率互动钢琴</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        点击不同音键试听，并观察频率柱状变化。
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 146 }}>
          {noteItems.map((item, index) => {
            const height = Math.max(36, Math.round(item.freq / 4));
            const selected = index === activeIndex;
            return (
              <button
                key={item.label}
                onClick={() => playInteractiveNote(index)}
                style={{
                  flex: 1,
                  height: 140,
                  borderRadius: 14,
                  border: selected ? "1px solid #e6c878" : "1px solid rgba(212,177,94,0.14)",
                  background: "rgba(38,34,46,0.85)",
                  cursor: "pointer",
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  alignItems: "center",
                }}
              >
                <div style={{ width: "100%", height, borderRadius: 10, background: selected ? "#111111" : "#D1D5DB", transition: "height 0.2s ease" }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-primary)", marginTop: 10 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>{`${item.freq} Hz`}</div>
              </button>
            );
          })}
        </div>
        <div className="subtle-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>当前选中音</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>{active.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`频率：${active.freq} Hz`}
            <br />
            {active.tip}
          </div>
        </div>
      </div>
    </div>
  );
}

function InteractiveVolumeAmplitudeWidgetCn() {
  const levels = [
    { label: "pp", amp: 0.18, volume: 0.1, note: "很弱，振幅最小。" },
    { label: "p", amp: 0.3, volume: 0.16, note: "较弱，保持柔和。" },
    { label: "mp", amp: 0.46, volume: 0.22, note: "中弱，振幅抬升。" },
    { label: "mf", amp: 0.64, volume: 0.3, note: "中强，常规演奏力度。" },
    { label: "f", amp: 0.82, volume: 0.4, note: "较强，听感更饱满。" },
  ];
  const [activeIndex, setActiveIndex] = useState(2);

  const playLevel = useCallback(async (index) => {
    const level = levels[index];
    setActiveIndex(index);
    await unlockAudioSystem();
    playTone(261.63, 0.55, "piano", level.volume);
  }, []);

  const active = levels[activeIndex];
  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>音量与振幅</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        比较不同力度层级，观察音量越强时振幅越大的关系。
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", minHeight: 118 }}>
        {levels.map((level, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={level.label}
              onClick={() => playLevel(index)}
              style={{
                flex: 1,
                height: 104,
                borderRadius: 12,
                border: selected ? "1px solid #e6c878" : "1px solid rgba(212,177,94,0.14)",
                background: "rgba(38,34,46,0.85)",
                cursor: "pointer",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <div style={{ width: "100%", height: `${Math.round(level.amp * 92)}px`, borderRadius: 8, background: selected ? "#111111" : "#D1D5DB" }} />
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8 }}>{level.label}</div>
            </button>
          );
        })}
      </div>
      <div className="subtle-card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前力度</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {`${active.label}：振幅 ${active.amp.toFixed(2)}，播放音量 ${active.volume.toFixed(2)}。${active.note}`}
        </div>
      </div>
    </div>
  );
}

function StaffDrillWidget({ title, intro, targets, options, referenceText }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const active = targets[activeIndex];

  const pickTarget = (index) => {
    setActiveIndex(index);
    setSelectedAnswer("");
  };

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>{intro}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 0.95fr", gap: 14 }}>
        <div className="subtle-card" style={{ padding: 14 }}>
          <svg viewBox="0 0 420 230" style={{ width: "100%", display: "block" }}>
            {[0, 1, 2, 3, 4].map((line) => {
              const y = 58 + line * 22;
              return <line key={line} x1="42" y1={y} x2="372" y2={y} stroke="rgba(244,239,227,0.6)" strokeWidth="1.2" />;
            })}
            <text x="52" y="205" fontSize="12" fill="rgba(244,239,227,0.5)">{referenceText}</text>
            {targets.map((target, index) => (
              <g key={target.id} onClick={() => pickTarget(index)} style={{ cursor: "pointer" }}>
                <ellipse cx={target.x} cy={target.y} rx="12" ry="8" fill={index === activeIndex ? "#f0d68a" : "rgba(38,34,46,0.85)"} stroke="rgba(244,239,227,0.7)" strokeWidth="1.4" transform={`rotate(-12 ${target.x} ${target.y})`} />
                <text x={target.x - 12} y={target.y - 18} fontSize="12" fill="#f4efe3">{target.label}</text>
              </g>
            ))}
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>当前目标：{active.label}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSelectedAnswer(option)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: selectedAnswer === option ? "1px solid #e6c878" : "1px solid rgba(255,255,255,0.12)",
                  background: selectedAnswer === option ? "var(--gradient-accent)" : "rgba(255,255,255,0.06)",
                  color: selectedAnswer === option ? "#1a1206" : "var(--color-text-primary)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {option}
              </button>
            ))}
          </div>
          {selectedAnswer ? (
            <div style={{ marginTop: 10, fontSize: 12, color: selectedAnswer === active.answer ? "#166534" : "#b91c1c", lineHeight: 1.8 }}>
              {selectedAnswer === active.answer ? "回答正确。" : `回答错误，答案是 ${active.answer}。`}
              <br />
              {active.hint}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TrebleClefDrillWidgetCn() {
  return (
    <StaffDrillWidget
      title="高音谱号位置练习"
      intro="先以第二线 G4 为锚点，再定位中央 C 和附近加线音。"
      referenceText="第二线 = G4；中央 C = 下加一线"
      targets={[
        { id: "g4", label: "G4", x: 120, y: 124, answer: "第二线", hint: "先记住 G4，再按级进上下数。" },
        { id: "c4", label: "C4", x: 190, y: 182, answer: "下加一线", hint: "中央 C 位于高音谱表下方。" },
        { id: "b4", label: "B4", x: 260, y: 102, answer: "第三线", hint: "从 G4 向上按级进数。" },
        { id: "a5", label: "A5", x: 330, y: 72, answer: "上方第二间", hint: "先判断音符在线上还是间内。" },
      ]}
      options={["下加一线", "第一线", "第二线", "第三线", "上方第二间"]}
    />
  );
}

function BassClefDrillWidgetCn() {
  return (
    <StaffDrillWidget
      title="低音谱号位置练习"
      intro="先以第四线 F3 为锚点，再把中央 C 作为上加线参考。"
      referenceText="第四线 = F3；中央 C = 上加一线"
      targets={[
        { id: "f3", label: "F3", x: 130, y: 124, answer: "第四线", hint: "低音谱号两个点夹住 F 线。" },
        { id: "c4", label: "C4", x: 205, y: 58, answer: "上加一线", hint: "中央 C 位于低音谱表上方。" },
        { id: "d3", label: "D3", x: 280, y: 146, answer: "第三线", hint: "围绕 F3 锚点上下数。" },
        { id: "a3", label: "A3", x: 345, y: 102, answer: "第五线", hint: "命名前先确认在线上还是间内。" },
      ]}
      options={["第三线", "第四线", "第五线", "上加一线", "第二间"]}
    />
  );
}

function ExpressionVsTempoCardCn() {
  return (
    <SectionWidget
      title="速度术语与表情术语"
      intro="先判断术语改变的是速度还是音乐性格。表情术语描述风格与情绪，不直接等于拍速。"
      rows={[
        { label: "Allegro", note: "速度术语，意为快速而活泼。" },
        { label: "Andante", note: "中速，如行走般的速度。" },
        { label: "Dolce", note: "表情术语，意为甜美、柔和。" },
        { label: "Cantabile", note: "表情术语，意为歌唱性。" },
      ]}
    />
  );
}

function DotsAndTiesGuideWidgetCn() {
  return (
    <SectionWidget
      title="附点与连音线"
      intro="先判断是单个音被延长，还是两个同音高音符被连接。"
      rows={[
        { label: "附点四分音符", note: "附点增加原时值的一半：1 拍加 0.5 拍，共 1.5 拍。" },
        { label: "连音线", note: "连音线连接同音高音符，把时值合并成一个持续音。" },
      ]}
    />
  );
}

function NoteValueHierarchyWidgetCn() {
  return (
    <SectionWidget
      title="音符时值层级"
      intro="处理时值题时，抓住音符之间二分递减的关系会更清楚。"
      rows={[
        { label: "全音符 / 二分音符 / 四分音符", note: "一个全音符通常等于四个四分音符；一个二分音符等于两个四分音符。" },
        { label: "四分 / 八分 / 十六分", note: "每往下一级，时值减半。" },
        { label: "做题抓手", note: "先找到参照拍，再进行乘二或除二换算。" },
      ]}
    />
  );
}

function OrnamentComparisonWidgetCn() {
  return (
    <SectionWidget
      title="回音与倚音"
      intro="判断题目问的是演奏音序，还是小音符是否占用主音时值。"
      rows={[
        { label: "回音", note: "围绕主音的四音装饰音型。" },
        { label: "前倚音", note: "小音符出现在主音之前，并解决到主音。" },
        { label: "后倚音", note: "出现在主音之后的短装饰音，通常快速处理。" },
      ]}
    />
  );
}

function TrillVsMordentWidgetCn() {
  return (
    <SectionWidget
      title="颤音与波音"
      intro="颤音是持续的快速交替；波音是围绕主音的短促装饰。"
      rows={[
        { label: "颤音", note: "主音与邻音快速交替，形成持续装饰效果。" },
        { label: "上波音", note: "短暂移动到上方邻音后回到主音。" },
        { label: "下波音", note: "短暂移动到下方邻音后回到主音。" },
      ]}
    />
  );
}

function CrossBarTieGuideWidgetCn() {
  return (
    <SectionWidget
      title="跨小节连音线"
      intro="长时值跨越小节线时，应按小节拆分，并用连音线连接同音高音符。"
      rows={[
        { label: "检查小节线", note: "如果声音跨越小节边界，记谱应拆分。" },
        { label: "检查音高", note: "只有同音高音符才能用连音线连接。" },
        { label: "分配拍数", note: "先补足前一小节，再把剩余时值写入下一小节。" },
      ]}
    />
  );
}

function ArticulationContrastWidgetCn() {
  return (
    <SectionWidget
      title="奏法记号"
      intro="听辨声音是连贯、分离、保持，还是带有重音。"
      rows={[
        { label: "连奏", note: "音与音之间平滑连接，不要与连音线混淆。" },
        { label: "断奏", note: "音符短促、分离。" },
        { label: "保持音", note: "音符保持完整时值。" },
        { label: "重音", note: "强调音符起音。" },
      ]}
    />
  );
}

function SyncopationPatternWidgetCn() {
  return (
    <SectionWidget
      title="经典切分节奏型"
      intro="先找重音是否发生移位，再判断移位是如何形成的。"
      rows={[
        { label: "弱拍延续到强拍", note: "音从弱拍开始，并延续到通常应为强拍的位置。" },
        { label: "强拍前休止", note: "预期重音处休止，使后续进入产生重音移位感。" },
        { label: "连续切分", note: "效果来自一连串重音移位。" },
      ]}
    />
  );
}

function TemperamentEnharmonicWidgetCn() {
  return (
    <SectionWidget
      title="律制与等音记法"
      intro="把实际听到的音高与书写音名区分开。十二平均律下，许多等音记法听起来相同。"
      rows={[
        { label: "等音记法", note: "C♯ 与 D♭ 在十二平均律中可听起来相同，但在记谱功能上不同。" },
        { label: "律制", note: "律制决定音高空间如何被划分。" },
        { label: "做题抓手", note: "先判断题目关注的是书写音名，还是实际听到的音高。" },
      ]}
    />
  );
}

function DynamicsScaleWidgetCn() {
  return (
    <SectionWidget
      title="力度记号分类"
      intro="选择具体符号前，先判断它属于固定力度、渐变过程，还是瞬间重音。"
      rows={[
        { label: "固定力度", note: "p、mp、mf、f 表示相对稳定的音量层级。" },
        { label: "渐变过程", note: "cresc. 与 dim. 描述随时间变化的力度。" },
        { label: "瞬间重音", note: "sf、sfz、fp 强调突然的重音或力度对比。" },
      ]}
    />
  );
}

function RepeatPathGuideWidgetCn() {
  return (
    <SectionWidget
      title="反复记号路径"
      intro="不要只背标签，要追踪实际演奏路线。"
      rows={[
        { label: "基本反复", note: "找到反复区域，从结束反复记号回到开始反复记号。" },
        { label: "第一、第二结尾", note: "第一次走第 1 结尾，第二次跳过第 1 结尾并进入第 2 结尾。" },
        { label: "百分号与 bis/ter", note: "百分号常表示重复前一小节；bis、ter 表示重复次数。" },
      ]}
    />
  );
}

function DcDsCodaGuideWidgetCn() {
  return (
    <SectionWidget
      title="D.C.、D.S.、Coda 与 Fine"
      intro="判断从哪里返回、从哪里继续，以及乐曲在哪里结束。"
      rows={[
        { label: "D.C.", note: "回到开头；若有 al Fine 或 al Coda，再按提示继续。" },
        { label: "D.S.", note: "回到 Segno 记号，而不是回到开头。" },
        { label: "Coda / Fine", note: "Fine 标记结束；Coda 标记尾声段落。" },
      ]}
    />
  );
}

function MeterAccentGuideWidgetCn() {
  return (
    <SectionWidget
      title="节拍与强弱规律"
      intro="读出每小节拍数、拍单位，以及常见强弱组织。"
      rows={[
        { label: "3/4", note: "每小节三拍，第一拍通常为强拍。" },
        { label: "4/4", note: "常见强弱规律为强、弱、次强、弱。" },
        { label: "6/8", note: "两个大拍，每个大拍分为三个八分音符脉冲。" },
      ]}
    />
  );
}

function SyncopationTypeGuideWidgetCn() {
  return (
    <SectionWidget
      title="切分节奏的三种形式"
      intro="不要先看音符形状，而要先看哪个预期强拍被打破。"
      rows={[
        { label: "连音线型切分", note: "弱拍起音被连音线或持续音延伸到强拍位置。" },
        { label: "强拍休止型", note: "预期强拍处休止，注意力被转移到后续声音。" },
        { label: "弱位重音型", note: "弱位被强调，形成重音移位。" },
      ]}
    />
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
