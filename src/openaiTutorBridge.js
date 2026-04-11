const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export function installOpenAITutorBridge() {
  if (typeof window === "undefined" || window.__openaiTutorBridgeInstalled) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url;
    if (url !== ANTHROPIC_MESSAGES_URL) {
      return originalFetch(input, init);
    }

    try {
      const payload = JSON.parse(init.body || "{}");
      const resp = await originalFetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system: payload.system,
          messages: payload.messages || [],
          maxTokens: payload.max_tokens,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        return new Response(JSON.stringify({
          content: [{
            type: "text",
            text: data.detail || data.error || "AI 服务请求失败，请检查 API Key 和模型配置。",
          }],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        content: [{ type: "text", text: data.text || "" }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : "AI request failed",
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };

  window.__openaiTutorBridgeInstalled = true;
}
