import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ✅ 항상 정의되도록 기본값 지정
const phpTarget = process.env.VITE_PHP_TARGET || "http://127.0.0.1:8000";

export default defineConfig(({ command }) => {
  const basePath = "/ri-portal/"; // GitHub Pages repo명

  return {
    base: basePath,
    plugins: [react()],

    // ✅ dev 서버에서만 프록시 사용 (build에서는 필요 없음)
    server: command === "serve"
      ? {
          proxy: {
            "/api": { target: phpTarget, changeOrigin: true },
            "/login.php": { target: phpTarget, changeOrigin: true },
            "/logout.php": { target: phpTarget, changeOrigin: true },
          },
        }
      : undefined,
  };
});
