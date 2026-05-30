import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { installOpenAITutorBridge } from "./openaiTutorBridge.js";
import { installEnglishDemoShell } from "./englishDemoContent.js";
import "./styles.css";

installOpenAITutorBridge();
installEnglishDemoShell();

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
          <h1>Page failed to load</h1>
          <p>The frontend script encountered an error. Refresh the page or use Chrome / Edge.</p>
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
  </React.StrictMode>,
);
