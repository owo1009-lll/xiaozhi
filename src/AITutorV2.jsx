import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { appendTutorHistory } from "./musicaiBkt";
import { getKnowledgePointsForLesson } from "./musicaiKnowledge";
import { compressImageFileToDataUrl } from "./fileUtils";
import { getStudentProfile } from "./studentProfile";

export default function AITutorV2({ lessonId, lessonTitle }) {
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
  const tutorSystem = lessonId === "L12"
    ? `你是一名大学乐理教师。当前课时：${lessonTitle}。\n请始终使用清晰、准确、简洁的中文回答。\n这是综合诊断课，不要逐条背诵所有知识点。优先说明诊断目的、如何串联第 1-11 课、如何定位薄弱点，以及下一步复习建议。\n课时背景：\n${contextText}`
    : `你是一名大学乐理教师。当前课时：${lessonTitle}。\n请始终使用清晰、准确、简洁的中文回答。\n课时背景：\n${contextText}`;

  useEffect(() => {
    setMsgs([{
      role: "assistant",
      text: `你好，我是你的 AI 乐理导师。当前课时：${lessonTitle}\n\n你可以让我：\n- 解释本课核心概念\n- 澄清某个具体知识点\n- 生成一道练习题\n- 说明这些知识如何用于真实音乐`,
    }]);
  }, [lessonId, lessonTitle]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

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
            (json?.kind === "timeout" ? "AI 导师响应超时。请先缩短问题，或先尝试不带图片提问。" : "")
            || (json?.kind === "upstream_network" ? "AI 服务网络不稳定，请稍后重试。" : "")
            || json?.detail
            || "AI 服务暂时不可用，请稍后重试。"
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
        ? "AI 导师响应超时。纯文字问题通常需要 2-5 秒，图片问题可能更久，请稍后重试。"
        : "无法连接 AI 服务。请确认后端正在运行，或稍后重试。";
      setMsgs((prev) => [...prev, { role: "assistant", text: message }]);
    } finally {
      window.clearTimeout(timeoutId);
      imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
      imageStageTimerRef.current = [];
      setLoading(false);
      setLoadingStage("");
    }
  }, [imageDataUrl, imageName, input, lessonId, lessonTitle, loading, msgs, studentProfile.studentId, tutorSystem]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 460, border: "1px solid rgba(212,177,94,0.14)", borderRadius: 12, overflow: "hidden", background: "rgba(38,34,46,0.85)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(212,177,94,0.14)", background: "rgba(255,255,255,0.05)" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>AI 乐理导师</div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
          {lessonTitle} - 纯文字问题通常需要 2-5 秒；图片需要压缩、识别并匹配课时内容，因此耗时更长。
        </div>
        {responseMeta ? (
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            {responseMeta.cached ? "缓存回答" : "实时生成回答"}
            {responseSourceLabel ? ` - 来源：${responseSourceLabel}` : ""}
            {responseMeta.elapsedMs ? ` - ${responseMeta.elapsedMs} ms` : ""}
            {responseMeta.modelUsed ? ` - ${responseMeta.modelUsed}` : ""}
            {responseMeta.retried ? " - 已自动重试一次" : ""}
          </div>
        ) : null}
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((msg, index) => (
          <div key={`${msg.role}-${index}`} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "82%", padding: "10px 12px", borderRadius: 12, background: msg.role === "user" ? "var(--gradient-accent)" : "rgba(255,255,255,0.06)", color: msg.role === "user" ? "#1a1206" : "var(--color-text-primary)", border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.08)", fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {msg.imageDataUrl ? <img src={msg.imageDataUrl} alt={msg.imageName || "已上传图片"} style={{ display: "block", maxWidth: 220, borderRadius: 10, marginBottom: 8 }} /> : null}
              {msg.text}
            </div>
          </div>
        ))}
        {loading ? <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{loadingStage || "思考中..."}</div> : null}
      </div>
      <div style={{ padding: 10, borderTop: "1px solid rgba(212,177,94,0.14)", background: "rgba(255,255,255,0.04)" }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePickImage} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePickImage} />
        {imageDataUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: 8, borderRadius: 10, background: "rgba(38,34,46,0.85)", border: "1px solid rgba(212,177,94,0.14)" }}>
            <img src={imageDataUrl} alt={imageName || "预览图"} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{imageName || "已选择图片"}</div>
            <button onClick={() => { setImageDataUrl(""); setImageName(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(212,177,94,0.14)", background: "rgba(255,255,255,0.06)", cursor: "pointer" }}>移除</button>
          </div>
        ) : null}
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 8, lineHeight: 1.6 }}>
          建议先提出一个简短问题。若上传图片，系统会先压缩图片、识别内容，再结合当前课时回答。
        </div>
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
            placeholder="输入你的问题，或上传照片后提问..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", fontSize: 12, outline: "none" }}
          />
          <button onClick={() => cameraInputRef.current?.click()} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(38,34,46,0.85)", cursor: "pointer" }}>拍照</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(38,34,46,0.85)", cursor: "pointer" }}>相册</button>
          <button onClick={send} disabled={loading || (!input.trim() && !imageDataUrl)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)", background: "var(--gradient-accent)", color: "#1a1206", cursor: loading || (!input.trim() && !imageDataUrl) ? "default" : "pointer" }}>发送</button>
        </div>
      </div>
    </div>
  );
}
