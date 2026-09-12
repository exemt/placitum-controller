/**
 * Машина состояний сходимости. Чистая: на входе три снимка, на выходе то, что
 * рисует панель. Ни шины, ни базы, ни времени -- поэтому её и можно накрыть
 * таблицей в тесте, а не ловить состояния на стенде.
 *
 * Расхождение -- не одно состояние, а три независимых, и лечатся они разным:
 *
 *   черновик в Postgres --компиляция--> hash_draft
 *                                           | (1) не отправлено: кнопка
 *   манифест в KV (desired) ------------> hash_desired
 *                                           | (2) не доехало: ждать или чинить
 *   пульс участника (actual) -----------> hash_actual + apply
 *
 * Плюс четвёртый, редкий и самый неприятный: участник докладывает хеш, которого
 * контроллер никогда не издавал. Кнопкой это не лечится, и мешать его с (2)
 * нельзя.
 *
 * Спека -- docs/config-convergence.md.
 */

import type { ChannelId } from "./channels.ts";

export interface PlanError {
  code: string;
  message: string;
  /** Числа и имена причины -- панели для перевода; в message они уже есть. */
  params?: Record<string, string | number>;
}

/** Хеш пересчитанного черновика. `ok=false` -- план не компилируется. */
export interface DraftView {
  hash: string;
  /**
   * Отпечаток источника в базе. Двигается на любую правку, включая ту, которую
   * компилятор не печатает; `hash` на такую правку не двигается вовсе.
   */
  sourceHash: string;
  ok: boolean;
  /** Источника нет: ни одного профиля. Не ошибка, см. состояние `empty`. */
  empty: boolean;
  errors: PlanError[];
  at: string;
}

/** То, что лежит в KV. */
export interface DesiredView {
  hash: string;
  rev: number;
  at?: string;
  /**
   * Имена профилей изданного поколения. Не для показа: по ним межканальная
   * проверка отвечает, издан ли профиль, на который сослался шаблон nginx.
   */
  profiles?: string[];
}

/**
 * Участник, обязанный применить канал. `degraded` -- запись жива, но кадра не
 * было дольше порога; исчезнувшую запись сюда уже не передают, её нет во флоте
 * вовсе.
 */
export interface ConsumerInput {
  uuid: string;
  label: string;
  hash?: string;
  rev?: number;
  apply?: string;
  degraded: boolean;
}

export type ConsumerState =
  | "ok"
  | "stale"
  | "pending"
  | "failed"
  | "foreign"
  | "silent";

export type ChannelState =
  | "ok"
  | "empty"
  | "dirty"
  | "no_effect"
  | "broken"
  | "never"
  | "converging"
  | "failed"
  | "foreign"
  | "silent"
  /** Издано, а участников у канала нет вовсе: ни живых, ни замолчавших. */
  | "nobody"
  | "unmanaged";

/**
 * Источник канала опустел уже после рассылки: на флоте стоит поколение,
 * которое нечем заменить -- `send` отвергнет пустой состав. Не «отличается»,
 * а «рассылать нечего», и кнопка тут не поможет.
 */
export const SOURCE_EMPTIED: PlanError = {
  code: "source_emptied",
  message: "источник пуст, а поколение на флоте стоит: send отвергнет пустой состав",
};

/** Межканальное препятствие: рассылать можно, но сначала другой канал. */
export interface Blocked {
  code: string;
  message: string;
  /** Канал, который надо разослать раньше. */
  before?: ChannelId;
}

export interface ChannelInput {
  id: ChannelId;
  delivered: boolean;
  draft: DraftView | null;
  desired: DesiredView | null;
  /**
   * Отпечаток источника на момент последней рассылки. `null` -- неизвестен
   * (контроллер перезапускался и рассылки с тех пор не было). Тогда правки
   * сверять не с чем, и молчать честнее, чем показать расхождение, которого,
   * может, и нет.
   */
  sentSourceHash: string | null;
  consumers: ConsumerInput[];
  /** Хеши, которые контроллер когда-либо издавал по этому каналу. */
  ledger: readonly string[];
  blocked: Blocked[];
}

export interface ConsumerView {
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
  /** Сохранённое отличается от изданного: ждёт кнопки. */
  dirty: boolean;
  /**
   * Источник правили с последней рассылки. Отдельно от `dirty`: правка,
   * которую компилятор не печатает, двигает только этот признак, и именно она
   * раньше проходила как «сошлось».
   */
  sourceChanged: boolean;
  delivered: boolean;
  draft: DraftView | null;
  desired: DesiredView | null;
  consumers: ConsumerView[];
  counts: Record<ConsumerState, number>;
  blocked: Blocked[];
}

/**
 * `undecryptable` -- отдельное слово агента: ключ контура в его окружении не
 * открывает конверт. Для панели это тот же отказ применения, что и
 * `apply_failed`: боевое дерево не тронуто, поколение не встало.
 */
const FAILED_APPLY = new Set(["apply_failed", "undecryptable"]);

export function consumerState(
  row: ConsumerInput,
  desired: DesiredView | null,
  ledger: readonly string[],
): ConsumerState {
  if (row.apply !== undefined && FAILED_APPLY.has(row.apply)) {
    return "failed";
  }

  /*
   * Молчание проверяется после отказа применения и до сверки хешей: замолчавший
   * узел с последним известным хешем desired -- всё равно дыра, а не успех
   * (docs/config-distribution.md). А вот узел, который успел сказать
   * `apply_failed` и замолчал, интереснее как отказ.
   */
  if (row.degraded) {
    return "silent";
  }

  if (row.hash === undefined || row.hash === "") {
    return "pending";
  }

  if (desired !== null && row.hash === desired.hash) {
    return "ok";
  }

  /*
   * Хеш из журнала -- моё прежнее поколение: идёт дренаж, это нормально.
   * Хеша в журнале нет -- на узле лежит то, чего контроллер не издавал.
   * Без журнала различить нельзя, и вся разница между «подожди» и «иди
   * смотреть на узел» пропала бы.
   */
  return ledger.includes(row.hash) ? "stale" : "foreign";
}

function emptyCounts(): Record<ConsumerState, number> {
  return { ok: 0, stale: 0, pending: 0, failed: 0, foreign: 0, silent: 0 };
}

/** Источник правили с последней рассылки. */
export function sourceChanged(input: ChannelInput): boolean {
  const { draft, sentSourceHash } = input;
  return (
    draft !== null &&
    sentSourceHash !== null &&
    draft.sourceHash !== "" &&
    draft.sourceHash !== sentSourceHash
  );
}

/**
 * Худшее из посчитанного -- для одной иконки. Порядок не произвольный:
 *
 * `failed` и `foreign` -- про боевой контур, они выше всего. `broken` -- про
 * черновик, который не компилируется: обычное состояние незаконченной правки,
 * и ставить его выше отказа на ноде значит прятать аварию за опечаткой.
 * `never` выше `dirty` потому, что «ни разу не отправлено» точнее, чем
 * «отличается от ничего»; `dirty` выше `no_effect` потому, что уехавшая правка
 * важнее не уехавшей.
 */
export function channelState(input: ChannelInput, counts: Record<ConsumerState, number>): ChannelState {
  const { draft, desired, delivered } = input;

  if (counts.failed > 0) {
    return "failed";
  }

  if (counts.foreign > 0) {
    return "foreign";
  }

  if (draft !== null && !draft.ok) {
    return "broken";
  }

  /*
   * Пустой источник: контур не пользуется этой проверкой. Тихо -- пока на
   * флоте нет поколения. Есть -- заменить его нечем, и это уже отказ.
   */
  if (draft !== null && draft.empty) {
    return desired === null ? "empty" : "broken";
  }

  if (desired === null) {
    return "never";
  }

  if (draft !== null && draft.ok && draft.hash !== desired.hash) {
    return "dirty";
  }

  /*
   * Источник правили, а конфигурация вышла та же. Либо поле не читает
   * компилятор, либо директива печатается, но не поддержана сборкой модуля
   * (nginx/docs/module/unsupported.md), либо правили то, на что никто не
   * ссылается. Во всех трёх случаях «сошлось» -- неправда: оператор менял
   * настройку и вправе знать, что она никуда не уехала.
   */
  if (sourceChanged(input)) {
    return "no_effect";
  }

  if (!delivered) {
    return "unmanaged";
  }

  if (counts.silent > 0) {
    return "silent";
  }

  /*
   * Издано, а участников нет вовсе -- ни живых, ни замолчавших. Это не
   * молчание, а отсутствие: инспектора такого рода на контуре не подняли, и
   * рассылать некому. Замолчавший участник пойман выше (`counts.silent`);
   * «никого» -- тихое состояние, красить его в жёлтый значит отучать смотреть
   * на цвет.
   */
  if (counts.ok + counts.stale + counts.pending === 0) {
    return "nobody";
  }

  if (counts.stale > 0 || counts.pending > 0) {
    return "converging";
  }

  return "ok";
}

export function viewChannel(input: ChannelInput): ChannelView {
  const counts = emptyCounts();
  const consumers: ConsumerView[] = [];

  /*
   * У канала без читателя участников нет по построению: реплики живы, но этот
   * ключ не забирают, и сверять их отпечаток с изданным манифестом бессмысленно.
   */
  if (input.delivered) {
    for (const row of input.consumers) {
      const state = consumerState(row, input.desired, input.ledger);
      counts[state] += 1;
      consumers.push({
        uuid: row.uuid,
        label: row.label,
        state,
        hash: row.hash,
        rev: row.rev,
        apply: row.apply,
      });
    }
  }

  const dirty =
    input.draft !== null &&
    input.draft.ok &&
    !input.draft.empty &&
    (input.desired === null || input.draft.hash !== input.desired.hash);

  const state = channelState(input, counts);

  /*
   * Причину «broken» оператор обязан прочитать. У опустевшего источника своей
   * ошибки компиляции нет -- она появляется только в паре с изданным
   * поколением, и приписать её плану заранее нельзя.
   */
  const draft =
    input.draft !== null && input.draft.empty && input.desired !== null
      ? { ...input.draft, ok: false, errors: [...input.draft.errors, SOURCE_EMPTIED] }
      : input.draft;

  return {
    id: input.id,
    state,
    dirty,
    sourceChanged: sourceChanged(input),
    delivered: input.delivered,
    draft,
    desired: input.desired,
    consumers,
    counts,
    blocked: input.blocked,
  };
}

/** Худший канал контура -- для лампы в шапке. */
const LAMP_ORDER: ChannelState[] = [
  "failed",
  "foreign",
  "broken",
  "silent",
  "never",
  "dirty",
  "no_effect",
  "converging",
  "unmanaged",
  "nobody",
  "empty",
  "ok",
];

export type ConvergenceLamp = "red" | "yellow" | "green";

const LAMP: Record<ChannelState, ConvergenceLamp> = {
  failed: "red",
  foreign: "red",
  broken: "yellow",
  silent: "yellow",
  never: "yellow",
  dirty: "yellow",
  no_effect: "yellow",
  converging: "yellow",
  unmanaged: "green",
  nobody: "green",
  empty: "green",
  ok: "green",
};

export function worstState(states: readonly ChannelState[]): ChannelState {
  for (const state of LAMP_ORDER) {
    if (states.includes(state)) {
      return state;
    }
  }
  return "ok";
}

export function lampOf(states: readonly ChannelState[]): ConvergenceLamp {
  return LAMP[worstState(states)];
}
