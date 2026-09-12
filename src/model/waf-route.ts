/**
 * Наследуемые настройки маршрута. Один и тот же документ стоит на http-пространстве
 * (значения по умолчанию), на сервере и на пути.
 *
 * Слияние вниз -- замена ключа, не глубокий merge и не сложение массивов.
 * Ключа нет -- взять у родителя. Ключ есть -- действовать тем, что записано,
 * в том числе пустым массивом: так путь снимает общие `waf_local_check`, чего
 * в nginx пока нельзя выразить директивой `none`, а в модели -- можно, и
 * генератор либо научится, либо откажется печатать такой путь.
 *
 * Имена инспекторов, наборов и записей отказа здесь -- строки, как в nginx.
 * Ссылки на каталог по uuid живут в полях, где сущность выбирается целиком
 * (апстрим пути, сертификат сервера), а не перечисляется набором директив.
 */

export type FrameAudit = "off" | "deny" | "all";

export type Policy = "pass" | "block";
export type DenyMode = "fast" | "deterministic";
/**
 * Режим вызова: `active` -- спрашивать и гейтить, `passive` -- спрашивать ради
 * лога, `vote` -- спрашивать ради очков (совещательный голос: очки в живую
 * сумму, deny читается как 100, сам не решает), `off` -- не спрашивать, пока
 * сосед не включит управляющим глаголом. Включить может любой инспектор,
 * спрошенный на маршруте: разрешения у адресата нет. `ignore` -- снятое
 * значение старых документов: строка не печатается вовсе.
 */
export type InspectorMode = "active" | "passive" | "vote" | "off" | "ignore";
export type InspectorPhase = "request" | "response" | "frame";

/**
 * Сторона кадров у вызова фазы `frame`: от клиента (`frame:c2s`), от
 * приложения (`frame:s2c`) или обе (`frame` -- модуль настраивает оба
 * слота одной строкой). Без ключа -- `c2s`: так хранятся вызовы, заведённые
 * до стороны приложения.
 */
export type InspectorStream = "c2s" | "s2c" | "both";
export type InspectorResume = "off" | "prefer" | "require";
export type HoldMode = "gate" | "monitor";

export type BodyLevel = "none" | "meta" | `preview=${string}` | "full";
export type BodyLimitPolicy = "block" | "trim" | "pass";

/**
 * Вызов `waf_inspect <фаза> <name> wave=<n> [timeout=] [mode=]
 * [keep=] [resume=]`. Полный список опций -- docs/directives/list/inspect.md;
 * других у директивы нет, `phase=` на строке роняет `nginx -t` (фаза --
 * первое слово), `weight=` снят: очки ложатся в сумму как присланы.
 */
export interface InspectorRef {
  name: string;
  /** Обязателен у директивы. Нет ключа -- генератор ставит 0. */
  wave?: number;
  timeoutMs?: number;
  mode?: InspectorMode;
  /**
   * `keep=on`: держать состояние после ответа -- за ним вернётся поздняя
   * фаза того же инспектора. Только `request`: на потребляющей фазе это
   * `nginx -t`, и парсер такой ключ отвергает. Пара с `resume=` на том же
   * маршруте обязательна в обе стороны -- проверяет `validateNginxExport`
   * до рассылки и `nginx -t` на ноде.
   */
  keep?: boolean;
  /**
   * Продолжение предыдущей фазы: публиковать в личный subject экземпляра;
   * `require` -- без состояния отказать, а не переиграть. Только `response`:
   * на `request` и на кадрах это `nginx -t` (кадры инспектируются каждый сам
   * по себе и транзакцию рукопожатия не продолжают), и парсер такой ключ
   * отвергает.
   */
  resume?: InspectorResume;
  /** Фаза печатается первым словом, а не опцией. */
  phase?: InspectorPhase;
  /** Только у `frame`: какую сторону спрашивать. Без ключа -- `c2s`. */
  stream?: InspectorStream;
  /** `if <значение> in|not in <набор>`: звать инспектора не на всяком запросе. */
  conds?: Cond[];
  /** Снято: `profile=` -- опция реестра, на вызове это `nginx -t`. */
  profile?: string;
}

/**
 * Узел реестра `waf_inspector`. Ключ карты -- имя, `subject` берётся из
 * каталога при печати.
 *
 * Директива принимает ровно `subject=`, `profile=`, `audit=` и `breaker*`
 * (docs/directives/list/inspector.md). Всё, что ниже помечено как снятое,
 * на реестре роняет `nginx -t`: это опции вызова (`waf_inspect`) либо их нет
 * вовсе. Поля остаются в типе только затем, чтобы старый jsonb читался; ни
 * компилятор их не печатает, ни UX не показывает, а сохранение карточки их
 * выбрасывает.
 */
export interface InspectorDecl {
  /**
   * Процесс из каталога, который слушает это имя. Нет ключа -- имя узла и
   * есть имя процесса. Так одному процессу дают второе имя с другим
   * `profile=` без копии записи каталога: тема, фазы и inspector.conf --
   * свойства процесса, объявление их не повторяет, а ссылается.
   */
  process?: string;
  profile?: string;
  audit?: string;
  breaker?: {
    enabled?: boolean;
    /** Доля таймаутов на окне, 0…1. Умолчание 0.5. */
    threshold?: number;
    windowMs?: number;
    probeMs?: number;
  };
  /**
   * `vars=`: какие поля секции `vars` едут этому имени -- имена стандартного
   * набора (`BUILTIN_VARS`), `waf_var` пространства либо `all`. Нет ключа --
   * секции в сообщении этому имени нет; запись аудита везёт набор целиком
   * независимо от объявлений.
   */
  vars?: string[];

  /** Снято: опция вызова. Генератор берёт её как запасной `timeout=`. */
  timeoutMs?: number;
  /**
   * Снято: у директив нет `after=` вовсе. Порядок описывает обязательный
   * `wave=` на вызове, а не граф зависимостей. Читается лишь затем, чтобы
   * посчитать номер волны для строк, где его ещё не проставили.
   */
  after?: string[];
  /** Снято: снимок -- `waf_capture`. */
  needs?: string;
  /** Снято: размещения тела на реестре нет. */
  body?: string;
  /** Снято. */
  sample?: number;
  /** Снято: `mode=passive` на вызове. */
  role?: "mandatory" | "advisory";
  /** Снято. */
  placement?: "remote" | "local";
  /** Снято: списков заголовков и cookie у реестра нет. */
  allowHeaders?: string[];
  allowCookies?: string[];
}

/**
 * Условие строки: `if <значение> in <набор>` / `if <значение> not in <набор>`.
 *
 * Принимают его `waf_local_check`, `waf_local_rate` и `waf_inspect`
 * (`local/ngx_http_waf_select.c`, `ngx_http_waf_cond_parse`). Несколько
 * условий на строке -- И: строка работает, только если сошлись все.
 *
 * Пустое значение считается «нет в наборе», а не отдельным случаем: куки нет
 * -- значит, её нет и среди доверенных, и `not in` на ней истинно.
 */
export interface Cond {
  /** Переменная nginx или селектор `$waf_request_cookies.sid`. */
  value: string;
  dataset: string;
  /** `not in`. */
  negate?: boolean;
}

export interface LocalCheck {
  dataset: string;
  variable: string;
  action: "block" | "allow" | "wave";
  response?: string;
  conds?: Cond[];
}

export interface LocalRate {
  key: string;
  rate: string;
  burst: number;
  /**
   * Что считает корзина: запросы (умолчание), обращения к шине или кадры
   * WebSocket. `frames` -- правило бежит только на кадрах websocket-пути и
   * рукопожатие не считает; `requests` и `waves` на кадрах не смотрятся.
   */
  count?: "requests" | "waves" | "frames";
  action?: "block" | "pass";
  response?: string;
  /** Автобан ключа в overlay набора: `list=<dataset> ttl=<time>`. */
  list?: string;
  ttl?: string;
  /**
   * `hash=md5`: корзина ведётся по md5 ключа. Длинный ключ (JWT в cookie) без
   * этого не влезает в узел дерева и правило молча пропускается. В набор
   * автобана уезжает сырой ключ: хеширует ли его набор, решает сам набор.
   */
  hash?: boolean;
  conds?: Cond[];
}

export interface CookieDefaults {
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface ScoreDeny {
  threshold: number;
  response?: string;
}

/**
 * Всё, что nginx наследует http -> server -> location. Поля необязательны:
 * отсутствие -- наследование, не «значение по умолчанию модуля». Значения
 * по умолчанию модуля (`waf off`, `deadline 50ms`) подставляет генератор,
 * когда ключа нет ни на одном уровне.
 */
export interface WafRouteSettings {
  enabled?: boolean;

  /**
   * Реестр. Печатается как `waf_inspector` в http {} и живёт только там:
   * пространство объявляет инспекторов.
   */
  inspectors?: Record<string, InspectorDecl>;

  /**
   * Набор «кого звать» -- `waf_inspect`. Только сервер и путь: контур
   * объявляет, хост назначает. Ключ на пространстве компилятор отвергает
   * (`route_at_http`).
   */
  requestInspectors?: InspectorRef[] | "none" | "all";
  responseInspectors?: InspectorRef[] | "none" | "all";
  /**
   * Инспекторы кадров WebSocket: `waf_inspect frame:c2s|frame:s2c|frame`.
   * Сторона -- у каждого вызова своя (`stream`), умолчание -- от клиента.
   * `none` снимает обе стороны.
   */
  frameInspectors?: InspectorRef[] | "none" | "all";
  inspectorModes?: Record<string, InspectorMode>;
  /** Снято: `profile=` задаётся на узле реестра. */
  inspectorProfiles?: Record<string, string>;

  /**
   * `waf_deadline`: бюджет фазы. Что делать с тем, кто в него не уложился,
   * говорит `exception` -- с 09.09.2026 это разные директивы.
   */
  deadlineMs?: number;
  responseDeadlineMs?: number;
  /**
   * `waf_hold response`: держать ли ответ до вердикта. `gate` (умолчание
   * модуля) не отдаёт клиенту ни байта; `monitor` отпускает сразу, а отказ
   * обрывает поток. На фазе запроса выбора нет (`request monitor` -- это
   * `mode=passive`, а не отпущенный запрос), поэтому ключ один.
   */
  responseHold?: HoldMode;

  /**
   * Фаза кадров, обе стороны: `waf_deadline frame` и `waf_score_deny frame`
   * -- одна строка настраивает оба направления. Удержания здесь нет: модуль
   * ведёт кадры только в `gate`, а `monitor` отвергает на `nginx -t`.
   */
  frameDeadlineMs?: number;
  frameScoreDeny?: ScoreDeny;

  /**
   * `waf_audit_frames`: какие кадры уходят записью аудита агенту. `deny`
   * (умолчание модуля) -- только кадр, у которого есть что сказать: отказ,
   * подмена, счёт; `all` -- каждый спрошенный, `frameAuditSample` берёт
   * каждый n-й; `off` -- ни одного. Запись на сессию при закрытии пишется
   * при любом значении, кроме `off`. Сэмпл печатается только с `all`.
   */
  frameAudit?: FrameAudit;
  frameAuditSample?: number;

  /**
   * `waf_frame_reassemble`: единица инспекции -- собранное сообщение, а не
   * кадр с fin=false; получателю оно уходит одним кадром. Умолчание модуля
   * `off`: склейка меняет провод.
   */
  frameReassemble?: boolean;

  /**
   * `waf_frame_control_rate`: ping и pong сверх частоты не пересылаются.
   * Строка `<n>r/s` | `<n>r/m` | `off`; умолчание модуля `10r/s`.
   */
  frameControlRate?: string;

  /**
   * `waf_frame_cache`: кеш вердикта по хешу нагрузки на сторону кадра.
   * `frameCacheTtl` -- срок записи (`<n>s` | `<n>m`, не больше часа),
   * `frameCacheStream` -- какую сторону кешировать (умолчание `both`).
   * Печатается только с названным сроком; требует зоны локального слоя.
   */
  frameCacheTtl?: string;
  frameCacheStream?: "c2s" | "s2c" | "both";

  /**
   * Рукопожатие websocket-пути. `waf_require_upgrade`: запрос без
   * `Upgrade: websocket` отказывается локальным слоем записью
   * `requireUpgradeResponse` (умолчание `upgrade_required`, 426);
   * `waf_ws_strip_extensions`: какие расширения снять из предложения клиента
   * (умолчание `permessage-deflate` -- сжатые кадры шли бы мимо инспекции;
   * `[]` -- не снимать). Оба ключа только у websocket-пути; без ключа
   * компилятор печатает умолчание.
   */
  requireUpgrade?: boolean;
  requireUpgradeResponse?: string;
  wsStripExtensions?: string[];

  /**
   * `waf_exception`: что делать, когда вердикта нет. Строка -- хвост директивы
   * целиком, с фазой первым словом и необязательным классом вторым:
   * `request deny response=error`, `response bus pass`. Классы -- `timeout`,
   * `absent`, `bus`, `body`, `inspector`, `overload`; строка без класса задаёт
   * все шесть.
   *
   * Массив, а не поля на класс: у директивы та же форма, что у `waf_send` и
   * `waf_archive`, и разложенная по ключам она разъехалась бы с грамматикой
   * на первом же новом классе. Прежние `deadlinePolicy` и `onAbsent`/
   * `onBusError`/`onBodyUnavailable` мигрированы сюда (089).
   */
  exception?: string[];
  denyMode?: DenyMode;

  scoreDeny?: ScoreDeny;
  responseScoreDeny?: ScoreDeny;

  /**
   * `waf_archive`: что переживёт запрос. Строка -- хвост директивы целиком,
   * вместе с областью: `request headers args ttl=30d`. Массив, потому что
   * строки одного уровня складываются по объектам, а не вытесняют друг друга, --
   * иначе телу нельзя было бы назначить свой срок, не переписав заголовки.
   *
   * Обменник маршрут не выбирает: он в контуре один и стоит в http (`waf_store`).
   */
  archive?: string[];

  /**
   * `waf_body_limit`: предел размера тела и исход для того, что его перешагнуло.
   * Политика -- второе слово той же директивы, как у дедлайна, и печатается
   * только рядом со своим размером.
   */
  bodyLimit?: string;
  bodyLimitPolicy?: BodyLimitPolicy;

  denyResponseDefault?: string;
  redirectAllow?: string[];

  /**
   * `waf_action_max` / `waf_actions_max`: пределы канала просьб между
   * инспекторами. Оба нужны модулю до запроса -- буфер сообщения считается
   * заранее, и число действий входит в бюджет множителем.
   *
   * Ноль у `actionsMax` -- рабочий режим, а не «не задано»: на маршруте с
   * одним-двумя инспекторами переписываться некому, и секции в сообщении там
   * быть не должно. Форма и словарь -- docs/inspector-actions.md.
   */
  actionMax?: string;
  actionsMax?: number;
  cookieDefaults?: CookieDefaults;

  localChecks?: LocalCheck[];
  localRates?: LocalRate[];

  debugHeader?: boolean;
  /**
   * Что снять с запроса для инспекторов: `headers args body`. На маршруте
   * гасит родителя. Архив и превью этой оси не подчинены -- они снимают
   * объект поверх неё.
   */
  capture?: string[];

  /**
   * `waf_preview`: срез запроса в самой записи аудита. Строка -- хвост
   * директивы целиком: `headers=30k/2k deny=x-api-key`.
   * Размер необязателен: без него бюджетом становится всё, что WAF читает;
   * второе число -- потолок на одну пару. Массив: у каждого объекта своя
   * строка, и настроить заголовки, не трогая тело, иначе было бы нечем.
   *
   * Названное здесь превью -- требование извлечь объект, поэтому у всех трёх
   * умолчание `off`: тело читается там, где его назвали, а не везде.
   */
  preview?: string[];

  /**
   * `waf_send`: откуда отдать объект получателю -- апстриму на фазе запроса,
   * клиенту на фазе ответа, второй стороне на кадрах. Строка -- хвост
   * директивы с фазой первым словом: `request headers=original body=store`,
   * `response body=store`. `original` -- как пришёл, правки инспекторов не
   * поднимаются; `store` -- версия инспектора
   * из обменника, если он её положил. Умолчание модуля: у запроса
   * `headers=store`, остальное `original`; у ответа и кадров всё `store`.
   * Неполный снимок store не отдаёт никогда -- это факт про объект, а не
   * настройка. Пустой массив ничего не печатает: у оси нет `none`.
   */
  send?: string[];
}

/**
 * Спрашивают ли на маршруте инспекторов фазы запроса. Ключа нет -- набор
 * наследуется сверху, то есть спрашивают; `"none"` и пустой список -- нет.
 *
 * Предикат общий у капчи и калитки: обе проверяют свою страницу проверки на
 * рекурсию, и разъехаться этим двум ответам нельзя.
 */
export function routeInspectsRequests(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (value === "none") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}
