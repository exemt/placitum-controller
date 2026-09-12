import type { Uuid } from "./id.ts";
import type { NginxLocationSettings } from "./settings.ts";
import type { WafRouteSettings } from "./waf-route.ts";

export const LOCATION_MATCHES = [
  "prefix",
  "exact",
  "regex",
  "regex_i",
  "named",
] as const;

export type LocationMatch = (typeof LOCATION_MATCHES)[number];

export const LOCATION_HANDLERS = [
  "proxy",
  "static",
  "return",
  "named",
] as const;

export type LocationHandler = (typeof LOCATION_HANDLERS)[number];

export function isLocationMatch(value: string): value is LocationMatch {
  return (LOCATION_MATCHES as readonly string[]).includes(value);
}

export function isLocationHandler(value: string): value is LocationHandler {
  return (LOCATION_HANDLERS as readonly string[]).includes(value);
}

/**
 * Протокол пути -- какие фазы у него бывают. `http`: запрос и ответ.
 * `websocket`: запрос (рукопожатие) и кадры, фазы ответа нет и не будет --
 * 101 без тела. Ключи кадров принимаются только на websocket-путях, ключи
 * ответа на них отвергаются; на сервере и пространстве ключей кадров не
 * бывает вовсе: сервер смешивает пути обоих протоколов.
 */
export const LOCATION_PROTOCOLS = ["http", "websocket"] as const;

export type LocationProtocol = (typeof LOCATION_PROTOCOLS)[number];

export function isLocationProtocol(value: string): value is LocationProtocol {
  return (LOCATION_PROTOCOLS as readonly string[]).includes(value);
}

/**
 * `location` внутри сервера. Наборы данных и лимиты не копируются с сервера
 * автоматически: нет ключа `localChecks` / `localRates` -- действуют родительские;
 * ключ есть, даже пустой массив -- родительские не применяются.
 *
 * Апстрим -- uuid, не имя: переименовать пул можно, не трогая пути. В шаблон
 * генератор подставит текущее имя.
 *
 * `raw` -- внутри `location … { }` оператор пишет текст сам. Скелет остаётся:
 * match и path. handler, апстрим, `nginx`/`waf` не печатаются.
 */
export interface Location {
  id: Uuid;
  serverId: Uuid;
  match: LocationMatch;
  path: string;
  position: number;
  enabled: boolean;
  handler: LocationHandler;
  /** См. LOCATION_PROTOCOLS. У websocket компилятор сам печатает пресет
   * заголовков апгрейда, час `proxy_read_timeout` и `waf_inspect response none`. */
  protocol: LocationProtocol;
  upstreamId?: Uuid;
  /** Хвост `proxy_pass http://app/;` -- `/` или пусто (передать URI как есть). */
  upstreamUri?: string;
  returnStatus?: number;
  /**
   * Страница ответа: именованный путь того же сервера (`@waf_deny`), на
   * который компилятор уводит через `error_page <код> =<код> @имя;`. Тело
   * строкой не хранится -- страница живёт файлом в каталоге `pages:` и
   * подставляет SSI-переменные, см. docs/deny-pages.md.
   */
  returnPage?: string;
  /** Адрес редиректа: у 3xx вторым аргументом `return` nginx ждёт URL. */
  returnUrl?: string;
  nginx: NginxLocationSettings;
  waf: WafRouteSettings;
  raw: boolean;
  rawNginx: string;
  /**
   * Корень сервера (`prefix /`): заводится вместе с сервером, не удаляется,
   * match и path не меняются. Запрос, не попавший в другие пути, попадает
   * сюда -- поэтому у каждой записи аудита есть uuid маршрута.
   */
  builtin: boolean;
}
