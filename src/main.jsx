import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { installOpenAITutorBridge } from "./openaiTutorBridge.js";
import "./styles.css";

installOpenAITutorBridge();

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error">
          <h1>页面加载失败</h1>
          <p>前端脚本运行时出错，请刷新页面或换用 Chrome / Edge 浏览器。</p>
          <pre>{this.state.error.message}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
