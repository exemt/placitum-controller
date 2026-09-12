/**
 * Словарь диагностик: какие сообщения бывают, насколько они серьёзны и о чём.
 *
 * Уровень и тема заданы здесь по одному разу на код, а не в месте вызова.
 * Иначе один и тот же код со временем начинает выдаваться то предупреждением,
 * то советом — смотря какая ветка сработала, — и отфильтровать его целиком
 * уже невозможно.
 *
 * Уровни различаются последствием, а не тяжестью формулировки:
 *
 *  - `error` — ModSecurity правило не загрузит либо его нельзя однозначно
 *    показать в конструкторе; визуальная вкладка блокируется;
 *  - `warning` — правило загрузится, но сделает не то, что задумано:
 *    не сработает никогда, сработает всегда или пропустит часть входа;
 *  - `advice` — правило делает ровно то, что написано; есть способ проще,
 *    дешевле или надёжнее. Совет не окрашивает сводку и не мешает работать.
 *
 * Тема — вторая, независимая ось. Она нужна не для показа, а чтобы можно
 * было заглушить целый разряд сообщений: тому, кто переносит готовый набор
 * правил из CRS, советы по стилю не нужны, а проверки окружения — нужны.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'advice';

export type DiagnosticTopic =
  /** Форма правила: имена, обязательные поля, целостность цепочки. */
  | 'structure'
  /** Логика проверки: противоречия, тавтологии, несовместимые шаги. */
  | 'logic'
  /** Покрытие: проверка сработает, но пропустит часть того, что должна ловить. */
  | 'coverage'
  /** Зависимость от остального файла: директив, меток, чужих переменных. */
  | 'environment'
  /** Наблюдаемость: попадёт ли срабатывание в лог и что в нём будет видно. */
  | 'logging'
  /** Цена исполнения на каждом запросе. */
  | 'performance'
  /** Избыточность и запись, которую принято писать иначе. */
  | 'style';

type Kind = readonly [DiagnosticSeverity, DiagnosticTopic];

/**
 * Все коды диагностик. Ключ совпадает с ключом перевода (`diag.<code>`).
 *
 * Порядок разделов — от «не загрузится» к «можно и так, но лучше иначе».
 */
export const DIAGNOSTIC_CATALOG = {
  /* --- Форма: без этого правило не загрузится ---------------------- */
  notParsed: ['error', 'structure'],
  unbalancedQuotes: ['error', 'structure'],
  unknownDirective: ['error', 'structure'],
  emptyTargets: ['error', 'structure'],
  unknownOperator: ['error', 'structure'],
  danglingChain: ['error', 'structure'],
  missingId: ['error', 'structure'],
  duplicateId: ['error', 'structure'],
  duplicateIdCrossFile: ['error', 'structure'],
  chainLinkHeadAction: ['error', 'structure'],
  exclusionNoTarget: ['error', 'structure'],
  exclusionBadId: ['error', 'structure'],
  directiveArgCount: ['error', 'structure'],
  directiveValueMissing: ['error', 'structure'],
  directiveNotNumber: ['error', 'structure'],

  /* --- Форма: загрузится, но что-то написано не по правилам --------- */
  unknownVariable: ['warning', 'structure'],
  selectorNeedsQuotes: ['warning', 'structure'],
  selectorNotPortable: ['warning', 'structure'],
  unknownTransform: ['warning', 'structure'],
  unknownAction: ['warning', 'structure'],
  actionNotEditable: ['warning', 'structure'],
  operatorArgumentRequired: ['warning', 'structure'],
  operatorArgumentUnexpected: ['warning', 'structure'],
  invalidRegex: ['warning', 'structure'],
  missingPhase: ['warning', 'structure'],
  noDisruptive: ['warning', 'structure'],
  destinationMissing: ['warning', 'structure'],
  destinationUnexpected: ['warning', 'structure'],
  exclusionUpdateActionMetadata: ['warning', 'structure'],
  exclusionCtlNoTarget: ['warning', 'structure'],
  // Предупреждение, а не ошибка, — по той же причине, что у неизвестного
  // действия: набор допустимых значений редактор знает из своей таблицы, а
  // она может отстать от движка. Ошибка заблокировала бы конструктор на
  // весь файл из-за одного значения, которого редактор просто не выучил.
  directiveBadValue: ['warning', 'structure'],
  directiveUnknownFlag: ['warning', 'structure'],

  /* --- Логика: проверка значит не то, что кажется ------------------- */
  countWithTransforms: ['warning', 'logic'],
  countOnScalar: ['warning', 'logic'],
  selectorNotSupported: ['warning', 'logic'],
  selectorRequired: ['warning', 'logic'],
  excludeWithoutSelector: ['warning', 'logic'],
  excludeWithoutBase: ['warning', 'logic'],
  operatorInputMismatch: ['warning', 'logic'],
  nonNumericArgument: ['warning', 'logic'],
  invalidIpEntry: ['warning', 'logic'],
  transformNoneNotFirst: ['warning', 'logic'],
  duplicateTransform: ['warning', 'logic'],
  statusWithoutBlock: ['warning', 'logic'],
  exclusionUpdateTargetNotExclusion: ['warning', 'logic'],
  exclusionRemovedThenUpdated: ['warning', 'logic'],
  exclusionEmptyRange: ['warning', 'logic'],
  exclusionCtlBadId: ['warning', 'logic'],
  exclusionCtlTargetList: ['warning', 'logic'],
  exclusionCtlDeadTarget: ['warning', 'logic'],
  exclusionCtlCarrierStops: ['warning', 'logic'],

  /* --- Логика: проверка не сработает никогда ------------------------ */
  caseNeverMatches: ['warning', 'logic'],
  whitespaceNeverMatches: ['warning', 'logic'],
  hashWithoutHexEncode: ['warning', 'logic'],
  conflictingCaseTransforms: ['warning', 'logic'],
  impossibleNumericRange: ['warning', 'logic'],
  literalWithRegexSyntax: ['warning', 'logic'],
  negationMatchesNothing: ['warning', 'logic'],
  neverTrueComparison: ['warning', 'logic'],

  /* --- Логика: проверка срабатывает всегда -------------------------- */
  matchesEverything: ['warning', 'logic'],
  alwaysTrueComparison: ['warning', 'logic'],

  /* --- Покрытие: ловит меньше, чем должно --------------------------- */
  phaseTooEarly: ['warning', 'coverage'],
  decodeAfterNormalise: ['warning', 'coverage'],
  noNormalisation: ['advice', 'coverage'],
  unescapedDot: ['advice', 'coverage'],
  overlappingTargets: ['advice', 'coverage'],
  exclusionTooBroad: ['advice', 'coverage'],

  /* --- Окружение: остального файла не хватает ----------------------- */
  requestBodyAccessOff: ['warning', 'environment'],
  responseBodyAccessOff: ['warning', 'environment'],
  disruptiveInLoggingPhase: ['warning', 'environment'],
  missingMarker: ['warning', 'environment'],
  skipBeyondEnd: ['warning', 'environment'],
  exclusionBeforeRule: ['warning', 'environment'],
  exclusionInEarlierFile: ['warning', 'environment'],
  exclusionCtlAfterRule: ['warning', 'environment'],
  engineNotEnforcing: ['advice', 'environment'],
  exclusionNoMatch: ['advice', 'environment'],
  xmlWithoutProcessor: ['advice', 'environment'],
  txNeverSet: ['advice', 'environment'],

  /* --- Логи: сработает, но следа не останется ----------------------- */
  captureWithoutRegex: ['warning', 'logging'],
  captureMissing: ['warning', 'logging'],
  blockWithoutLog: ['warning', 'logging'],
  logdataWithoutLog: ['warning', 'logging'],
  captureUnused: ['advice', 'logging'],
  blockWithoutMsg: ['advice', 'logging'],

  /* --- Цена исполнения ---------------------------------------------- */
  possibleRedos: ['warning', 'performance'],
  regexIsPlainText: ['advice', 'performance'],
  anchoredLiteralRegex: ['advice', 'performance'],
  redundantLeadingWildcard: ['advice', 'performance'],
  capturingGroupUnused: ['advice', 'performance'],
  rblOnHotPath: ['advice', 'performance'],

  /* --- Избыточность и запись ---------------------------------------- */
  duplicateTarget: ['advice', 'style'],
  duplicateCondition: ['advice', 'style'],
  duplicateRule: ['advice', 'style'],
  redundantTransform: ['advice', 'style'],
  transformsWithoutCheck: ['advice', 'style'],
  singlePhraseList: ['advice', 'style'],
  idInReservedRange: ['advice', 'style'],
  exclusionDuplicate: ['advice', 'style'],
  exclusionByMsgFragile: ['advice', 'style'],
  exclusionCtlAlreadyRemoved: ['advice', 'style'],
} as const satisfies Record<string, Kind>;

/** Код диагностики — он же ключ перевода (`diag.<code>`). */
export type DiagnosticCode = keyof typeof DIAGNOSTIC_CATALOG;

export function severityOf(code: DiagnosticCode): DiagnosticSeverity {
  return DIAGNOSTIC_CATALOG[code][0];
}

export function topicOf(code: DiagnosticCode): DiagnosticTopic {
  return DIAGNOSTIC_CATALOG[code][1];
}

/** Часть правила, к которой относится сообщение. */
export type DiagnosticSlot = 'targets' | 'transforms' | 'operator' | 'actions';

/**
 * Адрес диагностики в модели конструктора.
 *
 * Номер строки годится текстовой вкладке, но в конструкторе строк нет:
 * там нужно подсветить конкретное поле. Поэтому адрес хранится отдельно
 * от `line` и в терминах модели, а не исходника.
 */
export interface DiagnosticAnchor {
  /** Ключ правила (`VisualRule.key`). */
  ruleKey: string;
  /**
   * Номер звена цепочки, 1-based. Задан только у правил с несколькими
   * условиями: у одиночного правила «условие 1» — лишний шум.
   */
  condition?: number;
  slot?: DiagnosticSlot;
  /** Позиция внутри слота: номер области проверки или шага конвейера. */
  index?: number;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  topic: DiagnosticTopic;
  code: DiagnosticCode;
  /** Подстановки в текст сообщения. */
  params?: Record<string, string>;
  /**
   * Файл набора, к которому относится диагностика.
   *
   * Строка и ключ правила считаются внутри файла, поэтому без него замечание
   * из одного файла открывалось бы в другом. У одинокого документа файла нет.
   */
  file?: string;
  /** Строка исходника (1-based), к которой относится диагностика. */
  line?: number;
  anchor?: DiagnosticAnchor;
}

/**
 * Накопитель диагностик.
 *
 * Уровень не передаётся: он берётся из каталога по коду. Место сообщения
 * (строка и адрес в модели) задаётся один раз на весь блок проверок через
 * {@link at}, чтобы каждая проверка занималась только своим условием.
 */
export class Diagnostics {
  readonly items: Diagnostic[] = [];

  private file?: string;
  private line?: number;
  private anchor?: DiagnosticAnchor;

  /**
   * В каком файле набора идут проверки.
   *
   * Задаётся отдельно от {@link at} и реже: файл держится весь проход по
   * одному документу, а строка меняется на каждом правиле.
   */
  inFile(file: string | undefined): this {
    this.file = file;
    return this;
  }

  /** Куда относить последующие сообщения. */
  at(line: number | undefined, anchor?: DiagnosticAnchor): this {
    this.line = line;
    this.anchor = anchor;
    return this;
  }

  report(code: DiagnosticCode, params?: Record<string, string>): void;
  report(code: DiagnosticCode, slot: DiagnosticSlot, params?: Record<string, string>): void;
  report(
    code: DiagnosticCode,
    slotOrParams?: DiagnosticSlot | Record<string, string>,
    maybeParams?: Record<string, string>,
  ): void {
    const slot = typeof slotOrParams === 'string' ? slotOrParams : undefined;
    const params = typeof slotOrParams === 'string' ? maybeParams : slotOrParams;
    const [severity, topic] = DIAGNOSTIC_CATALOG[code];

    this.items.push({
      severity,
      topic,
      code,
      params,
      file: this.file,
      line: this.line,
      anchor: this.anchor && slot ? { ...this.anchor, slot } : this.anchor,
    });
  }

  count(severity: DiagnosticSeverity): number {
    return this.items.filter((d) => d.severity === severity).length;
  }
}
