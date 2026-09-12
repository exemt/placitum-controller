import { createHash, createPublicKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Пин fingerprint ключа контура (см. src/crypto/seal.ts). В образе он
 * приходит переменной сборки из deploy/.env, но dev-сервер запускается прямо
 * здесь и того файла не читает -- вторую копию значения пришлось бы держать
 * в ux/.env и не забывать обновлять после смены ключа.
 *
 * Вместо копии считаем fingerprint из самого deploy/secrets/contour.pub:
 * это тот же файл, который отдаёт контроллер в GET /api/<scope>/crypto,
 * поэтому в dev пин не может разойтись с ключом в принципе.
 *
 * Приоритет: ux/.env -> переменная окружения (сборка образа) -> сам ключ.
 * Пустая строка -- ключа нет и переменной нет: UX покажет «пин не задан».
 */
function contourFingerprint(fromEnvFile: string | undefined): string {
  if (fromEnvFile !== undefined && fromEnvFile !== "") {
    return fromEnvFile;
  }

  const fromProcess = process.env.VITE_CONTOUR_FINGERPRINT;
  if (fromProcess !== undefined && fromProcess !== "") {
    return fromProcess;
  }

  // Внутри сборки образа этого пути нет: контекст -- controller/, не корень
  // репозитория. Тогда работает ветка выше.
  const pub = fileURLToPath(
    new URL("../../deploy/secrets/contour.pub", import.meta.url),
  );
  if (!existsSync(pub)) {
    return "";
  }

  const der = createPublicKey(readFileSync(pub, "utf8")).export({
    type: "spki",
    format: "der",
  });

  return "sha256:" + createHash("sha256").update(der).digest("hex");
}

/* Один прокси на dev и preview: API и живой сокет присутствия -- в контроллер. */
const PROXY = {
  "/api": {
    target: "http://127.0.0.1:8080",
    changeOrigin: true,
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
      /*
       * JS Self-Profiling API (new Profiler(...)) только для dev: без этого
       * заголовка Chromium не даёт семплировать стек и искать, где виджет
       * пути блокирует поток на секунды. На прод-сборку не влияет --
       * заголовок ставит dev-сервер, а не nginx.
       */
      headers: { "Document-Policy": "js-profiling" },
      port: 5173,
      proxy: PROXY,
    },
    /*
     * `vite preview` -- прод-сборка из dist с тем же прокси: единственный
     * честный способ померить панель без dev-накладных React/MUI.
     */
    preview: {
      port: 4173,
      headers: { "Document-Policy": "js-profiling" },
      proxy: PROXY,
    },
  };
});
