import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Contour key fingerprint pinned into the panel: from ux/.env or the environment, empty when unset.
function contourFingerprint(fromEnvFile: string | undefined): string {
  if (fromEnvFile !== undefined && fromEnvFile !== "") {
    return fromEnvFile;
  }

  return process.env.VITE_CONTOUR_FINGERPRINT ?? "";
}

const PROXY = {
  // No changeOrigin: the API compares Origin with Host and refuses a page of another site.
  "/api": {
    target: "http://127.0.0.1:8080",
  },
  "/agent_health_socket": {
    target: "ws://127.0.0.1:8080",
    ws: true,
  },
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    plugins: [react()],
    define: {
      "import.meta.env.VITE_CONTOUR_FINGERPRINT": JSON.stringify(
        contourFingerprint(env.VITE_CONTOUR_FINGERPRINT),
      ),
    },
    server: {
      headers: { "Document-Policy": "js-profiling" },
      port: 5173,
      proxy: PROXY,
    },
    preview: {
      port: 4173,
      headers: { "Document-Policy": "js-profiling" },
      proxy: PROXY,
    },
  };
});
