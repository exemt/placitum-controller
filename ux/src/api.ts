import type { ArchiveOutcome } from "./config/directive-tail.ts";
import type { FleetSnapshot } from "./fleet.ts";

export interface Health {
  ok: boolean;
  db?: boolean;
}

export interface Meta {
  service: string;
  version: string;
  mode: "debug";
  hostname: string;
  pid: number;
  uptime_s: number;
}

export interface Space {
  uuid: string;
  name: string;
  raw: boolean;
  created_at: string;
  updated_at: string;
}

export const DATASET_KINDS = ["list", "content"] as const;

export type DatasetKind = (typeof DATASET_KINDS)[number];

export const DATASET_TYPES = ["string", "numeric", "ipv4", "ip"] as const;

export type DatasetType = (typeof DATASET_TYPES)[number];

export const TEXT_CONTENT_TYPES = ["text", "html", "json", "xml"] as const;

export function isTextContentType(name: string): boolean {
  return (TEXT_CONTENT_TYPES as readonly string[]).includes(name);
}

export interface ContentType {
  uuid: string;
  name: string;
  mime: string;
  description: string;
}

/** Кто включает этот список: составной набор адреса. */
export interface DatasetSetLink {
  uuid: string;
  name: string;
  exclude: boolean;
}

export type DatasetMode = "active" | "internal";

export interface Dataset {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  kind: DatasetKind;
  type: DatasetType;
  content_type_id: string | null;
  max_entries: number;
  limit?: number;
  active: boolean;
  /** Объявлен слотом `waf_local_dataset` в шаблоне. */
  in_nginx?: boolean;
  /**
   * Приехал с поставкой: стандартная страница отказа. Заперт целиком --
   * не правится, не удаляется, не переименовывается: это образец, свой
   * вариант получают копией. Имя набора -- имя записи каталога
   * waf_deny_response, по которому страницу ищет try_files.
   */
  builtin?: boolean;
  mode?: DatasetMode;
  ttl?: string | null;
  /**
   * `hash=md5`: набор строк хранит md5 значений, а не сами значения. Всё, что
   * сравнивается с набором или пишет в него, хеширует значение само.
   */
  hash?: boolean;
  size: number;
  /**
   * Имена переменных, которые читает страница: контроллер считает их из тела
   * (`echo var=` и `expr=`). `null` -- набор не страница либо тело не разобрать
   * (двоичный тип, слишком большое). Этим `params=` у записи отказа знает,
   * что шаблон вообще печатает.
   */
  vars: string[] | null;
  linked: boolean;
  linked_sets: DatasetSetLink[];
  created_at: string;
  updated_at: string;
}

export interface DatasetContent {
  dataset_id: string;
  name: string;
  size: number;
  blob: string;
  updated_at: string;
}

export interface Address {
  uuid: string;
  dataset_id: string;
  address: string;
  ttl_s: number;
  expires_at: string | null;
  origin: string;
  reason: string;
}

export interface RuleFileMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface RuleFile extends RuleFileMeta {
  text_raw: string;
}

export interface RuleSetMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  file_count: number;
  created_at: string;
  updated_at: string;
}

export interface RuleSetMember {
  uuid: string;
  name: string;
}

export interface RuleSet extends RuleSetMeta {
  files: RuleSetMember[];
  /**
   * Файлы данных профиля: наборы вида content, которые операторы
   * `@pmFromFile` / `@ipMatchFromFile` читают рядом с правилами. `file` --
   * имя на диске инспектора, именно его пишут в правило.
   */
  data_files: { uuid: string; name: string; file: string }[];
  /** Политика профиля: правила приёма и инициаторы по исходу. */
  policy?: ModsecPolicy;
  /**
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах `prior`. Список общий на пространство и
   * неполон по построению: профили, приезжающие файлами, контроллеру не
   * видны, поэтому поле поводов остаётся свободным вводом. Только с
   * карточкой.
   */
  sender_codes?: SenderCode[];
  /**
   * Профиль default отличается от поставки: считает контроллер, сверяя его
   * с образцом из сида. У своего профиля всегда false.
   */
  modified?: boolean;
}

async function parseJson<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as {
        error?: string;
        detail?: unknown;
        invalid?: unknown;
        errors?: unknown;
      };
      if (typeof body.error === "string") {
        detail = body.error;
        /* Код отказа называет причину, detail -- место: путь, поле, имя. */
        if (typeof body.detail === "string" && body.detail !== "") {
          detail = `${body.error}: ${body.detail}`;
        }
        if (Array.isArray(body.invalid) && body.invalid.length > 0) {
          const sample = body.invalid
            .filter((item): item is string => typeof item === "string")
            .slice(0, 5);
          if (sample.length > 0) {
            detail = `${body.error}: ${sample.join(", ")}`;
          }
        }
        /*
         * Отказ компиляции (`validation_failed` у send) несёт причины списком:
         * без них полоса канала говорила только «validation_failed», и за
         * причиной приходилось идти в превью.
         */
        if (Array.isArray(body.errors) && body.errors.length > 0) {
          const reasons = body.errors
            .map((row: unknown) =>
              row !== null && typeof row === "object" && "message" in row
                ? String((row as { message: unknown }).message)
                : "",
            )
            .filter((text) => text !== "")
            .slice(0, 5);
          if (reasons.length > 0) {
            detail = `${body.error}: ${reasons.join("; ")}`;
          }
        }
      }
    } catch {
      // не JSON
    }
    throw new Error(`${path} → ${detail}`);
  }

  /*
   * 204 -- законный ответ на удаление: тела нет, и разбирать нечего. Без этой
   * ветки успешное удаление доезжает до страницы синтаксической ошибкой JSON.
   */
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return (await res.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  return parseJson<T>(await fetch(path), path);
}

async function getText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) {
    await parseJson<never>(res, path);
  }
  return res.text();
}

/*
 * Кто узнаёт о правках. Панель обязана замечать любое изменение конфигурации,
 * а не только то, которое сделали на «своей» странице, поэтому слушатель висит
 * на транспорте, а не на страницах: страниц два десятка, и подписать каждую --
 * значит однажды забыть новую и получить панель, которая молчит.
 */
type MutationListener = (path: string, method: string) => void;

let mutationListener: MutationListener | null = null;

export function onMutation(listener: MutationListener | null): void {
  mutationListener = listener;
}

async function sendJson<T>(
  path: string,
  method: "POST" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = parseJson<T>(res, path);

  // Только успешные: отказ ничего в базе не поменял, и дёргать пересчёт на
  // каждую неудачную валидацию формы незачем.
  if (res.ok) {
    mutationListener?.(path, method);
  }

  return out;
}

/**
 * Ответ без тела: 204. Отдельно от sendJson -- разбор пустого тела как JSON
 * упал бы там, где всё в порядке.
 */
async function sendNoContent(
  path: string,
  method: "POST" | "PUT" | "DELETE",
): Promise<void> {
  const res = await fetch(path, { method });

  if (!res.ok) {
    let detail = `${res.status}`;

    try {
      const body = (await res.json()) as { error?: string };

      if (typeof body.error === "string") {
        detail = body.error;
      }
    } catch {
      // не JSON
    }

    throw new Error(`${method} ${path}: ${detail}`);
  }

  mutationListener?.(path, method);
}

export function fetchHealth(): Promise<Health> {
  return getJson<Health>("/api/health");
}

export function fetchMeta(): Promise<Meta> {
  return getJson<Meta>("/api/meta");
}

export async function fetchSpaces(): Promise<Space[]> {
  const row = await getJson<{ spaces: Space[] }>("/api/spaces");
  return row.spaces;
}

export function fetchFleet(): Promise<FleetSnapshot> {
  return getJson("/api/fleet");
}

export interface ContourCrypto {
  alg: string;
  public_key: string;
  fingerprint: string;
}

export function fetchCrypto(scope: string): Promise<ContourCrypto> {
  return getJson<ContourCrypto>(`/api/${scope}/crypto`);
}

export async function fetchDatasets(scope: string): Promise<Dataset[]> {
  const row = await getJson<{ datasets: Dataset[] }>(
    `/api/${scope}/datasets`,
  );
  return row.datasets;
}

export function createDataset(
  scope: string,
  input: {
    name: string;
    description?: string;
    subject?: string;
    kind: DatasetKind;
    type?: DatasetType;
    content_type_id?: string;
    mode: DatasetMode;
    limit?: number;
    ttl?: string;
    /** `hash=md5`: только у списка строк. */
    hash?: boolean;
    /**
     * Слот `waf_local_dataset` в шаблоне. Ставит страница http -- там, где
     * список локального слоя и заводят; наборы ip-компилятора живут в той же
     * таблице и слотом не бывают.
     */
    in_nginx?: boolean;
    /**
     * UUID набора, чей состав скопировать в новый. Новый список редко
     * начинают с чистого листа: чаще берут готовый и правят.
     */
    copy_from?: string;
  },
): Promise<Dataset> {
  return sendJson<Dataset>(`/api/${scope}/datasets`, "POST", input);
}

export async function fetchContentTypes(scope: string): Promise<ContentType[]> {
  const row = await getJson<{ content_types: ContentType[] }>(
    `/api/${scope}/content-types`,
  );
  return row.content_types;
}

export function fetchDatasetContent(
  scope: string,
  datasetId: string,
): Promise<DatasetContent> {
  return getJson<DatasetContent>(`/api/${scope}/datasets/${datasetId}/content`);
}

export function putDatasetContent(
  scope: string,
  datasetId: string,
  input: { name: string; blob: string },
): Promise<DatasetContent> {
  return sendJson<DatasetContent>(
    `/api/${scope}/datasets/${datasetId}/content`,
    "PUT",
    input,
  );
}

export function updateDataset(
  scope: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    /**
     * Тема шины, с которой набор наполняется. Только у active: у internal
     * состав в конфиге, и сервер отвечает `subject_internal`.
     */
    subject?: string;
    mode?: DatasetMode;
    limit?: number;
    ttl?: string;
    in_nginx?: boolean;
    /** `hash=md5`: меняется только у пустого набора строк (`hash_locked`). */
    hash?: boolean;
  },
): Promise<Dataset> {
  return sendJson<Dataset>(`/api/${scope}/datasets/${id}`, "PUT", input);
}

/*
 * Занятый набор контроллер не удаляет: 409 `in_use` с местами в detail --
 * полоса отказа формы показывает их через errorMessage, как остальные коды.
 */
export function deleteDataset(scope: string, id: string): Promise<Dataset> {
  return sendJson<Dataset>(`/api/${scope}/datasets/${id}`, "DELETE");
}

export async function fetchAddresses(
  scope: string,
  datasetId: string,
): Promise<Address[]> {
  const row = await getJson<{ addresses: Address[] }>(
    `/api/${scope}/datasets/${datasetId}/addresses`,
  );
  return row.addresses;
}

export async function addAddress(
  scope: string,
  datasetId: string,
  address: string,
): Promise<Address[]> {
  return addAddresses(scope, datasetId, { address });
}

export async function addAddresses(
  scope: string,
  datasetId: string,
  body: {
    address?: string;
    addresses?: string[];
    text?: string;
    ttl_s?: number;
  },
): Promise<Address[]> {
  const row = await sendJson<{ addresses: Address[] }>(
    `/api/${scope}/datasets/${datasetId}/addresses`,
    "POST",
    body,
  );
  return row.addresses;
}

export function deleteAddress(scope: string, addressId: string): Promise<Address> {
  return sendJson<Address>(`/api/${scope}/addresses/${addressId}`, "DELETE");
}

export type AuditSearchVerdict = "allow" | "deny" | "redirect";

/**
 * Строка позвоночника waf.audit. Одна и та же форма у элемента списка и у
 * открытой записи: это один и тот же запрос, и второй тип на то же самое
 * пришлось бы разбирать дважды.
 *
 * Страна и ASN лежат в `vars`, а не отдельными полями: своего geo у модуля нет
 * и не будет, они приезжают через `waf_var` вместе с User-Agent и остальным,
 * что оператор объявил на маршруте.
 */
/**
 * Одна запись секции sessions: кто назвал (инспектор), источник входа, вид
 * (`own` -- выписал контур, `jwt` -- чужой токен, `app` -- кука приложения),
 * логин и идентификатор -- не сама кука, а sid либо хеш.
 */
export interface AuditSession {
  by?: string;
  source: string;
  kind: string;
  user: string;
  id: string;
  /** Подпись сошлась; `false` у разбора без ключа -- claims написал клиент. */
  verified: boolean;
  issued?: number;
  expires?: number;
  groups?: string;
  /** Отправитель пассивен: заголовки личности приложению не легли. */
  passive?: boolean;
}

/**
 * Личность сессии одной строкой -- `источник:логин`. Голый логин личности не
 * называет: `alice` своей калитки и `alice` из чужого JWT совпадают именем и
 * больше ничем, пространство имён задаёт источник входа. В этой же форме
 * группирует журнал (`by=user`) и её же принимает фильтр `user=`.
 *
 * Сессия без логина (запись есть, имени нет) личности не даёт -- пустая
 * строка, и рисовать её не надо.
 */
export function sessionIdentity(s: AuditSession): string {
  if (s.user === "") {
    return "";
  }

  return s.source !== "" ? `${s.source}:${s.user}` : s.user;
}

export interface AuditSearchEvent {
  ts: string;
  node: string;
  ray: string;
  phase: string;

  client_ip?: string;
  client_port?: number;
  server_ip?: string;
  server_port?: number;
  tls_version?: string;
  tls_sni?: string;

  method: string;
  scheme?: string;
  host: string;
  uri: string;
  http_version?: string;
  args_size: number;
  headers_size: number;
  headers_count: number;
  body_size: number;
  content_type?: string;
  /** Код, который получил клиент: наш отказ либо ответ приложения. */
  status: number;
  /**
   * Код самого приложения, до вмешательства. Нет поля -- апстрим не отвечал:
   * у фазы запроса так всегда. Различать их обязательно: в status один и тот
   * же 418 означает и «приложение ответило успехом, а мы закрыли ответ», и
   * «мы закрыли запрос, приложение не отвечало вовсе».
   */
  upstream_status?: number;

  server_name?: string;
  location?: string;
  /** Uuid пути (`waf_route_id`): ключ схлопывания и адрес карточки пути. */
  location_id?: string;

  verdict: string;
  /** Почему вынесен итог: закрытый набор, пусто ровно на `allow`. */
  code?: string;
  /** Чей вердикт стал итогом: `module` либо имя решающего инспектора. */
  by: string;

  score: number;
  deny_at?: number;
  shadow?: number;

  waf_latency_us: number;

  inspectors: string[];
  inspectors_verdict: Record<string, string>;
  inspectors_state?: Record<string, string>;
  inspectors_score: Record<string, number>;
  inspectors_latency_ms?: Record<string, number>;
  inspectors_role?: Record<string, string>;
  inspectors_profile?: Record<string, string>;
  /**
   * Свод участников строкой: `modsec: score [50], ml: timeout`. Собран на
   * SELECT. Список его не рисует -- там фишки по картам выше, где видно и
   * профиль, и вес, и задержка; поле остаётся частью ответа поиска.
   */
  inspectors_view: string;

  vars?: Record<string, string>;

  /**
   * Чьи сессии назвали инспекторы: своя калитка, чужой JWT, кука приложения.
   * Есть и в списке: «кто это был» -- вопрос списка не меньше, чем карточки.
   */
  sessions?: AuditSession[];

  /**
   * Маркеры записи -- метки, поставленные глаголом `mark`. Множество строк
   * оператора; кто и по какому поводу просил, видно в действиях записи.
   * Есть и в списке: метку ставят, чтобы искать по ней и видеть её в строке.
   */
  markers?: string[];

  /**
   * Срез запроса: заголовки и параметры парами, тело — префиксом байт.
   * Едет только с одиночной записью (`fetchAuditEvent`), в списке этих полей
   * нет — маршрут списка их не запрашивает. Отсутствие поля здесь не значит
   * «пусто»: означает и «превью выключено на маршруте», и «список из старой
   * записи до этой возможности». Пустой объект — превью включено, но срез
   * ничего не поймал (например, deny-лист вычеркнул все имена).
   */
  headers_preview?: Record<string, string>;
  args_preview?: Record<string, string>;
  body_preview?: string;
  /**
   * `"sent"` — body_preview показывает доставленную получателю версию тела
   * после подмены (waf_preview ... source=sent), а не оригинал. Оригинал в
   * этом случае лежит в архиве. Поля нет — превью показывает оригинал.
   */
  body_preview_source?: "sent";

  /**
   * Имена пар, чьё значение урезано потолком на пару, и число пар, выброшенных
   * целиком. Без этого префикс сошёл бы за оригинал, а неполная секция — за
   * полную: длина карты у урезанной пары прежняя.
   */
  headers_preview_truncated?: string[];
  args_preview_truncated?: string[];
  headers_preview_dropped?: number;
  args_preview_dropped?: number;

  /** Локаторы обменника. Содержимое достаётся отдельными ручками карточки. */
  store?: {
    headers?: AuditStoreLocator;
    args?: AuditStoreLocator;
    body?: AuditStoreLocator;
  };

  /**
   * Кадры WebSocket. Соединение — один запрос: рукопожатие, кадры и сессия
   * лежат под одним ray, кадр внутри него адресуется стороной и номером
   * (`frameAddr`). Секции есть только у своих фаз: `frame` у phase=frame,
   * `session` у phase=session.
   */
  frame?: AuditFrameInfo;
  session?: AuditSessionInfo;
}

/**
 * Адрес кадра для ручек записи (`?frame=c2s:12`). Пусто у записей других
 * фаз: там ray и фаза адресуют запись сами.
 */
export function frameAddr(row: { phase: string; frame?: AuditFrameInfo }): string {
  return row.phase === "frame" && row.frame !== undefined
    ? `${row.frame.direction}:${row.frame.seq}`
    : "";
}

/** Кадр записи phase=frame: срез полезной нагрузки едет только с одиночной записью. */
export interface AuditFrameInfo {
  seq: number;
  direction: "c2s" | "s2c" | string;
  opcode: string;
  fin: boolean;
  size: number;
  rewritten: boolean;
  payload_preview?: string;
  payload_truncated?: boolean;
}

/** Итог соединения записи phase=session. */
export interface AuditSessionInfo {
  frames_c2s: number;
  frames_s2c: number;
  bytes_c2s: number;
  bytes_s2c: number;
  frames_denied: number;
  frames_rewritten: number;
  close_code: number;
  close_reason: string;
  duration_ms: number;
}

/**
 * Локатор из колонки `store_*`: то же, что отдаёт `store.Locator` модуля,
 * прошедшее через агента и логгер без изменений. `size` есть всегда, даже у
 * освобождённого объекта; `store`/`driver`/`key` — только когда по этому
 * локатору ещё можно спросить содержимое (`/headers`, `/args`, `/body`).
 */
export interface AuditStoreLocator {
  unavailable?: string;
  size: number;
  declared_size?: number;
  sha256?: string;
  complete?: boolean;
  truncated?: boolean;
  encoding?: string;
  store?: string;
  driver?: string;
  key?: string;
  expires_at?: number;
}

/** Находка одного инспектора. Форма общая: правило CRS, тип ПДн, класс уязвимости. */
export interface AuditFinding {
  ts: string;
  node: string;
  ray: string;
  phase: string;
  inspector: string;
  profile?: string;
  verdict: string;
  score?: number;
  engine_ms?: number;
  index: number;
  code?: string;
  severity?: string;
  target?: string;
  rule?: string;
  offset?: number;
  length?: number;
  confidence?: number;
  evidence?: string;
  engine?: unknown;
  clean?: boolean;
}

/** Участник фазы. Форма одна и на модуль (ключ `module`), и на инспектора. */
export interface AuditParticipant {
  name: string;
  self?: boolean;
  decisive?: boolean;
  verdict?: string;
  state?: string;
  /** Что легло в сумму: заявка при score, сотня у совещательного deny. */
  score?: number;
  latency_ms?: number;
  engine_ms?: number;
  role?: string;
  profile?: string;
  clean?: boolean;
  orphan?: boolean;
  findings?: AuditFinding[];
  /**
   * Правка ответа, если этот участник её заказывал. Заказать могут несколько,
   * поднимает модуль ровно один объект: у наблюдающего профиля и у
   * проигравшего заказ applied=false, и вместе с группами это «что было бы
   * применено». Архив и срез при этом хранят оригинал.
   */
  rewrite?: { applied: boolean; size?: number; groups?: string[] };
}

/** Что один получатель сделал с просьбой. */
/** Параметр глагола: те же границы, которыми модуль отбраковывает ответ. */
export interface ActionParam {
  name: string;
  type: "int" | "bool" | "string";
  required: boolean;
  min?: number;
  max?: number;
  signed?: boolean;
}

export interface ActionSpec {
  do: string;
  axes: string[];
  params: ActionParam[];
  listeners: string[];
  /**
   * Глагол умеет ослаблять защиту получателя: правило `from: "*"` с ним
   * загрузчик не примет — послабление требует имени отправителя.
   */
  weakens: boolean;
  /**
   * Исполняет модуль, а не сосед: адресат -- вызов на маршруте, правила
   * приёма у получателя нет, широковещательной формы нет.
   */
  module?: boolean;
  /** Адресат -- запись маршрута (журнал и архив), а не вызов соседа; поля to на проводе нет. */
  route?: boolean;
  /**
   * Модуль исполняет глагол и от пассивного отправителя (журнал, архив,
   * маркер). Очки и управляющие глаголы от пассивного он отвергает.
   */
  fromPassive?: boolean;
}

/**
 * Словарь действий контура. Своей копии списка панель не держит: расширить
 * словарь в шести местах и забыть седьмое -- ровно то, ради чего эта ручка
 * заведена.
 */
export interface ActionRegistry {
  v: number;
  axes: string[];
  verbs: ActionSpec[];
  common: ActionParam[];
}

/**
 * Предел длины метки (`marker` у `mark`), байт: та же граница, которой
 * отбраковывает модуль. Копия контроллерской (model/actions.ts): панель
 * проверяет форму до отправки, чтобы не собирать мышью то, что не сохранится.
 */
export const MARKER_MAX_BYTES = 128;

/**
 * Форма метки: непуста, не длиннее предела, без управляющих символов и без
 * крайних пробелов. Алфавита у метки нет -- её читает человек в журнале.
 * Возвращает ключ подписи ошибки либо `null`, если метка годится.
 */
export function markerError(marker: string): "empty" | "long" | "bad" | null {
  if (marker.trim() === "") {
    return "empty";
  }

  if (new TextEncoder().encode(marker).length > MARKER_MAX_BYTES) {
    return "long";
  }

  for (const ch of marker) {
    const code = ch.codePointAt(0) ?? 0;

    if (code < 0x20 || code === 0x7f) {
      return "bad";
    }
  }

  return null;
}

/** Имена объектов просьбы записи -- те же, что у директив снимка. */
export const RECORD_OBJECTS = ["headers", "args", "body"] as const;

export type RecordObjectName = (typeof RECORD_OBJECTS)[number];

/**
 * Объект просьбы записи (audit / archive) -- как строка директивы: сторона
 * (off исключает), размер (у архива -- сколько байт уедет, у журнала --
 * бюджет превью; null -- весь / как на маршруте) и источник (как снято либо
 * оригинал без масок снимка; пусто -- как на маршруте).
 */
export interface RecordObject {
  set: "" | "on" | "off";
  limit: number | null;
  source: "" | "store" | "original";
}

/**
 * Повод, объявленный профилем отправителя, -- строка подсказки поля поводов.
 * Словаря у поводов нет: подсказка перечисляет уже объявленное и называет
 * объявителя, а ввод остаётся свободным (docs/inspector-actions.md, «Повод»).
 */
export interface SenderCode {
  code: string;
  /** Кто объявил: процесс-отправитель и его профиль. */
  by: { inspector: string; profile: string }[];
}

export function fetchActions(): Promise<ActionRegistry> {
  return getJson<ActionRegistry>("/api/actions");
}

/** Оси, допустимые хотя бы при одном из выбранных глаголов. */
export function axesFor(reg: ActionRegistry | null, verbs: readonly string[]): string[] {
  if (reg === null) {
    return [];
  }

  const ok = new Set<string>();

  for (const spec of reg.verbs) {
    if (!verbs.includes(spec.do)) {
      continue;
    }

    for (const axis of spec.axes) {
      ok.add(axis);
    }
  }

  return reg.axes.filter((axis) => ok.has(axis));
}

/**
 * Глаголы, которые ослабляют защиту. Широковещательному правилу (`from: "*"`)
 * они недоступны: тихий адресный обход хуже громкой общей аварии, поэтому
 * послабление требует имени отправителя.
 */
export function weakeningVerbs(reg: ActionRegistry | null): string[] {
  return (reg?.verbs ?? []).filter((spec) => spec.weakens).map((spec) => spec.do);
}

/** Глаголы, которые имеет смысл предлагать в правилах этого инспектора. */
export function verbsFor(reg: ActionRegistry | null, inspector: string): string[] {
  if (reg === null) {
    return [];
  }

  return reg.verbs
    .filter(
      (spec) =>
        spec.module !== true &&
        (spec.listeners.length === 0 || spec.listeners.includes(inspector)),
    )
    .map((spec) => spec.do);
}

export interface AuditActionOutcome {
  inspector: string;
  outcome: string;
  took?: number;
}

/**
 * Просьба одного инспектора другому и её судьба. Живые перечисляет модуль,
 * исход называет получатель, склеивает их поиск. Пустой `outcomes` -- законный
 * и самый интересный случай: просьбу никто не услышал либо услышавший смолчал.
 */
export interface AuditAction {
  from?: string;
  /** Пусто -- широковещательная: «всем» не имя адресата. */
  to?: string;
  do: string;
  apply?: string;
  code?: string;
  delta?: number;
  value?: number;
  phase?: string;
  /** Отправитель пассивен: в prior записи не было, исхода не будет. */
  passive?: boolean;
  outcomes?: AuditActionOutcome[];
}

export interface AuditCard {
  ts: string;
  node: string;
  ray: string;
  phase: string;
  verdict: string;
  code?: string;
  by: string;
  score: number;
  deny_at?: number;
  shadow?: number;
  items: AuditParticipant[];
  count: number;
  actions?: AuditAction[];
  frame?: AuditFrameInfo;
  session?: AuditSessionInfo;
}

export const AUDIT_CONTENT_KINDS = ["headers", "args", "body"] as const;

export type AuditContentKind = (typeof AUDIT_CONTENT_KINDS)[number];

export interface AuditContentPair {
  name: string;
  value: string;
}

/**
 * Содержимое обменника. `available: false` — обычный ответ: запись есть, размер и
 * контрольная сумма верны, а байтов не будет, и `reason` говорит почему.
 */
export interface AuditContent {
  node: string;
  ray: string;
  phase: string;
  kind: AuditContentKind;

  size: number;
  declared_size?: number;
  sha256?: string;
  complete?: boolean;
  truncated?: boolean;
  encoding?: string;
  content_type?: string;

  store?: string;
  driver?: string;
  key?: string;
  /**
   * Unix-время, после которого объекта в архиве не будет: срок называет само
   * хранилище своим правилом удаления. Нет поля — срока нет, объект переживёт
   * саму запись.
   */
  expires_at?: number;

  available: boolean;
  reason?: string;

  returned: number;
  /** Ответ упёрся в потолок окна. Не то же, что `truncated` локатора. */
  clipped?: boolean;

  /** Байтовый сдвиг окна внутри объекта. */
  offset?: number;
  /**
   * Окно началось внутри значения предыдущей пары: `text` — продолжение,
   * карточка дописывает его к последней уже показанной паре.
   */
  continuation?: boolean;

  headers?: AuditContentPair[];
  params?: AuditContentPair[];
  count?: number;
  raw?: string;
  text?: string;
  base64?: string;
  binary?: boolean;
}

export interface AuditSearchPage {
  items: AuditSearchEvent[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

/**
 * Оси группировки журнала. Закрытый список повторяет whitelist поиска;
 * порядок в запросе — порядок колонок в таблице групп.
 */
export type AuditGroupDim =
  | "ip"
  | "host"
  | "server"
  | "uri"
  | "route"
  | "method"
  | "status"
  | "verdict"
  | "phase"
  /** Метка: запись без меток в такую группировку не попадает вовсе. */
  | "marker"
  /**
   * Страна и автономная система адреса. Своих колонок в записи у них нет:
   * значение даёт словарь по каталогу пространства, поэтому ось отвечает и
   * на то, что записано до заливки каталога. Адрес, которого каталог не
   * знает, собирается в группу с пустым ключом -- «сколько не опознали».
   */
  | "country"
  | "asn"
  /**
   * Личность -- пара `источник:логин` из секции sessions. Запись без сессий
   * в группировку не попадает; у записи с двумя сессиями запрос считается
   * в обеих группах.
   */
  | "user";

export interface AuditGroupRow {
  /** Значения осей, все строками; пустая строка — «нет значения». */
  keys: Partial<Record<AuditGroupDim, string>>;
  hits: number;
  /*
   * Чем кончились запросы группы, по вердиктам. Старый логгер их не считает
   * -- поля может не быть вовсе, поэтому необязательные.
   */
  allowed?: number;
  redirected?: number;
  denied: number;
  /** Время последнего запроса группы, ISO. */
  last: string;
}

export interface AuditGroupPage {
  items: AuditGroupRow[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

export type AuditSearchQuery = {
  verdict?: "" | AuditSearchVerdict;
  code?: string;
  /** `request`, `response`, `frame` или `session`. */
  phase?: string;
  method?: string;
  host?: string;
  /** Имена блоков server через запятую -- конфигурация, не заголовок Host. */
  server?: string;
  uri?: string;
  /** Uuid путей через запятую -- точное совпадение по `location_id`. */
  route?: string;
  status?: string;
  inspector?: string;
  /**
   * Личность из секции sessions, точное совпадение с любой записью массива.
   * Голый логин (`alice`) -- «этот логин у кого угодно», пара
   * `источник:логин` (`corp:alice`) -- «этот человек»; двоеточие делит по
   * первому вхождению, а логин с двоеточием ищут с пустым источником
   * (`:urn:user:1`).
   */
  user?: string;
  /** Идентификатор сессии из той же секции: sid либо хеш куки. */
  session?: string;
  /** Маркер записи -- строка целиком, любой элемент секции `markers`. */
  marker?: string;
  /** Код страны адреса, две буквы; регистр не важен. */
  country?: string;
  /** Номер автономной системы адреса, без префикса `AS`. */
  asn?: string;
  /** Ray запроса; у WebSocket под ним же рукопожатие, кадры и сессия. */
  ray?: string;
  ip?: string;
  node?: string;
  /** Имя или `имя=значение` заголовка — ищет по `headers_preview`. */
  header?: string;
  /** Имя или `имя=значение` параметра — ищет по `args_preview`. */
  param?: string;
  /** Подстрока — ищет по `lower(body_preview)`, регистр не важен. */
  body?: string;
  from?: string;
  to?: string;
  /**
   * Порядок страницы по времени: `desc` (умолчание) -- с конца окна, `asc` --
   * с начала. Не сортировка уже полученного: страницу режет ClickHouse, и
   * `offset` считается в том же порядке. Группы порядок не слушают -- у них
   * свой `sort`/`dir`.
   */
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

/**
 * Строка журнала процессов ноды. Не запись аудита и не её срез: у access-строки
 * нет ray, а error_log пишется и там, где запроса не было вовсе.
 */
export interface LogLine {
  ts: string;
  /** Кто записал: нода, чей агент снял строку со своего сокета. */
  writer: string;
  /** Что за сервис: тег syslog из самой директивы nginx. */
  service: string;
  severity?: string;
  text: string;
}

export interface LogSearchPage {
  items: LogLine[];
  count: number;
  total: number;
  limit: number;
  offset: number;
}

/** Пара «нода — сервис», встреченная в окне: чем наполняются списки фильтров. */
export interface LogFacet {
  writer: string;
  service: string;
  count: number;
}

export type LogSearchQuery = {
  writer?: string;
  service?: string;
  severity?: string;
  /** Подстрока — ищет по `lower(text)`, регистр не важен. */
  text?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

/**
 * 503 от контроллера — это «искать негде», а не «ничего не нашлось». Разница
 * важна: пустой список под фильтром выглядит одинаково, а чинить надо разное.
 */
async function search<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (res.status === 503) {
    throw new Error("search_unreachable");
  }
  return parseJson<T>(res, path);
}

function record(node: string, ray: string): string {
  return `/api/search/audit/${encodeURIComponent(node)}/${encodeURIComponent(ray)}`;
}

export function fetchAuditSearch(q: AuditSearchQuery): Promise<AuditSearchPage> {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === "") {
      continue;
    }
    p.set(key, String(value));
  }
  const qs = p.toString();

  return search<AuditSearchPage>(
    `/api/search/audit${qs !== "" ? `?${qs}` : ""}`,
  );
}

/** Сортировка групп: метрика или одна из выбранных осей. */
export type AuditGroupSort = {
  key: "hits" | "denied" | "last" | AuditGroupDim;
  dir: "asc" | "desc";
};

/**
 * Группы вместо строк: тот же фильтр, свёрнутый по осям `by`. Считает
 * ClickHouse — группировка страницы списка выдавала бы топ среза за топ окна.
 */
export function fetchAuditGroups(
  q: AuditSearchQuery,
  by: readonly AuditGroupDim[],
  sort: AuditGroupSort,
): Promise<AuditGroupPage> {
  return search<AuditGroupPage>(
    `/api/search/audit/groups${params({ ...q, by: by.join(","), sort: sort.key, dir: sort.dir })}`,
  );
}

function params(q: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === "") {
      continue;
    }
    p.set(key, String(value));
  }
  const qs = p.toString();

  return qs !== "" ? `?${qs}` : "";
}

export function fetchLogSearch(q: LogSearchQuery): Promise<LogSearchPage> {
  return search<LogSearchPage>(`/api/search/logs${params(q)}`);
}

/*
 * Наборы для списков фильтров. Своим запросом, а не полем страницы: они
 * считаются группировкой по окну и меняются на порядок реже, чем строки, --
 * пересчитывать их на каждое перелистывание незачем.
 */
export function fetchLogFacets(window: {
  from?: string;
  to?: string;
}): Promise<{ items: LogFacet[]; count: number }> {
  return search<{ items: LogFacet[]; count: number }>(
    `/api/search/logs/facets${params(window)}`,
  );
}

/*
 * Уровни журнала сервисов контура: документ policy/log-levels. Не под
 * пространством -- процессы общие на весь контур. Сохранение уходит в KV
 * сразу, без черновика: сервисы переставляют порог первым событием watch.
 * Инспекторов в списке нет -- их уровень в каталоге и едет поколением.
 */
export interface LogLevelsService {
  /** Колонка «сервис» журнала и ключ документа. */
  name: string;
  /** Переменная стартового порога: к ней уровень вернётся, если ключ снять. */
  env: string;
}

export interface LogLevels {
  rev: number;
  levels: Record<string, InspectorLogLevel>;
  services: LogLevelsService[];
}

export function fetchLogLevels(): Promise<LogLevels> {
  return getJson<LogLevels>("/api/log-levels");
}

/** Таблица целиком: ключ без значения (null) снимается. */
export function saveLogLevels(
  levels: Record<string, InspectorLogLevel | null>,
): Promise<LogLevels> {
  return sendJson<LogLevels>("/api/log-levels", "PUT", { levels });
}

/*
 * Одна запись. Фаза обязательна там, где их две: у запроса и у ответа общий
 * ray, и без фазы бэкенд отдаёт первую попавшуюся -- то есть чаще всего не ту,
 * которую открыли.
 */
export function fetchAuditEvent(
  node: string,
  ray: string,
  phase?: string,
  frame?: string,
): Promise<AuditSearchEvent> {
  return search<AuditSearchEvent>(`${record(node, ray)}${params({ phase, frame })}`);
}

/** Разбор записи по участникам — то, ради чего запись открывают. */
export function fetchAuditInspectors(
  node: string,
  ray: string,
  phase?: string,
  frame?: string,
): Promise<AuditCard> {
  return search<AuditCard>(`${record(node, ray)}/inspectors${params({ phase, frame })}`);
}

/**
 * Заголовки, строка запроса или тело — из обменника, не из ClickHouse. Фаза --
 * та же, что у записи: у ответа свои ключи обменника (`:rsp`), и без неё
 * бэкенд отдал бы объекты запроса под видом объектов ответа.
 */
export function fetchAuditContent(
  node: string,
  ray: string,
  kind: AuditContentKind,
  window?: { offset: number; limit: number },
  phase?: string,
  frame?: string,
): Promise<AuditContent> {
  const p = new URLSearchParams();
  if (phase !== undefined && phase !== "") {
    p.set("phase", phase);
  }
  if (frame !== undefined && frame !== "") {
    p.set("frame", frame);
  }
  if (window !== undefined) {
    p.set("offset", String(window.offset));
    p.set("limit", String(window.limit));
  }
  const qs = p.toString();

  return search<AuditContent>(
    `${record(node, ray)}/${kind}${qs !== "" ? `?${qs}` : ""}`,
  );
}

export async function fetchRuleFiles(scope: string): Promise<RuleFileMeta[]> {
  const row = await getJson<{ rule_files: RuleFileMeta[] }>(
    `/api/${scope}/rule-files`,
  );
  return row.rule_files;
}

export function fetchRuleFile(scope: string, id: string): Promise<RuleFile> {
  return getJson<RuleFile>(`/api/${scope}/rule-files/${id}`);
}

export function createRuleFile(
  scope: string,
  input: { name: string; description: string; text_raw: string },
): Promise<RuleFile> {
  return sendJson<RuleFile>(`/api/${scope}/rule-files`, "POST", input);
}

export function updateRuleFile(
  scope: string,
  id: string,
  input: { name?: string; description?: string; text_raw?: string },
): Promise<RuleFile> {
  return sendJson<RuleFile>(`/api/${scope}/rule-files/${id}`, "PUT", input);
}

/** Файл в составе профиля не удаляется: 409 `in_use` называет профили. */
export function deleteRuleFile(scope: string, id: string): Promise<RuleFile> {
  return sendJson<RuleFile>(`/api/${scope}/rule-files/${id}`, "DELETE");
}

export async function fetchRuleSets(scope: string): Promise<RuleSetMeta[]> {
  const row = await getJson<{ rule_sets: RuleSetMeta[] }>(
    `/api/${scope}/rule-sets`,
  );
  return row.rule_sets;
}

export function fetchRuleSet(scope: string, id: string): Promise<RuleSet> {
  return getJson<RuleSet>(`/api/${scope}/rule-sets/${id}`);
}

export function createRuleSet(
  scope: string,
  input: {
    name: string;
    description: string;
    files: string[];
    data_files?: string[];
  },
): Promise<RuleSet> {
  return sendJson<RuleSet>(`/api/${scope}/rule-sets`, "POST", input);
}

export function updateRuleSet(
  scope: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    files?: string[];
    data_files?: string[];
    policy?: ModsecPolicy;
  },
): Promise<RuleSet> {
  return sendJson<RuleSet>(`/api/${scope}/rule-sets/${id}`, "PUT", input);
}

/*
 * default не удаляется (`default_required`), названный с маршрута -- 409
 * `in_use` с местами.
 */
export function deleteRuleSet(scope: string, id: string): Promise<RuleSet> {
  return sendJson<RuleSet>(`/api/${scope}/rule-sets/${id}`, "DELETE");
}

/**
 * Вернуть default к поставке: контроллер перезаписывает его образцом из
 * сида. Своего профиля ручка не касается -- отвечает `not_default`.
 */
export function restoreRuleSet(
  scope: string,
  id: string,
): Promise<RuleSet & { missing_files: string[] }> {
  return sendJson<RuleSet & { missing_files: string[] }>(
    `/api/${scope}/rule-sets/${id}/restore`,
    "POST",
  );
}

export interface RulesSendResult {
  v: 1;
  rev: number;
  config_hash: string;
  profiles: string[];
}

export function sendRules(scope: string): Promise<RulesSendResult> {
  return sendJson<RulesSendResult>(`/api/${scope}/rules/send`, "POST");
}

export type InspectorPhase = "request" | "response" | "frame";

/**
 * Уровень журнала процесса: словарь error_log nginx без emerg, от болтливого
 * к тихому. Те же слова, что у модуля на краю. Сам инспектор пишет только
 * debug/info/warn/error: notice режет то же, что warn, а crit и alert глушат
 * его журнал целиком.
 */
export const INSPECTOR_LOG_LEVELS = [
  "debug",
  "info",
  "notice",
  "warn",
  "error",
  "crit",
  "alert",
] as const;

export type InspectorLogLevel = (typeof INSPECTOR_LOG_LEVELS)[number];

export interface InspectorMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  subject: string;
  /**
   * Фазы, которые процесс умеет вести. Заявка возможностей, а не расписание:
   * когда его зовут, решает `waf_inspect` на маршруте.
   */
  phases: InspectorPhase[];
  /** Описание процесса для каталога. На сборку и шину не влияет. */
  description: string;
  /** Ссылка на документацию процесса. Пусто, пока доков нет. */
  docs_url: string;
  /**
   * Уровень журнала процесса. Единственное поле каталога, которое доезжает до
   * процесса: блоком settings его поколения при следующей рассылке канала,
   * применяется без рестарта. Переменная окружения -- только стартовое
   * значение до первого поколения.
   */
  log_level: InspectorLogLevel;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface Inspector extends InspectorMeta {
  conf: string;
}

/**
 * Сервис инспектора -- последнее звено темы: `waf.req.modsec` -- `modsec`.
 *
 * Записей реестра у одного сервиса несколько (`ip-ext`, `ip-admin`), а
 * подсистема за ними одна: её профили, её словарь глаголов. Всё, что
 * относится к подсистеме, а не к имени, ищется по этому ключу.
 */
export function serviceOfSubject(subject: string): string {
  return subject.split(".").pop() ?? "";
}

export async function fetchInspectors(scope: string): Promise<InspectorMeta[]> {
  const row = await getJson<{ inspectors: InspectorMeta[] }>(
    `/api/${scope}/inspectors`,
  );
  return row.inspectors;
}

/**
 * Объявленное имя контура: узел `*.waf.inspectors`, развёрнутый через свой
 * процесс из каталога. Ровно то, к чему маршрут вправе привязаться; каталог
 * перечисляет процессы, а звать можно только объявленное. `known=false` --
 * объявление есть, процесса за ним нет: сборка на таком узле падает.
 */
export interface DeclaredInspector {
  name: string;
  process: string;
  subject: string | null;
  phases: InspectorPhase[];
  profile: string;
  known: boolean;
}

export async function fetchDeclaredInspectors(
  scope: string,
): Promise<DeclaredInspector[]> {
  const row = await getJson<{ declared: DeclaredInspector[] }>(
    `/api/${scope}/inspectors/declared`,
  );
  return row.declared;
}

export function fetchInspector(scope: string, id: string): Promise<Inspector> {
  return getJson<Inspector>(`/api/${scope}/inspectors/${id}`);
}

/**
 * Каталог -- справочник процессов: записи приезжают с поставкой, из панели их
 * не заводят и не сносят. Имя, тема и фазы прибиты к процессу; панель правит
 * витрину (описание, ссылку на доки), inspector.conf и уровень журнала --
 * единственное, что отсюда доезжает до самого процесса.
 */
export function updateInspector(
  scope: string,
  id: string,
  input: {
    description?: string;
    docs_url?: string;
    log_level?: InspectorLogLevel;
    conf?: string;
  },
): Promise<Inspector> {
  return sendJson<Inspector>(`/api/${scope}/inspectors/${id}`, "PUT", input);
}

export const STORE_TYPES = [
  "certificate",
  "private_key",
  "chain",
  "ca",
  "crl",
  "creds",
  "dhparam",
  "deny_page",
  "other",
] as const;

export type StoreType = (typeof STORE_TYPES)[number];

export interface StoreObjectMeta {
  uuid: string;
  type: StoreType;
  metadata: Record<string, unknown>;
  size: number;
  created_at: string;
}

/**
 * `blob` -- base64 конверта, уже зашифрованного в браузере (см.
 * ../src/crypto/seal.ts). Контроллер его не открывает.
 */
export function createStoreObject(
  scope: string,
  input: { type: StoreType; blob: string; metadata?: Record<string, unknown> },
): Promise<StoreObjectMeta> {
  return sendJson<StoreObjectMeta>(`/api/${scope}/store`, "POST", input);
}

/**
 * Метаданные -- из crypto-сервиса (docs/crypto-service.md), не браузера:
 * `sans`/`not_before`/`not_after`/`fingerprint` контроллер сам вписывает
 * по ответу расшифровки, тело запроса их не содержит.
 */
/**
 * Тип сертификата -- чем он является, а не куда его сегодня привязали:
 * `server` -- пара с приватным ключом для ssl_certificate,
 * `client_ca` -- доверенный корень mTLS для ssl_client_certificate.
 * У client_ca ключа нет, зато может быть список отзыва.
 */
export const CERTIFICATE_TYPES = ["server", "client_ca"] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

/** Разбор CRL crypto-сервисом. Есть только у client_ca. */
export interface CertificateCrl {
  store_id: string;
  issuer: string;
  this_update: string | null;
  next_update: string | null;
  revoked: number | null;
}

export interface Certificate {
  uuid: string;
  http_space_id: string;
  name: string;
  type: CertificateType;
  cert_store_id: string;
  key_store_id: string | null;
  chain_store_id: string | null;
  sans: string[];
  not_before: string | null;
  not_after: string | null;
  fingerprint: string;
  subject: string;
  issuer: string;
  serial: string;
  crl: CertificateCrl | null;
}

export async function fetchCertificates(scope: string): Promise<Certificate[]> {
  const row = await getJson<{ certificates: Certificate[] }>(
    `/api/${scope}/certificates`,
  );
  return row.certificates;
}

export function createCertificateRecord(
  scope: string,
  input: {
    name: string;
    type: CertificateType;
    cert_store_id: string;
    key_store_id?: string;
    chain_store_id?: string;
  },
): Promise<Certificate> {
  return sendJson<Certificate>(`/api/${scope}/certificates`, "POST", input);
}

/**
 * Замена списка отзыва: PUT, не POST -- у корня в каждый момент ровно один
 * актуальный CRL. `crl_store_id` -- уже загруженный store-объект, ciphertext
 * контроллер не открывает.
 */
export function setCertificateCrl(
  scope: string,
  id: string,
  crlStoreId: string,
): Promise<Certificate> {
  return sendJson<Certificate>(`/api/${scope}/certificates/${id}/crl`, "PUT", {
    crl_store_id: crlStoreId,
  });
}

export function deleteCertificateCrl(
  scope: string,
  id: string,
): Promise<Certificate> {
  return sendJson<Certificate>(`/api/${scope}/certificates/${id}/crl`, "DELETE");
}

export function deleteCertificateRecord(
  scope: string,
  id: string,
): Promise<Certificate> {
  return sendJson<Certificate>(`/api/${scope}/certificates/${id}`, "DELETE");
}

export const IP_COUNTRY_TYPES = ["v4", "v6"] as const;

export type IpCountryType = (typeof IP_COUNTRY_TYPES)[number];

export interface IpCountry {
  uuid: string;
  http_space_id: string;
  code: string;
  type: IpCountryType;
  description: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface IpCountryAddress {
  uuid: string;
  country_id: string;
  address: string;
}

export const IP_ASN_TYPES = IP_COUNTRY_TYPES;

export type IpAsnType = IpCountryType;

export interface IpAsn {
  uuid: string;
  http_space_id: string;
  asn: number;
  type: IpAsnType;
  description: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface IpAsnAddress {
  uuid: string;
  asn_id: string;
  address: string;
}

/** Список внутри составного набора: имя, тип и признак живого состава. */
export interface IpSetList {
  uuid: string;
  name: string;
  type: string;
  active: boolean;
}

export interface IpSetMatch {
  lists: IpSetList[];
  countries: string[];
  asns: number[];
}

export interface IpSetMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  list_count: number;
  live: boolean;
  created_at: string;
  updated_at: string;
}

export interface IpSet extends IpSetMeta, IpSetMatch {
  inverse: boolean;
  exclude: IpSetMatch;
}

export type IpSetMatchInput = {
  lists: string[];
  countries: string[];
  asns: number[];
};

export const IP_RULE_ACTIONS = ["allow", "deny", "request", "list"] as const;

export type IpRuleAction = (typeof IP_RULE_ACTIONS)[number];

/*
 * Своего словаря глаголов и осей здесь нет: он приезжает реестром с
 * `GET /api/actions` вместе с осями и границами параметров. Копия, лежавшая
 * тут, не использовалась ни одной строкой и успела отстать от реестра на пять
 * глаголов.
 */

/**
 * Чем закрывается профиль, в котором не совпал ни один список. Счёта здесь
 * нет: вердикт у инспектора адреса один из двух, и оператор выбирает его явно.
 */
export const IP_DEFAULT_ACTIONS = ["allow", "deny"] as const;

export type IpDefaultAction = (typeof IP_DEFAULT_ACTIONS)[number];

/**
 * Где оказался адрес -- условие строки по исходу. Слова про списки, а не про
 * вердикт: `allow` бывает и белым списком, и строкой «иначе», а это разные
 * строки профиля. Чёрный список решает двумя действиями -- отказом и счётом,
 * -- и для строки по исходу это один случай.
 */
export const IP_OUTCOME_ONS = ["white", "black", "none", "overload"] as const;

export type IpOutcomeOn = (typeof IP_OUTCOME_ONS)[number];

/** Правило профиля: набор и что с ним делать. */
export interface IpRule {
  uuid: string;
  position: number;
  /** Условие терминальной строки: составной набор. У накопительной null. */
  set: string | null;
  set_name: string;
  /** Условие накопительной строки: сырой список. У терминальной null. */
  dataset: string | null;
  dataset_name: string;
  /** «Адрес не в списке»: условие наоборот. Только у request и list. */
  not: boolean;
  action: IpRuleAction;
  response: string;
  code: string;
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /** mark: метка события на записи -- произвольная строка оператора. */
  marker: string;
  /** mutate: группа модификаторов получателя; куда переключить -- `side`. */
  group: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /**
   * Сторона mutate и просьбы записи (audit, archive). У строки ключ `set`
   * занят набором, поэтому сторона здесь -- `side`; срок архива приезжает тем
   * же `ttl`, что и срок записи в набор: у строки одно из двух.
   */
  side: string;
  when: string[];
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  force: boolean;
  list: string | null;
  list_name: string;
  ttl: number;
  enabled: boolean;
}

export type IpRuleInput = {
  /** Условие терминальной строки. У накопительной null. */
  set?: string | null;
  /** Условие накопительной строки: сырой список. У терминальной null. */
  dataset?: string | null;
  /** «Адрес не в списке»: условие наоборот. Только у request и list. */
  not?: boolean;
  action: IpRuleAction;
  response?: string;
  code?: string;
  to?: string;
  do?: string;
  apply?: string;
  delta?: number | null;
  value?: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter?: string;
  /** mark: метка события на записи -- произвольная строка оператора. */
  marker?: string;
  /** mutate: группа модификаторов получателя; куда переключить -- `side`. */
  group?: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** Сторона mutate и просьбы записи (у строки -- `side`), исходы и объекты. */
  side?: string;
  when?: string[];
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
  force?: boolean;
  list?: string | null;
  /** list: кого писать -- адрес, самый узкий анонс, все накрывающие, система. */
  write?: "addr" | "net" | "net_all" | "asn";
  ttl?: number;
  enabled?: boolean;
};

/**
 * Строка по исходу: то, где нашёлся адрес, даёт действие -- просьбу соседу
 * либо запись адреса в живой набор. Условие -- само место, а не набор; строка
 * «иначе» дёргает только `on: none`. Просьба законна везде, но на отказе она
 * не доедет: deny обрывает фазу.
 */
export interface IpOutcomeInput {
  /** white | black | none | overload. */
  on: IpOutcomeOn;
  /**
   * Только у overload: с какого заполнения очереди инспектора строка
   * срабатывает, 25..100 процентов. Сотня -- край: запрос сброшен.
   */
  at?: number;
  /** Просьба соседу -- та же форма, что у строки-правила. */
  to?: string;
  do?: string;
  apply?: string;
  delta?: number | null;
  value?: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter?: string;
  /** mark: метка события на записи -- произвольная строка оператора. */
  marker?: string;
  /** mutate: группа модификаторов получателя; куда переключить -- `set`. */
  group?: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** Сторона mutate и просьбы записи: у инициатора набора нет, и она здесь просто `set`. */
  set?: string;
  when?: string[];
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
  /** uuid живого набора. */
  list: string;
  /** Кого писать: адрес, самый узкий анонс, все накрывающие, система. */
  write?: "addr" | "net" | "net_all" | "asn";
  /** Срок записи, сек; 0 -- вечная. */
  ttl: number;
  /** Повод; пусто -- код решения. */
  code: string;
}

export interface IpProfileMeta {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  rule_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Сырой список, объявленный профилем: его везут на ноду без всякой логики,
 * просто потому, что о нём попросили. Условие накопительной строки выбирается
 * из объявленных.
 */
export interface IpProfileDataset {
  uuid: string;
  name: string;
  /** Активный: состав едет шиной от keeper, тела в паке нет. */
  active: boolean;
}

export interface IpProfile extends IpProfileMeta {
  rules: IpRule[];
  datasets: IpProfileDataset[];
  outcomes: IpOutcomeInput[];
  default: IpDefaultAction;
  default_code: string;
  /**
   * Профиль default отличается от поставки: считает контроллер, сверяя его
   * с образцом из сида. У своего профиля всегда false.
   */
  modified?: boolean;
}

export async function fetchIpCountries(scope: string): Promise<IpCountry[]> {
  const row = await getJson<{ ip_countries: IpCountry[] }>(
    `/api/${scope}/ip-countries`,
  );
  return row.ip_countries;
}

export interface IpSetAddressPage<T> {
  addresses: T[];
  total: number;
  count: number;
  page: number;
  page_size: number;
  page_count: number;
}

export async function fetchIpCountryAddresses(
  scope: string,
  id: string,
  page = 0,
  pageSize = 10,
  q = "",
): Promise<IpSetAddressPage<IpCountryAddress>> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q.trim() !== "") {
    query.set("q", q);
  }
  return getJson<IpSetAddressPage<IpCountryAddress>>(
    `/api/${scope}/ip-countries/${id}/addresses?${query}`,
  );
}

export function exportIpCountryAddresses(
  scope: string,
  id: string,
): Promise<string> {
  return getText(`/api/${scope}/ip-countries/${id}/addresses/export`);
}

export async function fetchIpAsns(scope: string): Promise<IpAsn[]> {
  const row = await getJson<{ ip_asns: IpAsn[] }>(`/api/${scope}/ip-asns`);
  return row.ip_asns;
}

export async function fetchIpAsnAddresses(
  scope: string,
  id: string,
  page = 0,
  pageSize = 10,
  q = "",
): Promise<IpSetAddressPage<IpAsnAddress>> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (q.trim() !== "") {
    query.set("q", q);
  }
  return getJson<IpSetAddressPage<IpAsnAddress>>(
    `/api/${scope}/ip-asns/${id}/addresses?${query}`,
  );
}

export function exportIpAsnAddresses(scope: string, id: string): Promise<string> {
  return getText(`/api/${scope}/ip-asns/${id}/addresses/export`);
}

// ---------- выгрузки гео ----------

export type GeoKind = "country" | "asn";

/** Загрузка выгрузки MaxMind: сверка каталога пространства и файл кодеру. */
export interface GeoImportJob {
  kind: GeoKind;
  space_id: string;
  state: "running" | "done" | "failed";
  /** catalog -- разбор и сверка каталога; publish -- документ кодеру. */
  phase: "catalog" | "publish";
  sha256: string;
  size: number;
  database_type: string;
  build_epoch: number;
  networks: number;
  keys: number;
  added: number;
  removed: number;
  started_at: string;
  finished_at?: string;
  took_ms?: number;
  error?: string;
  detail?: string;
}

/** Загруженный файл вида: что стоит в каталоге и что должен держать кодер. */
export interface GeoFileInfo {
  sha256: string;
  size: number;
  database_type: string;
  build_epoch: number;
  uploaded_at: string;
  /** Документ policy/geo называет этот файл: кодер о нём знает. */
  published: boolean;
  /** Сколько живых копий кодера отвечает по этому файлу. */
  coders: number;
}

export interface GeoImportView {
  jobs: Record<GeoKind, GeoImportJob | null>;
  files: Record<GeoKind, GeoFileInfo | null>;
  coder: { replicas: number; rev: number };
}

/** Отказ загрузки с кодом контроллера: окно переводит код во фразу. */
export class GeoUploadError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "GeoUploadError";
    this.code = code;
    this.detail = detail;
  }
}

export function fetchGeoImports(scope: string): Promise<GeoImportView> {
  return getJson<GeoImportView>(`/api/${scope}/geo/import`);
}

/**
 * Файл уходит телом как есть: base64 в JSON раздул бы двенадцать мегабайт на
 * треть, а контроллеру всё равно нужны байты. Ответ 202 -- задача принята;
 * ход -- `fetchGeoImports`.
 */
export async function uploadGeoFile(
  scope: string,
  kind: GeoKind,
  file: File,
): Promise<GeoImportJob> {
  const path = `/api/${scope}/geo/import/${kind}`;
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: file,
  });

  let body: { job?: GeoImportJob; error?: string; detail?: string } = {};

  try {
    body = (await res.json()) as typeof body;
  } catch {
    // не JSON: прокси впереди или обрыв
  }

  if (!res.ok || body.job === undefined) {
    throw new GeoUploadError(body.error ?? `http_${res.status}`, body.detail);
  }

  mutationListener?.(path, "POST");
  return body.job;
}

export async function fetchIpSets(scope: string): Promise<IpSetMeta[]> {
  const row = await getJson<{ ip_sets: IpSetMeta[] }>(`/api/${scope}/ip-sets`);
  return row.ip_sets;
}

export function fetchIpSet(scope: string, id: string): Promise<IpSet> {
  return getJson<IpSet>(`/api/${scope}/ip-sets/${id}`);
}

export function createIpSet(
  scope: string,
  input: {
    name: string;
    description: string;
    inverse: boolean;
    lists: string[];
    countries: string[];
    asns: number[];
    exclude: IpSetMatchInput;
  },
): Promise<IpSet> {
  return sendJson<IpSet>(`/api/${scope}/ip-sets`, "POST", input);
}

export function updateIpSet(
  scope: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    inverse?: boolean;
    lists?: string[];
    countries?: string[];
    asns?: number[];
    exclude?: IpSetMatchInput;
  },
): Promise<IpSet> {
  return sendJson<IpSet>(`/api/${scope}/ip-sets/${id}`, "PUT", input);
}

export function deleteIpSet(scope: string, id: string): Promise<void> {
  return sendNoContent(`/api/${scope}/ip-sets/${id}`, "DELETE");
}

export async function fetchIpProfiles(scope: string): Promise<IpProfileMeta[]> {
  const row = await getJson<{ ip_profiles: IpProfileMeta[] }>(
    `/api/${scope}/ip-profiles`,
  );
  return row.ip_profiles;
}

export function fetchIpProfile(scope: string, id: string): Promise<IpProfile> {
  return getJson<IpProfile>(`/api/${scope}/ip-profiles/${id}`);
}

export function createIpProfile(
  scope: string,
  input: {
    name: string;
    description: string;
    rules: IpRuleInput[];
    /** uuid сырых списков, которые профиль просит упаковать. */
    datasets: string[];
    outcomes: IpOutcomeInput[];
    default: IpDefaultAction;
    default_code?: string;
  },
): Promise<IpProfile> {
  return sendJson<IpProfile>(`/api/${scope}/ip-profiles`, "POST", input);
}

export function updateIpProfile(
  scope: string,
  id: string,
  input: {
    name?: string;
    description?: string;
    rules?: IpRuleInput[];
    datasets?: string[];
    outcomes?: IpOutcomeInput[];
    default?: IpDefaultAction;
    default_code?: string;
  },
): Promise<IpProfile> {
  return sendJson<IpProfile>(`/api/${scope}/ip-profiles/${id}`, "PUT", input);
}

/** Профиль, названный с маршрута через profile=, -- 409 `in_use` с местами. */
export function deleteIpProfile(scope: string, id: string): Promise<IpProfile> {
  return sendJson<IpProfile>(`/api/${scope}/ip-profiles/${id}`, "DELETE");
}

/**
 * Вернуть default к поставке: контроллер перезаписывает его образцом из
 * сида. Своего профиля ручка не касается -- отвечает `not_default`.
 */
export function restoreIpProfile(scope: string, id: string): Promise<IpProfile> {
  return sendJson<IpProfile>(`/api/${scope}/ip-profiles/${id}/restore`, "POST");
}

export interface GeoCountryHit {
  code: string;
  name?: string;
}

export interface GeoAsnHit {
  asn: number;
  name?: string;
}

export interface GeoLookupResult {
  addr: string;
  countries: GeoCountryHit[];
  asns: GeoAsnHit[];
  error?: string;
}

/**
 * Страна и ASN пачкой: отвечает каталог пространства, кодер -- только за
 * то, чего в каталоге нет. Один HTTP-поход на все карточки кадра — см.
 * `components/ip-geo`, который и копит адреса в пачку. Ручка scoped:
 * каталог у каждого пространства свой.
 */
export async function fetchGeoLookupBatch(
  scope: string,
  addrs: string[],
): Promise<GeoLookupResult[]> {
  const row = await sendJson<{ results: GeoLookupResult[] }>(
    `/api/${scope}/geo/lookup/batch`,
    "POST",
    { addrs },
  );
  return row.results;
}

export type SpaceHttp = {
  uuid: string;
  name: string;
  raw: boolean;
  raw_nginx: string;
  /**
   * Скелет файла выше `http {}`: `load_module`, `worker_processes`, `events {}`.
   * Агент пишет вывод компилятора прямо в `nginx.conf`, поэтому без него мастер
   * не стартует, а модуля в процессе нет. В панели он не правился вовсе.
   */
  nginx_main: Record<string, unknown>;
  nginx: Record<string, unknown>;
  waf_http: Record<string, unknown>;
  waf: Record<string, unknown>;
  /**
   * Адреса развёртывания: контроллер поднят с ними, панель их показывает, но
   * не правит. В `PUT` не уходят -- см. saveSpaceHttp.
   */
  infra: {
    nats_url: string;
    /** Боевой обменник тел (`CONTROLLER_REDIS_URL`), пароль скрыт. */
    redis_url?: string;
    /** Внутренний Redis контура (`CONTROLLER_REDIS_INTERNAL_URL`), пароль скрыт. */
    redis_internal_url?: string;
  };
  created_at: string;
  updated_at: string;
};

export function fetchSpaceHttp(scope: string): Promise<SpaceHttp> {
  return getJson<SpaceHttp>(`/api/${scope}/http`);
}

export function saveSpaceHttp(
  scope: string,
  input: Pick<
    SpaceHttp,
    "nginx_main" | "nginx" | "waf_http" | "waf" | "raw" | "raw_nginx"
  >,
): Promise<SpaceHttp> {
  return sendJson<SpaceHttp>(`/api/${scope}/http`, "PUT", input);
}

export type RouteServer = {
  uuid: string;
  http_space_id: string;
  name: string;
  server_names: string[];
  enabled: boolean;
  nginx: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
  location_count: number;
  listen_count: number;
  /**
   * Адреса, которые слушает сервер. Приезжают вместе со списком, а не
   * отдельным запросом на строку: таблица показывает их прямо в колонке.
   */
  listens: ServerListen[];
};

export type RouteLocation = {
  uuid: string;
  server_id: string;
  server_name: string;
  http_space_id: string;
  match: string;
  path: string;
  position: number;
  enabled: boolean;
  handler: string;
  /** http -- запрос и ответ; websocket -- рукопожатие и кадры, ответа нет. */
  protocol: string;
  upstream_id: string | null;
  upstream_uri: string | null;
  return_status: number | null;
  return_page: string | null;
  return_url: string | null;
  nginx: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
  /** Корень сервера: не удаляется, match и path заперты. */
  builtin: boolean;
};

export type ServerInput = {
  name: string;
  server_names: string[];
  enabled: boolean;
  nginx: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
};

export type LocationInput = {
  match: string;
  path: string;
  enabled: boolean;
  handler: string;
  protocol: string;
  upstream_id: string | null;
  upstream_uri: string | null;
  return_status: number | null;
  return_page: string | null;
  return_url: string | null;
  nginx: Record<string, unknown>;
  waf: Record<string, unknown>;
  raw: boolean;
  raw_nginx: string;
};

export async function fetchServers(scope: string): Promise<RouteServer[]> {
  const row = await getJson<{ servers: RouteServer[] }>(`/api/${scope}/servers`);
  return row.servers;
}

export function createServer(
  scope: string,
  input: ServerInput,
): Promise<RouteServer> {
  return sendJson<RouteServer>(`/api/${scope}/servers`, "POST", input);
}

export function updateServer(
  scope: string,
  id: string,
  input: ServerInput,
): Promise<RouteServer> {
  return sendJson<RouteServer>(`/api/${scope}/servers/${id}`, "PUT", input);
}

export function deleteServer(scope: string, id: string): Promise<RouteServer> {
  return sendJson<RouteServer>(`/api/${scope}/servers/${id}`, "DELETE");
}

export async function fetchLocations(
  scope: string,
  serverId?: string,
): Promise<RouteLocation[]> {
  const q = serverId === undefined ? "" : `?server=${serverId}`;
  const row = await getJson<{ locations: RouteLocation[] }>(
    `/api/${scope}/locations${q}`,
  );
  return row.locations;
}

export function createLocation(
  scope: string,
  serverId: string,
  input: LocationInput,
): Promise<RouteLocation> {
  return sendJson<RouteLocation>(
    `/api/${scope}/servers/${serverId}/locations`,
    "POST",
    input,
  );
}

export function updateLocation(
  scope: string,
  id: string,
  input: LocationInput,
): Promise<RouteLocation> {
  return sendJson<RouteLocation>(`/api/${scope}/locations/${id}`, "PUT", input);
}

/** Все пути сервера в новом порядке; ответ -- они же с пересчитанными позициями. */
export async function reorderLocations(
  scope: string,
  serverId: string,
  order: string[],
): Promise<RouteLocation[]> {
  const row = await sendJson<{ locations: RouteLocation[] }>(
    `/api/${scope}/servers/${serverId}/locations/order`,
    "PUT",
    { order },
  );
  return row.locations;
}

export function deleteLocation(
  scope: string,
  id: string,
): Promise<RouteLocation> {
  return sendJson<RouteLocation>(`/api/${scope}/locations/${id}`, "DELETE");
}

export const UPSTREAM_METHODS = [
  "round_robin",
  "least_conn",
  "ip_hash",
  "hash",
] as const;

export type UpstreamMethod = (typeof UPSTREAM_METHODS)[number];

export type UpstreamPeer = {
  uuid: string;
  host: string;
  port: number;
  weight: number;
  max_fails: number | null;
  fail_timeout_ms: number | null;
  backup: boolean;
  down: boolean;
  position: number;
};

export type UpstreamPool = {
  uuid: string;
  http_space_id: string;
  name: string;
  method: UpstreamMethod;
  hash_key: string | null;
  keepalive: number | null;
  keepalive_requests: number | null;
  keepalive_timeout_ms: number | null;
  /** Узлы слушают TLS: proxy_pass пойдёт по https, путь получит proxy_ssl_*. */
  tls: boolean;
  /** Имя в рукопожатии (SNI). Пусто -- хост единственного узла пула. */
  tls_name: string | null;
  /** Значение Host: к защищаемому серверу; старше заголовка пути. */
  host_header: string | null;
  peer_count: number;
  bind_count: number;
  peers: UpstreamPeer[];
};

export type UpstreamPeerInput = {
  host: string;
  port: number;
  weight: number;
  max_fails?: number | null;
  fail_timeout_ms?: number | null;
  backup: boolean;
  down: boolean;
};

export type UpstreamInput = {
  name: string;
  method: UpstreamMethod;
  hash_key: string | null;
  keepalive: number | null;
  keepalive_requests: number | null;
  keepalive_timeout_ms: number | null;
  tls: boolean;
  tls_name: string | null;
  host_header: string | null;
  peers: UpstreamPeerInput[];
};

export async function fetchUpstreams(scope: string): Promise<UpstreamPool[]> {
  const row = await getJson<{ upstreams: UpstreamPool[] }>(
    `/api/${scope}/upstreams`,
  );
  return row.upstreams;
}

export function createUpstream(
  scope: string,
  input: UpstreamInput,
): Promise<UpstreamPool> {
  return sendJson<UpstreamPool>(`/api/${scope}/upstreams`, "POST", input);
}

export function updateUpstream(
  scope: string,
  id: string,
  input: UpstreamInput,
): Promise<UpstreamPool> {
  return sendJson<UpstreamPool>(`/api/${scope}/upstreams/${id}`, "PUT", input);
}

export function deleteUpstream(
  scope: string,
  id: string,
): Promise<UpstreamPool> {
  return sendJson<UpstreamPool>(`/api/${scope}/upstreams/${id}`, "DELETE");
}

export type ListenPort = {
  uuid: string;
  http_space_id: string;
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxy_protocol: boolean;
  bind_count: number;
  default_server_id: string | null;
};

export type PortInput = {
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxy_protocol: boolean;
};

export type ServerListen = {
  uuid: string;
  server_id: string;
  port_id: string;
  default_server: boolean;
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxy_protocol: boolean;
};

export async function fetchPorts(scope: string): Promise<ListenPort[]> {
  const row = await getJson<{ ports: ListenPort[] }>(`/api/${scope}/ports`);
  return row.ports;
}

export function createPort(scope: string, input: PortInput): Promise<ListenPort> {
  return sendJson<ListenPort>(`/api/${scope}/ports`, "POST", input);
}

export function updatePort(
  scope: string,
  id: string,
  input: PortInput,
): Promise<ListenPort> {
  return sendJson<ListenPort>(`/api/${scope}/ports/${id}`, "PUT", input);
}

export function deletePort(scope: string, id: string): Promise<ListenPort> {
  return sendJson<ListenPort>(`/api/${scope}/ports/${id}`, "DELETE");
}

export async function fetchServerListens(
  scope: string,
  serverId: string,
): Promise<ServerListen[]> {
  const row = await getJson<{ listens: ServerListen[] }>(
    `/api/${scope}/servers/${serverId}/ports`,
  );
  return row.listens;
}

export function bindServerPort(
  scope: string,
  serverId: string,
  input: { port_id: string; default_server: boolean },
): Promise<ServerListen> {
  return sendJson<ServerListen>(
    `/api/${scope}/servers/${serverId}/ports`,
    "POST",
    input,
  );
}

export function updateServerListen(
  scope: string,
  serverId: string,
  bindId: string,
  input: { default_server: boolean },
): Promise<ServerListen> {
  return sendJson<ServerListen>(
    `/api/${scope}/servers/${serverId}/ports/${bindId}`,
    "PUT",
    input,
  );
}

export function unbindServerPort(
  scope: string,
  serverId: string,
  bindId: string,
): Promise<ServerListen> {
  return sendJson<ServerListen>(
    `/api/${scope}/servers/${serverId}/ports/${bindId}`,
    "DELETE",
  );
}

export const CERTIFICATE_KINDS = ["server", "client_ca", "trusted"] as const;

export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];

export type ServerCertificateBind = {
  uuid: string;
  server_id: string;
  certificate_id: string;
  kind: CertificateKind;
  type: CertificateType;
  name: string;
  sans: string[];
  not_before: string | null;
  not_after: string | null;
  fingerprint: string;
  subject: string;
  /** Показывается на карточке сервера: у mTLS без CRL отзыв не проверяется. */
  has_crl: boolean;
};

export async function fetchServerCertificates(
  scope: string,
  serverId: string,
): Promise<ServerCertificateBind[]> {
  const row = await getJson<{ certificates: ServerCertificateBind[] }>(
    `/api/${scope}/servers/${serverId}/certificates`,
  );
  return row.certificates;
}

export function bindServerCertificate(
  scope: string,
  serverId: string,
  input: { certificate_id: string; kind: CertificateKind },
): Promise<ServerCertificateBind> {
  return sendJson<ServerCertificateBind>(
    `/api/${scope}/servers/${serverId}/certificates`,
    "POST",
    input,
  );
}

export function unbindServerCertificate(
  scope: string,
  serverId: string,
  bindId: string,
): Promise<ServerCertificateBind> {
  return sendJson<ServerCertificateBind>(
    `/api/${scope}/servers/${serverId}/certificates/${bindId}`,
    "DELETE",
  );
}

// ---------- сходимость конфигурации ----------

/*
 * Три уровня одним документом: что сохранено, что издано и что применили
 * участники. Панель ничего из этого сама не считает -- хеш обязан приходить от
 * того же кода, который печатает файл на `send`. Второй компилятор в панели уже
 * был и разъехался с первым (см. config/PreviewDock.tsx).
 */

export type ChannelId =
  | "nginx"
  | "agent"
  | "haproxy"
  | "rules"
  | "ip"
  | "auth"
  | "captcha"
  | "json"
  | "action"
  | "counter"
  | "vlai"
  | "rewrite";

export type ChannelState =
  | "ok"
  | "empty"
  | "dirty"
  /** Источник правили, а конфигурация вышла та же: правка никуда не уедет. */
  | "no_effect"
  | "broken"
  | "never"
  | "converging"
  | "failed"
  | "foreign"
  | "silent"
  /** Издано, а участников у канала нет вовсе: такого инспектора не подняли. */
  | "nobody"
  | "unmanaged";

export type ConsumerState =
  | "ok"
  | "stale"
  | "pending"
  | "failed"
  | "foreign"
  | "silent";

export interface ChannelPlanError {
  code: string;
  message: string;
  /** Числа и имена причины для перевода; контроллер прежней версии их не шлёт. */
  params?: Record<string, string | number>;
}

export interface ChannelBlocked {
  code: string;
  message: string;
  before?: ChannelId;
}

export interface ChannelConsumer {
  uuid: string;
  label: string;
  state: ConsumerState;
  hash?: string;
  rev?: number;
  apply?: string;
}

export interface ChannelView {
  id: ChannelId;
  state: ChannelState;
  dirty: boolean;
  /** Источник правили с последней рассылки -- независимо от `dirty`. */
  sourceChanged: boolean;
  delivered: boolean;
  draft: {
    hash: string;
    sourceHash: string;
    ok: boolean;
    empty: boolean;
    errors: ChannelPlanError[];
    at: string;
  } | null;
  desired: { hash: string; rev: number; at?: string } | null;
  consumers: ChannelConsumer[];
  counts: Record<ConsumerState, number>;
  blocked: ChannelBlocked[];
  key: string;
  /** Путь `send` относительно `/api/<scope>`. */
  send: string;
  page: string;
}

export interface ConvergenceSnapshot {
  v: 1;
  at: string;
  seq: number;
  scope: string;
  lamp: "red" | "yellow" | "green";
  worst: ChannelState;
  channels: ChannelView[];
}

export function fetchConvergence(scope: string): Promise<ConvergenceSnapshot> {
  return getJson<ConvergenceSnapshot>(`/api/${scope}/convergence`);
}

/** Пересчитать, не дожидаясь срока годности плана. */
export function refreshConvergence(
  scope: string,
  channel?: ChannelId,
): Promise<ConvergenceSnapshot> {
  const tail = channel === undefined ? "" : `?channel=${channel}`;
  return sendJson<ConvergenceSnapshot>(
    `/api/${scope}/convergence/refresh${tail}`,
    "POST",
  );
}

/**
 * Разослать канал его собственным `send`. Общего эндпоинта на все каналы нет
 * намеренно: у каждого свои коды отказа (`missing_default`, `store_not_found`,
 * `validation_failed`), и заворачивать их в один ответ значило бы потерять
 * причину ровно там, где она нужна.
 */
export function sendChannel(scope: string, channel: ChannelView): Promise<unknown> {
  return sendJson(`/api/${scope}/${channel.send}`, "POST");
}

// ---------- nginx config send ----------

export interface NginxConfigSendResult {
  sha256: string;
  v: 1;
  rev: number;
  config_hash: string;
  store_refs: number;
}

export function sendNginxConfig(scope: string): Promise<NginxConfigSendResult> {
  return sendJson<NginxConfigSendResult>(`/api/${scope}/config/send`, "POST");
}

export function fetchNginxPreview(scope: string): Promise<string> {
  return getText(`/api/${scope}/config/preview`);
}

// ---------- настройки агента ----------

/**
 * Документ агента контура: куда возить архив и с каким темпом.
 *
 * Реквизитов S3 здесь нет и не будет -- ключи остаются секретом ноды
 * (`WAF_RETAIN_S3_CREDENTIALS_FILE`). Контроллер называет хранилище, но не
 * открывает его; панель тем более.
 */
export type AgentArchiveKind = "headers" | "args" | "body";

export interface AgentBatchWire {
  size?: number;
  timeout_ms?: number;
}

export interface AgentSettingsWire {
  s3?: {
    endpoint?: string;
    region?: string;
    buckets?: Partial<Record<AgentArchiveKind, string>>;
  };
  archive?: {
    workers?: number;
    queue?: number;
    timeout_ms?: number;
    batch?: Partial<Record<AgentArchiveKind, AgentBatchWire>>;
  };
}

export interface AgentSettingsDoc {
  settings: AgentSettingsWire;
  updated_at: string | null;
  /** Хеш сохранённого черновика: с ним сравнивается ревизия на флоте. */
  sha256: string;
}

export interface AgentConfDesired {
  rev: number | null;
  sha256: string | null;
}

export function fetchAgentSettings(scope: string): Promise<AgentSettingsDoc> {
  return getJson<AgentSettingsDoc>(`/api/${scope}/agent`);
}

export function saveAgentSettings(
  scope: string,
  settings: AgentSettingsWire,
): Promise<AgentSettingsDoc> {
  return sendJson<AgentSettingsDoc>(`/api/${scope}/agent`, "PUT", settings);
}

export function sendAgentSettings(scope: string): Promise<AgentConfDesired> {
  return sendJson<AgentConfDesired>(`/api/${scope}/agent/send`, "POST");
}

export function fetchAgentDesired(scope: string): Promise<AgentConfDesired> {
  return getJson<AgentConfDesired>(`/api/${scope}/agent/desired`);
}

/*
 * Настройки haproxy: третий документ той же формы, что nginx и агент.
 * Контроллер собирает из него haproxy.cfg целиком; send кладёт файл в KV.
 */

export type HaproxyBalance = "roundrobin" | "leastconn" | "source";

export interface HaproxyServerWire {
  name: string;
  host: string;
  port?: number;
}

export interface HaproxySettingsWire {
  process?: {
    maxconn?: number;
    bufsize?: number;
  };
  timeouts?: {
    connect_ms?: number;
    client_ms?: number;
    server_ms?: number;
    keepalive_ms?: number;
    tunnel_ms?: number;
  };
  frontend?: {
    port?: number;
  };
  backend?: {
    balance?: HaproxyBalance;
    check?: {
      path?: string;
      status?: number;
      inter_ms?: number;
    };
    servers?: HaproxyServerWire[];
  };
  stats?: {
    enabled?: boolean;
    port?: number;
  };
  docker_dns?: boolean;
}

export interface HaproxySettingsDoc {
  settings: HaproxySettingsWire;
  updated_at: string | null;
  /** Хеш файла из сохранённого черновика: с ним сравнивается флот. */
  sha256: string;
}

export interface HaproxyConfDesired {
  rev: number | null;
  sha256: string | null;
}

export function fetchHaproxySettings(scope: string): Promise<HaproxySettingsDoc> {
  return getJson<HaproxySettingsDoc>(`/api/${scope}/haproxy`);
}

export function saveHaproxySettings(
  scope: string,
  settings: HaproxySettingsWire,
): Promise<HaproxySettingsDoc> {
  return sendJson<HaproxySettingsDoc>(`/api/${scope}/haproxy`, "PUT", settings);
}

export function sendHaproxySettings(scope: string): Promise<HaproxyConfDesired> {
  return sendJson<HaproxyConfDesired>(`/api/${scope}/haproxy/send`, "POST");
}

export function fetchHaproxyDesired(scope: string): Promise<HaproxyConfDesired> {
  return getJson<HaproxyConfDesired>(`/api/${scope}/haproxy/desired`);
}

/**
 * Наследование настроек: что уровень получит сверху, если сам ключ не запишет.
 *
 * Контроллер считает это той же `resolveRoute`, которой пользуется компилятор
 * (`src/model/resolve.ts`), поэтому форма показывает не догадку, а ровно то
 * значение, которое напечатает генератор. Без этого пустое поле на сервере и
 * пути неотличимо от «не задано нигде» и от «снято».
 */
export type InheritFrom = "http" | "server";
export type InheritSection = "waf" | "nginx";

export interface InheritedField {
  section: InheritSection;
  key: string;
  from: InheritFrom;
  value: unknown;
}

export interface InheritanceLayer {
  uuid: string;
  name: string;
  waf: Record<string, unknown>;
  nginx: Record<string, unknown>;
}

export interface HttpInheritance {
  http: InheritanceLayer;
  inherited: InheritedField[];
}

export interface RouteInheritance extends HttpInheritance {
  server: InheritanceLayer;
}

export function fetchHttpInheritance(scope: string): Promise<HttpInheritance> {
  return getJson<HttpInheritance>(`/api/${scope}/http/inheritance`);
}

export function fetchServerInheritance(
  scope: string,
  uuid: string,
): Promise<HttpInheritance> {
  return getJson<HttpInheritance>(`/api/${scope}/servers/${uuid}/inheritance`);
}

export function fetchLocationInheritance(
  scope: string,
  uuid: string,
): Promise<RouteInheritance> {
  return getJson<RouteInheritance>(`/api/${scope}/locations/${uuid}/inheritance`);
}

/**
 * Каталоги, на которые настройки ссылаются по имени. Один запрос на открытие
 * карточки: пять селектов -- не повод для пяти походов.
 */
export interface CatalogBundle {
  deny_responses: { name: string; type: string; status?: number; page?: string }[];
  log_formats: { name: string; kind: "nginx"; summary: string }[];
  datasets: {
    name: string;
    kind: string;
    type: string;
    active: boolean;
    /** Слот `waf_local_dataset` в шаблоне: false -- набор ip-компилятора. */
    in_nginx: boolean;
    /** `ttl=` набора: срок overlay, который наследует автобан у `waf_local_rate`. */
    ttl?: string;
    /** `hash=md5`: набор хранит md5 значений; сравнения и автобан хешируют сами. */
    hash?: boolean;
  }[];
  inspectors: { name: string; subject: string; phases: string[] }[];
  /** Темы уже объявленных инспекторов: из них выбирают второе имя на процесс. */
  subjects: string[];
  /**
   * Подсказка для `profile=`: профили всех сервисов контура. `kind` --
   * сервис ([serviceOfSubject]), а не таблица: `modsec`, `ip`, `auth`,
   * `captcha`, `json`, `action`, `counter`. Сервиса, у которого профилей не
   * бывает (`vlai`), в списке нет.
   */
  profiles: { name: string; kind: string }[];
  response_pages: { name: string }[];
  body_stores: { name: string; driver: string }[];
  upstreams: { uuid: string; name: string }[];
}

export function fetchCatalog(scope: string): Promise<CatalogBundle> {
  return getJson<CatalogBundle>(`/api/${scope}/catalog`);
}

/**
 * Один узел дерева, чей текст показывает превью. `http` -- файл, где апстримы
 * и серверы стоят заглушками `include` по uuid; сервер, путь и пул -- сам блок
 * (у сервера пути тоже заглушками). Без узла -- файл целиком, как на `send`:
 * им засевают «Свой конфиг» пространства.
 */
export type PreviewNode =
  | { kind: "http" }
  | { kind: "server"; uuid: string }
  | { kind: "location"; uuid: string }
  | { kind: "upstream"; uuid: string };

export type PreviewDraft = {
  http?: {
    nginx?: Record<string, unknown>;
    nginx_main?: Record<string, unknown>;
    waf_http?: Record<string, unknown>;
    waf?: Record<string, unknown>;
    raw?: boolean;
    raw_nginx?: string;
  };
  server?: {
    /** Пустой у несохранённой карточки: сервер появляется в дереве целиком. */
    uuid: string;
    nginx?: Record<string, unknown>;
    waf?: Record<string, unknown>;
    server_names?: string[];
    enabled?: boolean;
    raw?: boolean;
    raw_nginx?: string;
    /** Привязки черновика: до «Сохранить» их видит только форма. */
    listens?: { port_id: string; default_server?: boolean }[];
    certificates?: { certificate_id: string; kind: string }[];
  };
  /** Пул: тот же документ, что уходит в запись, плюс uuid (пустой у новой). */
  upstream?: UpstreamInput & { uuid: string };
  location?: {
    uuid: string;
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
};

export interface PreviewResult {
  text: string;
  errors: ChannelPlanError[];
  /*
   * Предупреждения не держат рассылку: конфиг корректен, а названное в них --
   * мёртвая настройка, а не поломка. Ключ необязателен, потому что контроллер
   * прежней версии его не присылает.
   */
  warnings?: { code: string; message: string }[];
}

/**
 * Превью несохранённой карточки настоящим компилятором. Второго компилятора в
 * панели нет намеренно: он разошёлся бы с тем, который печатает файл на `send`,
 * и оператор видел бы текст, который никуда не уедет.
 */
export function previewConfig(
  scope: string,
  draft: PreviewDraft,
  node?: PreviewNode,
): Promise<PreviewResult> {
  return sendJson<PreviewResult>(`/api/${scope}/config/preview`, "POST", {
    draft,
    node,
  });
}

// -- каталоги http {}: ответы отказа, обменник объектов, форматы логов ------------
//
// Без них конфигурация не работает: `waf_capture` без обменника не грузится,
// отказ без записи каталога нечем отдать клиенту, `access_log … main` без
// формата роняет `nginx -t`. Страниц у них до сих пор не было.

export type DenyResponseType = "http" | "grpc" | "websocket";

/**
 * Кто держит запись именем: умолчание маршрута (`waf_deny_response_default`),
 * порог счёта (`score`, by -- фаза), локальный слой (`check`/`rate`), правило
 * ip-профиля либо документ профиля подсистемы (`auth`/`captcha`/`json`/
 * `counter` -- at там имя профиля; незаполненное поле держит умолчание
 * подсистемы). Занятую не удалить и не переименовать: ссылки остались бы на
 * несуществующее -- 409 `in_use` с этим же списком.
 */
export interface DenyResponseUse {
  at: string;
  kind: "default" | "score" | "check" | "rate" | "ip_profile" | "auth" | "captcha" | "json" | "counter";
  by?: string;
}

export interface DenyResponseRow {
  uuid: string;
  name: string;
  type: DenyResponseType;
  spec: {
    status?: number;
    page?: string;
    message?: string;
    code?: number;
    reason?: string;
    /** params=: что запись отдаёт клиенту. Пусто -- всё. */
    params?: string[];
  };
  /** Считает контроллер по waf-документам; в PUT/POST не отправляется. */
  uses?: DenyResponseUse[];
}

/**
 * Драйвер обменника один: `none` и `inline` горячий путь модуля не вызывает, и
 * маршрут со снимком при них не проходит `nginx -t`.
 */
export type StoreDriver = "redis";

export interface BodyStoreRow {
  uuid: string;
  name: string;
  driver: StoreDriver;
  /**
   * Адрес, с которым поднят контроллер (`CONTROLLER_REDIS_URL`): панель его
   * показывает, но не правит -- тот же redis знают агент и инспекторы.
   */
  url: string;
  spec: Record<string, string | number | boolean>;
}

export interface LogFormatRow {
  uuid: string;
  name: string;
  kind: "nginx";
  fields: string[];
  format: string;
}

export async function fetchDenyResponses(scope: string): Promise<DenyResponseRow[]> {
  const row = await getJson<{ deny_responses: DenyResponseRow[] }>(
    `/api/${scope}/deny-responses`,
  );
  return row.deny_responses;
}

export function saveDenyResponse(
  scope: string,
  id: string | null,
  input: Omit<DenyResponseRow, "uuid" | "uses">,
): Promise<DenyResponseRow> {
  return id === null
    ? sendJson(`/api/${scope}/deny-responses`, "POST", input)
    : sendJson(`/api/${scope}/deny-responses/${id}`, "PUT", input);
}

export function deleteDenyResponse(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/deny-responses/${id}`, "DELETE");
}

export async function fetchBodyStores(scope: string): Promise<BodyStoreRow[]> {
  const row = await getJson<{ body_stores: BodyStoreRow[] }>(`/api/${scope}/body-stores`);
  return row.body_stores;
}

/** Драйвер и адрес контроллер печатает сам, поэтому их тут нет. */
export function saveBodyStore(
  scope: string,
  id: string | null,
  input: Pick<BodyStoreRow, "name" | "spec">,
): Promise<BodyStoreRow> {
  return id === null
    ? sendJson(`/api/${scope}/body-stores`, "POST", input)
    : sendJson(`/api/${scope}/body-stores/${id}`, "PUT", input);
}

export async function fetchLogFormats(scope: string): Promise<LogFormatRow[]> {
  const row = await getJson<{ log_formats: LogFormatRow[] }>(`/api/${scope}/log-formats`);
  return row.log_formats;
}

export function saveLogFormat(
  scope: string,
  id: string | null,
  input: Omit<LogFormatRow, "uuid">,
): Promise<LogFormatRow> {
  return id === null
    ? sendJson(`/api/${scope}/log-formats`, "POST", input)
    : sendJson(`/api/${scope}/log-formats/${id}`, "PUT", input);
}

export function deleteLogFormat(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/log-formats/${id}`, "DELETE");
}

/* --- калитка второго фактора (inspectors/auth) ----------------------------- */

/**
 * Глаголы, которые калитка умеет применять. Остальной словарь ей не адресован:
 * challenge проводит капча, порога и памяти про субъектов у калитки нет.
 */
export type AuthVerb = "reauth" | "skip";
/** Оси, встречающиеся при этих глаголах: reauth — session, skip — request. */
export type AuthAxis = "request" | "session";

/**
 * Что профиль принимает от соседа. Единственное место, где чужое высказывание
 * что-то значит: без правила действие не применяется вовсе.
 * Форма и ограничения -- docs/inspector-actions.md.
 */
/**
 * События правил калитки. Просьба соседу доедет только с allow, поэтому у
 * anonymous, invalid и forbidden доступны лишь глаголы записи маршрута.
 */
export type AuthOn = "authenticated" | "anonymous" | "invalid" | "forbidden" | "overload";

/** Правило калитки по событию: просьба соседу либо запись адреса в набор. */
export interface AuthEventRule {
  on: AuthOn;
  /** Только у on: overload: порог заполнения очереди в процентах; пусто -- край. */
  at?: number | null;
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /** mark: метка события на записи -- произвольная строка оператора. */
  marker: string;
  /** mutate: какую группу модификаторов получателя переключить и куда; оба обязательны. */
  group: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** У mutate -- куда переключить группу; у audit / archive -- писать или нет. */
  set: "on" | "off" | "";
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  /** Только archive с set on: исходы, на которых просьбу исполнять. */
  when: ArchiveOutcome[];
  /** Запись в живой набор: имя набора. */
  list: string;
  /**
   * Кого писать: адрес клиента; самый узкий анонс (net); все накрывающие
   * анонсы (net_all); систему целиком (asn) -- подсеть и систему калитка берёт
   * у кодера гео.
   */
  write?: "addr" | "net" | "net_all" | "asn";
  /** Срок: у записи в набор -- срок записи, у archive с set on -- срок архива. */
  ttlS: number;
  code: string;
}

export interface AuthPriorRule {
  /** Имя отправителя; `*` -- любой. */
  from: string;
  accept: AuthVerb[];
  /** Пусто -- любая ось, допустимая при этих глаголах. */
  apply: AuthAxis[];
  /** Пусто -- любой повод. */
  codes: string[];
}

/**
 * Документ источника входа повторяет форму source.yaml инспектора, кроме
 * сроков: в YAML они человеческие ("8h"), здесь -- секунды. Печатает обратно
 * контроллер. Источник -- всё про сам вход: провайдер, форма, сессии, список,
 * то, что калитка рассказывает приложению.
 */
export interface AuthSourceDoc {
  login: { uri: string; title: string; note: string; page: string };
  session: {
    /* Пусто -- умолчание инспектора: waf_sid_<имя источника>. */
    cookie: string;
    ttlS: number;
    renewAfterS: number;
    bind: string[];
    subnet: { v4: number; v6: number };
  };
  ticket: { cookie: string; ttlS: number };
  list: {
    sessions: string;
    cookie: string;
    ttlS: number;
    origin: string;
    /* Окно на доезд записи через секвенсор; 0 -- умолчание инспектора. */
    graceS: number;
  };
  upstream: {
    user: string;
    groups: string;
    method: string;
    cookie: string;
    ttlS: number;
  };
  /* Один источник -- один способ входа; комбинации -- набором инспекторов на маршруте. */
  provider: string;
  /* Откуда стыкованный источник (code/totp) берёт личность: имя первого источника. */
  identity: { from: string };
  providers: {
    local: { users: string } | null;
    code: {
      kind: "totp" | "static";
      digits: number;
      periodS: number;
      skew: number;
      codes: string[];
      users: string;
    } | null;
    ldap: {
      url: string;
      startTls: boolean;
      bind: "upn" | "dn_template" | "search";
      upnSuffix: string;
      dnTemplate: string;
      timeoutS: number;
      groups: string[];
      search: {
        base: string;
        filter: string;
        bindDn: string;
        passwordEnv: string;
        passwordStore: string | null;
      };
      tls: { caFile: string; insecureSkipVerify: boolean };
    } | null;
    ntlm: {
      url: string;
      domain: string;
      timeoutS: number;
      startTls: boolean;
      groups: string[];
      search: {
        base: string;
        filter: string;
        bindDn: string;
        passwordEnv: string;
        passwordStore: string | null;
      };
      tls: { caFile: string; insecureSkipVerify: boolean };
    } | null;
    /*
     * Внешние провайдеры: сессию выписывает не контур. jwt -- чужой токен по
     * схеме claims, app -- кука приложения, которой калитка верит после
     * того, как подсмотрела вход на маршруте приложения.
     */
    jwt: AuthJwtProvider | null;
    app: AuthAppProvider | null;
  };
  lockout: { attempts: number; windowS: number; lockS: number };
  roster: { store: "redis" | "memory"; prefix: string; revokeRefreshMs: number };
}

export const AUTH_JWT_ALGS = [
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "none",
] as const;

export type AuthJwtAlg = (typeof AUTH_JWT_ALGS)[number];

export interface AuthJwtProvider {
  /* Ровно одно: кука либо заголовок с префиксом схемы («Bearer»). */
  cookie: string;
  header: string;
  prefix: string;
  verify: {
    alg: AuthJwtAlg;
    /* PEM публичного ключа для RS/ES; секрет HMAC -- только из окружения. */
    key: string;
    secretEnv: string;
    issuer: string;
    audience: string;
    leewayS: number;
  };
  claims: { user: string; session: string; groups: string; issued: string; expiry: string };
}

export const AUTH_APP_FIELD_SOURCES = ["body.form", "body.json", "args", "header"] as const;

export type AuthAppFieldSource = (typeof AUTH_APP_FIELD_SOURCES)[number];

export interface AuthAppProvider {
  cookie: string;
  learn: {
    login: { uri: string; method: string };
    logout: { uri: string; method: string };
    success: {
      status: number[];
      cookieNew: boolean;
      json: { path: string; equals: string } | null;
    };
    user: { from: AuthAppFieldSource; field: string };
  };
}

export interface AuthSource {
  uuid: string;
  http_space_id: string;
  /* Сервер, из локейшенов которого выбран адрес формы. */
  server_id: string | null;
  name: string;
  description: string;
  provider: string;
  doc: AuthSourceDoc;
  created_at: string;
  updated_at: string;
  /* Кто держит источник: профили (doc.source) и соседи (identity.from). */
  uses?: { at: string; kind: string }[];
}

/**
 * Документ профиля -- политика одного маршрута: режим, ссылка на источник,
 * условия допуска и правила приёма чужих просьб. Всё про сам вход живёт в
 * источнике.
 */
export interface AuthProfileDoc {
  /* Имя источника входа. Пусто -- профиль ничего не проверяет. */
  source: string;
  gate: {
    redirectMethods: string[];
    redirectStatus: number;
    denyResponse: string;
    htmlOnly: boolean;
    /*
     * Допуск по группам: вошедший обязан состоять хотя бы в одной. Пусто --
     * довольно самого входа. Проверяет их инспектор по сессии, поэтому пара
     * профилей на один источник -- общий и закрытый -- второго входа не требует.
     */
    groups: string[];
    /* Запись каталога под отказ «вошли, но не сюда» (403). */
    forbiddenResponse: string;
    /*
     * Форма телом ответа на том же URI вместо редиректа: инспектор кладёт её
     * в обменник и называет модулю секцией rewrite. false -- обычный редирект.
     */
    inline: boolean;
  };
  trigger: {
    prior: AuthPriorRule[];
    /** Возраст сессии, с которого действует просьба reauth; 0 — всегда. */
    reauthAfterS: number;
  };
  /** Правила по событиям волны: что калитка говорит соседям и маршруту. */
  rules: AuthEventRule[];
}

export interface AuthProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  source: string;
  doc: AuthProfileDoc;
  created_at: string;
  updated_at: string;
  /**
   * Отправители из правил `prior`, которых нет в реестре контура: их просьбы
   * не придут никогда. Приезжает только с карточкой (`GET .../profiles/:uuid`),
   * в списке профилей поля нет. Не ошибка -- реестр правят отдельно.
   */
  unknown_senders?: string[];
  /**
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах `prior`. Список общий на пространство и
   * неполон по построению: профили, приезжающие файлами, контроллеру не
   * видны, поэтому поле поводов остаётся свободным вводом. Только с
   * карточкой.
   */
  sender_codes?: SenderCode[];
  /**
   * Профиль default отличается от поставки: считает контроллер, сверяя его
   * с образцом из сида. У своего профиля всегда false.
   */
  modified?: boolean;
}

export async function fetchAuthProfiles(scope: string): Promise<AuthProfile[]> {
  const row = await getJson<{ profiles: AuthProfile[] }>(
    `/api/${scope}/auth/profiles`,
  );

  return row.profiles;
}

export function fetchAuthProfile(scope: string, id: string): Promise<AuthProfile> {
  return getJson<AuthProfile>(`/api/${scope}/auth/profiles/${id}`);
}

export function saveAuthProfile(
  scope: string,
  id: string | null,
  input: {
    name: string;
    description: string;
    doc: AuthProfileDoc;
  },
): Promise<AuthProfile> {
  return id === null
    ? sendJson<AuthProfile>(`/api/${scope}/auth/profiles`, "POST", input)
    : sendJson<AuthProfile>(`/api/${scope}/auth/profiles/${id}`, "PUT", input);
}

/* --- источники входа -------------------------------------------------------- */

export async function fetchAuthSources(scope: string): Promise<AuthSource[]> {
  const row = await getJson<{ sources: AuthSource[] }>(`/api/${scope}/auth/sources`);

  return row.sources;
}

export function fetchAuthSource(scope: string, id: string): Promise<AuthSource> {
  return getJson<AuthSource>(`/api/${scope}/auth/sources/${id}`);
}

export function saveAuthSource(
  scope: string,
  id: string | null,
  input: {
    name: string;
    description: string;
    server_id: string | null;
    doc: AuthSourceDoc;
  },
): Promise<AuthSource> {
  return id === null
    ? sendJson<AuthSource>(`/api/${scope}/auth/sources`, "POST", input)
    : sendJson<AuthSource>(`/api/${scope}/auth/sources/${id}`, "PUT", input);
}

export function deleteAuthSource(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/auth/sources/${id}`, "DELETE");
}

export function deleteAuthProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/auth/profiles/${id}`, "DELETE");
}

/**
 * Вернуть default к поставке: контроллер перезаписывает его образцом из
 * сида. Своего профиля ручка не касается -- отвечает `not_default`.
 */
export function restoreAuthProfile(scope: string, id: string): Promise<AuthProfile> {
  return sendJson<AuthProfile>(`/api/${scope}/auth/profiles/${id}/restore`, "POST");
}

/*
 * Пользователи живут в обычном списке строк: правит их раздел данных, а
 * контроллер считает bcrypt и отдаёт готовую запись login:hash[:группы].
 * Открытый пароль уходит на контроллер один раз и не сохраняется нигде.
 */
export async function buildAuthUserLine(
  scope: string,
  input: { login: string; password: string; groups?: string[]; totp_store?: string },
): Promise<string> {
  const row = await sendJson<{ line: string }>(
    `/api/${scope}/auth/user-line`,
    "POST",
    input,
  );

  return row.line;
}

/* Поколение калитки: то же, что лежит в KV WAF_DESIRED/policy/auth. */
export interface AuthManifestFile {
  name: string;
  text: string;
}

export interface AuthManifest {
  v: number;
  rev: number;
  config_hash: string;
  sources: Record<string, { files: AuthManifestFile[] }>;
  profiles: Record<string, { files: AuthManifestFile[] }>;
}

/** Разослать поколение: сборка манифеста и запись в KV. */
export function sendAuthProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/auth/send`, "POST");
}

export function fetchAuthDesired(scope: string): Promise<AuthManifest> {
  return getJson(`/api/${scope}/auth/desired`);
}

/* --- капча (inspectors/captcha) ------------------------------------------ */

/**
 * Документ профиля повторяет форму profile.yaml инспектора, кроме сроков
 * (здесь секунды) и лимитов (строки "30/m" как в YAML).
 */
/** Глаголы, которые капча умеет применять. `reauth` адресован не ей;
 * `threshold` умер вместе со счётом-триггером. */
export type CaptchaVerb = "challenge" | "skip" | "note";
/** Пункт accept: глагол либо `*` -- все четыре. */
export type CaptchaAccept = CaptchaVerb | "*";

/**
 * Что профиль принимает от соседа. Три поля: осей и потолков больше нет --
 * куда падает заряд, называет сама просьба, границы держат отправитель и
 * ёмкость корзины (docs/buckets.md репозитория captcha).
 */
export interface CaptchaPriorRule {
  /** Имя отправителя; `*` -- любой (тогда только challenge). */
  from: string;
  accept: CaptchaAccept[];
  /** Пусто -- любой повод. */
  codes: string[];
}

/** Корзина общего счёта: ёмкость, потери (%/с) и свои пороги. */
export interface CaptchaBucketTier {
  max: number;
  loss: number;
  /** % заполнения -- на виджет; 0 -- считает, но не гонит. */
  captchaAt: number;
  /** % заполнения -- правила «порог бана»; 0 -- не срабатывает. */
  banAt: number;
}

export interface CaptchaBuckets {
  ip: CaptchaBucketTier;
  sess: CaptchaBucketTier;
  asnNet: CaptchaBucketTier;
  asnRouter: CaptchaBucketTier;
}

/** Событие правила: провал, прохождение, два порога корзины и клиренс -- есть он или нет. */
export type CaptchaOn =
  | "fail"
  | "pass"
  | "bucket_captcha"
  | "bucket_ban"
  | "cleared"
  | "uncleared"
  | "overload";

/**
 * Правило по событию: «когда → кому → что сделать». Действие ровно одно:
 * заряд своей корзины, запись в набор либо просьба соседу (только у событий
 * волны -- порогов и клиренса: fail и pass случаются в HTTP-процессе, он не
 * на волне).
 */
export interface CaptchaEventRule {
  on: CaptchaOn;
  /** Только у on: overload: порог заполнения очереди в процентах; пусто -- край. */
  at?: number | null;
  /** У порогов корзин: какая корзина; пусто -- любая. */
  bucket: string;
  /** У uncleared и порогов: что капча решила на этом запросе; пусто -- любое решение. */
  next: "" | "allow" | "challenge";
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /** mark: метка события на записи -- произвольная строка оператора. */
  marker: string;
  /** mutate: какую группу модификаторов получателя переключить и куда; оба обязательны. */
  group: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** У mutate -- куда переключить группу; у audit / archive -- писать или нет. */
  set: "on" | "off" | "";
  /** Объекты просьбы записи (audit / archive с set on). */
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  /** Только archive с set on: исходы, на которых просьбу исполнять. */
  when: ArchiveOutcome[];
  list: string;
  /** Срок: у записи в набор -- срок записи, у archive с set on -- срок архива. */
  ttlS: number;
  write: "addr" | "net" | "net_all" | "asn" | "cid";
  charge: string;
  percent: number;
  code: string;
}

export interface CaptchaProviderRef {
  kind: string;
  length: number;
  audio: boolean;
}

export interface CaptchaExternalConfig {
  version: string;
  sitekey: string;
  secretEnv: string;
  secretStore: string | null;
  minScore: number;
  remoteip: boolean;
  timeoutS: number;
  onError: "fallback" | "allow" | "deny";
}

export interface CaptchaProfileDoc {
  path: string;
  title: string;
  note: string;
  page: string;
  trigger: {
    when: "always" | "buckets" | "never";
    prior: CaptchaPriorRule[];
  };
  buckets: CaptchaBuckets;
  rules: CaptchaEventRule[];
  gate: {
    redirectMethods: string[];
    redirectStatus: number;
    denyResponse: string;
    htmlOnly: boolean;
    /*
     * Виджет телом ответа на том же URI вместо редиректа: инспектор кладёт
     * страницу в обменник и называет модулю секцией rewrite. false -- редирект.
     */
    inline: boolean;
  };
  provider: CaptchaProviderRef;
  fallback: CaptchaProviderRef | null;
  providerConfig: {
    image: { alphabet: string; languages: string[]; audioDir: string };
    turnstile: CaptchaExternalConfig;
    recaptcha: CaptchaExternalConfig;
    hcaptcha: CaptchaExternalConfig;
    smartcaptcha: CaptchaExternalConfig;
  };
  challenge: { cookie: string; ttlS: number };
  clearance: {
    cookie: string;
    idCookie: string;
    ttlS: number;
    bind: string[];
    subnet: { v4: number; v6: number };
    /*
     * Живые клиренсы: истина капчи -- кука и список. Пусто -- списка нет,
     * клиренс живёт одной подписью и погасить его снаружи нельзя.
     */
    list: string;
    /* Окно на доезд записи через секвенсор; 0 -- умолчание инспектора. */
    graceS: number;
  };
  fingerprint: { collect: boolean; canvas: boolean; farmAt: number; windowS: number };
  limits: {
    issuePerSubnet: string;
    verifyPerSubnet: string;
    pendingMax: number;
    providerBudget: string;
  };
  upstream: { header: string };
  roster: { store: "redis" | "memory"; prefix: string; revokeRefreshMs: number };
  languages: string[];
}

export interface CaptchaProfile {
  uuid: string;
  http_space_id: string;
  server_id: string | null;
  name: string;
  description: string;
  when: string;
  provider: string;
  fallback: string | null;
  doc: CaptchaProfileDoc;
  created_at: string;
  updated_at: string;
  /**
   * Отправители из правил `prior`, которых нет в реестре контура: их просьбы
   * не придут никогда. Приезжает только с карточкой (`GET .../profiles/:uuid`),
   * в списке профилей поля нет. Не ошибка -- реестр правят отдельно.
   */
  unknown_senders?: string[];
  /**
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах `prior`. Список общий на пространство и
   * неполон по построению: профили, приезжающие файлами, контроллеру не
   * видны, поэтому поле поводов остаётся свободным вводом. Только с
   * карточкой.
   */
  sender_codes?: SenderCode[];
  /**
   * Профиль default отличается от поставки: считает контроллер, сверяя его
   * с образцом из сида. У своего профиля всегда false.
   */
  modified?: boolean;
}

export async function fetchCaptchaProfiles(scope: string): Promise<CaptchaProfile[]> {
  const row = await getJson<{ profiles: CaptchaProfile[] }>(
    `/api/${scope}/captcha/profiles`,
  );

  return row.profiles;
}

export function fetchCaptchaProfile(scope: string, id: string): Promise<CaptchaProfile> {
  return getJson<CaptchaProfile>(`/api/${scope}/captcha/profiles/${id}`);
}

export function saveCaptchaProfile(
  scope: string,
  id: string | null,
  input: {
    name: string;
    description: string;
    server_id: string | null;
    doc: CaptchaProfileDoc;
  },
): Promise<CaptchaProfile> {
  return id === null
    ? sendJson<CaptchaProfile>(`/api/${scope}/captcha/profiles`, "POST", input)
    : sendJson<CaptchaProfile>(`/api/${scope}/captcha/profiles/${id}`, "PUT", input);
}

export function deleteCaptchaProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/captcha/profiles/${id}`, "DELETE");
}

/**
 * Вернуть default к поставке: контроллер перезаписывает его образцом из
 * сида. Своего профиля ручка не касается -- отвечает `not_default`.
 */
export function restoreCaptchaProfile(
  scope: string,
  id: string,
): Promise<CaptchaProfile> {
  return sendJson<CaptchaProfile>(
    `/api/${scope}/captcha/profiles/${id}/restore`,
    "POST",
  );
}

/* Поколение профилей капчи: то же, что лежит в KV WAF_DESIRED/policy/captcha. */
export function sendCaptchaProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/captcha/send`, "POST");
}

export function fetchCaptchaDesired(scope: string): Promise<AuthManifest> {
  return getJson(`/api/${scope}/captcha/desired`);
}

/* --- профили контракта API (inspectors/json) ------------------------------- */

/*
 * Документ профиля повторяет форму profile.yaml инспектора, кроме двух мест:
 * ссылка на спецификацию здесь -- uuid объекта содержимого (имя подставляет
 * манифест), а размеры -- байтами. Фазы описаны раздельно и независимы.
 */
export type JsonAction = "deny" | "score" | "allow";

/** Правило исхода: что делать и сколько добавить (счёт читается при score). */
export interface JsonRule {
  action: JsonAction;
  score: number;
}

export interface JsonRequestPhase {
  enabled: boolean;
  checks: { body: boolean; query: boolean; pathParams: boolean; headers: boolean };
  policy: Record<string, JsonRule>;
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonResponsePhase {
  enabled: boolean;
  checks: { body: boolean; status: boolean; contentType: boolean };
  policy: Record<string, JsonRule>;
  onlyTypes: string[];
  denyResponse: string;
  outcomes: JsonOutcome[];
}

/*
 * Кадры WebSocket: третья независимая проверка профиля. Схема сообщения
 * выбирается по направлению и по дискриминатору в теле; политики свои у
 * каждого направления (docs/README.md репозитория json, «Кадры WebSocket»).
 */
export type JsonDirection = "c2s" | "s2c" | "any";

export interface JsonFrameBinding {
  path: string;
  match: "exact" | "prefix";
  direction: JsonDirection;
  subprotocol: string;
  discriminator: { pointer: string; value: string } | null;
  schema: string;
}

export interface JsonFrameDirection {
  checks: { body: boolean };
  policy: Record<string, JsonRule>;
  denyResponse: string;
  outcomes: JsonOutcome[];
}

export interface JsonFramePhase {
  enabled: boolean;
  bindings: JsonFrameBinding[];
  c2s: JsonFrameDirection;
  s2c: JsonFrameDirection;
}

export interface JsonBinding {
  methods: string[];
  path: string;
  match: "exact" | "prefix";
  schema: string;
}

/** Глаголы, которые инспектор контракта умеет применять. */
export type JsonVerb = "threshold" | "skip";

/**
 * Что профиль принимает от соседа. `*` не принимается: оба глагола умеют
 * ослаблять, послабление требует имени отправителя.
 */
export interface JsonPriorRule {
  from: string;
  accept: JsonVerb[];
  /** Пусто -- любой повод. */
  codes: string[];
}

/**
 * Триггер инициатора: собственный решённый вердикт фазы. `level` есть только
 * у счётчика (уровень корзины), `overload` -- только у vlai (запрос снят на
 * входе из-за полной очереди); чьи триггеры предлагать, решает страница
 * пропсом `ons` блока инициаторов.
 */
export type JsonOn = "deny" | "allow" | "score" | "level" | "overload";

/**
 * Инициатор по исходу: «когда → что сделать». Действие ровно одно -- просьба
 * соседу (непустой `do`) либо запись адреса клиента в живой набор (`list`).
 */
/** Условие по уровню корзины: есть только у счётчика (on: level). */
export interface OutcomeIf {
  counter: string;
  axis: string;
}

export interface JsonOutcome {
  /**
   * Только в панели: секция строки в объединённой таблице инициаторов
   * (счётчик держит request и frame одной таблицей). В документ не пишется --
   * форма раскладывает строки по секциям сама. Не `phase`: то поле -- фаза
   * вызова адресата у просьбы, и оно едет в документ.
   */
  section?: string;
  on: JsonOn;
  at: number | null;
  below: boolean;
  /** Только при on: level — какую корзину смотреть. */
  if?: OutcomeIf | null;
  /** Точное сравнение: score == at. С below взаимоисключимы. */
  eq: boolean;
  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  /** note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /** mark: метка события на записи -- произвольная строка оператора. */
  marker?: string;
  /** mutate: какую группу модификаторов получателя переключить и куда; оба обязательны. */
  group?: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** У mutate -- куда переключить группу; у audit / archive -- писать или нет. */
  set?: "on" | "off" | "";
  /**
   * Объекты просьбы записи (audit / archive с set on) -- как строки
   * директив: у каждого сторона, размер, источник. Срок архива -- тот же
   * ttlS, что у записи в набор.
   */
  headers?: RecordObject | null;
  args?: RecordObject | null;
  body?: RecordObject | null;
  /**
   * Только archive с set on: исходы, на которых просьбу исполнять -- как
   * `when=` директивы. Пусто -- любой, включая перенаправление.
   */
  when?: ArchiveOutcome[];
  list: string;
  /**
   * Кого писать в набор: адрес; эффективный анонс (net); все накрывающие
   * анонсы (net_all); систему целиком (asn) -- подсеть и систему разворачивает
   * инспектор у кодера гео.
   */
  write: "addr" | "net" | "net_all" | "asn";
  ttlS: number;
  code: string;
}

/**
 * Строка инициатора, общая для всех, кто умеет говорить сам: форма одна, и
 * блок таблицы у них тоже один (components/outcomes-block.tsx).
 */
export type OutcomeRule = JsonOutcome;

/** Политика профиля правил: обе стороны канала действий одним документом. */
export interface ModsecPriorRule {
  from: string;
  accept: string[];
  codes: string[];
}

export interface ModsecPolicy {
  prior: ModsecPriorRule[];
  outcomes: OutcomeRule[];
}

export interface JsonProfileDoc {
  trigger: { prior: JsonPriorRule[] };
  description: string;
  schema: {
    kind: "openapi" | "jsonschema";
    source: string;
    basePath: string;
  };
  request: JsonRequestPhase;
  response: JsonResponsePhase;
  frame: JsonFramePhase;
  bindings: JsonBinding[];
  limits: { maxBody: number; maxDepth: number; maxErrors: number; cache: number };
  audit: { values: "off" | "hash"; paths: boolean };
}

export interface JsonProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  kind: string;
  source: string;
  doc: JsonProfileDoc;
  created_at: string;
  updated_at: string;
  /** Отправители из правил prior, которых нет в реестре. Только с карточкой. */
  unknown_senders?: string[];
  /**
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах `prior`. Список общий на пространство и
   * неполон по построению: профили, приезжающие файлами, контроллеру не
   * видны, поэтому поле поводов остаётся свободным вводом. Только с
   * карточкой.
   */
  sender_codes?: SenderCode[];
  /**
   * Профиль default отличается от поставки: считает контроллер, сверяя его
   * с образцом из сида. У своего профиля всегда false.
   */
  modified?: boolean;
}

export async function fetchJsonProfiles(scope: string): Promise<JsonProfile[]> {
  const row = await getJson<{ profiles: JsonProfile[] }>(`/api/${scope}/json/profiles`);

  return row.profiles;
}

export function fetchJsonProfile(scope: string, id: string): Promise<JsonProfile> {
  return getJson<JsonProfile>(`/api/${scope}/json/profiles/${id}`);
}

export function saveJsonProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: JsonProfileDoc },
): Promise<JsonProfile> {
  return id === null
    ? sendJson<JsonProfile>(`/api/${scope}/json/profiles`, "POST", input)
    : sendJson<JsonProfile>(`/api/${scope}/json/profiles/${id}`, "PUT", input);
}

export function deleteJsonProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/json/profiles/${id}`, "DELETE");
}

/**
 * Вернуть default к поставке: контроллер перезаписывает его образцом из
 * сида. Своего профиля ручка не касается -- отвечает `not_default`.
 */
export function restoreJsonProfile(scope: string, id: string): Promise<JsonProfile> {
  return sendJson<JsonProfile>(`/api/${scope}/json/profiles/${id}/restore`, "POST");
}

/* Поколение профилей контракта: то же, что лежит в KV WAF_DESIRED/policy/json. */
export function sendJsonProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/json/send`, "POST");
}

export function fetchJsonDesired(scope: string): Promise<AuthManifest> {
  return getJson(`/api/${scope}/json/desired`);
}

/* --- счётчик (inspectors/counter) ------------------------------------------ */

/*
 * Документы повторяют контроллер (model/counter-profile.ts): профиль -- суд и
 * учёт, общая секция -- объявления счётчиков и источники ключей субъектов.
 * Секция одна на инспектор, а не на профиль: счётчики общие по имени, и
 * маршруты с разными профилями намеренно греют один счёт.
 */

export const COUNTER_AXES = ["ip", "asn_net", "asn_router", "sess", "user", "conn"] as const;

/** Селекторы правил measure фазы кадров. */
export const COUNTER_DIRECTIONS = ["c2s", "s2c"] as const;
export const COUNTER_OPCODES = ["text", "binary", "continuation"] as const;

export type CounterAxis = (typeof COUNTER_AXES)[number];

export interface CounterAxisTier {
  /** Ёмкость в натуральных единицах счётчика. */
  max: number;
  /** Потери, % ёмкости в секунду: тихий субъект остывает за 100/loss секунд. */
  loss: number;
}

/** Владение шкалой: корзину наполняет ровно один вход. */
export type CounterFill = "measure" | "note";

/**
 * Свои источники ключей настраиваемых осей счётчика: «на эту куку заведён
 * счётчик» видно прямо в объявлении. null — общие источники секции subjects.
 */
export interface CounterDeclSubjects {
  sess: { cookie: string };
  user: { from: string };
}

export interface CounterDecl {
  unit: string;
  fill: CounterFill;
  axes: Partial<Record<CounterAxis, CounterAxisTier>>;
  subjects: CounterDeclSubjects | null;
}

export interface CounterSharedDoc {
  counters: Record<string, CounterDecl>;
  subjects: { sess: { cookie: string }; user: { from: string } };
}

export interface CounterJudgeRule {
  counter: string;
  axis: CounterAxis;
  /** Порог в процентах заполнения. */
  at: number;
  action: "score" | "deny";
  score: number;
  code: string;
}

export interface CounterMeasureIf {
  status: number[];
  contentType: string[];
  methods: string[];
  /** Только у правил фазы кадров: направление и опкод кадра. Пусто -- любое. */
  direction: string[];
  opcode: string[];
}

export type CounterSource = "const" | "regex_count" | "size_kb" | "bytes";

export interface CounterMeasureRule {
  if: CounterMeasureIf;
  source: CounterSource;
  regex: string;
  /** Множитель значения источника; null -- единица. Минус снимает. */
  per: number | null;
  counter: string;
  /** Пусто -- все объявленные оси счётчика. */
  axes: CounterAxis[];
}

export type CounterVerb = "threshold" | "skip" | "note";

export interface CounterPriorRule {
  from: string;
  accept: CounterVerb[];
  /** Оси провода, о которых слушаем; пусто -- любая допустимая при глаголах. */
  apply: string[];
  codes: string[];
  /** Корзина fill: note, которую наполняют принятые note; обязательна при note. */
  counter: string;
}

export interface CounterProfileDoc {
  description: string;
  trigger: { prior: CounterPriorRule[] };
  request: {
    enabled: boolean;
    judge: CounterJudgeRule[];
    denyResponse: string;
    outcomes: OutcomeRule[];
  };
  response: { enabled: boolean; measure: CounterMeasureRule[] };
  /**
   * Кадры WebSocket в обе стороны: на кадре счётчик и меряет, и судит --
   * заряд кадра виден суду того же кадра. Отказ закрывает соединение кадром
   * Close из записи deny_response (type=websocket).
   */
  frame: CounterFramePhase;
}

export interface CounterFramePhase {
  enabled: boolean;
  measure: CounterMeasureRule[];
  judge: CounterJudgeRule[];
  denyResponse: string;
  outcomes: OutcomeRule[];
}

export interface CounterProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: CounterProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_senders?: string[];
  /**
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах `prior`. Список общий на пространство и
   * неполон по построению: профили, приезжающие файлами, контроллеру не
   * видны, поэтому поле поводов остаётся свободным вводом. Только с
   * карточкой.
   */
  sender_codes?: SenderCode[];
  /**
   * Профиль default отличается от поставки: считает контроллер, сверяя его
   * с образцом из сида. У своего профиля всегда false.
   */
  modified?: boolean;
}

export async function fetchCounterProfiles(scope: string): Promise<CounterProfile[]> {
  const row = await getJson<{ profiles: CounterProfile[] }>(
    `/api/${scope}/counter/profiles`,
  );

  return row.profiles;
}

export function fetchCounterProfile(scope: string, id: string): Promise<CounterProfile> {
  return getJson<CounterProfile>(`/api/${scope}/counter/profiles/${id}`);
}

export function saveCounterProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: CounterProfileDoc },
): Promise<CounterProfile> {
  return id === null
    ? sendJson<CounterProfile>(`/api/${scope}/counter/profiles`, "POST", input)
    : sendJson<CounterProfile>(`/api/${scope}/counter/profiles/${id}`, "PUT", input);
}

export function deleteCounterProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/counter/profiles/${id}`, "DELETE");
}

/**
 * Вернуть default к поставке: контроллер перезаписывает его образцом из
 * сида. Своего профиля ручка не касается -- отвечает `not_default`.
 */
export function restoreCounterProfile(
  scope: string,
  id: string,
): Promise<CounterProfile> {
  return sendJson<CounterProfile>(
    `/api/${scope}/counter/profiles/${id}/restore`,
    "POST",
  );
}

export async function fetchCounterShared(scope: string): Promise<CounterSharedDoc> {
  const row = await getJson<{ shared: CounterSharedDoc }>(`/api/${scope}/counter/shared`);

  return row.shared;
}

export async function saveCounterShared(
  scope: string,
  shared: CounterSharedDoc,
): Promise<CounterSharedDoc> {
  const row = await sendJson<{ shared: CounterSharedDoc }>(
    `/api/${scope}/counter/shared`,
    "PUT",
    { shared },
  );

  return row.shared;
}

/* Поколение счётчика: то же, что лежит в KV WAF_DESIRED/policy/counter. */
export function sendCounterProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/counter/send`, "POST");
}

/* --- профили инспектора действий (inspectors/action) ----------------------- */

/*
 * Чистый отправитель канала действий: правило -- признак запроса плюс просьбы
 * соседям. Документ повторяет YAML загрузчика
 * (inspectors/action/internal/policy/policy.go); вердикта у процесса нет.
 */

/** Просьба соседу -- форма провода. Адресат обязателен: «всем» здесь нет. */
export interface ActionProfileAsk {
  to: string;
  do: string;
  apply: string;
  /** Только threshold: проценты коэффициента, −100..900. */
  delta: number | null;
  /** Только note: проценты шкалы счётчика получателя, −100..100. */
  value: number | null;
  /** Только note: имя корзины получателя — селектор поверх его правил приёма. */
  counter: string;
  /** Только mark, обязательно: метка события на записи -- строка оператора. */
  marker: string;
  /** Только mutate, оба обязательны: какую группу модификаторов получателя переключить и куда. */
  group: string;
  /** Управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** У mutate -- куда переключить группу; у audit / archive -- писать или нет. */
  set: "on" | "off" | "";
  /** Объекты просьбы записи, каждый со своей стороной, размером и источником. */
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  /** Срок архива в секундах у archive с set on; 0 -- как на маршруте. */
  ttlS: number;
  /**
   * Только archive с set on: исходы, на которых просьбу исполнять -- как
   * `when=` директивы. Пусто -- любой, включая перенаправление.
   */
  when: ArchiveOutcome[];
  /**
   * Запись в живой набор вместо просьбы: имя активного списка. Непусто --
   * адресата и глагола у строки нет, пишет сам инспектор; срок -- ttlS.
   */
  list?: string;
  /** Кого писать: адрес, самый узкий анонс, все накрывающие, систему целиком. */
  write?: "addr" | "net" | "net_all" | "asn";
  code: string;
}

/** Признаки запроса. Все заданные блоки обязаны совпасть (И); пустой match
 * совпадает со всяким запросом профиля. */
export interface ActionProfileMatch {
  pathPrefix: string;
  suffixes: string[];
  static: boolean;
  methods: string[];
}

/**
 * Сравнение строки условия: с набором (in, not_in), с текстом (eq, ne) либо
 * ссылка на другое условие (is, is_not -- истинно / ложно).
 */
export const ACTION_COND_OPS = ["in", "not_in", "eq", "ne", "is", "is_not"] as const;

export type ActionCondOp = (typeof ACTION_COND_OPS)[number];

/**
 * Строка условия профиля действий: значение из запроса против набора либо
 * текста. Запись значения -- как у условий вызова на маршруте (`$uri`,
 * `$http_x_api_key`, `$waf_request_cookies.sid`), плюс `$waf_var.<имя>` --
 * поле секции vars сообщения инспектору.
 */
export interface ActionClause {
  value: string;
  op: ActionCondOp;
  /** Только in / not_in: имя активного набора пространства. */
  dataset: string;
  /** Только eq / ne: образец, побайтно. */
  text: string;
  /** Только is / is_not: имя другого условия профиля. */
  cond: string;
}

/**
 * Именованное условие: строки складываются по И либо, при any, по ИЛИ;
 * правила и другие условия ссылаются на него по имени.
 */
export interface ActionCondition {
  name: string;
  any: boolean;
  rows: ActionClause[];
}

export interface ActionProfileRule {
  /** Имя живёт в логе и аудите, на провод не едет. */
  name: string;
  /** Строка перегрузки: on: overload и порог очереди в процентах; пусто -- правило по совпадению. */
  on?: "" | "overload";
  at?: number | null;
  match: ActionProfileMatch;
  /** Имя условия профиля; пусто -- правило всегда. */
  cond?: string;
  /** Действия едут, когда условие ложно. */
  negate?: boolean;
  actions: ActionProfileAsk[];
}

export interface ActionProfileDoc {
  description: string;
  conditions?: ActionCondition[];
  rules: ActionProfileRule[];
}

export interface ActionProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: ActionProfileDoc;
  created_at: string;
  updated_at: string;
  /** Адресаты из правил, которых нет в реестре. Только с карточкой. */
  unknown_targets?: string[];
  /**
   * Профиль default отличается от поставки: считает контроллер, сверяя его
   * с образцом из сида. У своего профиля всегда false.
   */
  modified?: boolean;
}

export async function fetchActionProfiles(scope: string): Promise<ActionProfile[]> {
  const row = await getJson<{ profiles: ActionProfile[] }>(
    `/api/${scope}/action/profiles`,
  );

  return row.profiles;
}

export function fetchActionProfile(scope: string, id: string): Promise<ActionProfile> {
  return getJson<ActionProfile>(`/api/${scope}/action/profiles/${id}`);
}

export function saveActionProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: ActionProfileDoc },
): Promise<ActionProfile> {
  return id === null
    ? sendJson<ActionProfile>(`/api/${scope}/action/profiles`, "POST", input)
    : sendJson<ActionProfile>(`/api/${scope}/action/profiles/${id}`, "PUT", input);
}

export function deleteActionProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/action/profiles/${id}`, "DELETE");
}

/**
 * Вернуть default к поставке: контроллер перезаписывает его образцом из
 * сида. Своего профиля ручка не касается -- отвечает `not_default`.
 */
export function restoreActionProfile(
  scope: string,
  id: string,
): Promise<ActionProfile> {
  return sendJson<ActionProfile>(
    `/api/${scope}/action/profiles/${id}/restore`,
    "POST",
  );
}

/* Поколение профилей действий: то же, что в KV WAF_DESIRED/policy/action. */
export function sendActionProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/action/send`, "POST");
}

/* --- профили инспектора куки (inspectors/cookie) --------------------------- */

/*
 * Кука: выдать, снять, записать её значение в живой набор и рассказать
 * соседям. Документ повторяет YAML загрузчика
 * (inspectors/cookie/internal/policy/policy.go, cookie.go); вердикта у
 * процесса нет.
 *
 * Два уровня: cookies -- объявления (что это за кука), rules -- когда её
 * выдать или снять. Условия и признаки запроса -- те же, что у инспектора
 * действий, и типы берутся оттуда же.
 */

/** Состояние куки на входе, с которым сверяется правило. */
export const COOKIE_STATES = ["absent", "present", "invalid", "expired"] as const;

export type CookieState = (typeof COOKIE_STATES)[number];

/** Чем подписывается значение; none снимает состояния invalid и expired. */
export const COOKIE_SIGNS = ["hmac", "none"] as const;

export type CookieSign = (typeof COOKIE_SIGNS)[number];

/** Фаза правила; пусто -- обе. */
export const COOKIE_PHASES = ["request", "response"] as const;

export type CookiePhase = (typeof COOKIE_PHASES)[number];

/** Кого писать в набор: четыре общих охвата плюс значение самой куки. */
export const COOKIE_WRITES = ["addr", "net", "net_all", "asn", "cookie"] as const;

export type CookieWrite = (typeof COOKIE_WRITES)[number];

/** Чем заполнить значение при выдаче. */
export interface CookieValue {
  /** Откуда взять метку: операнд условий; пусто -- нет источника. */
  from: string;
  /** Источника нет либо он пуст -- эта метка. */
  default: string;
  /** Случайный хвост, байт; 0 -- без него. */
  random: number;
  /** Предел метки до сборки значения. */
  maxLen: number;
}

/**
 * Объявление куки. Secure, HttpOnly и SameSite здесь не живут: их форсирует
 * waf_cookie_defaults маршрута, домена у куки нет вовсе -- она host-only.
 */
export interface CookieDecl {
  name: string;
  path: string;
  /** Срок в секундах; 0 -- кука сессии. */
  maxAgeS: number;
  /** Возраст, после которого состояние -- expired; 0 -- состояния нет. */
  renewAfterS: number;
  sign: CookieSign;
  value: CookieValue;
}

/** Строка правила: просьба соседу либо запись в набор -- как у действий. */
export interface CookieProfileAsk extends Omit<ActionProfileAsk, "write"> {
  write?: CookieWrite;
  /** Положить в набор (умолчание) либо снять из него. */
  op?: "add" | "remove";
  /** Только write: cookie -- чьё значение писать; пусто -- кука правила. */
  cookie?: string;
}

export interface CookieProfileRule {
  name: string;
  match: ActionProfileMatch;
  /** Фаза правила; пусто -- обе. */
  phase?: CookiePhase | "";
  /** Коды ответа апстрима; только фаза ответа, пусто -- любой. */
  status?: number[];
  /** Состояние куки на входе; пусто -- любое; overload -- строка перегрузки. */
  on?: CookieState | "overload" | "";
  /** Только у on: overload: порог заполнения очереди в процентах; пусто -- край. */
  at?: number | null;
  /** Чьё состояние смотреть; у правила с операцией -- она же. */
  cookie?: string;
  /** Операция: имя объявленной куки. Одно из двух, не оба. */
  issue?: string;
  drop?: string;
  cond?: string;
  negate?: boolean;
  actions: CookieProfileAsk[];
}

export interface CookieProfileDoc {
  description: string;
  cookies?: CookieDecl[];
  conditions?: ActionCondition[];
  rules: CookieProfileRule[];
}

export interface CookieProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: CookieProfileDoc;
  created_at: string;
  updated_at: string;
  unknown_targets?: string[];
  modified?: boolean;
}

export async function fetchCookieProfiles(scope: string): Promise<CookieProfile[]> {
  const row = await getJson<{ profiles: CookieProfile[] }>(
    `/api/${scope}/cookie/profiles`,
  );

  return row.profiles;
}

export function fetchCookieProfile(scope: string, id: string): Promise<CookieProfile> {
  return getJson<CookieProfile>(`/api/${scope}/cookie/profiles/${id}`);
}

export function saveCookieProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: CookieProfileDoc },
): Promise<CookieProfile> {
  return id === null
    ? sendJson<CookieProfile>(`/api/${scope}/cookie/profiles`, "POST", input)
    : sendJson<CookieProfile>(`/api/${scope}/cookie/profiles/${id}`, "PUT", input);
}

export function deleteCookieProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/cookie/profiles/${id}`, "DELETE");
}

export function restoreCookieProfile(
  scope: string,
  id: string,
): Promise<CookieProfile> {
  return sendJson<CookieProfile>(
    `/api/${scope}/cookie/profiles/${id}/restore`,
    "POST",
  );
}

/* Поколение профилей куки: то же, что в KV WAF_DESIRED/policy/cookie. */
export function sendCookieProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/cookie/send`, "POST");
}

/* --- профили инспектора vlai (inspectors/vlai) ----------------------------- */

/*
 * Классификатор серьёзности: вердикт всегда score либо allow, поэтому профиль
 * короткий -- режим, поведение при полной очереди и две стороны канала
 * действий. Документ повторяет YAML загрузчика (inspectors/vlai/src/profiles.py).
 */

/** Глаголы, которые vlai умеет применять из чужих просьб. */
export type VlaiVerb = "threshold" | "skip";

/**
 * Что профиль принимает от соседа. `*` не принимается: оба глагола умеют
 * ослаблять, послабление требует имени отправителя.
 */
export interface VlaiPriorRule {
  from: string;
  accept: VlaiVerb[];
  /** Пусто -- любой повод. */
  codes: string[];
}

export interface VlaiProfileDoc {
  description: string;
  /**
   * Очередь процесса полна: ответить пропуском сразу (fail-open, умолчание),
   * стоять в очереди до дедлайна либо отказать сразу.
   */
  overload: "allow" | "wait" | "deny";
  trigger: { prior: VlaiPriorRule[] };
  /** Инициаторы, on score | overload: просьба соседу либо запись адреса
   * клиента в живой набор (write только addr — гео у vlai нет). */
  outcomes: OutcomeRule[];
}

export interface VlaiProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: VlaiProfileDoc;
  created_at: string;
  updated_at: string;
  /** Адресаты инициаторов, которых нет в реестре. Только с карточкой. */
  unknown_targets?: string[];
  /** Отправители правил приёма, которых нет в реестре. Только с карточкой. */
  unknown_senders?: string[];
  /**
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах `prior`. Список общий на пространство и
   * неполон по построению: профили, приезжающие файлами, контроллеру не
   * видны, поэтому поле поводов остаётся свободным вводом. Только с
   * карточкой.
   */
  sender_codes?: SenderCode[];
  /** Профиль default отличается от поставки: считает контроллер. */
  modified?: boolean;
}

export async function fetchVlaiProfiles(scope: string): Promise<VlaiProfile[]> {
  const row = await getJson<{ profiles: VlaiProfile[] }>(
    `/api/${scope}/vlai/profiles`,
  );

  return row.profiles;
}

export function fetchVlaiProfile(scope: string, id: string): Promise<VlaiProfile> {
  return getJson<VlaiProfile>(`/api/${scope}/vlai/profiles/${id}`);
}

export function saveVlaiProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: VlaiProfileDoc },
): Promise<VlaiProfile> {
  return id === null
    ? sendJson<VlaiProfile>(`/api/${scope}/vlai/profiles`, "POST", input)
    : sendJson<VlaiProfile>(`/api/${scope}/vlai/profiles/${id}`, "PUT", input);
}

export function deleteVlaiProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/vlai/profiles/${id}`, "DELETE");
}

/** Вернуть default к поставке: контроллер перезаписывает его образцом сида. */
export function restoreVlaiProfile(scope: string, id: string): Promise<VlaiProfile> {
  return sendJson<VlaiProfile>(`/api/${scope}/vlai/profiles/${id}/restore`, "POST");
}

/* Поколение профилей vlai: то же, что в KV WAF_DESIRED/policy/vlai. */
export function sendVlaiProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/vlai/send`, "POST");
}

/* --- профили инспектора rewrite (inspectors/rewrite) ----------------------- */

/*
 * Модификация ответов. Профиль отвечает на четыре вопроса: править или
 * наблюдать (mode), что менять (группы модификаторов с условиями), кого
 * слушать (правила приёма mutate/skip) и какой записью каталога отказывать,
 * когда подмена решена, но состояться не может (deny_response).
 *
 * Выражения исполняет только Go-процесс (RE2); в nginx.conf из всего профиля
 * не доезжает ничего. Документ повторяет YAML
 * загрузчика (inspectors/rewrite/internal/config/profile.go).
 */


export type RewriteBodyOpKind =
  | "remove"
  | "replace"
  | "insert_before"
  | "insert_after";

export interface RewriteBodyOp {
  op: RewriteBodyOpKind;
  pattern: string;
  /** Шаблон замены у replace, $1..$9 по правилам regexp.Expand. */
  to: string;
  /** Литеральная вставка у insert_before / insert_after. */
  text: string;
  /** Потолок совпадений; null -- умолчание загрузчика (256). */
  maxMatches: number | null;
}

export interface RewriteHeaderOp {
  op: "set" | "unset";
  name: string;
  value: string;
}

/** Где применяется группа: тело ответа или полезная нагрузка кадра WebSocket. */
export type RewriteGroupOn = "response" | "frame";

export interface RewriteGroup {
  name: string;
  /** Применяется без просьб соседей; выключенную включает mutate. */
  default: boolean;
  on: RewriteGroupOn;
  /** Пусто -- любой код ответа и любой тип; "+json" ловит суффикс. */
  status: number[];
  contentType: string[];
  /** Кадровая группа: направление (пусто -- оба) и опкод (пусто -- text). */
  direction: string[];
  opcode: string[];
  body: RewriteBodyOp[];
  /** Только у ответной группы: заголовков у кадра нет. */
  headers: RewriteHeaderOp[];
}

/**
 * Правило приёма. Оба глагола умеют ослаблять маскировку, поэтому
 * широковещательного правила у этого инспектора не бывает -- `from` обязателен.
 */
export interface RewritePriorRule {
  from: string;
  accept: ("mutate" | "skip")[];
  /** Ограничить правило поводами отправителя. Пусто -- любой повод. */
  codes: string[];
}

export interface RewriteProfileDoc {
  description: string;
  /** Запись каталога waf_deny_response для отказа по несостоявшейся подмене. */
  denyResponse: string;
  groups: RewriteGroup[];
  prior: RewritePriorRule[];
}

export interface RewriteProfile {
  uuid: string;
  http_space_id: string;
  name: string;
  description: string;
  doc: RewriteProfileDoc;
  created_at: string;
  updated_at: string;
  /** Отправители правил приёма, которых нет в реестре. Только с карточкой. */
  unknown_senders?: string[];
  /**
   * Поводы, объявленные профилями отправителей контура, -- подсказка
   * автодополнения в правилах `prior`. Список общий на пространство и
   * неполон по построению: профили, приезжающие файлами, контроллеру не
   * видны, поэтому поле поводов остаётся свободным вводом. Только с
   * карточкой.
   */
  sender_codes?: SenderCode[];
  /** Профиль default отличается от поставки: считает контроллер. */
  modified?: boolean;
}

export async function fetchRewriteProfiles(scope: string): Promise<RewriteProfile[]> {
  const row = await getJson<{ profiles: RewriteProfile[] }>(
    `/api/${scope}/rewrite/profiles`,
  );

  return row.profiles;
}

export function fetchRewriteProfile(scope: string, id: string): Promise<RewriteProfile> {
  return getJson<RewriteProfile>(`/api/${scope}/rewrite/profiles/${id}`);
}

export function saveRewriteProfile(
  scope: string,
  id: string | null,
  input: { name: string; description: string; doc: RewriteProfileDoc },
): Promise<RewriteProfile> {
  return id === null
    ? sendJson<RewriteProfile>(`/api/${scope}/rewrite/profiles`, "POST", input)
    : sendJson<RewriteProfile>(`/api/${scope}/rewrite/profiles/${id}`, "PUT", input);
}

export function deleteRewriteProfile(scope: string, id: string): Promise<unknown> {
  return sendJson(`/api/${scope}/rewrite/profiles/${id}`, "DELETE");
}

/** Вернуть default к поставке: контроллер перезаписывает его образцом сида. */
export function restoreRewriteProfile(
  scope: string,
  id: string,
): Promise<RewriteProfile> {
  return sendJson<RewriteProfile>(`/api/${scope}/rewrite/profiles/${id}/restore`, "POST");
}

/* Поколение профилей rewrite: то же, что в KV WAF_DESIRED/policy/rewrite. */
export function sendRewriteProfiles(scope: string): Promise<AuthManifest> {
  return sendJson(`/api/${scope}/rewrite/send`, "POST");
}
