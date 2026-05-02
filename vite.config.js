import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2015",
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (normalizedId.includes("node_modules")) {
            if (normalizedId.includes("react") || normalizedId.includes("react-dom")) return "vendor-react";
            return "vendor";
          }
          if (
            normalizedId.includes("/src/musicaiKnowledge")
            || normalizedId.includes("/src/musicaiQuestionBank")
            || normalizedId.includes("/src/pptLessonData")
            || normalizedId.includes("/src/weakKnowledgeEnhancements")
          ) {
            return "course-data";
          }
          return undefined;
        },
      },
    },
  },
});
