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
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Current Handle</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>{active.note}</div>
        </div>
      ) : null}
    </div>
  );
}

function InteractivePitchFrequencyWidgetCn() {
  const noteItems = [
    { label: "C3", freq: 130.81, tip: "Lower frequency gives a lower pitch." },
    { label: "G3", freq: 196.0, tip: "Frequency rises, so the pitch sounds higher." },
    { label: "C4", freq: 261.63, tip: "Middle C is a common reference point." },
    { label: "G4", freq: 392.0, tip: "The higher register sounds brighter." },
    { label: "C5", freq: 523.25, tip: "This is one octave above C4, close to double the frequency." },
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
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Pitch and Frequency Piano</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        Click a key to hear the pitch and compare the frequency bars.
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
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Selected Note</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 6 }}>{active.label}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
            {`Frequency: ${active.freq} Hz`}
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
    { label: "pp", amp: 0.18, volume: 0.1, note: "Very soft, with the smallest amplitude." },
    { label: "p", amp: 0.3, volume: 0.16, note: "Soft and controlled." },
    { label: "mp", amp: 0.46, volume: 0.22, note: "Medium soft." },
    { label: "mf", amp: 0.64, volume: 0.3, note: "Medium loud, a common baseline." },
    { label: "f", amp: 0.82, volume: 0.4, note: "Loud and fuller in sound." },
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
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Loudness and Amplitude</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8, marginBottom: 12 }}>
        Compare dynamic levels and notice that stronger loudness corresponds to larger amplitude.
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
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Current Dynamic</div>
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
          {`${active.label}: amplitude ${active.amp.toFixed(2)}, playback volume ${active.volume.toFixed(2)}. ${active.note}`}
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
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Current Target: {active.label}</div>
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
              {selectedAnswer === active.answer ? "Correct." : `Incorrect. The answer is ${active.answer}.`}
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
      title="Treble Clef Position Drill"
      intro="Anchor G4 on the second line, then locate middle C and nearby ledger-line notes."
      referenceText="Second line = G4; middle C = lower ledger line"
      targets={[
        { id: "g4", label: "G4", x: 120, y: 124, answer: "Second line", hint: "Remember G4 first, then count by steps." },
        { id: "c4", label: "C4", x: 190, y: 182, answer: "Lower ledger line", hint: "Middle C sits below the treble staff." },
        { id: "b4", label: "B4", x: 260, y: 102, answer: "Third line", hint: "Count upward from G4." },
        { id: "a5", label: "A5", x: 330, y: 72, answer: "Second space above", hint: "Check whether the note is on a line or in a space." },
      ]}
      options={["Lower ledger line", "First line", "Second line", "Third line", "Second space above"]}
    />
  );
}

function BassClefDrillWidgetCn() {
  return (
    <StaffDrillWidget
      title="Bass Clef Position Drill"
      intro="Anchor F3 on the fourth line, then use middle C as an upper ledger-line reference."
      referenceText="Fourth line = F3; middle C = upper ledger line"
      targets={[
        { id: "f3", label: "F3", x: 130, y: 124, answer: "Fourth line", hint: "The bass clef dots surround the F line." },
        { id: "c4", label: "C4", x: 205, y: 58, answer: "Upper ledger line", hint: "Middle C sits above the bass staff." },
        { id: "d3", label: "D3", x: 280, y: 146, answer: "Third line", hint: "Count around the F3 anchor." },
        { id: "a3", label: "A3", x: 345, y: 102, answer: "Fifth line", hint: "Confirm line or space before naming it." },
      ]}
      options={["Third line", "Fourth line", "Fifth line", "Upper ledger line", "Second space"]}
    />
  );
}

function ExpressionVsTempoCardCn() {
  return (
    <SectionWidget
      title="Tempo Terms vs Expression Terms"
      intro="First decide whether the term changes speed or character. Expression terms describe style and mood, not beat rate."
      rows={[
        { label: "Allegro", note: "A tempo term meaning fast and lively." },
        { label: "Andante", note: "A moderate walking tempo." },
        { label: "Dolce", note: "An expression term meaning sweet and gentle." },
        { label: "Cantabile", note: "An expression term meaning songlike." },
      ]}
    />
  );
}

function DotsAndTiesGuideWidgetCn() {
  return (
    <SectionWidget
      title="Dots and Ties"
      intro="Ask whether one note is being lengthened, or two same-pitch notes are being connected."
      rows={[
        { label: "Dotted quarter note", note: "A dot adds half the original value: one beat plus half a beat equals 1.5 beats." },
        { label: "Tie", note: "A tie connects same-pitch notes and adds their durations into one sustained sound." },
      ]}
    />
  );
}

function NoteValueHierarchyWidgetCn() {
  return (
    <SectionWidget
      title="Note-Value Hierarchy"
      intro="Duration questions are easier when you track the halving relationship between note values."
      rows={[
        { label: "Whole / half / quarter", note: "A whole note is usually four quarter notes; a half note is two quarter notes." },
        { label: "Quarter / eighth / sixteenth", note: "Each lower level halves the duration." },
        { label: "Problem-solving handle", note: "Find the reference beat first, then multiply or divide by two." },
      ]}
    />
  );
}

function OrnamentComparisonWidgetCn() {
  return (
    <SectionWidget
      title="Turns and Appoggiaturas"
      intro="Decide whether the question asks about note order or whether a small note takes part of the main note value."
      rows={[
        { label: "Turn", note: "A four-note ornament circling the main note." },
        { label: "Appoggiatura before the note", note: "A small note appears before resolving to the main note." },
        { label: "After-note ornament", note: "A short ornament after the main note, often treated quickly." },
      ]}
    />
  );
}

function TrillVsMordentWidgetCn() {
  return (
    <SectionWidget
      title="Trill vs Mordent"
      intro="A trill is a sustained rapid alternation; a mordent is a short decorative turn around the main note."
      rows={[
        { label: "Trill", note: "Main note and neighboring note alternate rapidly for a sustained effect." },
        { label: "Upper mordent", note: "A brief move to the upper neighbor and back." },
        { label: "Lower mordent", note: "A brief move to the lower neighbor and back." },
      ]}
    />
  );
}

function CrossBarTieGuideWidgetCn() {
  return (
    <SectionWidget
      title="Ties Across the Barline"
      intro="When a long duration crosses the barline, split it by measure and connect same-pitch notes with a tie."
      rows={[
        { label: "Check the barline", note: "If the sound crosses a measure boundary, split the notation." },
        { label: "Check pitch", note: "Only same-pitch notes should be connected by a tie." },
        { label: "Distribute beats", note: "Complete the first measure first, then place the remaining duration in the next measure." },
      ]}
    />
  );
}

function ArticulationContrastWidgetCn() {
  return (
    <SectionWidget
      title="Articulation Signs"
      intro="Listen for whether the sound is connected, separated, held, or accented."
      rows={[
        { label: "Legato", note: "Notes connect smoothly; do not confuse it with a tie." },
        { label: "Staccato", note: "Notes are short and detached." },
        { label: "Tenuto", note: "Hold the note for its full value." },
        { label: "Accent", note: "Emphasize the attack of the note." },
      ]}
    />
  );
}

function SyncopationPatternWidgetCn() {
  return (
    <SectionWidget
      title="Classic Syncopation Patterns"
      intro="Look for displaced accent first, then identify how the displacement is created."
      rows={[
        { label: "Weak beat extended into strong beat", note: "A note starts weak and is sustained into a normally strong position." },
        { label: "Rest before strong-beat entry", note: "Silence on the expected accent makes the following entry feel displaced." },
        { label: "Continuous syncopation", note: "The effect comes from a chain of shifted accents." },
      ]}
    />
  );
}

function TemperamentEnharmonicWidgetCn() {
  return (
    <SectionWidget
      title="Temperament and Enharmonic Spelling"
      intro="Separate sounding pitch from written spelling. Equal temperament makes many enharmonic spellings sound the same."
      rows={[
        { label: "Enharmonic spelling", note: "C sharp and D flat can sound the same in equal temperament but function differently in notation." },
        { label: "Temperament", note: "A tuning system defines how pitch space is divided." },
        { label: "Question handle", note: "Ask whether the question cares about written name or sounding pitch." },
      ]}
    />
  );
}

function DynamicsScaleWidgetCn() {
  return (
    <SectionWidget
      title="Dynamic Marking Categories"
      intro="Classify dynamics as fixed level, gradual process, or single accent before choosing a specific symbol."
      rows={[
        { label: "Fixed levels", note: "p, mp, mf, and f show a relatively stable loudness level." },
        { label: "Gradual change", note: "cresc. and dim. describe change across time." },
        { label: "Single accent", note: "sf, sfz, and fp focus on a sudden emphasis or contrast." },
      ]}
    />
  );
}

function RepeatPathGuideWidgetCn() {
  return (
    <SectionWidget
      title="Repeat Sign Pathway"
      intro="Trace the performance route instead of memorizing labels."
      rows={[
        { label: "Basic repeat", note: "Find the repeated region and return from the end sign to the start sign." },
        { label: "First and second endings", note: "Use ending 1 the first time, then skip it and use ending 2." },
        { label: "Percent and bis/ter", note: "Percent signs often repeat a measure; bis and ter indicate repeat counts." },
      ]}
    />
  );
}

function DcDsCodaGuideWidgetCn() {
  return (
    <SectionWidget
      title="D.C., D.S., Coda, and Fine"
      intro="Decide where to return, where to continue, and where the music ends."
      rows={[
        { label: "D.C.", note: "Return to the beginning, then follow al Fine or al Coda if present." },
        { label: "D.S.", note: "Return to the sign, not to the beginning." },
        { label: "Coda / Fine", note: "Fine marks the ending; Coda marks a closing passage." },
      ]}
    />
  );
}

function MeterAccentGuideWidgetCn() {
  return (
    <SectionWidget
      title="Meter and Accent Pattern"
      intro="Read the number of beats, the beat unit, and the usual strong-weak pattern."
      rows={[
        { label: "3/4", note: "Three beats per measure; beat 1 is usually strong." },
        { label: "4/4", note: "A common pattern is strong, weak, secondary strong, weak." },
        { label: "6/8", note: "Two large beats, each divided into three eighth-note pulses." },
      ]}
    />
  );
}

function SyncopationTypeGuideWidgetCn() {
  return (
    <SectionWidget
      title="Three Forms of Syncopation"
      intro="Do not start with note shape. Start with which expected strong beat has been disrupted."
      rows={[
        { label: "Tie-based syncopation", note: "A weak-beat attack is tied or sustained into a stronger beat." },
        { label: "Rest-on-strong-beat type", note: "The expected strong beat is silent, shifting attention to the following sound." },
        { label: "Weak-position accent", note: "A weak position is stressed, creating displaced accent." },
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
