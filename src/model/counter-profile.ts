/*
 * Профиль инспектора счётчика (inspectors/counter).
 *
 * Документ повторяет форму profile.yaml инспектора один в один. Кроме профилей
 * у счётчика есть общая секция -- объявления счётчиков и источники ключей
 * субъектов: она одна на инспектор, лежит отдельной строкой (counter_shared) и
 * едет в манифесте псевдопрофилем `_shared`. Профили ссылаются на счётчики по
 * имени, и ссылка на необъявленное отвергается при сохранении -- то же самое
 * сделал бы загрузчик инспектора, но apply_failed в пульсе видит не оператор.
 *
 * Формы -- docs/README.md репозитория counter.
 */


/** Действия правила judge. allow нет: пустое правило пишется его отсутствием. */
export type CounterJudgeAction = "deny" | "score";

/** Источники значения правила measure. `bytes` -- размер в байтах: у кадров
 * килобайты слишком крупная единица. */
export type CounterSource = "const" | "regex_count" | "size_kb" | "bytes";

/** Оси субъектов. Порядок -- порядок показа. `conn` -- соединение WebSocket
 * (conn_id рукопожатия), есть только на фазе кадров. */
export const COUNTER_AXES = ["ip", "asn_net", "asn_router", "sess", "user", "conn"] as const;

/** Селекторы правил measure фазы кадров. */
export const COUNTER_DIRECTIONS = ["c2s", "s2c"] as const;
export const COUNTER_OPCODES = ["text", "binary", "continuation"] as const;

export type CounterAxis = (typeof COUNTER_AXES)[number];

/* --- общая секция ----------------------------------------------------------- */

/** Ёмкость и потери одной оси. Ёмкость в натуральных единицах счётчика. */
export interface CounterAxisTier {
  max: number;
  /** Проценты ёмкости в секунду; тихий субъект остывает за 100/loss секунд. */
  loss: number;
}

/**
 * Владение шкалой: корзину наполняет ровно один вход -- либо собственные
 * правила measure (умолчание), либо note соседей. Два входа в одну шкалу
 * означали бы двух владельцев одной ответственности. Судятся оба владения
 * одинаково.
 */
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
  /** Подпись единицы для панели и аудита. На арифметику не влияет. */
  unit: string;
  fill: CounterFill;
  axes: Partial<Record<CounterAxis, CounterAxisTier>>;
  subjects: CounterDeclSubjects | null;
}

/**
 * Источники ключей настраиваемых осей. sess -- кука клиренса капчи по
 * умолчанию; user -- "cookie:<имя>", "header:<имя>" либо личность от калитки:
 * "session:user" (корзина на логин) и "session:sid" (корзина на сессию).
 * Пусто -- ось выключена.
 */
export interface CounterSubjects {
  sess: { cookie: string };
  user: { from: string };
}

export interface CounterSharedDoc {
  counters: Record<string, CounterDecl>;
  subjects: CounterSubjects;
}

export const DEFAULT_SESS_COOKIE = "waf_cid";

/* --- профиль ---------------------------------------------------------------- */

/**
 * Правило суда: «корзина дошла → что делать». Порог в процентах заполнения --
 * натуральные единицы у каждого счётчика свои, процент читается одинаково.
 */
export interface CounterJudgeRule {
  counter: string;
  axis: CounterAxis;
  at: number;
  action: CounterJudgeAction;
  /** Только при action: score, 1..100. */
  score: number;
  /** Повод; пусто -- COUNTER_LEVEL. */
  code: string;
}

/**
 * Предикат правила measure. Пустое поле -- «любой». Пути здесь сознательно
 * нет: разное поведение на разных путях -- это разные профили на разных
 * маршрутах, а не селектор внутри правила.
 */
export interface CounterMeasureIf {
  status: number[];
  contentType: string[];
  methods: string[];
  /** Только у правил фазы кадров: направление и опкод кадра. Пусто -- любое. */
  direction: string[];
  opcode: string[];
}

export interface CounterMeasureRule {
  if: CounterMeasureIf;
  source: CounterSource;
  /** Только при source: regex_count. */
  regex: string;
  /** Множитель значения источника; null -- единица. Минус снимает. */
  per: number | null;
  counter: string;
  /** Какие оси заряжать. Пусто -- все объявленные у счётчика. */
  axes: CounterAxis[];
}

/**
 * Глаголы, которые счётчик применяет: коэффициент к отдаваемому счёту,
 * пропуск суда и note -- изменение корзины fill: note процентами её ёмкости.
 * Заряды note ложатся на фазе ответа, суд читает их со следующего запроса.
 */
export type CounterVerb = "threshold" | "skip" | "note";

export interface CounterPriorRule {
  /** Имя отправителя. `*` не принимается: все три глагола умеют ослаблять. */
  from: string;
  accept: CounterVerb[];
  /**
   * Оси провода, о которых слушаем; пусто -- любая допустимая при глаголах.
   * Настоящий выбор только у note: request у threshold/skip единственна.
   */
  apply: string[];
  codes: string[];
  /**
   * Корзина, которую наполняют принятые note; обязательна при note. Потолков
   * у правила нет: границы чисел держат загрузчик отправителя и ёмкость
   * корзины.
   */
  counter: string;
}

export interface CounterTrigger {
  prior: CounterPriorRule[];
}

/**
 * Триггер инициатора: собственный решённый вердикт фазы запроса либо уровень
 * названной корзины. Второй нужен там, где вердикт ответа не даёт: корзин у
 * счётчика много, а вердикт один, и по нему не отличить, какая перелилась.
 */
export type CounterOn = "deny" | "allow" | "score" | "level" | "overload";

/** Какую корзину смотрит инициатор с on: level. */
export interface CounterOutcomeIf {
  counter: string;
  axis: CounterAxis;
}

/**
 * Инициатор по решению: просьба соседу (непустой `do`) либо запись субъекта в
 * живой набор (непустой `list`). Форма и правила -- те же, что у json.
 */
import type { ArchiveWhen, RecordObject } from "./actions.ts";

export interface CounterOutcome {
  on: CounterOn;
  at: number | null;
  below: boolean;
  /** Только при on: level — какую корзину смотреть. */
  if: CounterOutcomeIf | null;
  /** Точное сравнение: score == at. С below взаимоисключимы. */
  eq: boolean;

  to: string;
  do: string;
  apply: string;
  delta: number | null;
  value: number | null;
  /** Имя корзины получателя при do: note — селектор поверх его правил приёма. */
  counter: string;
  /**
   * Метка события при `do: mark`, обязательна: произвольная строка оператора.
   * Модуль кладёт её в маркеры записи, по которым события ищут и группируют.
   */
  marker: string;
  /** Только mutate, оба обязательны: какую группу модификаторов получателя переключить и куда. */
  group: string;
  /** Только управляющие глаголы: вызову какой фазы адресата ставить режим; пусто -- всем. */
  phase?: string;
  /** У mutate -- куда переключить группу; у audit / archive -- писать или нет. */
  set: "on" | "off" | "";
  /**
   * Глаголы записи (audit, archive): set -- писать или нет; objects и limit --
   * только у archive с set on: какие объекты оставить агенту и сколько байт.
   * Срок архива -- тот же ttlS, что у записи в набор: у строки либо просьба,
   * либо запись.
   */
  headers: RecordObject | null;
  args: RecordObject | null;
  body: RecordObject | null;
  /**
   * Только archive с set on: на каких исходах маршрута просьбу исполнять --
   * как when= директивы. Пусто -- на любом, включая перенаправление: просьба
   * сильнее when= маршрута, о котором отправитель не знает.
   */
  when: ArchiveWhen[];

  list: string;
  /**
   * addr | net | net_all | asn; пусто -- addr. Подсеть (эффективный анонс либо
   * все накрывающие) и систему разворачивает инспектор у кодера гео.
   */
  write: string;
  ttlS: number;

  code: string;
}

export interface CounterRequestPhase {
  enabled: boolean;
  judge: CounterJudgeRule[];
  /** Одна запись каталога на фазу: отказ по любому правилу -- одна страница. */
  denyResponse: string;
  outcomes: CounterOutcome[];
}

/** Фаза ответа только меряет: вердикт всегда allow, инициаторов нет. */
export interface CounterResponsePhase {
  enabled: boolean;
  measure: CounterMeasureRule[];
}

/**
 * Кадры WebSocket в обе стороны: на кадре счётчик и меряет, и судит --
 * заряд этого кадра виден суду того же кадра. Отказ закрывает соединение
 * кадром Close из записи deny_response (type=websocket).
 */
export interface CounterFramePhase {
  enabled: boolean;
  measure: CounterMeasureRule[];
  judge: CounterJudgeRule[];
  denyResponse: string;
  outcomes: CounterOutcome[];
}

export interface CounterProfileDoc {
  description: string;
  trigger: CounterTrigger;
  request: CounterRequestPhase;
  response: CounterResponsePhase;
  frame: CounterFramePhase;
}

export interface CounterProfile {
  id: string;
  httpSpaceId: string;
  name: string;
  description: string;
  doc: CounterProfileDoc;
  createdAt: Date;
  updatedAt: Date;
}
