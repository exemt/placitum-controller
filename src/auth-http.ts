/*
 * API калитки второго фактора: источники входа и профили.
 *
 * Источник -- всё про сам вход (провайдер, форма, сессии, пользователи);
 * профиль -- политика маршрута со ссылкой source. Источники объявляются
 * первыми, профили привязываются к ним -- как корзины и профили у счётчика.
 *
 * Роутер ходит в репозитории напрямую, без слоя state: ни источники, ни
 * профили не участвуют в сборке nginx.conf, и держать их вторым экземпляром
 * в памяти контроллера незачем. Тот же выбор сделан у rules-http.
 *
 * Секретов здесь не проходит ни одного, кроме пароля пользователя: он приходит
 * один раз, тут же хешируется bcrypt и до базы доезжает хешем. Секрет TOTP и
 * пароль служебной записи LDAP приезжают ссылкой на store-объект, который
 * зашифрован в браузере ключом контура.
 */

import bcrypt from "bcryptjs";
import { Router } from "express";
import type { Request, Response } from "express";

import { DocError } from "./auth-doc-util.ts";
import { buildAuthManifest } from "./auth-manifest.ts";
import { normalizeDoc, validateDoc } from "./auth-profile-doc.ts";
import type { AuthProfileRepo } from "./auth-profiles.ts";
import {
  isExternalProvider,
  normalizeSourceDoc,
  validateLoginPage,
  validateSourceDoc,
} from "./auth-source-doc.ts";
import type { AuthSourceRepo } from "./auth-sources.ts";
import {
  DEFAULT_DOC_BASELINE,
  DEFAULT_PROFILE_NAME,
  docDiffersFromBaseline,
  isDefaultRename,
} from "./default-profile.ts";
import type { DesiredStore } from "./desired.ts";
import { sendWriteError } from "./http-error.ts";
import type { InspectorSettingsSource } from "./inspector-settings.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { AuthProfile, AuthProfileDoc } from "./model/auth-profile.ts";
import type { AuthSource, AuthSourceDoc } from "./model/auth-source.ts";
import { scopeOf } from "./scope.ts";
import type { RootState } from "./state/types.ts";
import { authFastPathUses, profileUses, usesDetail } from "./usage.ts";

const NAME_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const LOGIN_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,127}$/;
const MIN_PASSWORD = 8;

function jsonProfile(row: AuthProfile) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    description: row.description,
    source: row.source,
    doc: row.doc,
    modified:
      row.name === DEFAULT_PROFILE_NAME &&
      docDiffersFromBaseline(row.description, row.doc, normalizeDoc),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function jsonSource(row: AuthSource) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    server_id: row.serverId,
    name: row.name,
    description: row.description,
    provider: row.provider,
    doc: row.doc,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function badName(value: unknown): boolean {
  return typeof value !== "string" || !NAME_RE.test(value);
}

export function authRouter(
  getState: () => RootState,
  sources: AuthSourceRepo,
  repo: AuthProfileRepo,
  desired: DesiredStore,
  settingsOf: InspectorSettingsSource,
): Router {
  const router = Router({ mergeParams: true });

  /* --- проверки источника -------------------------------------------------- */

  /*
   * Адрес формы обязан быть локейшеном названного сервера с выключенным waf --
   * иначе вход требует входа. Сверка строковая, и путь, которого на краю нет,
   * ошибкой себя не выдаёт: форма даёт бесконечный редирект без единой записи.
   */
  async function checkPaths(
    scope: string,
    serverId: string | null,
    doc: AuthSourceDoc,
    res: Response,
  ): Promise<boolean> {
    /*
     * У внешнего провайдера формы нет: пустой login.uri значит «401 всем», и
     * сверять его не с чем. Названный адрес -- страница входа приложения, и
     * она обязана быть локейшеном сервера, как форма.
     */
    if (isExternalProvider(doc.provider) && doc.login.uri === "") {
      return true;
    }

    if (serverId === null) {
      res.status(400).json({ error: "server_required" });

      return false;
    }

    const locations = await sources.serverLocations(serverId, scope);

    if (locations === null) {
      res.status(400).json({ error: "unknown_server" });

      return false;
    }

    /*
     * Именованный и регулярный location путём быть не могут: браузеру некуда
     * идти по "@waf_deny", а сравнение -- строковое, не по шаблону.
     */
    const addressable = locations.filter(
      (row) => row.match === "prefix" || row.match === "exact",
    );

    const found = addressable.find((row) => row.path === doc.login.uri);

    if (found === undefined) {
      res.status(400).json({
        error: "unknown_location",
        detail: doc.login.uri,
        locations: addressable.map((row) => row.path),
      });

      return false;
    }

    /*
     * Инспекторы на локации формы больше не проверяются: калитка узнаёт свой
     * адрес сама и отвечает на нём allow (decide: AUTH_SELF), так что
     * рекурсии «вход требует входа» не бывает при любом наборе, а списки,
     * лимиты и modsec на форме только к месту.
     */
    return true;
  }

  /*
   * Источник и есть пространство сессий, поэтому его адрес формы и куки
   * уникальны: два источника с одной session.cookie -- это два множества
   * пользователей, невольно открывающие двери друг друга. То же правило
   * держит реестр инспектора; здесь оно ловится на записи, а не постфактум
   * в apply_failed.
   */
  function cookieOf(name: string, doc: AuthSourceDoc): string {
    return doc.session.cookie !== "" ? doc.session.cookie : `waf_sid_${name}`;
  }

  function ticketOf(name: string, doc: AuthSourceDoc): string {
    return doc.ticket.cookie !== "" ? doc.ticket.cookie : `waf_lgn_${name}`;
  }

  async function checkSourceUnique(
    scope: string,
    selfId: string | null,
    name: string,
    doc: AuthSourceDoc,
    res: Response,
  ): Promise<boolean> {
    for (const row of await sources.list(scope)) {
      if (row.id === selfId) {
        continue;
      }

      // Пустой адрес -- у внешних провайдеров без страницы входа, и он ничей.
      if (doc.login.uri !== "" && row.doc.login.uri === doc.login.uri) {
        res.status(400).json({ error: "login_uri_taken", detail: row.name });

        return false;
      }

      if (cookieOf(row.name, row.doc) === cookieOf(name, doc)) {
        res.status(400).json({ error: "session_cookie_taken", detail: row.name });

        return false;
      }

      if (ticketOf(row.name, row.doc) === ticketOf(name, doc)) {
        res.status(400).json({ error: "ticket_cookie_taken", detail: row.name });

        return false;
      }
    }

    return true;
  }

  /*
   * Своя форма входа -- объект раздела «Страницы». Проверяется на записи, а не
   * только при рассылке: оператор обязан узнать про сломанную форму в тот
   * момент, когда он её выбрал.
   */
  async function checkLoginPage(
    scope: string,
    doc: AuthSourceDoc,
    res: Response,
  ): Promise<boolean> {
    if (doc.login.page === "") {
      return true;
    }

    const page = await sources.loginPage(doc.login.page, scope);

    if (page === null) {
      res.status(400).json({ error: "unknown_login_page", detail: doc.login.page });

      return false;
    }

    if (page.type !== "html") {
      res.status(400).json({ error: "login_page_not_html", detail: page.name });

      return false;
    }

    try {
      validateLoginPage(page.text);
    } catch (err) {
      res.status(400).json({
        error: "invalid_login_page",
        detail: err instanceof Error ? err.message : String(err),
      });

      return false;
    }

    return true;
  }

  /* --- источники ----------------------------------------------------------- */

  router.get("/sources", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      res.json({ sources: (await sources.list(scope)).map(jsonSource) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/sources", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        server_id?: unknown;
        doc?: unknown;
      };

      if (badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      const doc = normalizeSourceDoc(body.doc);
      validateSourceDoc(doc);

      const serverId = asUuid(String(body.server_id ?? "")) ?? null;

      if (!(await checkPaths(scope, serverId, doc, res))) {
        return;
      }

      if (!(await checkSourceUnique(scope, null, body.name as string, doc, res))) {
        return;
      }

      if (!(await checkLoginPage(scope, doc, res))) {
        return;
      }

      const row = await sources.insert({
        httpSpaceId: scope,
        serverId,
        name: body.name as string,
        description: typeof body.description === "string" ? body.description : "",
        doc,
      });

      log("info", "auth source created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonSource(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_source", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.get("/sources/:uuid", async (req: Request, res: Response, next) => {
    try {
      const row = await ownedSource(req, res);

      if (row === null) {
        return;
      }

      res.json({
        ...jsonSource(row),
        uses: await sources.uses(row.httpSpaceId, row.name),
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/sources/:uuid", async (req: Request, res: Response, next) => {
    try {
      const existing = await ownedSource(req, res);

      if (existing === null) {
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        server_id?: unknown;
        doc?: unknown;
      };

      if (body.name !== undefined && badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      /*
       * Переименовать занятый источник нельзя: ссылки на него -- строки
       * doc.source профилей и identity.from соседей, и после переименования
       * они молча повисли бы. Сначала отвязывают, потом переименовывают.
       */
      if (
        typeof body.name === "string" &&
        body.name !== existing.name
      ) {
        const uses = await sources.uses(existing.httpSpaceId, existing.name);

        if (uses.length > 0) {
          res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
          return;
        }
      }

      let doc = undefined;

      if (body.doc !== undefined) {
        doc = normalizeSourceDoc(body.doc);
        validateSourceDoc(doc);
      }

      const serverId =
        body.server_id === undefined
          ? existing.serverId
          : (asUuid(String(body.server_id ?? "")) ?? null);

      /*
       * Проверять надо и смену сервера в одиночку: адрес формы остался
       * прежним, а список локейшенов под ним стал другим.
       */
      if (
        (doc !== undefined || body.server_id !== undefined) &&
        !(await checkPaths(existing.httpSpaceId, serverId, doc ?? existing.doc, res))
      ) {
        return;
      }

      if (
        (doc !== undefined || body.name !== undefined) &&
        !(await checkSourceUnique(
          existing.httpSpaceId,
          existing.id,
          typeof body.name === "string" ? body.name : existing.name,
          doc ?? existing.doc,
          res,
        ))
      ) {
        return;
      }

      if (doc !== undefined && !(await checkLoginPage(existing.httpSpaceId, doc, res))) {
        return;
      }

      const row = await sources.update(existing.id, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        serverId: body.server_id === undefined ? undefined : serverId,
        doc,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "auth source updated", { uuid: row.id, name: row.name });
      res.json(jsonSource(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_source", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.delete("/sources/:uuid", async (req: Request, res: Response, next) => {
    try {
      const existing = await ownedSource(req, res);

      if (existing === null) {
        return;
      }

      const uses = await sources.uses(existing.httpSpaceId, existing.name);

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      await sources.remove(existing.id);
      log("info", "auth source removed", { uuid: existing.id, name: existing.name });
      res.status(204).end();
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /* --- проверки профиля ---------------------------------------------------- */

  /*
   * Ссылка обязана разрешаться уже на записи: профиль с висячим source --
   * это apply_failed на send, то есть та же ошибка, но позже и дороже.
   */
  async function checkSource(
    scope: string,
    doc: AuthProfileDoc,
    res: Response,
  ): Promise<boolean> {
    // Профиль без источника ничего не проверяет: сверять нечего.
    if (doc.source === "") {
      return true;
    }

    const known = await sources.list(scope);

    if (!known.some((row) => row.name === doc.source)) {
      res.status(400).json({
        error: "unknown_source",
        detail: doc.source,
        known: known.map((row) => row.name),
      });

      return false;
    }

    return true;
  }

  /*
   * Запись каталога под отказ «не та группа». Сверяется на записи, потому что
   * увидеть промах иначе можно только в тот момент, когда чужой человек
   * упёрся в закрытый раздел, -- то есть на живом трафике.
   */
  async function checkForbidden(
    scope: string,
    doc: AuthProfileDoc,
    res: Response,
  ): Promise<boolean> {
    if (doc.gate.groups.length === 0) {
      return true;
    }

    const known = new Set(await repo.denyResponses(scope));

    if (!known.has(doc.gate.forbiddenResponse)) {
      res.status(400).json({
        error: "deny_response_unknown",
        detail: doc.gate.forbiddenResponse,
        known: [...known],
      });

      return false;
    }

    return true;
  }

  /*
   * Быстрый путь несовместим с допуском по группам: маршрут с if-условием
   * отвечает локальным слоем, инспектора не спрашивая, -- то есть и групп не
   * проверяя. Раньше пару ловил документ (список и группы жили вместе);
   * теперь список объявлен на источнике, и пара сходится только на маршруте.
   * Ловится с обеих сторон: здесь -- профиль, который закрывают группами при
   * живом условии, в config/send -- условие, которое вешают на закрытый
   * профиль.
   */
  function checkFastPath(
    scope: string,
    name: string,
    doc: AuthProfileDoc,
    res: Response,
  ): boolean {
    if (doc.gate.groups.length === 0) {
      return true;
    }

    const uses = authFastPathUses(getState(), scope, name);

    if (uses.length > 0) {
      res.status(409).json({
        error: "fast_path_gated",
        detail: usesDetail(uses),
        uses,
      });

      return false;
    }

    return true;
  }

  /* --- профили ------------------------------------------------------------- */

  router.get("/profiles", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      res.json({ profiles: (await repo.list(scope)).map(jsonProfile) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/profiles", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        doc?: unknown;
      };

      if (badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      const doc = normalizeDoc(body.doc);
      validateDoc(doc);

      if (!(await checkSource(scope, doc, res))) {
        return;
      }

      if (!(await checkForbidden(scope, doc, res))) {
        return;
      }

      if (!checkFastPath(scope, body.name as string, doc, res)) {
        return;
      }

      const row = await repo.insert({
        httpSpaceId: scope,
        name: body.name as string,
        description: typeof body.description === "string" ? body.description : "",
        doc,
      });

      log("info", "auth profile created", { uuid: row.id, name: row.name });
      res.status(201).json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.get("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const row = await owned(req, res);

      if (row === null) {
        return;
      }

      /*
       * Отправители, которых нет в реестре контура. Правило от такого не
       * сработает никогда, но это не ошибка сохранения: реестр правят отдельно,
       * и профиль, написанный вперёд него, -- нормальный порядок работы.
       * Поэтому замечание едет вместе с карточкой, а не отказом.
       */
      const known = new Set(await repo.inspectorNames(row.httpSpaceId));
      const unknownSenders = [
        ...new Set(
          row.doc.trigger.prior
            .map((rule) => rule.from)
            .filter((from) => from !== "*" && !known.has(from)),
        ),
      ];

      /*
       * Поводы, которые отправители контура адресуют калитке, -- подсказка
       * автодополнения в правилах prior. Только из профилей, которые держит
       * контроллер: список неполон по построению, и поле остаётся свободным.
       */
      const senderCodes = await repo.senderCodes(row.httpSpaceId);

      res.json({
        ...jsonProfile(row),
        unknown_senders: unknownSenders,
        sender_codes: senderCodes,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const existing = await owned(req, res);

      if (existing === null) {
        return;
      }

      const body = req.body as {
        name?: unknown;
        description?: unknown;
        doc?: unknown;
      };

      if (body.name !== undefined && badName(body.name)) {
        res.status(400).json({ error: "invalid_name" });
        return;
      }

      /*
       * Переименовать default нельзя: объявление без `profile=` ищет профиль
       * по этому имени, и переименование оставило бы поколение без точки
       * опоры -- ровно то же, что удаление. Само содержимое правится: default
       * -- рабочая политика пространства, а не запертый образец. Чем он
       * поставлен и как вернуть его назад -- `default-profile.ts`.
       */
      if (isDefaultRename(existing.name, body.name)) {
        res.status(400).json({ error: "default_name_locked" });
        return;
      }

      let doc = undefined;

      if (body.doc !== undefined) {
        doc = normalizeDoc(body.doc);
        validateDoc(doc);
      }

      if (doc !== undefined && !(await checkSource(existing.httpSpaceId, doc, res))) {
        return;
      }

      if (doc !== undefined && !(await checkForbidden(existing.httpSpaceId, doc, res))) {
        return;
      }

      if (
        doc !== undefined &&
        !checkFastPath(
          existing.httpSpaceId,
          typeof body.name === "string" ? body.name : existing.name,
          doc,
          res,
        )
      ) {
        return;
      }

      const row = await repo.update(existing.id, {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        doc,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "auth profile updated", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  /*
   * Вернуть default к поставке -- к тому, чем он пришёл из
   * schema/02-seed.sql. Отдельная ручка, а не PUT с телом образца:
   * панель не обязана знать, чем профиль поставлен, образец держит
   * `default-profile.ts`, и возвращает его тот же, кто его держит.
   */
  router.post("/profiles/:uuid/restore", async (req: Request, res: Response, next) => {
    try {
      const existing = await owned(req, res);

      if (existing === null) {
        return;
      }

      /*
       * Возвращать к поставке нечего у своего профиля: он не приходил из
       * сида, и «как было» у него нет.
       */
      if (existing.name !== DEFAULT_PROFILE_NAME) {
        res.status(400).json({ error: "not_default" });
        return;
      }

      const doc = normalizeDoc(DEFAULT_DOC_BASELINE.doc);
      validateDoc(doc);

      const row = await repo.update(existing.id, {
        description: DEFAULT_DOC_BASELINE.description,
        doc,
      });

      if (row === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      log("info", "auth profile restored", { uuid: row.id, name: row.name });
      res.json(jsonProfile(row));
    } catch (err) {
      if (err instanceof DocError) {
        res.status(400).json({ error: "invalid_profile", detail: err.message });
        return;
      }

      sendWriteError(err, res, next);
    }
  });

  router.delete("/profiles/:uuid", async (req: Request, res: Response, next) => {
    try {
      const existing = await owned(req, res);

      if (existing === null) {
        return;
      }

      /*
       * Набор без default инспектор не примет: маршрут, не назвавший профиль,
       * останется без калитки. Отказываем здесь, а не после send.
       */
      if (existing.name === "default") {
        res.status(409).json({ error: "default_required" });
        return;
      }

      /* Профиль держат маршруты: `profile=` объявления. */
      const uses = profileUses(
        getState(),
        existing.httpSpaceId,
        "auth",
        existing.name,
      );

      if (uses.length > 0) {
        res.status(409).json({ error: "in_use", detail: usesDetail(uses), uses });
        return;
      }

      await repo.remove(existing.id);
      log("info", "auth profile removed", { uuid: existing.id, name: existing.name });
      res.status(204).end();
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /* --- пользователи провайдера local -------------------------------------- */

  /*
   * Пользователи живут в обычном списке строк раздела данных, и правят их там
   * же. Контроллеру остаётся одно, чего список сам не умеет: посчитать bcrypt.
   * Открытый пароль приходит сюда один раз, уходит отсюда хешем и не
   * сохраняется нигде -- ни в базе, ни в логе.
   */
  router.post("/user-line", async (req: Request, res: Response, next) => {
    try {
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const body = req.body as {
        login?: unknown;
        password?: unknown;
        groups?: unknown;
        totp_store?: unknown;
      };

      if (typeof body.login !== "string" || !LOGIN_RE.test(body.login)) {
        res.status(400).json({ error: "invalid_login" });
        return;
      }

      if (typeof body.password !== "string" || body.password.length < MIN_PASSWORD) {
        res.status(400).json({ error: "weak_password", min: MIN_PASSWORD });
        return;
      }

      const groups = Array.isArray(body.groups)
        ? body.groups.filter((item): item is string => typeof item === "string")
        : [];

      if (groups.some((item) => item.includes(":") || item.includes(","))) {
        res.status(400).json({ error: "invalid_group" });
        return;
      }

      const store =
        typeof body.totp_store === "string" && body.totp_store !== ""
          ? (asUuid(body.totp_store) ?? null)
          : null;

      if (typeof body.totp_store === "string" && body.totp_store !== "" && store === null) {
        res.status(400).json({ error: "invalid_totp_store" });
        return;
      }

      const hash = await bcrypt.hash(body.password, 12);

      const parts = [body.login, hash];

      if (groups.length > 0 || store !== null) {
        parts.push(groups.join(","));
      }

      if (store !== null) {
        parts.push(store);
      }

      res.json({ line: parts.join(":") });
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /* --- поколение ---------------------------------------------------------- */

  router.get("/desired", async (req: Request, res: Response, next) => {
    try {
      if (scopeOf(req) === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const manifest = await desired.getAuth();

      if (manifest === null) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(manifest);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.post("/send", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      /*
       * rev растёт на каждый успешный send и берётся из того, что уже лежит в
       * KV: контроллер историю поколений не хранит, а откат -- это повторный
       * send предыдущего состава.
       */
      const current = await desired.getAuth();
      const built = await buildAuthManifest(
        sources,
        repo,
        scope,
        (current?.rev ?? 0) + 1,
        settingsOf,
      );

      if ("error" in built) {
        res.status(400).json(built);
        return;
      }

      await desired.putAuth(built.manifest);

      log("info", "auth sent", {
        space: scope,
        rev: built.manifest.rev,
        hash: built.manifest.config_hash,
        sources: Object.keys(built.manifest.sources),
        profiles: Object.keys(built.manifest.profiles),
      });

      res.json(built.manifest);
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /* --- общее -------------------------------------------------------------- */

  async function owned(req: Request, res: Response): Promise<AuthProfile | null> {
    const scope = scopeOf(req);
    const id = asUuid(req.params.uuid);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return null;
    }

    if (id === undefined) {
      res.status(400).json({ error: "invalid_uuid" });
      return null;
    }

    const row = await repo.get(id);

    if (row === null || row.httpSpaceId !== scope) {
      res.status(404).json({ error: "not_found" });
      return null;
    }

    return row;
  }

  async function ownedSource(req: Request, res: Response): Promise<AuthSource | null> {
    const scope = scopeOf(req);
    const id = asUuid(req.params.uuid);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return null;
    }

    if (id === undefined) {
      res.status(400).json({ error: "invalid_uuid" });
      return null;
    }

    const row = await sources.get(id);

    if (row === null || row.httpSpaceId !== scope) {
      res.status(404).json({ error: "not_found" });
      return null;
    }

    return row;
  }

  return router;
}
