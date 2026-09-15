import type { LogLevel } from "../inspector-settings.ts";
import type { Uuid } from "./id.ts";
import type { NginxHttpSettings, NginxMainSettings, WafHttpSettings } from "./settings.ts";
import type { WafRouteSettings } from "./waf-route.ts";

/**
 * Один блок `http {}`. Обычно один на контур (prod / staging), не один на
 * виртуальный хост. Серверы, порты, апстримы и каталоги модуля принадлежат
 * пространству и удаляются вместе с ним.
 *
 * Общие опции http хранятся в трёх местах, и смешивать их нельзя:
 *
 * 1. `wafHttp` -- то, что в nginx бывает только в http (шина, зона, пределы).
 * 2. `waf` -- то, что наследуется на каждый сервер и путь, пока те не заменят
 *    ключ. Это и есть «значения по умолчанию контура».
 * 3. `nginx` -- ядро nginx этого же блока (keepalive, resolver, real_ip).
 *
 * Четвёртое место -- `nginxMain`, и оно не про `http {}` вовсе: агент пишет
 * напечатанное целиком в `nginx.conf`, поэтому скелет файла (`load_module`,
 * `worker_processes`, `events {}`) обязан приехать вместе с деревом.
 *
 * `raw` -- пользователь пишет тело `http {}` сам. Тогда серверы и пути не
 * печатаются: скелет пространства остаётся, дерева внутри нет. Каталоги
 * (инспекторы, наборы) в API живут, в шаблон из таблиц не едут -- они уже
 * в тексте, если оператор их туда поставил.
 *
 * Каталоги -- отдельные таблицы: инспектор имеет имя, набор маршрута
 * ссылается на него (`waf_inspect`), путь -- на апстрим. Складывать их
 * в jsonb массивом -- потерять FK и уникальность имени.
 */
export interface HttpSpace {
  id: Uuid;
  name: string;
  /** Скелет файла: `load_module`, `worker_processes`, `events {}`. */
  nginxMain: NginxMainSettings;
  nginx: NginxHttpSettings;
  wafHttp: WafHttpSettings;
  waf: WafRouteSettings;
  raw: boolean;
  rawNginx: string;
  createdAt: Date;
  updatedAt: Date;
}

export type InspectorPhase = "request" | "response" | "frame";

/** Строка списка каталога: без текста inspector.conf. */
export interface InspectorMeta {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  /** Тема шины: `waf.req.modsec`. Не имя процесса. */
  subject: string;
  /**
   * Фазы, которые процесс умеет вести. Множество, а не одна: modsec ведёт и
   * запрос, и ответ -- один набор правил, одна транзакция, фазы 1-2 и 3-4 в
   * ней подряд.
   *
   * Это заявка возможностей, а не расписание. Когда инспектора зовут, решает
   * `waf_inspect` на маршруте: фаза там -- первое слово вызова.
   */
  phases: InspectorPhase[];
  /** Описание процесса для каталога. На compile и шину не влияет. */
  description?: string;
  /** Ссылка на документацию процесса. Пусто, пока доков нет. */
  docsUrl?: string;
  /**
   * Уровень журнала процесса: словарь error_log nginx без emerg. Единственное
   * поле каталога, которое доезжает до процесса, -- блоком `settings` его
   * поколения, и применяется без рестарта. Переменная `WAF_<ИМЯ>_LOG` --
   * только стартовое значение до первого поколения.
   *
   * Необязательное только ради снимков, где каталог нужен не как каталог:
   * экспорту nginx уровень ни к чему, и строка без него -- строка с `info`.
   */
  logLevel?: LogLevel;
  position?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Запись каталога целиком: строка списка плюс текст `inspector.conf`.
 *
 * Больше в ней ничего и нет. Параметры `waf_inspector` -- `profile`, `audit`,
 * `breaker` -- и опции вызова -- `timeout`, `weight`, `needs`, `body`, `after`
 * -- живут в `*.waf.inspectors` с 029: они принадлежат контуру, а не процессу,
 * и на разных уровнях у одного имени разные. Колонки под них в таблице
 * остались мёртвым грузом и сняты в 049.
 */
export interface Inspector extends InspectorMeta {
  /** Текст inspector.conf: очередь процесса. Не опция nginx. */
  conf?: string;
}

export const DATASET_KINDS = ["list", "content"] as const;

export type DatasetKind = (typeof DATASET_KINDS)[number];

export const DEFAULT_DATASET_KIND: DatasetKind = "list";

export function isDatasetKind(value: string): value is DatasetKind {
  return (DATASET_KINDS as readonly string[]).includes(value);
}

export const DATASET_TYPES = ["string", "numeric", "ipv4", "ip"] as const;

export type DatasetType = (typeof DATASET_TYPES)[number];

export const DEFAULT_DATASET_TYPE: DatasetType = "ipv4";

export function isDatasetType(value: string): value is DatasetType {
  return (DATASET_TYPES as readonly string[]).includes(value);
}

/** Тип директивы nginx: IP-наборы -- cidr, строки и числа -- string. */
export function nginxDatasetType(type: DatasetType): "cidr" | "string" {
  return type === "ipv4" || type === "ip" ? "cidr" : "string";
}

/**
 * Сколько `waf_local_dataset` принимает одна конфигурация модуля, внутренние и
 * активные вместе. Зеркало NGX_HTTP_WAF_MAX_DATASETS из
 * nginx/module/src/ngx_http_waf.h и меняется вместе с ним: сверх него
 * `nginx -t` падает на каждом краю («waf: at most N datasets may be
 * declared»), поэтому компилятор отказывает раньше рассылки.
 */
export const NGINX_MAX_DATASETS = 128;

export const TEXT_CONTENT_TYPES = ["text", "html", "json", "xml"] as const;

export function isTextContentType(name: string): boolean {
  return (TEXT_CONTENT_TYPES as readonly string[]).includes(name);
}

/**
 * Каталог типов файла для kind=content. Глобальный, не принадлежит
 * пространству. Имя -- ключ (text, html, json); mime -- подсказка UX.
 */
export interface ContentType {
  id: Uuid;
  name: string;
  mime: string;
  description: string;
}

/**
 * Именованный объект каталога данных. kind задаётся при создании:
 * list -- `waf_local_dataset`, type=элемент, состав в dataset_addresses;
 * content -- один файл, тип из content_types, тело в dataset_contents.
 * В шину локального слоя едет только list с active=true.
 * active -- realtime: контроллер публикует snapshot/add/remove и принимает
 * события с края. TTL у записи: 0 -- вечная, иначе expiresAt.
 */
export interface Dataset {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  description: string;
  kind: DatasetKind;
  type: DatasetType;
  contentTypeId?: Uuid;
  maxEntries: number;
  liveMax?: number;
  /** Overlay active-списка, как `ttl=5m`. Колонки в БД может не быть. */
  ttl?: string;
  /**
   * `hash=md5`: набор строк хранит md5 значений, а не сами значения. Всё, что
   * сравнивается с набором или пишет в него, хеширует значение само: check,
   * if, автобан rate, keeper, панель. Только у type=string.
   */
  hash?: boolean;
  /** Записи internal; в nginx отдельными строками. */
  entries?: string[];
  /** Слот `waf_local_dataset` в шаблоне nginx. IP-наборы компилятора -- false. */
  inNginx?: boolean;
  position?: number;
  active: boolean;
  /**
   * Набор приехал с поставкой (schema/02-seed.sql): стандартная страница
   * отказа или заготовка-список. Страница заперта
   * целиком -- это образец, свой вариант заводят копией; у списка заперто
   * только имя, на него ссылаются по имени, а состав правят.
   */
  builtin?: boolean;
  size: number;
  /**
   * Имена переменных, которые читает страница (`kind = content`, текстовый
   * тип): считаются из тела при чтении набора, см. pageVars. Панели они нужны
   * там, где записи отказа выбирают `params=`: перечень и шаблон друг о друге
   * не знают, и расхождение иначе видно только клиенту на живом отказе.
   *
   * Не поле базы: тело правят и ручкой содержимого, и сидом, а колонка,
   * которую забыли обновить, соврала бы про страницу молча.
   */
  vars?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DatasetAddress {
  id: Uuid;
  datasetId: Uuid;
  address: string;
  ttlS: number;
  expiresAt?: Date;
  origin: string;
  reason: string;
}

export interface DatasetContent {
  datasetId: Uuid;
  name: string;
  body: Buffer;
  size: number;
  updatedAt: Date;
}

export interface DenyResponse {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  type: "http" | "grpc" | "websocket";
  spec: {
    status?: number;
    page?: string;
    message?: string;
    code?: number;
    reason?: string;
    /**
     * Что записи разрешено отдать клиенту: слова из словаря `params=`
     * (ray, addr, scope, subject, retry). Не задано -- всё: перечень
     * читается как «отдаю только это», а не как обязанность его писать.
     */
    params?: string[];
  };
}

/**
 * Горячий обменник контура: `waf_store`. Строка одна на пространство, имя в
 * конфиг не едет -- маршрут обменник не выбирает.
 *
 * Драйвер только `redis`: `none` и `inline` горячий путь не вызывает
 * (nginx/docs/module/known-issues.md), а `s3` в модуле нет и не будет --
 * архив пишет агент. Адреса тут тоже нет: он приезжает окружением
 * контроллера, см. [InfraUrls]. В `spec` остаются сроки и пределы.
 */
export interface BodyStore {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  driver: "redis";
  spec: Record<string, string | number | boolean>;
}

/**
 * Формат access-лога nginx: `log_format <name> '<тело>'`. Раньше таблица
 * держала и `waf_log_format` (поля записи аудита, `kind = waf`) -- снят
 * вместе с `waf_audit`: запись аудита пишет агент по фиксированной схеме.
 * Колонки `kind` и `fields` остались в базе, значение у `kind` одно.
 */
export interface LogFormat {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  kind: "nginx";
  fields: string[];
  /** Тело директивы без кавычек. */
  format: string;
}
