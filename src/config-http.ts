import { Router } from "express";

import type { NginxCompiler } from "./compile.ts";
import { jsonSendNginxPack } from "./compile/nginx-pack.ts";
import {
  applyDraft,
  DraftParseError,
  type DraftOverlay,
} from "./compile/nginx-draft.ts";
import { previewBlock, type PreviewNode } from "./compile/nginx-preview.ts";
import { NginxCompileError, WafCompileError } from "./compile/nginx-http.ts";
import {
  certificateStoreIds,
  compileNginx,
  exportNginx,
  validateNginxExport,
} from "./compile/nginx.ts";
import { actionReceiverWarnings } from "./compile/action-receivers.ts";
import { loadActionTargets } from "./action-targets.ts";
import { gatedFastPathHits, loadGatedAuthProfiles } from "./auth-guard.ts";
import { log } from "./log.ts";
import { scopeOf } from "./scope.ts";
import type { Pool } from "./db.ts";

/** Узел превью из тела запроса; всё незнакомое -- файл целиком. */
function previewNodeOf(node: { kind?: string; uuid?: string } | undefined): PreviewNode | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (node.kind === "http") {
    return { kind: "http" };
  }
  if (
    (node.kind === "server" || node.kind === "location" || node.kind === "upstream") &&
    typeof node.uuid === "string"
  ) {
    return { kind: node.kind, uuid: node.uuid };
  }
  return undefined;
}

/**
 * POST /api/:scope/config/send -- compile + pack + publish nginx config.
 * GET  /api/:scope/config/desired -- current pointer summary.
 */
export function configRouter(pool: Pool, nginxCompiler: NginxCompiler): Router {
  const router = Router({ mergeParams: true });

  router.post("/send", async (req, res, next) => {
    try {
      const scopeUuid = scopeOf(req);

      if (scopeUuid === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const source = await exportNginx(pool, scopeUuid);

      /*
       * Быстрый путь на закрытом профиле калитки: условие отвечает локальным
       * слоем и пропускает проверку групп. Пара сходится только на маршруте,
       * поэтому проверяется здесь -- по тому же экспорту, что и компиляция.
       */
      const gatedHits = gatedFastPathHits(
        source,
        await loadGatedAuthProfiles(pool, scopeUuid),
      );

      if (gatedHits.length > 0) {
        res.status(422).json({
          error: "validation_failed",
          errors: gatedHits.map((hit) => ({
            code: "auth_fast_path_gated",
            message:
              `waf_inspect ${hit.inspector} on ${hit.at}: profile ` +
              `"${hit.profile}" gates by groups, and an "if" condition would ` +
              `skip the group check`,
          })),
        });
        return;
      }

      const result = await nginxCompiler.compile(source);

      if (result.errors.length > 0) {
        res.status(422).json({
          error: "validation_failed",
          errors: result.errors,
        });
        return;
      }

      /*
       * Предупреждения не держат рассылку: конфиг корректен, а просьба без
       * получателя -- это мёртвая настройка, а не поломка. Но сказать о ней
       * надо здесь, а не в проде: на краю она видна только строкой в waf.log,
       * и то однажды на воркер.
       */
      const warnings = actionReceiverWarnings(
        source,
        await loadActionTargets(pool, scopeUuid, source.space.waf?.inspectors ?? {}),
      );

      log("info", "nginx config sent", {
        scope: scopeUuid,
        sha256: result.sha256,
        rev: result.pointer?.rev,
        store_refs: result.storeRefs.length,
        warnings: warnings.length,
      });

      res.json({
        sha256: result.sha256,
        ...(result.pointer ? jsonSendNginxPack(result.pointer) : {}),
        store_refs: result.storeRefs.length,
        warnings,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/preview", async (req, res, next) => {
    try {
      const scopeUuid = scopeOf(req);

      if (scopeUuid === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const source = await exportNginx(pool, scopeUuid);
      try {
        res.type("text/plain").send(compileNginx(source).text);
      } catch (err) {
        // Незакомпилировавшееся дерево -- состояние конфигурации, а не сбой
        // процесса: оператору нужно прочитать причину, а не увидеть 500.
        if (err instanceof NginxCompileError || err instanceof WafCompileError) {
          res.status(422).json({
            error: "compile_failed",
            errors:
              err instanceof NginxCompileError
                ? err.names.map((name) => ({
                    code: err.code,
                    message: `inspector "${name}" is not in the catalog`,
                  }))
                : [{ code: err.code, message: err.message, ...(err.params ? { params: err.params } : {}) }],
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  /**
   * Превью несохранённой карточки. Тот же компилятор, что печатает файл на
   * `send`, и никакого второго на клиенте: текст на экране обязан быть тем,
   * который уедет.
   *
   * Тело: `{ draft, node }`. `draft` -- одна открытая карточка поверх дерева
   * из базы, `node` -- какой блок показать: `http` (файл, серверы и апстримы
   * заглушками `include` по uuid), `server` / `location` / `upstream` с
   * `uuid` -- сам блок, пути сервера тоже заглушками. Без `node` возвращается
   * файл целиком, как его напечатает `send`, -- им засевают «Свой конфиг».
   * Ошибки компиляции не 500: незаконченная правка -- нормальное состояние
   * формы, и её надо показать оператору, а не спрятать.
   */
  router.post("/preview", async (req, res, next) => {
    try {
      const scopeUuid = scopeOf(req);

      if (scopeUuid === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const body = (req.body ?? {}) as {
        draft?: DraftOverlay;
        node?: { kind?: string; uuid?: string };
      };

      const exported = await exportNginx(pool, scopeUuid);

      let source;
      try {
        source = applyDraft(exported, body.draft ?? {});
      } catch (err) {
        if (err instanceof DraftParseError) {
          res.status(400).json({ error: err.code });
          return;
        }
        throw err;
      }

      let block: string;
      try {
        block = previewBlock(source, previewNodeOf(body.node));
      } catch (err) {
        if (err instanceof NginxCompileError || err instanceof WafCompileError) {
          res.json({
            text: "",
            errors:
              err instanceof NginxCompileError
                ? err.names.map((name) => ({
                    code: err.code,
                    message: `inspector "${name}" is not in the catalog`,
                  }))
                : [{ code: err.code, message: err.message, ...(err.params ? { params: err.params } : {}) }],
          });
          return;
        }
        throw err;
      }

      const storeIds = certificateStoreIds(source);

      // Черновик карточки проверяется целиком, поэтому и предупреждения тут те
      // же, что уедут с рассылкой: оператор видит их до сохранения.
      const warnings = actionReceiverWarnings(
        source,
        await loadActionTargets(pool, scopeUuid, source.space.waf?.inspectors ?? {}),
      );

      res.json({
        text: block,
        errors: validateNginxExport(source, storeIds),
        warnings,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/desired", async (_req, res, next) => {
    try {
      const pointer = await nginxCompiler["desired"]?.getNginxPack();
      if (pointer === null || pointer === undefined) {
        res.json({ rev: null });
        return;
      }
      res.json(jsonSendNginxPack(pointer));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
