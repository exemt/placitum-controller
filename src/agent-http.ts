/**
 * `/api/:scope/agent` -- настройки агента контура.
 *
 * Раскладка та же, что у `/config`: PUT сохраняет черновик, `send` публикует
 * его в KV. Сохранить не значит раскатать -- правило контроллера, и у этого
 * документа оно тем более уместно: агент применяет настройку на лету, и
 * «сохранил на полпути» не должно означать «уже поехало на флот».
 *
 * Ревизия берётся из KV, а не из базы: источник истины о том, какое поколение
 * стоит на флоте, -- само поколение. Хеш не изменился -- ничего не публикуем,
 * иначе каждое нажатие «отправить» выглядело бы новой настройкой в пульсе.
 */

import { Router } from "express";

import type { AgentSettingsRepo } from "./agent-settings.ts";
import {
  jsonAgentSettings,
  parseAgentSettingsBody,
} from "./agent-settings-parse.ts";
import {
  buildAgentConf,
  hashAgentConf,
  jsonAgentConf,
} from "./compile/agent-conf.ts";
import type { DesiredStore } from "./desired.ts";
import { log } from "./log.ts";
import { scopeOf } from "./scope.ts";

export function agentRouter(
  repo: AgentSettingsRepo,
  desired: DesiredStore,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await repo.get(scope);
      res.json({
        settings: jsonAgentSettings(row.settings),
        updated_at: row.updatedAt?.toISOString() ?? null,
        /**
         * Хеш сохранённого черновика: панель сравнивает его с ревизией на
         * флоте и показывает «не отправлено», не пересчитывая ничего сама.
         */
        sha256: hashAgentConf(row.settings),
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const parsed = parseAgentSettingsBody(req.body);

      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const row = await repo.save(scope, parsed.value);
      log("info", "agent settings saved", { scope });
      res.json({
        settings: jsonAgentSettings(row.settings),
        updated_at: row.updatedAt?.toISOString() ?? null,
        sha256: hashAgentConf(row.settings),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/send", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const row = await repo.get(scope);
      const hash = hashAgentConf(row.settings);
      const current = await desired.getAgentConf().catch(() => null);

      if (current !== null && current.sha256 === hash) {
        // Документ тот же -- ревизия не растёт, но рассылка состоялась.
        await desired.markPublished("agent");
        res.json(jsonAgentConf(current));
        return;
      }

      const pointer = buildAgentConf(row.settings, (current?.rev ?? 0) + 1);
      await desired.putAgentConf(pointer);

      log("info", "agent conf sent", {
        scope,
        rev: pointer.rev,
        sha256: pointer.sha256,
      });
      res.json(jsonAgentConf(pointer));
    } catch (err) {
      next(err);
    }
  });

  router.get("/desired", async (_req, res, next) => {
    try {
      const pointer = await desired.getAgentConf();
      if (pointer === null) {
        res.json({ rev: null, sha256: null });
        return;
      }
      res.json(jsonAgentConf(pointer));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
