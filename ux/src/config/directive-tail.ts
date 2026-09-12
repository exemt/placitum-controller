/**
 * Грамматика хвостов `waf_capture`, `waf_archive`, `waf_preview` и `waf_send`.
 *
 * Модель хранит их строками -- хвост директивы целиком, как он попадёт в файл.
 * Это правильно для хранения (объект, размеры и списки имён читаются вместе), но
 * никуда не годится для формы: оператор набирает `request headers=64k
 * mask=cookie` вслепую, а ошибка всплывает при `nginx -t` уже на ноде.
 *
 * Здесь единственное место, знающее грамматику: `parse` разбирает строки в
 * объекты, `format` собирает обратно. Компилятор при этом не меняется -- он
 * по-прежнему печатает строки.
 *
 * Формы (docs/directives/list/capture.md, archive.md, preview.md):
 *
 *     waf_capture <фаза> <headers|args|body>[=<size>|none] ...;
 *     waf_capture <фаза> none | off;
 *     waf_capture <фаза> headers|args mask=<name>,...;
 *     waf_capture <фаза> headers|args deny=<name>,...;
 *
 *     waf_archive <фаза> <объекты> [ttl=<time>] [when=allow|deny|allow,deny];
 *     waf_archive <фаза> reload <obj>[=capture|<size>] ...;
 *     waf_archive <фаза> headers|args allow=|mask=|deny=<name>,...;
 *     waf_preview <фаза> <объект>=<size>[/<item>] ...;
 *     waf_preview <фаза> reload <obj>[=capture|<size>] ...;
 *     waf_preview <фаза> headers|args allow=|mask=|deny=<name>,...;
 *
 *     waf_send <фаза> <obj>=original|store ...;
 *
 * Archive и preview наследуют capture: объекты, размеры, `mask=` / `deny=`.
 * Своя строка перекрывает только названное.
 *
 * Send -- четвёртая ось той же таблицы: откуда отдать объект получателю,
 * как пришёл или версию инспектора из обменника. Списков имён и размеров у неё
 * нет, `none` тоже: снятая строка возвращает умолчание модуля (у запроса
 * `headers=store`, остальное `original`; у ответа и кадров всё `store`).
 * Неполный снимок store не отдаёт никогда -- это факт, не настройка.
 *
 * `ttl=` и `when=` -- тоже свойства объекта, а не оси: модуль держит их на вид
 * (`archive_ttl[]`, `archive_when[]`), строка настраивает только названные в
 * ней виды, а неназванный вид приносит срок и исход от родителя вместе с
 * собой. Поэтому в модели они лежат в [ObjectSpec], а виды с разными
 * параметрами при печати разъезжаются по строкам.
 *
 * `reload` -- не флаг оси, а отдельная строка со своим списком объектов
 * (модуль держит бит на объект: `archive_reload`, `preview_reload`). Поэтому
 * в модели это свойство объекта -- `original` с собственным размером: у
 * одного объекта в архив едет оригинал, у соседнего -- то, что после масок.
 * Оригинал кладётся в обменник до передачи агенту, инспекторы его не видят.
 * Ключ обменника при этом один на объект: оригинал, положенный ради одной оси,
 * прочитает и другая -- см. [checkStoreCross].
 *
 * Фаза -- первое слово хвоста, и у каждой фазы свой словарь объектов: у ответа
 * нет строки запроса, у кадров -- только тело. В документе строки всех фаз
 * лежат в одном ключе; строка без фазы -- запроса, так хранились документы до
 * фазы ответа. Из кадров форма ведёт сторону клиента (`frame:c2s`) и только у
 * снимка; прочие строки с `frame` не разбираются -- компилятор их отвергает.
 */

export const OBJECTS = ["headers", "args", "body"] as const;
export type ObjectName = (typeof OBJECTS)[number];

/** Объекты, у которых бывают списки имён; у тела имён нет. */
export type ListTarget = "headers" | "args";
export const LIST_TARGETS = ["headers", "args"] as const;

/*
 * Исходы, на которых объект уезжает в архив (`when=`). Слов `always` и
 * `redirect` в грамматике нет: первое совпадало с умолчанием, второе отдельно
 * почти не архивируют. Пустой набор -- любой исход, включая redirect; оба
 * слова вместе -- «всё, кроме перенаправления», и это третье состояние, а не
 * синоним умолчания.
 */
export const ARCHIVE_OUTCOMES = ["allow", "deny"] as const;
export type ArchiveOutcome = (typeof ARCHIVE_OUTCOMES)[number];

/** Набор исходов в канонический вид: `allow` перед `deny`, без повторов. */
function outcomeSet(words: readonly string[]): ArchiveOutcome[] {
  return ARCHIVE_OUTCOMES.filter((name) => words.includes(name));
}

/**
 * Исход словами -- подпись под кнопками выбора: ключ i18n, как у [ProblemCode].
 *
 * Ни одного слова -- любой исход, включая перенаправление (это и есть
 * отсутствие `when=`); оба -- «всё, кроме перенаправления», третье состояние,
 * которое взаимоисключающими кнопками не набиралось. Общий для формы объекта
 * и формы просьбы архива: слова там одни и те же.
 */
export function whenSummaryKey(when: readonly ArchiveOutcome[]): string {
  if (when.length === 0) return "tail.whenSummaryAny";
  if (when.length === 2) return "tail.whenSummaryBoth";
  return when[0] === "deny" ? "tail.whenSummaryDeny" : "tail.whenSummaryAllow";
}

/** Одинаковы ли исходы двух объектов -- для группировки строк. */
export function sameOutcomes(
  a: readonly ArchiveOutcome[] | undefined,
  b: readonly ArchiveOutcome[] | undefined,
): boolean {
  return (a ?? []).join(",") === (b ?? []).join(",");
}

/*
 * Фазы снимка. У кадров модуль читает только сторону клиента и только тело:
 * `frame:c2s body=` -- полезная нагрузка кадра инспекторам. Архив и превью
 * кадров модуль отвергает на `nginx -t`, об этом говорит checkTail.
 */
export const TAIL_PHASES = ["request", "response", "frame:c2s", "frame:s2c"] as const;
export type TailPhase = (typeof TAIL_PHASES)[number];

/**
 * Фазы, у которых пустой ключ печатается как `none`. Кадры сюда не входят:
 * умолчание модуля и так «не снимать», а строка `frame:c2s none` на маршруте
 * без сокетов читалась бы как настройка сокетов.
 */
export const NONE_PHASES: readonly TailPhase[] = ["request", "response"];

/** Объекты по фазам (capture.md): строка запроса -- объект только запроса. */
export const PHASE_OBJECTS: Record<TailPhase, readonly ObjectName[]> = {
  request: OBJECTS,
  response: ["headers", "body"],
  "frame:c2s": ["body"],
  "frame:s2c": ["body"],
};

/** Фаза строки и хвост без неё. `null` -- строка фазы, которой панель не ведёт. */
export function splitPhaseLine(raw: string): { phase: TailPhase; rest: string } | null {
  const t = raw.trim();
  const first = t.split(/\s+/, 1)[0] ?? "";
  if (
    first === "request" ||
    first === "response" ||
    first === "frame:c2s" ||
    first === "frame:s2c"
  ) {
    return { phase: first, rest: t.slice(first.length).trim() };
  }
  if (first.startsWith("frame")) {
    return null;
  }
  return { phase: "request", rest: t };
}

export interface ObjectSpec {
  /** Объект назван в директиве. */
  on: boolean;
  /**
   * Размер: у снимка -- срез (пусто -- целиком), у записи -- бюджет среза
   * (обязателен), у архива -- сколько уедет в S3 (пусто -- как снято).
   */
  size?: string;
  /** Потолок на одну пару, только у записи headers/args: `30k/2k`. */
  item?: string;
  /** Явное `=none`: объект выключен на этом уровне. */
  none?: boolean;
  /**
   * Источник -- оригинал (строка `reload`): в обменник кладётся несмаскированный
   * объект, только у архива и записи.
   */
  original?: boolean;
  /**
   * Сколько оригинала класть: `capture` -- в размере снимка, размер -- столько,
   * `undefined` -- целиком (только на фазе запроса).
   */
  originalSize?: string;
  /**
   * Откуда отдать получателю (только у `waf_send`): как пришёл либо версия
   * инспектора из обменника.
   */
  send?: SendSource;
  /**
   * `ttl=` архива: сколько объект живёт в S3; пусто -- вечно. Свойство объекта,
   * а не оси: строка директивы настраивает только названные в ней виды, и
   * модуль держит срок на объект (`archive_ttl[]`).
   */
  ttl?: string;
  /**
   * `when=` архива: исходы, на которых объект сохраняется; пусто (и поле
   * целиком) -- любой, включая redirect. Тоже на объект: `archive_when[]`.
   */
  when?: readonly ArchiveOutcome[];
}

export type SendSource = "original" | "store";

export type ListName = "allow" | "mask" | "deny";

export interface TailModel {
  objects: Record<ObjectName, ObjectSpec>;
  /** `allow=` -- только эти имена; у снимка его нет (archive.md, preview.md). */
  allow: Partial<Record<ListTarget, string[]>>;
  mask: Partial<Record<ListTarget, string[]>>;
  deny: Partial<Record<ListTarget, string[]>>;
  /**
   * `source=sent` у превью: в записи показать доставленную получателю версию
   * подменённого тела, а не оригинал. Только у body фаз с подменой
   * (response, frame); оригинал остаётся в архиве.
   */
  sourceSent?: boolean;
  /** Вся ось снята: `none` / `off` одним словом. */
  off: boolean;
}

export function emptyTail(): TailModel {
  return {
    objects: {
      headers: { on: false },
      args: { on: false },
      body: { on: false },
    },
    allow: {},
    mask: {},
    deny: {},
    off: false,
  };
}

function isObject(word: string): word is ObjectName {
  return (OBJECTS as readonly string[]).includes(word);
}

function isListTarget(word: string): word is ListTarget {
  return (LIST_TARGETS as readonly string[]).includes(word);
}

/**
 * Строки одного уровня и одной фазы складываются по объектам, а `none`
 * очищает фазу. Строки других фаз не читаются: у каждой фазы своя модель.
 *
 * Объект копится по строкам: у записи бюджет и оригинал -- две разные строки
 * об одном объекте (`headers=30k/1k` и `reload headers=capture`), и вторая не
 * должна затирать первую.
 */
export function parseTail(lines: unknown, phase: TailPhase = "request"): TailModel {
  const model = emptyTail();
  const rows = Array.isArray(lines)
    ? lines
        .filter((x): x is string => typeof x === "string")
        .map(splitPhaseLine)
        .filter((row): row is { phase: TailPhase; rest: string } => row !== null)
        .filter((row) => row.phase === phase)
        .map((row) => row.rest)
    : [];

  if (rows.length === 0) {
    return model;
  }

  for (const raw of rows) {
    const words = raw.split(/\s+/).filter((w) => w !== "");
    let i = 0;
    if (words[i] === "none" || words[i] === "off") {
      // Голое `none` очищает уровень целиком.
      const cleared = emptyTail();
      cleared.off = true;
      return cleared;
    }
    const original = words[i] === "reload";
    if (original) {
      i += 1;
    }

    let listTarget: ListTarget | undefined;

    /*
     * Строка списка имён -- ровно два слова: вид и список
     * (`headers mask=cookie`), так её и отличает модуль
     * (`ngx_http_waf_obj_list`: четыре аргумента с фазой). Вид здесь называет
     * адресата списка, а не объект строки: считать его объектом значило бы
     * стереть размер, заданный соседней строкой того же уровня.
     */
    const head = words[i];
    if (
      words.length - i === 2
      && isListTarget(head)
      && /^(allow|mask|deny)=/.test(words[i + 1] ?? "")
    ) {
      listTarget = head;
      i += 1;
    }

    /*
     * `ttl=` и `when=` привязаны к видам своей строки, а не к оси: модуль
     * держит их на объект (`archive_ttl[]`, `archive_when[]`), и строка
     * `reload body ttl=30d` рядом со строкой `headers ttl=1h` -- это два
     * разных срока, а не спор о едином. Слова стоят где угодно в строке,
     * поэтому объекты копятся и получают их после разбора всей строки.
     */
    let rowTtl: string | undefined;
    let rowWhen: ArchiveOutcome[] | undefined;
    const rowObjects: ObjectName[] = [];

    for (; i < words.length; i += 1) {
      const word = words[i];

      if (word.startsWith("ttl=")) {
        rowTtl = word.slice(4);
        continue;
      }
      if (word.startsWith("when=")) {
        const set = outcomeSet(
          word
            .slice(5)
            .split(",")
            .map((name) => name.trim()),
        );
        // `when=` без единого известного слова модуль не примет -- считаем,
        // что исход не назван, и не показываем несуществующий фильтр.
        rowWhen = set.length > 0 ? set : undefined;
        continue;
      }
      if (word === "source=sent" || word === "source=original") {
        model.sourceSent = word === "source=sent";
        continue;
      }
      if (/^(allow|mask|deny)=/.test(word)) {
        const eq = word.indexOf("=");
        const bag = model[word.slice(0, eq) as ListName];
        const names = word.slice(eq + 1).split(",").map((n) => n.trim()).filter((n) => n !== "");
        const target = listTarget ?? "headers";
        bag[target] = [...(bag[target] ?? []), ...names];
        continue;
      }

      const [name, value] = word.split("=", 2);
      if (!isObject(name)) {
        continue;
      }
      listTarget = isListTarget(name) ? name : undefined;
      // Срок и исход строки достаются её видам; `=none` -- выключенный вид,
      // хранить их некому.
      if (value !== "none") {
        rowObjects.push(name);
      }
      const spec = model.objects[name];

      if (original) {
        model.objects[name] = {
          ...spec,
          on: true,
          none: undefined,
          original: true,
          originalSize: value === undefined || value === "" ? undefined : value,
        };
        continue;
      }
      if (value === "none") {
        model.objects[name] = { on: false, none: true };
        continue;
      }
      /*
       * `waf_send`: значение объекта -- источник, не размер. Размеры так не
       * пишутся, поэтому слово различает оси само, без знания вида.
       */
      if (value === "original" || value === "store") {
        model.objects[name] = { on: true, send: value };
        continue;
      }
      const [size, item] = (value ?? "").split("/", 2);
      model.objects[name] = {
        ...spec,
        on: true,
        none: undefined,
        size: size === "" ? undefined : size,
        item: item === "" || item === undefined ? undefined : item,
      };
    }

    /*
     * Строки одного объекта складываются (бюджет и `reload` -- две строки об
     * одном виде), поэтому названный срок и исход дописываются, а неназванные
     * оставляют то, что стояло у вида раньше.
     */
    for (const name of rowObjects) {
      const spec = model.objects[name];
      model.objects[name] = {
        ...spec,
        ttl: rowTtl ?? spec.ttl,
        when: rowWhen ?? spec.when,
      };
    }
  }

  return model;
}

export type TailKind = "capture" | "archive" | "preview" | "send";

/** Списки, которые ось умеет: у снимка нет `allow=`, у отдачи списков нет. */
export function listNames(kind: TailKind): readonly ListName[] {
  if (kind === "send") return [];
  return kind === "capture" ? ["mask", "deny"] : ["allow", "mask", "deny"];
}

/**
 * Объекты после масок -- одной строкой, оригинал -- строкой `reload`, списки
 * имён -- своими: так их разбирает модуль, по строке на форму.
 *
 * Фаза запроса пишется без префикса -- так лежат документы, заведённые до
 * фазы ответа, и менять им форму незачем. Ответ всегда со своим словом.
 */
export function formatTail(
  model: TailModel,
  kind: TailKind,
  phase: TailPhase = "request",
): string[] {
  return formatPhaseless(model, kind, phase).map((line) =>
    phase === "request" ? line : `${phase} ${line}`,
  );
}

/** Строки всех фаз одним ключом документа -- как он хранится. */
export function formatTails(
  models: Record<TailPhase, TailModel>,
  kind: TailKind,
): string[] {
  return TAIL_PHASES.flatMap((phase) => formatTail(models[phase], kind, phase));
}

/** Слово строки (вид со своей величиной) и параметры, привязанные к нему. */
interface Word {
  text: string;
  opts: string[];
}

/**
 * Виды с одинаковыми параметрами -- одной строкой, разные -- своими.
 *
 * `ttl=` и `when=` в грамматике привязаны к видам той же строки, поэтому
 * «тело только на отказ, заголовки всегда» -- это две строки, а не одна с
 * двумя `when=`. Порядок групп -- порядок видов: сначала тот, что назван
 * первым, чтобы файл читался сверху вниз так же, как таблица.
 */
function groupWords(words: Word[]): string[][] {
  const groups: { key: string; words: string[]; opts: string[] }[] = [];
  for (const word of words) {
    const key = word.opts.join(" ");
    const group = groups.find((g) => g.key === key);
    if (group === undefined) {
      groups.push({ key, words: [word.text], opts: word.opts });
    } else {
      group.words.push(word.text);
    }
  }
  return groups.map((g) => [...g.words, ...g.opts]);
}

function formatPhaseless(model: TailModel, kind: TailKind, phase: TailPhase): string[] {
  if (model.off) {
    return [];
  }

  /*
   * Отдача: объекты со своим источником одной строкой, параметры фазы --
   * той же. `none` у оси нет, неназванный объект просто наследуется.
   */
  if (kind === "send") {
    const words: string[] = [];
    for (const name of PHASE_OBJECTS[phase]) {
      const spec = model.objects[name];
      if (spec.on && spec.send !== undefined) {
        words.push(`${name}=${spec.send}`);
      }
    }
    return words.length > 0 ? [words.join(" ")] : [];
  }

  const out: string[] = [];
  const masked: Word[] = [];
  const original: Word[] = [];

  /*
   * Срок и исход -- свойства вида, и вместе с ним они и печатаются: виды с
   * одинаковыми параметрами собираются в строку, разные разъезжаются по
   * строкам, как их и складывает модуль.
   */
  const paramsOf = (spec: ObjectSpec): string[] => {
    if (kind !== "archive") return [];
    const opts: string[] = [];
    if (spec.ttl !== undefined && spec.ttl !== "") opts.push(`ttl=${spec.ttl}`);
    if (spec.when !== undefined && spec.when.length > 0) {
      opts.push(`when=${outcomeSet(spec.when).join(",")}`);
    }
    return opts;
  };

  for (const name of PHASE_OBJECTS[phase]) {
    const spec = model.objects[name];
    if (spec.none === true) {
      // Выключенный вид параметров не несёт: снимать нечего, хранить негде.
      masked.push({ text: `${name}=none`, opts: [] });
      continue;
    }
    if (!spec.on) {
      continue;
    }
    const opts = paramsOf(spec);
    if (kind !== "capture" && spec.original === true && (phase === "frame:c2s" || phase === "frame:s2c")) {
      // Кадр: оригинал -- весь кадр, строкой `body` без reload и без размера.
      masked.push({ text: name, opts });
      continue;
    }
    if (kind !== "capture" && spec.original === true) {
      original.push({
        text: spec.originalSize === undefined ? name : `${name}=${spec.originalSize}`,
        opts,
      });
      /*
       * Бюджет записи -- своя строка и при оригинале: `headers=30k/1k` рядом
       * с `reload headers=capture` (preview.md). Без бюджета запись получает
       * срез в размер оригинала.
       */
      if (kind === "preview" && spec.size !== undefined && spec.size !== "") {
        masked.push({
          text: spec.item ? `${name}=${spec.size}/${spec.item}` : `${name}=${spec.size}`,
          opts,
        });
      }
      continue;
    }
    if (spec.size === undefined || spec.size === "") {
      // У записи размер обязателен: голое имя видно в строках и ловится проверкой.
      masked.push({ text: name, opts });
      continue;
    }
    masked.push({
      text:
        kind === "preview" && spec.item
          ? `${name}=${spec.size}/${spec.item}`
          : `${name}=${spec.size}`,
      opts,
    });
  }

  // `source=sent` едет на строке превью рядом с бюджетом тела; original --
  // умолчание, его не печатаем. Свойство оси, не вида: у превью параметров на
  // видах нет, и строка там всё равно одна.
  const axisOpts: string[] = kind === "preview" && model.sourceSent === true ? ["source=sent"] : [];

  const maskedRows = groupWords(masked);
  const originalRows = groupWords(original);

  maskedRows.forEach((row, index) => {
    out.push([...row, ...(index === 0 ? axisOpts : [])].join(" "));
  });
  originalRows.forEach((row, index) => {
    out.push(
      ["reload", ...row, ...(maskedRows.length === 0 && index === 0 ? axisOpts : [])].join(" "),
    );
  });

  for (const target of LIST_TARGETS) {
    if (!PHASE_OBJECTS[phase].includes(target)) continue;
    for (const list of listNames(kind)) {
      const names = model[list][target];
      if (names && names.length > 0) {
        out.push(`${target} ${list}=${names.join(",")}`);
      }
    }
  }

  return out;
}

/** Размер в байтах: `8k` -> 8192. Для сравнения с пределами. */
export function sizeBytes(text: string | undefined): number | undefined {
  if (text === undefined || text.trim() === "") return undefined;
  const m = text.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)([kmg])?$/);
  if (m === null) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const mul = m[2] === "g" ? 1024 ** 3 : m[2] === "m" ? 1024 ** 2 : m[2] === "k" ? 1024 : 1;
  return Math.round(n * mul);
}

export type ProblemCode =
  | "overBodyLimit"
  | "overClientMax"
  | "notInCapture"
  | "widerThanCapture"
  | "budgetRequired"
  | "originalWholeResponse"
  | "originalNotCaptured"
  | "storeOriginal"
  | "listOverCaptureDeny"
  | "sendNotCaptured"
  | "sendPrefix";

export interface TailProblem {
  object: ObjectName;
  code: ProblemCode;
  /** Ошибка не даст ноде загрузить конфиг; предупреждение -- только сказать. */
  level: "error" | "warn";
  /** Подстановки для i18n-сообщения `tail.problem.<code>`. */
  params?: Record<string, string>;
}

/**
 * Проверки, которые иначе делает `nginx -t` уже на ноде
 * (capture.md / archive.md / preview.md, «правила»):
 *
 * - размер больше `waf_body_limit` или `client_max_body_size` -- отказ;
 * - объект не из capture или срез шире снимка -- отказ, увезти шире можно
 *   только оригиналом;
 * - у записи обязателен бюджет;
 * - оригинал шире снимка на фазе ответа -- отказ: перечитать ответ второй раз
 *   нельзя, держится ровно то, что снято;
 * - `=capture` при объекте не в capture -- отказ.
 */
export function checkTail(
  model: TailModel,
  kind: TailKind,
  ctx: {
    capture?: TailModel;
    bodyLimit?: string;
    clientMaxBody?: string;
    phase?: TailPhase;
  },
): TailProblem[] {
  const problems: TailProblem[] = [];
  const limit = sizeBytes(ctx.bodyLimit);
  const clientMax = sizeBytes(ctx.clientMaxBody);
  const phase = ctx.phase ?? "request";

  /*
   * Отдача из обменника (send.md, «правила»): без снимка объекта отдавать
   * нечего -- отказ; срез на теле (в том числе кадра) -- допустимо, но тело
   * шире среза не поднимется: сбой подъёма, которым распоряжается политика
   * фазы, и об этом стоит сказать. Заголовки и строку запроса правят по
   * именам, срез им не мешает.
   */
  if (kind === "send") {
    for (const name of PHASE_OBJECTS[phase]) {
      const spec = model.objects[name];
      if (!spec.on || spec.send !== "store") continue;
      const captured = ctx.capture?.objects[name];
      if (captured?.on !== true) {
        problems.push({ object: name, code: "sendNotCaptured", level: "error" });
        continue;
      }
      if (name === "body" && captured.size !== undefined && captured.size !== "") {
        problems.push({
          object: name,
          code: "sendPrefix",
          level: "warn",
          params: { size: captured.size },
        });
      }
    }
    return problems;
  }

  const overLimits = (name: ObjectName, text: string | undefined) => {
    const size = sizeBytes(text);
    if (size === undefined) return;
    if (limit !== undefined && size > limit) {
      problems.push({
        object: name,
        code: "overBodyLimit",
        level: "error",
        params: { size: text ?? "", limit: ctx.bodyLimit ?? "" },
      });
    }
    if (
      name === "body" &&
      clientMax !== undefined &&
      clientMax > 0 &&
      size > clientMax
    ) {
      problems.push({
        object: name,
        code: "overClientMax",
        level: "error",
        params: { size: text ?? "", limit: ctx.clientMaxBody ?? "" },
      });
    }
  };

  for (const name of PHASE_OBJECTS[phase]) {
    const spec = model.objects[name];
    if (!spec.on) continue;

    overLimits(name, spec.size);

    if (kind === "capture") continue;

    const frame = phase === "frame:c2s" || phase === "frame:s2c";

    // Кадр: масок нет, весь кадр лежит в буфере до вердикта. «Оригинал» у
    // кадра -- весь кадр целиком, без reload: размера нет, сверять нечего,
    // потолок держит waf_body_limit (overLimits выше).
    if (frame && spec.original === true) {
      continue;
    }

    const captured = ctx.capture?.objects[name];
    const captureSize = captured?.on === true ? sizeBytes(captured.size) : undefined;

    if (spec.original === true) {
      overLimits(name, spec.originalSize === "capture" ? undefined : spec.originalSize);
      if (spec.originalSize === "capture" && captured?.on !== true) {
        problems.push({ object: name, code: "originalNotCaptured", level: "error" });
      }
      if (phase === "response") {
        const origBytes =
          spec.originalSize === "capture" ? undefined : sizeBytes(spec.originalSize);
        const whole = spec.originalSize === undefined;
        const wider =
          origBytes !== undefined &&
          (captured?.on !== true ||
            (captured.size !== undefined && captureSize !== undefined && origBytes > captureSize));
        if (whole || wider) {
          problems.push({ object: name, code: "originalWholeResponse", level: "error" });
        }
      }
      continue;
    }

    if (captured?.on !== true) {
      problems.push({ object: name, code: "notInCapture", level: "error" });
      continue;
    }
    if (kind === "preview" && (spec.size === undefined || spec.size === "")) {
      problems.push({ object: name, code: "budgetRequired", level: "error" });
    }
    // Шире снимка запрещено только там, где за срезом стоит оригинал за маской
    // (запрос/ответ). У кадра масок нет и весь кадр в буфере — архив и превью
    // могут быть шире снимка, их держит только waf_body_limit (overLimits).
    const own = sizeBytes(spec.size);
    if (!frame && own !== undefined && captureSize !== undefined && captured.size !== undefined && own > captureSize) {
      problems.push({
        object: name,
        code: "widerThanCapture",
        level: "error",
        params: { size: spec.size ?? "", capture: captured.size },
      });
    }
  }

  return problems;
}

/**
 * Проверки между осями одной фазы.
 *
 * Оригинал, положенный ради одной оси, прочитает и другая: ключ обменника один
 * на объект, и `reload` перезаписывает его до передачи агенту. Маски снимка при
 * этом уже потеряны, а агент применяет только списки, названные у самой оси.
 * Поэтому объект, который вторая ось везёт «после масок» без своих списков,
 * на деле уедет оригиналом -- об этом и предупреждение. Тела не касается:
 * масок у него нет, а размер агент режет по каждой оси свой.
 *
 * Обратная беда -- ошибка, и её ловит `nginx -t`: `allow=` или `mask=` архива
 * и записи на имя, которое `deny=` снимка выбросил до put. Без оригинала имени
 * в объекте уже нет, и обещание оси молча не сбылось бы. Маска поверх маски
 * снимка -- не противоречие: агент имя, уже хешированное снимком, второй раз
 * не хеширует.
 */
export function checkStoreCross(
  models: Record<TailKind, TailModel>,
  phase: TailPhase,
): (TailProblem & { kind: TailKind })[] {
  const problems: (TailProblem & { kind: TailKind })[] = [];
  const pairs: [TailKind, TailKind][] = [
    ["archive", "preview"],
    ["preview", "archive"],
  ];
  for (const target of LIST_TARGETS) {
    if (!PHASE_OBJECTS[phase].includes(target)) continue;
    for (const [plain, reloaded] of pairs) {
      const a = models[plain];
      const b = models[reloaded];
      if (a.off || b.off) continue;
      const spec = a.objects[target];
      const other = b.objects[target];
      if (!spec.on || spec.original === true) continue;
      if (!other.on || other.original !== true) continue;
      const hasOwnLists = listNames(plain).some(
        (list) => (a[list][target]?.length ?? 0) > 0,
      );
      if (hasOwnLists) continue;
      problems.push({
        kind: plain,
        object: target,
        code: "storeOriginal",
        level: "warn",
        params: { axis: reloaded },
      });
    }

    const captureDeny = models.capture.off ? [] : (models.capture.deny[target] ?? []);
    if (captureDeny.length === 0) continue;
    for (const kind of ["archive", "preview"] as const) {
      const model = models[kind];
      if (model.off) continue;
      const spec = model.objects[target];
      if (!spec.on || spec.original === true) continue;
      for (const list of ["allow", "mask"] as const) {
        const hit = (model[list][target] ?? []).find((name) =>
          captureDeny.some((d) => d.toLowerCase() === name.toLowerCase()),
        );
        if (hit === undefined) continue;
        problems.push({
          kind,
          object: target,
          code: "listOverCaptureDeny",
          level: "error",
          params: { name: hit, list },
        });
        break;
      }
    }
  }
  return problems;
}

/**
 * Действующий набор уровня: своё поверх родительского.
 *
 * Модуль сливает уровни пообъектно (`ngx_http_waf_merge_archive`, правила в
 * capture.md): названный здесь объект перекрывает родительский, неназванный
 * приходит сверху, `=none` его снимает, а голое `none` обрывает наследство
 * целиком. Форма показывает ровно это -- иначе оператор читает на пути
 * `headers`, а в файле действует ещё и родительский `body`.
 */
export function mergeTail(parent: TailModel, own: TailModel | undefined): TailModel {
  if (own === undefined) {
    return parent;
  }
  if (own.off) {
    return own;
  }
  const objects = { ...parent.objects };
  for (const name of OBJECTS) {
    const spec = own.objects[name];
    if (spec.on || spec.none === true) {
      objects[name] = spec;
    }
  }
  return {
    objects,
    allow: { ...parent.allow, ...own.allow },
    mask: { ...parent.mask, ...own.mask },
    deny: { ...parent.deny, ...own.deny },
    off: false,
  };
}

/**
 * Что записать на этом уровне, чтобы действовало `next`, когда выше действует
 * `parent`: объект, включённый у родителя и снятый здесь, получает `=none`,
 * иначе модуль дольёт его обратно при слиянии. У отдачи `=none` нет:
 * неназванный объект наследуется как есть.
 */
export function overrideTail(parent: TailModel, next: TailModel, kind?: TailKind): TailModel {
  const objects = { ...next.objects };
  for (const name of OBJECTS) {
    const spec = next.objects[name];
    if (!spec.on && parent.objects[name].on && kind !== "send") {
      objects[name] = { on: false, none: true };
    } else if (!spec.on) {
      objects[name] = { on: false };
    }
  }
  return { ...next, objects, off: false };
}
