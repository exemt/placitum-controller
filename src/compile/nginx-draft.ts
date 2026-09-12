/**
 * Наложение несохранённой карточки на экспорт пространства.
 *
 * Превью в панели показывает то, что оператор сейчас правит, а `exportNginx`
 * читает Postgres -- то, что сохранено. Разница между ними и есть смысл кнопки
 * «Сохранить», поэтому печатать превью из базы нельзя, а печатать его вторым
 * компилятором на клиенте -- значит завести второй компилятор, который
 * разойдётся с настоящим. Правильный шов здесь: настоящий компилятор,
 * которому дали дерево с одной подменённой веткой.
 *
 * Подменяется ровно одна карточка -- та, что открыта. Правок в двух карточках
 * одновременно в UX не бывает: форма модальна.
 */

import type { CertificateKind } from "../model/listen.ts";
import {
  parseNginx,
  parseNginxLocation,
  parseNginxMain,
  parseNginxServer,
  parseWaf,
  parseWafHttp,
  type ParseResult,
} from "../space-settings-parse.ts";
import { parseUpstreamCreate } from "../upstreams-parse.ts";
import type { NginxExport, ServerExport } from "./nginx-source.ts";

/** Ошибка разбора черновика: незаконченная правка, а не сбой сервера. */
export class DraftParseError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "DraftParseError";
  }
}

/**
 * Черновик проходит теми же парсерами, что и `PUT`: превью обязано показывать
 * то, что сохранится, а не то, что прислал браузер. Кривой документ здесь --
 * ошибка формы, и она возвращается оператору.
 */
function parsed<T>(next: unknown, prev: T, parse: (v: unknown) => ParseResult<T>): T {
  if (next === undefined) {
    return prev;
  }
  const result = parse(next);
  if (!result.ok) {
    throw new DraftParseError(result.error);
  }
  return result.value;
}

export interface DraftOverlay {
  /** Документы пространства: любой из четырёх, остальные берутся из базы. */
  http?: {
    nginx?: Record<string, unknown>;
    nginx_main?: Record<string, unknown>;
    waf_http?: Record<string, unknown>;
    waf?: Record<string, unknown>;
    raw?: boolean;
    raw_nginx?: string;
  };
  server?: {
    /** Пустой -- карточка ещё не сохранена: сервер появляется в дереве целиком. */
    uuid: string;
    nginx?: Record<string, unknown>;
    waf?: Record<string, unknown>;
    server_names?: string[];
    enabled?: boolean;
    raw?: boolean;
    raw_nginx?: string;
    /**
     * Привязки карточки: порт по uuid из каталога пространства, сертификат --
     * по uuid и назначению. Без них превью печатало бы сохранённые `listen`
     * поверх правленых полей: привязки сохраняются отдельными запросами, и до
     * «Сохранить» их видит только форма.
     */
    listens?: { port_id: string; default_server?: boolean }[];
    certificates?: { certificate_id: string; kind: string }[];
  };
  /**
   * Пул: тот же документ, что уходит в `POST /upstreams`, плюс uuid (пустой
   * у новой карточки). Разбирается тем же парсером, что и запись.
   */
  upstream?: { uuid: string } & Record<string, unknown>;
  location?: {
    uuid: string;
    /** Новая карточка ещё не в базе: чтобы её увидеть, нужен сервер-владелец. */
    server_id?: string;
    nginx?: Record<string, unknown>;
    waf?: Record<string, unknown>;
    match?: string;
    path?: string;
    position?: number;
    enabled?: boolean;
    handler?: string;
    protocol?: string;
    upstream_id?: string | null;
    upstream_uri?: string | null;
    return_status?: number | null;
    return_page?: string | null;
    return_url?: string | null;
    raw?: boolean;
    raw_nginx?: string;
  };
}

/** Значение ключа, если оно задано; иначе прежнее. `null` в jsonb не кладём. */
function pick<T>(next: T | undefined, prev: T): T {
  return next === undefined ? prev : next;
}

export function applyDraft(source: NginxExport, draft: DraftOverlay): NginxExport {
  let out = source;

  if (draft.http !== undefined) {
    const h = draft.http;
    out = {
      ...out,
      space: {
        ...out.space,
        nginx: parsed(h.nginx, out.space.nginx, parseNginx),
        nginxMain: parsed(h.nginx_main, out.space.nginxMain, parseNginxMain),
        wafHttp: parsed(h.waf_http, out.space.wafHttp, parseWafHttp),
        waf: parsed(h.waf, out.space.waf, parseWaf),
        raw: pick(h.raw, out.space.raw),
        rawNginx: pick(h.raw_nginx, out.space.rawNginx),
      },
    };
  }

  if (draft.server !== undefined) {
    const d = draft.server;
    const known = out.servers.some((srv) => srv.server.id === d.uuid);
    out = {
      ...out,
      servers: known
        ? out.servers.map((srv) => (srv.server.id === d.uuid ? withServer(out, srv, d) : srv))
        : [...out.servers, withServer(out, freshServer(out, d.uuid), d)],
    };
  }

  if (draft.upstream !== undefined) {
    out = { ...out, upstreams: withUpstream(out, draft.upstream) };
  }

  if (draft.location !== undefined) {
    out = { ...out, servers: out.servers.map((srv) => withLocation(srv, draft.location!)) };
  }

  return out;
}

/** Карточка ещё не сохранена: сервер без привязок и путей, документ -- из черновика. */
function freshServer(source: NginxExport, uuid: string): ServerExport {
  return {
    server: {
      id: uuid,
      httpSpaceId: source.space.id,
      name: "",
      serverNames: [],
      enabled: true,
      nginx: {},
      waf: {},
      raw: false,
      rawNginx: "",
    },
    listens: [],
    certificates: [],
    locations: [],
  };
}

function withServer(
  source: NginxExport,
  srv: ServerExport,
  d: NonNullable<DraftOverlay["server"]>,
): ServerExport {
  const serverNames = pick(d.server_names, srv.server.serverNames);
  const server = {
    ...srv.server,
    // Имя карточки панель берёт из первого hostname; у новой оно ещё пусто.
    name: srv.server.name !== "" ? srv.server.name : (serverNames[0] ?? ""),
    nginx: parsed(d.nginx, srv.server.nginx, parseNginxServer),
    waf: parsed(d.waf, srv.server.waf, parseWaf),
    serverNames,
    enabled: pick(d.enabled, srv.server.enabled),
    raw: pick(d.raw, srv.server.raw),
    rawNginx: pick(d.raw_nginx, srv.server.rawNginx),
  };
  return {
    ...srv,
    server,
    listens: d.listens === undefined ? srv.listens : listensOf(source, server.id, d.listens),
    certificates:
      d.certificates === undefined
        ? srv.certificates
        : certificatesOf(source, server.id, d.certificates),
  };
}

/*
 * Привязки черновика разворачиваются по каталогам пространства: порт и
 * сертификат панель выбирает из них же, поэтому неизвестный uuid -- не
 * «пропустить», а ошибка формы, как и кривой документ.
 */
function listensOf(
  source: NginxExport,
  serverId: string,
  rows: NonNullable<NonNullable<DraftOverlay["server"]>["listens"]>,
): ServerExport["listens"] {
  return rows.map((row) => {
    const port = source.ports.find((item) => item.id === row.port_id);
    if (port === undefined) {
      throw new DraftParseError("unknown_port");
    }
    return {
      id: "",
      serverId,
      portId: port.id,
      ssl: false,
      http2: false,
      proxyProtocol: false,
      defaultServer: row.default_server === true,
      port,
    };
  });
}

const CERTIFICATE_KINDS: readonly string[] = ["server", "client_ca", "trusted"];

function certificatesOf(
  source: NginxExport,
  serverId: string,
  rows: NonNullable<NonNullable<DraftOverlay["server"]>["certificates"]>,
): ServerExport["certificates"] {
  return rows.map((row) => {
    const certificate = source.certificates.find((item) => item.id === row.certificate_id);
    if (certificate === undefined) {
      throw new DraftParseError("unknown_certificate");
    }
    if (!CERTIFICATE_KINDS.includes(row.kind)) {
      throw new DraftParseError("invalid_certificate_kind");
    }
    return {
      id: "",
      serverId,
      certificateId: certificate.id,
      kind: row.kind as CertificateKind,
      certificate,
    };
  });
}

/**
 * Пул черновика заменяет сохранённый с тем же uuid либо добавляется к списку
 * (новая карточка). Документ идёт через парсер записи целиком: у пула нет
 * частичных правок, форма присылает его весь.
 */
function withUpstream(
  source: NginxExport,
  d: NonNullable<DraftOverlay["upstream"]>,
): NginxExport["upstreams"] {
  const { uuid, ...body } = d;
  const result = parseUpstreamCreate(body, source.space.id);
  if (!result.ok) {
    throw new DraftParseError(result.error);
  }
  const { httpSpaceId: _space, ...row } = result.value;
  const next: NginxExport["upstreams"][number] = { id: uuid, ...row };
  const known = source.upstreams.some((up) => up.id === uuid);
  return known
    ? source.upstreams.map((up) => (up.id === uuid ? next : up))
    : [...source.upstreams, next];
}

function withLocation(
  srv: ServerExport,
  d: NonNullable<DraftOverlay["location"]>,
): ServerExport {
  const index = srv.locations.findIndex((loc) => loc.id === d.uuid);

  if (index < 0) {
    // Карточка ещё не сохранена: её видно только в сервере, который её создаёт.
    if (d.server_id !== srv.server.id) {
      return srv;
    }
    const fresh = {
      id: d.uuid,
      serverId: srv.server.id,
      match: (d.match ?? "prefix") as ServerExport["locations"][number]["match"],
      path: d.path ?? "/",
      position: d.position ?? 0,
      enabled: d.enabled ?? true,
      handler: (d.handler ?? "proxy") as ServerExport["locations"][number]["handler"],
      protocol: (d.protocol ?? "http") as ServerExport["locations"][number]["protocol"],
      upstreamId: d.upstream_id ?? undefined,
      upstreamUri: d.upstream_uri ?? undefined,
      returnStatus: d.return_status ?? undefined,
      returnPage: d.return_page ?? undefined,
      returnUrl: d.return_url ?? undefined,
      nginx: parsed(d.nginx, {}, parseNginxLocation),
      waf: parsed(d.waf, {}, parseWaf),
      raw: d.raw ?? false,
      rawNginx: d.raw_nginx ?? "",
      builtin: false,
    };
    return {
      ...srv,
      locations: [...srv.locations, fresh].sort((a, b) => a.position - b.position),
    };
  }

  const prev = srv.locations[index];
  const next = {
    ...prev,
    match: pick(d.match, prev.match) as typeof prev.match,
    path: pick(d.path, prev.path),
    position: pick(d.position, prev.position),
    enabled: pick(d.enabled, prev.enabled),
    handler: pick(d.handler, prev.handler) as typeof prev.handler,
    protocol: pick(d.protocol, prev.protocol) as typeof prev.protocol,
    upstreamId: d.upstream_id === undefined ? prev.upstreamId : (d.upstream_id ?? undefined),
    upstreamUri: d.upstream_uri === undefined ? prev.upstreamUri : (d.upstream_uri ?? undefined),
    returnStatus:
      d.return_status === undefined ? prev.returnStatus : (d.return_status ?? undefined),
    returnPage: d.return_page === undefined ? prev.returnPage : (d.return_page ?? undefined),
    returnUrl: d.return_url === undefined ? prev.returnUrl : (d.return_url ?? undefined),
    nginx: parsed(d.nginx, prev.nginx, parseNginxLocation),
    waf: parsed(d.waf, prev.waf, parseWaf),
    raw: pick(d.raw, prev.raw),
    rawNginx: pick(d.raw_nginx, prev.rawNginx),
  };

  const locations = [...srv.locations];
  locations[index] = next;
  return { ...srv, locations: locations.sort((a, b) => a.position - b.position) };
}
