/**
 * Объектная модель конфигурации ModSecurity.
 *
 * Парсер (`parser.ts`) раскладывает «сырой» текст правил на дерево объектов,
 * описанное здесь. Модель ориентирована на две задачи:
 *  1. Дать редактору структурированное представление правила (переменные,
 *     оператор, действия) для инспекторов/форм и будущей визуализации.
 *  2. Сохранять достаточно информации об исходнике (спаны строк, `raw`),
 *     чтобы можно было связать объект с местом в тексте.
 *
 * Модель намеренно «толерантная»: неизвестные директивы не считаются ошибкой,
 * а попадают в обобщённый {@link DirectiveStatement}.
 */

/** Категория директивы верхнего уровня — дискриминатор объединения. */
export type StatementKind =
  | 'SecRule'
  | 'SecAction'
  | 'SecMarker'
  | 'directive'
  | 'comment'
  | 'blank';

/**
 * Диапазон исходных строк, занятый утверждением.
 * Номера строк — 1-based и указывают на физические строки исходника
 * (с учётом переносов через завершающий `\`).
 */
export interface SourceSpan {
  startLine: number;
  endLine: number;
}

/** Общие поля любого утверждения. */
export interface StatementBase {
  kind: StatementKind;
  /** Оригинальный текст утверждения (физические строки, склеенные `\n`). */
  raw: string;
  span: SourceSpan;
}

/* ------------------------------------------------------------------ */
/* Компоненты правила SecRule / SecAction                              */
/* ------------------------------------------------------------------ */

/**
 * Одна цель правила из списка `VARIABLES`, например `ARGS`,
 * `REQUEST_HEADERS:User-Agent`, `!ARGS:token`, `&ARGS`.
 */
export interface RuleVariable {
  /** Исходный фрагмент до нормализации. */
  raw: string;
  /** Имя коллекции/переменной без префиксов и селектора (`ARGS`). */
  name: string;
  /**
   * Уточнение после `:` — имя поля или regex (`User-Agent`, `/^x/`).
   * Хранится разобранным: без обрамляющих одинарных кавычек и экранирования.
   */
  selector?: string;
  /** Префикс `&` — брать количество элементов, а не значения. */
  count: boolean;
  /** Префикс `!` — исключить цель из проверки. */
  exclusion: boolean;
}

/**
 * Оператор правила. В исходнике это второй аргумент SecRule в кавычках,
 * например `"@rx foo"`, `"@contains bar"`, `"!@eq 0"` или неявный `"foo"`.
 */
export interface RuleOperator {
  /** Исходное содержимое кавычек оператора. */
  raw: string;
  /** Каноничное имя оператора без `@` (`rx`, `contains`, `eq`). */
  name: string;
  /** Префикс `!` — отрицание результата оператора. */
  negated: boolean;
  /** Аргумент оператора — всё после имени (regex, число, строка). */
  argument: string;
  /** true, когда `@op` не был указан и оператор по умолчанию — `rx`. */
  implicit: boolean;
}

/**
 * Одно действие из списка действий, например `id:1001`, `phase:2`, `deny`,
 * `t:lowercase`, `msg:'text'`, `setvar:tx.score=+1`.
 */
export interface RuleAction {
  /** Исходный фрагмент действия до разбора. */
  raw: string;
  /** Имя действия (`id`, `phase`, `deny`, `t`, `msg`, `setvar`). */
  name: string;
  /** Значение после `:` (без обрамляющих одинарных кавычек). */
  value?: string;
  /** true, когда значение в исходнике было в одинарных кавычках. */
  quoted: boolean;
}

/* ------------------------------------------------------------------ */
/* Утверждения верхнего уровня                                         */
/* ------------------------------------------------------------------ */

/** `SecRule VARIABLES "OPERATOR" "ACTIONS"`. */
export interface SecRuleStatement extends StatementBase {
  kind: 'SecRule';
  variables: RuleVariable[];
  operator: RuleOperator;
  actions: RuleAction[];
  /** Значение действия `id`, если задано. */
  id?: string;
  /** Значение действия `phase`, если задано. */
  phase?: string;
  /** Значение действия `msg` (без кавычек), если задано. */
  msg?: string;
  /** Правило продолжается следующим (есть действие `chain`). */
  chained: boolean;
}

/** `SecAction "ACTIONS"` — правило, срабатывающее безусловно. */
export interface SecActionStatement extends StatementBase {
  kind: 'SecAction';
  actions: RuleAction[];
  id?: string;
  phase?: string;
}

/** `SecMarker LABEL` — именованная метка для skipAfter. */
export interface SecMarkerStatement extends StatementBase {
  kind: 'SecMarker';
  label: string;
}

/** Любая другая директива конфигурации, например `SecRuleEngine On`. */
export interface DirectiveStatement extends StatementBase {
  kind: 'directive';
  name: string;
  args: string[];
}

/** Строка-комментарий, начинающаяся с `#`. */
export interface CommentLine extends StatementBase {
  kind: 'comment';
  /** Текст комментария без ведущего `#` и пробела. */
  text: string;
}

/** Пустая (или состоящая из пробелов) строка — хранится для точных спанов. */
export interface BlankLine extends StatementBase {
  kind: 'blank';
}

/** Размеченное объединение всех видов утверждений. */
export type ParsedStatement =
  | SecRuleStatement
  | SecActionStatement
  | SecMarkerStatement
  | DirectiveStatement
  | CommentLine
  | BlankLine;

/** Результат разбора всего документа. */
export interface ParsedDocument {
  /** Все утверждения в порядке следования (включая комментарии и пустые строки). */
  statements: ParsedStatement[];
  /** Быстрый доступ только к правилам SecRule. */
  rules: SecRuleStatement[];
}
