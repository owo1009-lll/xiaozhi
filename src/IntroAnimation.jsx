import { useEffect, useState } from "react";
import { PPT_CHAPTERS } from "./pptLessonData";
import "./introAnimation.css";

const SEEN_KEY = "musicai.intro.seen";
const READY_DELAY_MS = 2100;
const TITLE = "乐理智学";
const SUBTITLE = "音乐理论智能学习平台";
const SKIP_LABEL = "跳过";
const START_LABEL = "点击进入";
const FALLBACK_CHAPTER_LABELS = ["乐音体系", "记谱法", "装饰音", "音乐术语", "节奏节拍"];

const shortLabel = (text) =>
  String(text || "")
    .replace(/^第\s*\d+\s*章\s*[：:\-]?\s*/, "")
    .trim();

const CHAPTER_LABELS = (PPT_CHAPTERS || [])
  .slice(0, 5)
  .map((chapter, index) => shortLabel(chapter?.t) || FALLBACK_CHAPTER_LABELS[index])
  .filter(Boolean);

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function IntroAnimation() {
  // 预览阶段：每次进入都播放开场。上线前改回"只播一次"（读取 SEEN_KEY）。
  const [show, setShow] = useState(() => typeof window !== "undefined");
  const [ready, setReady] = useState(false);
  const [exiting, setExiting] = useState(false);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (!show) return undefined;
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // 本轮无法写入本地存储时，仍播放一次开场动画。
    }
    if (reduced) {
      setReady(true);
      return undefined;
    }
    const timer = setTimeout(() => setReady(true), READY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [show, reduced]);

  if (!show) return null;

  const enter = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => setShow(false), 420);
  };

  return (
    <div
      className={`intro-overlay${exiting ? " is-exiting" : ""}${reduced ? " is-static" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={START_LABEL}
      onClick={enter}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") enter(); }}
    >
      <div className="intro-sky" />
      <button
        type="button"
        className="intro-skip"
        onClick={(event) => { event.stopPropagation(); enter(); }}
        aria-label="跳过开场动画"
      >
        {SKIP_LABEL}
      </button>
      <div className="intro-scene">
        <div className="intro-sun" />
        <div className="intro-clouds"><span /><span /><span /></div>
        <div className="intro-hills" />
        <div className="intro-field">
          <div className="intro-staff"><i /><i /><i /><i /><i /></div>
          <div className="intro-notes">
            {[0, 1, 2, 3, 4].map((index) => (
              <div className="intro-note" style={{ "--i": index }} key={index}>
                <svg width="22" height="34" viewBox="0 0 22 34" aria-hidden="true">
                  <ellipse cx="8" cy="26" rx="7" ry="5" fill="#F6E6B4" stroke="#D4B15E" strokeWidth="1.6" transform="rotate(-15 8 26)" />
                  <rect x="13.6" y="4" width="2.6" height="23" fill="#D4B15E" />
                </svg>
              </div>
            ))}
          </div>
        </div>
        <div className="intro-sign">
          <span className="intro-sign-title">{TITLE}</span>
        </div>
      </div>
      {ready ? <div className="intro-start">{START_LABEL}</div> : null}
    </div>
  );
}
