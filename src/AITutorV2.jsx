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

  const contentSections = getKnowledgePointsForLesson(lessonId).map((item) => ({
    h: item.title,
    b: item.subConcepts?.join("；") || "",
  }));
  const contextText = lessonId === "L12"
    ? "本课是综合诊断课。请整合前 11 课的核心知识点，重点帮助学生定位薄弱知识点、解释错误原因、给出复习顺序与下一步建议。"
    : contentSections.map((section) => `${section.h}: ${section.b}`).join("\n\n");
  const tutorSystem = lessonId === "L12"
    ? `你是一位大学乐理课程教师。当前课程：${lessonTitle}。\n请始终用中文回复，说明要清楚、准确、简洁。\n这是综合诊断课，不要逐条背诵全部知识点；请优先说明综合诊断目的、如何整合前 11 课知识点、如何定位薄弱项，以及下一步复习建议。\n课程内容：\n${contextText}`
    : `你是一位大学乐理课程教师。当前课程：${lessonTitle}。\n请始终用中文回复，说明要清楚、准确、简洁。\n课程内容：\n${contextText}`;

  useEffect(() => {
    setMsgs([{
      role: "assistant",
      text: `你好，我是你的 AI 乐理导师。当前课程：${lessonTitle}\n\n你可以问我：\n- 解释本课核心概念\n- 某个知识点的详细说明\n- 出一道练习题\n- 这些知识在实际中怎么应用`,
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
    const nextMsgs = [...msgs, { role: "user", text: text || "请结合我上传的图片进行讲解。", imageDataUrl, imageName }];
    setMsgs(nextMsgs);
    setInput("");
    setLoading(true);
    setResponseMeta(null);
    imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    imageStageTimerRef.current = [];
    if (imageDataUrl) {
      setLoadingStage("正在上传并识别图片中的乐谱、题目或课件内容...");
      imageStageTimerRef.current.push(window.setTimeout(() => {
        setLoadingStage("正在结合当前课时内容生成讲解、纠错和复习建议...");
      }, 2200));
      imageStageTimerRef.current.push(window.setTimeout(() => {
        setLoadingStage("图片分析通常比纯文字更慢，请稍候，系统仍在继续处理...");
      }, 6500));
    } else {
      setLoadingStage("正在整理问题并生成解释...");
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
            (json?.kind === "timeout" ? "AI 导师响应超时。建议先缩短问题，或改成不带图片提问后再继续。" : "")
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
        });
        setImageDataUrl("");
        setImageName("");
        appendTutorHistory(studentProfile.studentId, {
          lessonId,
          lessonTitle,
          prompt: text || "请结合我上传的图片进行讲解。",
          reply: replyText,
          imageUploaded: Boolean(imageDataUrl),
        });
      }
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "AI 导师响应超时。纯文字提问通常需要 2 到 5 秒，带图片会更慢，请稍后重试。"
        : "无法连接到 AI 服务。请确认当前网页后端已启动，或稍后重试。";
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
    <div style={{ display: "flex", flexDirection: "column", height: 460, border: "1px solid rgba(17,17,17,0.08)", borderRadius: 12, overflow: "hidden", background: "#ffffff" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(17,17,17,0.08)", background: "#f8f8f8" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>AI 乐理导师</div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
          {lessonTitle} · 纯文字通常 2 到 5 秒；图片会经过压缩、识别和课时匹配，等待时间会更长
        </div>
        {responseMeta ? (
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            {responseMeta.cached ? "本次回答命中缓存" : "本次回答来自实时生成"}
            {responseMeta.elapsedMs ? ` · ${responseMeta.elapsedMs} ms` : ""}
            {responseMeta.modelUsed ? ` · ${responseMeta.modelUsed}` : ""}
            {responseMeta.retried ? " · 已自动重试一次" : ""}
          </div>
        ) : null}
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((msg, index) => (
          <div key={`${msg.role}-${index}`} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "82%", padding: "10px 12px", borderRadius: 12, background: msg.role === "user" ? "#111111" : "#f5f5f5", color: msg.role === "user" ? "#ffffff" : "#111111", fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {msg.imageDataUrl ? <img src={msg.imageDataUrl} alt={msg.imageName || "上传图片"} style={{ display: "block", maxWidth: 220, borderRadius: 10, marginBottom: 8 }} /> : null}
              {msg.text}
            </div>
          </div>
        ))}
        {loading ? <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{loadingStage || "思考中..."}</div> : null}
      </div>
      <div style={{ padding: 10, borderTop: "1px solid rgba(17,17,17,0.08)", background: "#fafafa" }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePickImage} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePickImage} />
        {imageDataUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: 8, borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <img src={imageDataUrl} alt={imageName || "预览"} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{imageName || "已选择图片"}</div>
            <button onClick={() => { setImageDataUrl(""); setImageName(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.08)", background: "#f5f5f5", cursor: "pointer" }}>移除</button>
          </div>
        ) : null}
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 8, lineHeight: 1.6 }}>
          建议先用一句短问题提问。带图片时系统会依次完成“压缩上传 → 内容识别 → 结合本课讲解”，等待时间会明显长于纯文字。
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
            placeholder="输入你的问题，或拍照上传后提问..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", fontSize: 12, outline: "none" }}
          />
          <button onClick={() => cameraInputRef.current?.click()} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>拍照</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>相册</button>
          <button onClick={send} disabled={loading || (!input.trim() && !imageDataUrl)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: loading || (!input.trim() && !imageDataUrl) ? "default" : "pointer" }}>发送</button>
        </div>
      </div>
    </div>
  );
}
