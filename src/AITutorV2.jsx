import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendTutorHistory } from "./musicaiBkt";
import { getKnowledgePointsForLesson } from "./musicaiKnowledge";
import { compressImageFileToDataUrl } from "./fileUtils";
import { getStudentProfile } from "./studentProfile";
import { playTone } from "./musicAudio";

const TUTOR_NAME = "小智老师";

function RobotAvatar({ mood = "idle", size = 48 }) {
  const happy = mood === "happy";
  const thinking = mood === "thinking";
  const eye = "#86e29a";
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={{ display: "block" }} aria-hidden="true">
      <line x1="24" y1="11" x2="24" y2="5" stroke="#6e451f" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="4" r="3" fill="#7bdd8a" className={thinking ? "rb-pulse" : ""} />
      <rect x="3" y="22" width="4" height="9" rx="2" fill="#8a5a2b" />
      <rect x="41" y="22" width="4" height="9" rx="2" fill="#8a5a2b" />
      <rect x="7" y="11" width="34" height="30" rx="11" fill="#f4e6c4" stroke="#5e3c1c" strokeWidth="2.5" />
      <rect x="11" y="14" width="26" height="7" rx="4" fill="#fffdf6" opacity="0.6" />
      <rect x="12" y="20" width="24" height="16" rx="7" fill="#26352a" stroke="#3f6e2f" strokeWidth="1.5" />
      <g className={mood === "idle" ? "rb-eyes" : ""}>
        {happy ? (
          <>
            <path d="M15.5 27 q2.5 -3.4 5 0" fill="none" stroke={eye} strokeWidth="2.4" strokeLinecap="round" />
            <path d="M27.5 27 q2.5 -3.4 5 0" fill="none" stroke={eye} strokeWidth="2.4" strokeLinecap="round" />
          </>
        ) : thinking ? (
          <>
            <circle cx="18.5" cy="25.5" r="2.4" fill={eye} />
            <circle cx="29.5" cy="25.5" r="2.4" fill={eye} />
          </>
        ) : (
          <>
            <circle cx="18" cy="27" r="2.7" fill={eye} />
            <circle cx="30" cy="27" r="2.7" fill={eye} />
          </>
        )}
      </g>
      {happy ? (
        <path d="M19 32 q5 4.5 10 0" fill="none" stroke={eye} strokeWidth="2.2" strokeLinecap="round" />
      ) : thinking ? (
        <circle cx="24" cy="33" r="1.7" fill={eye} />
      ) : (
        <path d="M20.5 32.5 h7" stroke={eye} strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export default function AITutorV2({ lessonId, lessonTitle, generalMode = false }) {
  const studentProfile = useMemo(() => getStudentProfile(), []);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [responseMeta, setResponseMeta] = useState(null);
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const imageStageTimerRef = useRef([]);
  const [typed, setTyped] = useState(0);
  const responseSourceLabel = useMemo(() => {
    if (!responseMeta) return "";
    const modelUsed = String(responseMeta.modelUsed || "");
    if (responseMeta.imageUploaded || /vl|vision/i.test(modelUsed)) return "视觉模型";
    if (/local-priority|fallback/i.test(modelUsed)) return "本地兜底";
    if (modelUsed) return "云端模型";
    return "";
  }, [responseMeta]);

  const contentSections = getKnowledgePointsForLesson(lessonId).map((item) => ({
    h: item.title,
    b: item.subConcepts?.join("；") || "",
  }));
  const contextText = lessonId === "L12"
    ? "这是综合诊断课。请串联第 1-11 课核心知识点，帮助学习者定位薄弱点、解释错误原因，并给出复习顺序与下一步建议。"
    : contentSections.map((section) => `${section.h}: ${section.b}`).join("\n\n");
  const tutorSystem = generalMode
    ? `你是一名大学乐理教师。请始终使用清晰、准确、简洁的中文回答。请围绕乐理学习、课堂练习、作业订正和复习建议进行答疑。\n可参考的综合知识背景：\n${contextText}`
    : lessonId === "L12"
    ? `你是一名大学乐理教师。当前课时：${lessonTitle}。\n请始终使用清晰、准确、简洁的中文回答。\n这是综合诊断课，不要逐条背诵所有知识点。优先说明诊断目的、如何串联第 1-11 课、如何定位薄弱点，以及下一步复习建议。\n课时背景：\n${contextText}`
    : `你是一名大学乐理教师。当前课时：${lessonTitle}。\n请始终使用清晰、准确、简洁的中文回答。\n课时背景：\n${contextText}`;

  useEffect(() => {
    setMsgs([{
      role: "assistant",
      text: generalMode
        ? "你好，我是小智老师。\n\n你可以让我：\n- 解释乐理核心概念\n- 澄清某个具体知识点\n- 生成一道练习题\n- 帮你检查作业思路"
        : `你好，我是小智老师，你的智能乐理导师。当前课时：${lessonTitle}\n\n你可以让我：\n- 解释本课核心概念\n- 澄清某个具体知识点\n- 生成一道练习题\n- 说明这些知识如何用于真实音乐`,
    }]);
  }, [generalMode, lessonId, lessonTitle]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, typed]);

  useEffect(() => {
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant") return undefined;
    const full = last.text || "";
    setTyped(0);
    let count = 0;
    const id = window.setInterval(() => {
      count += 2;
      setTyped(count);
      if (count % 6 === 0) { try { playTone(740, 0.014, "square", 0.04); } catch { /* audio not unlocked yet */ } }
      if (count >= full.length) window.clearInterval(id);
    }, 18);
    return () => window.clearInterval(id);
  }, [msgs.length]);

  useEffect(() => () => {
    imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    imageStageTimerRef.current = [];
  }, []);

  const handlePickImage = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    setLoadingStage("正在压缩图片...");
    const dataUrl = await compressImageFileToDataUrl(file);
    setImageDataUrl(dataUrl);
    setImageName(file.name);
    setLoadingStage("");
    event.target.value = "";
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageDataUrl) || loading) return;
    const nextMsgs = [...msgs, { role: "user", text: text || "请根据我上传的图片进行讲解。", imageDataUrl, imageName }];
    setMsgs(nextMsgs);
    setInput("");
    setLoading(true);
    setResponseMeta(null);
    imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    imageStageTimerRef.current = [];
    if (imageDataUrl) {
      setLoadingStage("正在上传并识别图片中的乐谱、题目或课件内容...");
      imageStageTimerRef.current.push(window.setTimeout(() => {
        setLoadingStage("正在结合当前课时生成讲解、纠错和复习建议...");
      }, 2200));
      imageStageTimerRef.current.push(window.setTimeout(() => {
        setLoadingStage("图片分析通常比纯文字问题更慢，请继续等待处理完成...");
      }, 6500));
    } else {
      setLoadingStage("正在整理问题并生成讲解...");
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), imageDataUrl ? 45000 : 18000);
    try {
      const requestMessages = nextMsgs.slice(-5);
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          maxTokens: imageDataUrl ? 420 : 220,
          system: tutorSystem,
          messages: requestMessages.map((item) => ({
            role: item.role,
            content: item.text,
            imageDataUrl: item.imageDataUrl || undefined,
            imageName: item.imageName || undefined,
          })),
        }),
      });
      const json = await response.json();
      const replyText = response.ok
        ? String(json?.text || "请求失败，请稍后重试。").trim()
        : String(
            (json?.kind === "timeout" ? "智能导师响应超时。请先缩短问题，或先尝试不带图片提问。" : "")
            || (json?.kind === "upstream_network" ? "智能服务网络不稳定，请稍后重试。" : "")
            || json?.detail
            || "智能服务暂时不可用，请稍后重试。"
          ).trim();
      setMsgs((prev) => [...prev, { role: "assistant", text: replyText }]);
      if (response.ok) {
        setResponseMeta({
          elapsedMs: json?.elapsedMs || null,
          cached: Boolean(json?.cached),
          modelUsed: json?.modelUsed || "",
          retried: Boolean(json?.retried),
          imageUploaded: Boolean(imageDataUrl),
        });
        setImageDataUrl("");
        setImageName("");
        appendTutorHistory(studentProfile.studentId, {
          lessonId,
          lessonTitle,
          prompt: text || "请根据我上传的图片进行讲解。",
          reply: replyText,
          imageUploaded: Boolean(imageDataUrl),
        });
      }
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "智能导师响应超时。纯文字问题通常需要 2-5 秒，图片问题可能更久，请稍后重试。"
        : "无法连接智能服务。请确认后端正在运行，或稍后重试。";
      setMsgs((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      window.clearTimeout(timeoutId);
      imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
      imageStageTimerRef.current = [];
      setLoading(false);
      setLoadingStage("");
    }
  }, [imageDataUrl, imageName, input, lessonId, lessonTitle, loading, msgs, studentProfile.studentId, tutorSystem]);

  const lastIsAssistant = msgs[msgs.length - 1]?.role === "assistant";
  const mood = loading ? "thinking" : (lastIsAssistant ? "happy" : "idle");

  return (
    <div className="npc-chat">
      <div className="npc-chat-head">
        <div className="npc-portrait sm"><RobotAvatar mood={mood} size={30} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="npc-headname">{TUTOR_NAME}</div>
          {(responseSourceLabel || !generalMode) ? (
            <div className="npc-headsub">{generalMode ? responseSourceLabel : `${lessonTitle}${responseSourceLabel ? ` · ${responseSourceLabel}` : ""}`}</div>
          ) : null}
        </div>
      </div>
      <div ref={scrollRef} className="npc-scroll">
        {msgs.map((msg, index) => {
          if (msg.role === "user") {
            return (
              <div key={`u-${index}`} className="player-row">
                <div className="player-bubble">
                  {msg.imageDataUrl ? <img src={msg.imageDataUrl} alt={msg.imageName || "已上传图片"} /> : null}
                  {msg.text}
                </div>
              </div>
            );
          }
          const isLast = index === msgs.length - 1;
          const fullText = msg.text || "";
          const shownText = isLast && lastIsAssistant ? fullText.slice(0, typed) : fullText;
          const typing = isLast && lastIsAssistant && typed < fullText.length;
          return (
            <div key={`a-${index}`} className="npc-row">
              <div className="npc-portrait"><RobotAvatar mood={isLast ? mood : "idle"} size={46} /></div>
              <div className="npc-bubble">
                <div className="npc-name">{TUTOR_NAME}</div>
                <div className="npc-text">{shownText}{typing ? <span className="npc-caret">▌</span> : null}</div>
              </div>
            </div>
          );
        })}
        {loading ? (
          <div className="npc-row">
            <div className="npc-portrait"><RobotAvatar mood="thinking" size={46} /></div>
            <div className="npc-bubble">
              <div className="npc-name">{TUTOR_NAME}</div>
              <div className="npc-text">{loadingStage || "思考中"}<span className="npc-dots"><i /><i /><i /></span></div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="npc-input">
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePickImage} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePickImage} />
        {imageDataUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: 8, borderRadius: 10, background: "#fffaf0", border: "2px solid rgba(120,80,40,0.3)" }}>
            <img src={imageDataUrl} alt={imageName || "预览图"} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{imageName || "已选择图片"}</div>
            <button onClick={() => { setImageDataUrl(""); setImageName(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(120,80,40,0.3)", background: "rgba(94,60,28,0.07)", cursor: "pointer" }}>移除</button>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="和小智老师说点什么…"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "2px solid rgba(120,80,40,0.3)", fontSize: 13, outline: "none", background: "#fffaf0" }}
          />
          <button onClick={() => cameraInputRef.current?.click()} title="拍照" style={{ padding: "8px 11px", borderRadius: 10, border: "2px solid rgba(120,80,40,0.3)", background: "#fffaf0", cursor: "pointer" }}>📷</button>
          <button onClick={() => fileInputRef.current?.click()} title="相册" style={{ padding: "8px 11px", borderRadius: 10, border: "2px solid rgba(120,80,40,0.3)", background: "#fffaf0", cursor: "pointer" }}>🖼️</button>
          <button onClick={send} disabled={loading || (!input.trim() && !imageDataUrl)} style={{ padding: "9px 16px", borderRadius: 10, border: "2px solid #3f6e2f", background: "var(--gradient-accent)", color: "#fdf6e3", fontWeight: 700, cursor: loading || (!input.trim() && !imageDataUrl) ? "default" : "pointer" }}>说</button>
        </div>
      </div>
    </div>
  );
}
