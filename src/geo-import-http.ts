/**
 * Загрузка выгрузки MaxMind из панели (geo-import.ts) и раздача файла кодеру.
 *
 *   POST /api/:scope/geo/import/:kind   тело -- файл .mmdb; 202 и задача
 *   GET  /api/:scope/geo/import         задачи, загруженные файлы, кодер
 *   GET  /api/geo/files/:kind           файл кодеру
 *
 * Файлы -- не под пространством: кодер один на контур и пространств не
 * знает, как и уровни журнала (log-levels-http.ts).
 */

import express, { Router, type NextFunction, type Request, type Response } from "express";

import type { DesiredStore } from "./desired.ts";
import {
  GEO_KINDS,
  isGeoKind,
  type GeoDoc,
  type GeoFileMeta,
  type GeoFileRepo,
} from "./geo-files.ts";
import {
  GEO_UPLOAD_MAX_BYTES,
  GeoImportError,
  type GeoImportJob,
  type GeoImports,
} from "./geo-import.ts";
import type { GeoKind } from "./geo-sql.ts";
import type { ServiceRecord } from "./model/fleet.ts";
import { scopeOf } from "./scope.ts";

/** Имя кодера в кадре присутствия (`WAF_SERVICE_NAME` у geo, умолчание). */
export const GEO_SERVICE = "geo";

/** Кадр кодера называет файл, по которому тот отвечает сейчас. */
const CODER_SHA: Record<GeoKind, "country_sha256" | "asn_sha256"> = {
  country: "country_sha256",
  asn: "asn_sha256",
};

function jsonJob(job: GeoImportJob) {
  return {
    kind: job.kind,
    space_id: job.spaceId,
    state: job.state,
    phase: job.phase,
    sha256: job.file.sha256,
    size: job.file.size,
    database_type: job.file.databaseType,
    build_epoch: job.file.buildEpoch,
    networks: job.networks,
    keys: job.keys,
    added: job.added,
    removed: job.removed,
    started_at: job.startedAt.toISOString(),
    ...(job.finishedAt === undefined
      ? {}
      : { finished_at: job.finishedAt.toISOString(), took_ms: job.tookMs }),
    ...(job.error === undefined
      ? {}
      : { error: job.error, ...(job.detail === undefined ? {} : { detail: job.detail }) }),
  };
}

function jsonFile(file: GeoFileMeta, doc: GeoDoc | null, coders: ServiceRecord[]) {
  const key = CODER_SHA[file.kind];

  return {
    sha256: file.sha256,
    size: file.size,
    database_type: file.databaseType,
    build_epoch: file.buildEpoch,
    uploaded_at: file.uploadedAt.toISOString(),
    /* Документ policy/geo называет этот файл: кодер о нём знает. */
    published: doc?.[file.kind]?.sha256 === file.sha256,
    /* Сколько живых копий кодера отвечает по этому файлу. */
    coders: coders.filter((row) => row.work?.[key] === file.sha256).length,
  };
}

/* Тело -- файл как есть. Тип не сверяется: у .mmdb своего MIME нет. */
const readRaw = express.raw({ type: () => true, limit: GEO_UPLOAD_MAX_BYTES });

function readFile(req: Request, res: Response, next: NextFunction): void {
  readRaw(req, res, (err?: unknown) => {
    if (err === undefined || err === null) {
      next();
      return;
    }

    if ((err as { status?: unknown }).status === 413) {
      res.status(413).json({ error: "file_too_large", detail: String(GEO_UPLOAD_MAX_BYTES) });
      return;
    }

    res.status(400).json({ error: "file_unreadable" });
  });
}

export function geoImportRouter(deps: {
  imports: GeoImports;
  files: GeoFileRepo;
  desired: DesiredStore;
  /** Живые копии кодера: по их кадрам видно, кто уже на новом файле. */
  coders: () => ServiceRecord[];
}): Router {
  const router = Router({ mergeParams: true });

  router.post(
    "/:kind",
    (req, res, next) => {
      // Путь проверяется до чтения тела: 64 МБ в память ради опечатки в пути незачем.
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      if (!isGeoKind(req.params.kind)) {
        res.status(404).json({ error: "unknown_kind" });
        return;
      }

      next();
    },
    readFile,
    (req, res, next) => {
      const scope = scopeOf(req) as string;
      const kind = req.params.kind as GeoKind;
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

      try {
        const job = deps.imports.start(kind, scope, body);
        res.status(202).json({ job: jsonJob(job) });
      } catch (err) {
        if (err instanceof GeoImportError) {
          res.status(err.status).json({
            error: err.code,
            ...(err.detail === undefined ? {} : { detail: err.detail }),
          });
          return;
        }

        next(err);
      }
    },
  );

  router.get("/", async (req, res, next) => {
    try {
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const rows = await deps.files.list();
      /* KV недоступен -- файлы и задачи всё равно показать: «кодер не знает» видно и так. */
      const doc = await deps.desired.getGeo().catch(() => null);
      const coders = deps.coders();
      const jobs: Record<string, ReturnType<typeof jsonJob> | null> = {};
      const files: Record<string, ReturnType<typeof jsonFile> | null> = {};

      for (const kind of GEO_KINDS) {
        const job = deps.imports.job(kind);
        const file = rows.find((row) => row.kind === kind);

        jobs[kind] = job === undefined ? null : jsonJob(job);
        files[kind] = file === undefined ? null : jsonFile(file, doc, coders);
      }

      res.json({ jobs, files, coder: { replicas: coders.length, rev: doc?.rev ?? 0 } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function geoFilesRouter(files: GeoFileRepo): Router {
  const router = Router();

  router.get("/:kind", async (req, res, next) => {
    try {
      const kind = req.params.kind;

      if (!isGeoKind(kind)) {
        res.status(404).json({ error: "unknown_kind" });
        return;
      }

      const row = await files.data(kind);

      if (row === null) {
        res.status(404).json({ error: "geo_file_missing" });
        return;
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", String(row.data.length));
      res.setHeader("ETag", `"${row.meta.sha256}"`);
      res.setHeader("X-Geo-Sha256", row.meta.sha256);
      res.end(row.data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
