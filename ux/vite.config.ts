import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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

export default defineConfig({
  plugins: [react()],
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
});
