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
    if (responseMeta.imageUploaded || /vl|vision/i.test(modelUsed)) return "Vision model";
    if (/local-priority|fallback/i.test(modelUsed)) return "Local fallback";
    if (modelUsed) return "Cloud model";
    return "";
  }, [responseMeta]);

  const contentSections = getKnowledgePointsForLesson(lessonId).map((item) => ({
    h: item.title,
    b: item.subConcepts?.join("；") || "",
  }));
  const contextText = lessonId === "L12"
    ? "This is an integrated diagnostic lesson. Connect the core knowledge points from Lessons 1-11, help the learner locate weak points, explain error causes, and suggest a review order and next steps."
    : contentSections.map((section) => `${section.h}: ${section.b}`).join("\n\n");
  const tutorSystem = lessonId === "L12"
    ? `You are a university-level music theory instructor. Current lesson: ${lessonTitle}.\nAlways reply in clear, accurate, concise English.\nThis is an integrated diagnostic lesson. Do not recite all knowledge points one by one. Prioritize the diagnostic purpose, how to connect Lessons 1-11, how to locate weak points, and what to review next.\nLesson context:\n${contextText}`
    : `You are a university-level music theory instructor. Current lesson: ${lessonTitle}.\nAlways reply in clear, accurate, concise English.\nLesson context:\n${contextText}`;

  useEffect(() => {
    setMsgs([{
      role: "assistant",
      text: `Hello, I am your AI Music Theory Tutor. Current lesson: ${lessonTitle}\n\nYou can ask me to:\n- Explain this lesson's core concepts\n- Clarify a specific knowledge point\n- Create a practice question\n- Show how these ideas apply in real music`,
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
    setLoadingStage("Compressing image...");
    const dataUrl = await compressImageFileToDataUrl(file);
    setImageDataUrl(dataUrl);
    setImageName(file.name);
    setLoadingStage("");
    event.target.value = "";
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageDataUrl) || loading) return;
    const nextMsgs = [...msgs, { role: "user", text: text || "Please explain using the image I uploaded.", imageDataUrl, imageName }];
    setMsgs(nextMsgs);
    setInput("");
    setLoading(true);
    setResponseMeta(null);
    imageStageTimerRef.current.forEach((timerId) => window.clearTimeout(timerId));
    imageStageTimerRef.current = [];
    if (imageDataUrl) {
      setLoadingStage("Uploading and reading the score, question, or slide content in the image...");
      imageStageTimerRef.current.push(window.setTimeout(() => {
        setLoadingStage("Combining the image with the current lesson to generate explanation, correction, and review advice...");
      }, 2200));
      imageStageTimerRef.current.push(window.setTimeout(() => {
        setLoadingStage("Image analysis usually takes longer than text-only questions. Please wait while processing continues...");
      }, 6500));
    } else {
      setLoadingStage("Preparing the question and generating an explanation...");
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
        ? String(json?.text || "Request failed. Please try again later.").trim()
        : String(
            (json?.kind === "timeout" ? "AI Tutor response timed out. Try shortening the question or asking without an image first." : "")
            || (json?.kind === "upstream_network" ? "The AI service network is unstable. Please try again later." : "")
            || json?.detail
            || "The AI service is temporarily unavailable. Please try again later."
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
          prompt: text || "Please explain using the image I uploaded.",
          reply: replyText,
          imageUploaded: Boolean(imageDataUrl),
        });
      }
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "AI Tutor response timed out. Text-only questions usually take 2 to 5 seconds; image questions can take longer. Please try again later."
        : "Cannot connect to the AI service. Please confirm the backend is running or try again later.";
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
        <div style={{ fontSize: 14, fontWeight: 700 }}>AI Music Theory Tutor</div>
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>
          {lessonTitle} - text-only questions usually take 2 to 5 seconds; images require compression, recognition, and lesson matching, so they take longer.
        </div>
        {responseMeta ? (
          <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4 }}>
            {responseMeta.cached ? "Cached response" : "Live generated response"}
            {responseSourceLabel ? ` - Source: ${responseSourceLabel}` : ""}
            {responseMeta.elapsedMs ? ` - ${responseMeta.elapsedMs} ms` : ""}
            {responseMeta.modelUsed ? ` - ${responseMeta.modelUsed}` : ""}
            {responseMeta.retried ? " - automatically retried once" : ""}
          </div>
        ) : null}
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {msgs.map((msg, index) => (
          <div key={`${msg.role}-${index}`} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "82%", padding: "10px 12px", borderRadius: 12, background: msg.role === "user" ? "#111111" : "#f5f5f5", color: msg.role === "user" ? "#ffffff" : "#111111", fontSize: 12, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {msg.imageDataUrl ? <img src={msg.imageDataUrl} alt={msg.imageName || "Uploaded image"} style={{ display: "block", maxWidth: 220, borderRadius: 10, marginBottom: 8 }} /> : null}
              {msg.text}
            </div>
          </div>
        ))}
        {loading ? <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{loadingStage || "Thinking..."}</div> : null}
      </div>
      <div style={{ padding: 10, borderTop: "1px solid rgba(17,17,17,0.08)", background: "#fafafa" }}>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePickImage} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handlePickImage} />
        {imageDataUrl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: 8, borderRadius: 10, background: "#ffffff", border: "1px solid rgba(17,17,17,0.08)" }}>
            <img src={imageDataUrl} alt={imageName || "Preview"} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{imageName || "Image selected"}</div>
            <button onClick={() => { setImageDataUrl(""); setImageName(""); }} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(17,17,17,0.08)", background: "#f5f5f5", cursor: "pointer" }}>Remove</button>
          </div>
        ) : null}
        <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 8, lineHeight: 1.6 }}>
          Ask one short question first. With images, the system compresses the upload, recognizes the content, and combines it with the current lesson before answering.
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
            placeholder="Enter your question, or upload a photo and ask..."
            style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", fontSize: 12, outline: "none" }}
          />
          <button onClick={() => cameraInputRef.current?.click()} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>Camera</button>
          <button onClick={() => fileInputRef.current?.click()} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#ffffff", cursor: "pointer" }}>Gallery</button>
          <button onClick={send} disabled={loading || (!input.trim() && !imageDataUrl)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(17,17,17,0.12)", background: "#111111", color: "#ffffff", cursor: loading || (!input.trim() && !imageDataUrl) ? "default" : "pointer" }}>Send</button>
        </div>
      </div>
    </div>
  );
}
