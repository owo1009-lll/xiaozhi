# 乐理智学平台公网部署

这是一个 React/Vite + Express 项目。前端页面会调用同域 `/api/tutor`，后端使用 OpenAI GPT 或 Gemini 生成 AI 导师回答，避免把 API Key 暴露在浏览器里。

## 本地运行

```powershell
npm install
Copy-Item .env.example .env
```

编辑 `.env`，填入你的 API Key，然后运行：

```powershell
npm run build
npm start
```

访问 `http://localhost:3000`。

## 公网部署

任选支持 Node.js 服务的公网平台，例如 Render、Railway、Fly.io、VPS、宝塔面板 Node 项目等。

部署配置：

- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment Variables: 使用 OpenAI 时设置 `OPENAI_API_KEY` 和 `AI_PROVIDER=openai`
- Environment Variables: 使用 Gemini 时设置 `GEMINI_API_KEY`、`GEMINI_MODEL` 和 `AI_PROVIDER=gemini`
- 如果 Gemini 官方接口提示地区不支持，可额外设置 `GEMINI_BASE_URL` 指向你的第三方 Gemini 接口，并按需要把 `GEMINI_API_MODE` 设为 `google` 或 `bearer`

如果只是部署纯静态站点，AI 导师无法工作；必须同时部署 `server.js` 后端。
