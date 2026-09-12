/**
 * Смысловые проверки правила.
 *
 * `compile.ts` отвечает на вопрос «правило вообще загрузится» — здесь другой
 * вопрос: «сделает ли оно то, что человек имел в виду». Это разные вещи, и
 * почти все интересные ошибки живут во второй: правило синтаксически
 * безупречно, но `t:lowercase` рядом с `@streq POST` означает, что проверка
 * не сработает никогда, а `deny` с `nolog` — что о срабатывании никто
 * не узнает.
 *
 * Проверки разложены по трём уровням видимости, и это не формальность:
 * от уровня зависит, что проверка вообще способна заметить.
 *
 *  - {@link checkCondition} видит одну директиву `SecRule`: цели, конвейер,
 *    оператор. Сюда попадает всё про совместимость шагов между собой.
 *  - {@link checkRule} видит цепочку целиком вместе с действиями: реакцию,
 *    логи, противоречия между звеньями.
 *  - {@link checkDocument} видит файл: директивы конфигурации, метки,
 *    переменные, которые кто-то должен был выставить раньше.
 *  - {@link checkExclusions} видит связи между директивами: какое исключение
 *    какое правило правит и работает ли оно вообще.
 *
 * Каждая проверка тут — ответ на вопрос «что человек хотел сказать»,
 * поэтому ложное срабатывание дороже пропуска: сообщение, которому не
 * веришь, обесценивает соседние. Там, где уверенности нет, проверка
 * сужена до случая, в котором ошибка почти наверняка настоящая.
 */

import { ACTIONS } from '../components/syntax/modsecKeywords';
import {
  conditionConstraints,
  hasWholeBase,
  operatorMeta,
  splitOperatorArgument,
  takesDestination,
  transformMeta,
  variableMeta,
} from './semantics';
import {
  canonicalDirectiveName,
  directiveIssues,
  parseDirective,
} from './directives';
import { selectorIssue, selectorPattern } from './quoting';
import { isValidIpEntry } from './ip';
import { reviewRegex } from './regex';
import {
  exclusionList,
  exclusionSelectorText,
  exclusionSignature,
  isExclusionCtl,
} from './exclusions';
import { LONE_FILE, blockRef, fileMark } from './workspace';
import type { Diagnostics } from './diagnostics';
import type { DirectiveStatement } from './types';
import type { ExclusionIndex, ExclusionMatch } from './exclusions';
import type { VisualActions, VisualCondition, VisualOperator, VisualTarget } from './model';

/**
 * Имена действий, известные редактору.
 *
 * Список тот же, по которому работает подсветка: держать второй значило бы
 * получить действие, которое в тексте выделено, а в диагностике объявлено
 * незнакомым.
 */
const KNOWN_ACTIONS = new Set<string>(ACTIONS);

/* ------------------------------------------------------------------ */
/* Контекст набора                                                     */
/* ------------------------------------------------------------------ */

/**
 * То, что о правиле известно только по остальному набору файлов.
 *
 * Собирается одним проходом в `inspect.ts` по всем файлам в порядке
 * включения. Флаги трёхзначные: `null` — директивы нет ни в одном файле.
 * Отсутствие и явное `Off` — разные вещи: набор правил обычно живёт отдельно
 * от основного конфига, и молчание про `SecRequestBodyAccess` ничего не
 * значит, а явное `Off` рядом с проверкой тела запроса означает, что
 * проверять будет нечего.
 */
export interface DocumentContext {
  /** Значение `SecRuleEngine`: `On`, `DetectionOnly`, `Off` или `null`. */
  engine: string | null;
  requestBodyAccess: boolean | null;
  responseBodyAccess: boolean | null;
  /** Метки `SecMarker`, на которые можно перейти по `skipAfter`. */
  markers: Set<string>;
  /** Переменные `tx.*`, которые набор выставляет через `setvar`. */
  transactionVars: Set<string>;
  /** В наборе есть `ctl:requestBodyProcessor=XML`. */
  xmlProcessor: boolean;
  /** Хотя бы одно правило набора пытается заблокировать запрос. */
  hasBlockingRule: boolean;
  /**
   * В наборе есть `Include`: часть конфигурации сюда не открыта.
   *
   * Проверки «в наборе никто этого не выставляет» держатся на том, что
   * открытые файлы — это вся конфигурация. С включением это перестаёт быть
   * правдой: `tx.detection_paranoia_level` выставляет CRS, метку для
   * `skipAfter` заводит он же, и увидеть их отсюда нечем. Такие замечания
   * молчат — по той же причине, по какой молчит промах выборки исключения.
   */
  hasIncludes: boolean;
  /** Файл, в котором стоит `SecRuleEngine`: сказать о ней надо там же. */
  engineFile?: string;
  /** Строка директивы `SecRuleEngine`, если она есть. */
  engineLine?: number;
}

export function emptyDocumentContext(): DocumentContext {
  return {
    engine: null,
    requestBodyAccess: null,
    responseBodyAccess: null,
    markers: new Set(),
    transactionVars: new Set(),
    xmlProcessor: false,
    hasBlockingRule: false,
    hasIncludes: false,
  };
}

/** Что известно про правило, когда проверяется отдельное его условие. */
export interface ConditionContext {
  document: DocumentContext;
  /** У правила есть действие `capture`. */
  capture: boolean;
}

/** Что известно про правило, когда проверяется оно целиком. */
export interface RuleContext {
  document: DocumentContext;
  /** Сколько правил набора стоит после этого — для проверки `skip:N`. */
  rulesAfter: number;
  /** Идентификатор правила выше, которое проверяет ровно то же самое. */
  twinId?: string;
}

/* ------------------------------------------------------------------ */
/* Словари, по которым узнаются знакомые случаи                        */
/* ------------------------------------------------------------------ */

/** Операторы, которые сравнивают аргумент как есть, с учётом регистра. */
const LITERAL_OPERATORS = new Set([
  'streq',
  'contains',
  'beginsWith',
  'endsWith',
  'containsWord',
  'within',
  'strmatch',
]);

/** Операторы, которые заполняют `TX:0`…`TX:9` при действии `capture`. */
const CAPTURING_OPERATORS = new Set([
  'rx',
  'verifyCC',
  'verifyCPF',
  'verifySSN',
  'validateHash',
  'gsbLookup',
]);

/** Преобразования, раскрывающие кодирование. */
const DECODERS = new Set([
  'urlDecode',
  'urlDecodeUni',
  'htmlEntityDecode',
  'base64Decode',
  'base64DecodeExt',
  'jsDecode',
  'cssDecode',
  'escapeSeqDecode',
  'hexDecode',
  'utf8toUnicode',
]);

/**
 * Преобразования, которые сворачивают уже раскрытый текст.
 *
 * Именно они страдают от неправильного порядка: свернуть `..%2f` в путь
 * нельзя, пока `%2f` не превратился в косую черту.
 */
const NORMALISERS = new Set([
  'normalizePath',
  'normalizePathWin',
  'normalisePath',
  'normalisePathWin',
  'replaceComments',
  'removeComments',
  'removeCommentsChar',
  'cmdLine',
]);

/** Преобразование слева делает следующие за ним бессмысленными. */
const SUPERSEDES: Record<string, string[]> = {
  removeWhitespace: ['trim', 'trimLeft', 'trimRight', 'compressWhitespace'],
  urlDecodeUni: ['urlDecode'],
  normalizePathWin: ['normalizePath', 'normalisePath'],
};

/** Переменная содержит текст, который пришёл от клиента как есть. */
const USER_CONTROLLED = new Set([
  'ARGS',
  'ARGS_NAMES',
  'ARGS_GET',
  'ARGS_GET_NAMES',
  'ARGS_POST',
  'ARGS_POST_NAMES',
  'QUERY_STRING',
  'REQUEST_URI',
  'REQUEST_URI_RAW',
  'REQUEST_LINE',
  'REQUEST_BODY',
  'REQUEST_HEADERS',
  'REQUEST_COOKIES',
  'REQUEST_FILENAME',
  'REQUEST_BASENAME',
  'FILES',
  'FILES_NAMES',
  'RESPONSE_BODY',
]);

/**
 * Хранилища, тип значений которых задаёт не движок, а автор правил.
 *
 * В `TX:anomaly_score` лежит число, в `TX:msg` — строка, и по имени
 * коллекции узнать это нельзя: что положил `setvar`, то там и лежит.
 * Числовое сравнение с такой целью — обычный приём накопительной оценки,
 * поэтому тип входа у них не проверяется вовсе.
 */
const UNTYPED_COLLECTIONS = new Set(['TX', 'IP', 'SESSION', 'USER', 'ENV', 'GEO']);

/** Цель заполняется только при включённом разборе тела запроса. */
const REQUEST_BODY_TARGETS = new Set([
  'REQUEST_BODY',
  'REQUEST_BODY_LENGTH',
  'ARGS_POST',
  'ARGS_POST_NAMES',
  'FILES',
  'FILES_NAMES',
  'FILES_SIZES',
  'MULTIPART_STRICT_ERROR',
  'REQBODY_ERROR',
  'XML',
]);

/** Более узкая коллекция целиком входит в более широкую. */
const CONTAINED_IN: Record<string, string> = {
  ARGS_GET: 'ARGS',
  ARGS_POST: 'ARGS',
  ARGS_GET_NAMES: 'ARGS_NAMES',
  ARGS_POST_NAMES: 'ARGS_NAMES',
};

/**
 * Операторы, которые не смотрят на проверяемое значение.
 *
 * Не путать с операторами без аргумента: `@detectSQLi` аргумента тоже не
 * берёт, но значение разбирает, и преобразования перед ним обязательны —
 * без `t:urlDecodeUni` инъекция в процентном кодировании пройдёт мимо.
 */
const VALUE_BLIND_OPERATORS = new Set(['unconditionalMatch', 'noMatch', 'geoLookup']);

/** Реакции, которые прерывают обработку запроса. */
const BLOCKING = new Set(['deny', 'drop', 'redirect', 'proxy', 'block']);

/** Диапазон номеров, занятый OWASP Core Rule Set. */
const CRS_ID_RANGE: [number, number] = [900000, 999999];

/* ------------------------------------------------------------------ */
/* Разбор значений                                                     */
/* ------------------------------------------------------------------ */

/** Значение содержит макрос `%{TX.foo}` — что в нём окажется, неизвестно. */
export function isMacro(value: string): boolean {
  return /%\{[^}]*\}/.test(value);
}

export function isNumeric(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}

/** Обрезает значение до длины, на которой сообщение ещё читается. */
function short(value: string, limit = 40): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/**
 * Текст, который шаблон ищет буквально.
 *
 * Из регулярного выражения вычёркивается всё, что символом самого себя не
 * является: экранированные последовательности (`\d`, `\.`), символьные
 * классы, префиксы групп, макросы и метасимволы. Остаётся то, что должно
 * встретиться во входе как есть, — только по нему можно судить, переживёт
 * ли шаблон конвейер преобразований.
 */
function regexLiteral(pattern: string): string {
  return pattern
    .replace(/%\{[^}]*\}/g, ' ')
    .replace(/\\[pP]\{[^}]*\}/g, ' ')
    .replace(/\\./g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\?[a-zA-Z:=!<>#-]*\)?/g, ' ')
    .replace(/[*+?{}()|^$.]/g, ' ');
}

/** Буквальный текст, который оператор ищет во входе; `null` — такого нет. */
function literalText(operator: VisualOperator): string | null {
  const { name, argument } = operator;
  if (argument.trim() === '') return null;
  if (LITERAL_OPERATORS.has(name)) {
    return isMacro(argument) ? null : argument;
  }
  // `(?i)` снимает вопрос о регистре, а с ним и половину проверок ниже.
  if (name === 'rx' && !argument.startsWith('(?i)')) {
    return regexLiteral(argument);
  }
  return null;
}

/** Шаблон подходит к любому входу, в том числе к пустому. */
function matchesAnything(pattern: string): boolean {
  let core = pattern;
  for (;;) {
    const before = core;
    core = core
      .replace(/^\(\?:([^()|]*)\)$/, '$1')
      .replace(/^\(([^()|]*)\)$/, '$1')
      .replace(/^\^/, '')
      .replace(/(?<!\\)\$$/, '');
    if (core === before) break;
  }
  if (core === '.*' || core === '.*?' || core === '(?s).*') return true;
  // Пустая ветка альтернативы: `(foo|)` совпадает и с пустой строкой.
  return /\(\s*\||\|\s*\)|\|\s*\|/.test(pattern);
}

/** Шаблон записан без единого спецсимвола — это обычный поиск подстроки. */
function isPlainText(pattern: string): boolean {
  return pattern !== '' && !/[\\^$.*+?()[\]{}|]/.test(pattern);
}

/** Последнее приведение регистра в конвейере: после него регистр один. */
function caseFolding(transforms: string[]): 'lowercase' | 'uppercase' | null {
  let folding: 'lowercase' | 'uppercase' | null = null;
  for (const name of transforms) {
    if (name === 'none') folding = null;
    else if (name === 'lowercase' || name === 'uppercase') folding = name;
  }
  return folding;
}

/** Шаги конвейера после последнего `t:none` — только они и работают. */
function effectiveTransforms(transforms: string[]): string[] {
  const reset = transforms.lastIndexOf('none');
  return reset === -1 ? transforms : transforms.slice(reset + 1);
}

/** Ссылки на захваченные группы (`%{TX.1}`) в тексте. */
function captureRefs(text: string): string[] {
  const found = [...text.matchAll(/%\{tx[.:](\d)\}/gi)];
  return found.map((m) => m[1]);
}

/** Строковый отпечаток цели — для поиска одинаковых областей проверки. */
export function targetSignature(target: VisualTarget): string {
  const prefix = target.count ? '&' : '';
  const params = [...target.params].sort().join(',');
  return `${prefix}${target.name}|${target.mode}|${params}|${target.excludeOnly ?? false}`;
}

/** Строковый отпечаток условия — для поиска повторов внутри цепочки. */
export function conditionSignature(condition: VisualCondition): string {
  const targets = condition.targets.map(targetSignature).join('+');
  const { name, negated, argument } = condition.operator;
  return `${targets}#${condition.transforms.join('.')}#${negated ? '!' : ''}${name} ${argument}`;
}

/* ------------------------------------------------------------------ */
/* Числовые промежутки                                                 */
/* ------------------------------------------------------------------ */

/** Множество чисел, которое пропускает одно числовое сравнение. */
interface Range {
  min: number;
  max: number;
  minOpen: boolean;
  maxOpen: boolean;
}

const FULL_RANGE: Range = {
  min: Number.NEGATIVE_INFINITY,
  max: Number.POSITIVE_INFINITY,
  minOpen: false,
  maxOpen: false,
};

/** Промежуток, который задаёт сравнение; `null` — сравнение не числовое. */
function rangeOf(operator: VisualOperator): Range | null {
  const { name, argument, negated } = operator;
  if (negated || !isNumeric(argument)) return null;
  const n = Number(argument);
  switch (name) {
    case 'eq':
      return { min: n, max: n, minOpen: false, maxOpen: false };
    case 'gt':
      return { ...FULL_RANGE, min: n, minOpen: true };
    case 'ge':
      return { ...FULL_RANGE, min: n };
    case 'lt':
      return { ...FULL_RANGE, max: n, maxOpen: true };
    case 'le':
      return { ...FULL_RANGE, max: n };
    default:
      return null;
  }
}

function intersect(a: Range, b: Range): Range {
  const min = Math.max(a.min, b.min);
  const max = Math.min(a.max, b.max);
  return {
    min,
    max,
    minOpen: (a.min === min && a.minOpen) || (b.min === min && b.minOpen),
    maxOpen: (a.max === max && a.maxOpen) || (b.max === max && b.maxOpen),
  };
}

function isEmptyRange(range: Range): boolean {
  if (range.min > range.max) return true;
  return range.min === range.max && (range.minOpen || range.maxOpen);
}

/* ------------------------------------------------------------------ */
/* Уровень условия                                                     */
/* ------------------------------------------------------------------ */

/** Цели: что проверяется и заполнено ли оно вообще. */
function checkTargets(
  condition: VisualCondition,
  ctx: ConditionContext,
  diag: Diagnostics,
): void {
  const seen = new Set<string>();
  const whole = new Set<string>();

  for (const target of condition.targets) {
    const meta = variableMeta(target.name);
    if (!meta) {
      diag.report('unknownVariable', 'targets', { name: target.name });
    } else {
      if (target.params.length > 0 && meta.selector === 'none') {
        diag.report('selectorNotSupported', 'targets', { name: target.name });
      }
      // Параметр обязателен, а положительная часть цели — вся коллекция:
      // перечня, который бы его задал, здесь нет.
      if (meta.selector === 'required' && hasWholeBase(target)) {
        diag.report('selectorRequired', 'targets', { name: target.name });
      }
      if (target.count && !meta.collection) {
        diag.report('countOnScalar', 'targets', { name: target.name });
      }
    }

    if (target.mode === 'except' && target.params.some((p) => p === '')) {
      diag.report('excludeWithoutSelector', 'targets', { name: target.name });
    }

    checkSelectors(target, diag);
    // Вычитание живёт отдельной целью и когда положительная часть у
    // переменной всё же есть — например, у `ARGS:/^user_/|!ARGS:token`,
    // где перечень задан шаблоном. Предупреждать здесь не о чем: набор,
    // из которого вычитают, условие всё-таки набрало.
    const subtractsFromNothing =
      target.excludeOnly &&
      !condition.targets.some((t) => !t.excludeOnly && t.name === target.name);
    if (subtractsFromNothing) {
      diag.report('excludeWithoutBase', 'targets', { name: target.name });
    }

    const signature = targetSignature(target);
    if (seen.has(signature)) {
      diag.report('duplicateTarget', 'targets', { name: target.name });
    }
    seen.add(signature);
    if (!target.excludeOnly && target.params.length === 0) whole.add(target.name);

    checkTargetEnvironment(target, ctx, diag);
  }

  for (const [inner, outer] of Object.entries(CONTAINED_IN)) {
    if (whole.has(inner) && whole.has(outer)) {
      diag.report('overlappingTargets', 'targets', { inner, outer });
    }
  }
}

/**
 * Записывается ли параметр так, чтобы его понял любой ModSecurity.
 *
 * Имя аргумента с пробелом — не выдумка: браузер отправляет `Add+to+Basket`,
 * а до правила оно доходит уже как `Add to Basket`. Записать его прямо
 * нельзя — пробел обрывает параметр, — и обходные пути у двух версий
 * движка разные. Единственная общая форма — шаблон, её и предлагаем.
 */
function checkSelectors(target: VisualTarget, diag: Diagnostics): void {
  for (const param of target.params) {
    const issue = selectorIssue(param);
    if (issue === null) continue;

    const pattern = issue === 'v2only' ? selectorPattern(param) : null;
    if (pattern !== null) {
      diag.report('selectorNeedsQuotes', 'targets', { value: short(param), pattern });
    } else {
      diag.report('selectorNotPortable', 'targets', { value: short(param) });
    }
  }
}

/** Заполнена ли цель при той конфигурации, что описана в этом же файле. */
function checkTargetEnvironment(
  target: VisualTarget,
  ctx: ConditionContext,
  diag: Diagnostics,
): void {
  const { document } = ctx;

  if (document.requestBodyAccess === false && REQUEST_BODY_TARGETS.has(target.name)) {
    diag.report('requestBodyAccessOff', 'targets', { name: target.name });
  }
  if (document.responseBodyAccess === false && target.name === 'RESPONSE_BODY') {
    diag.report('responseBodyAccessOff', 'targets', { name: target.name });
  }
  if (target.name === 'XML' && !document.xmlProcessor && !document.hasIncludes) {
    diag.report('xmlWithoutProcessor', 'targets');
  }

  if (target.name === 'TX' && !ctx.capture && !document.hasIncludes) {
    for (const param of target.params) {
      // Захваченные группы (`TX:1`) и шаблоны (`TX:/^score_/`) выставляет
      // не `setvar`, и искать их среди присвоений бессмысленно.
      if (!/^[A-Za-z_][\w-]*$/.test(param)) continue;
      if (!document.transactionVars.has(param.toLowerCase())) {
        diag.report('txNeverSet', 'targets', { name: param });
      }
    }
  }
}

/** Конвейер преобразований: порядок, повторы и взаимные отмены. */
function checkTransforms(condition: VisualCondition, diag: Diagnostics): void {
  const seen = new Set<string>();

  condition.transforms.forEach((name, index) => {
    if (!transformMeta(name)) {
      diag.report('unknownTransform', 'transforms', { name });
      return;
    }
    if (name === 'none' && index > 0) diag.report('transformNoneNotFirst', 'transforms');
    if (seen.has(name)) diag.report('duplicateTransform', 'transforms', { name });
    seen.add(name);
  });

  const active = effectiveTransforms(condition.transforms);

  if (active.includes('lowercase') && active.includes('uppercase')) {
    diag.report('conflictingCaseTransforms', 'transforms');
  }

  // Раскрывать кодирование нужно до того, как текст свернут: `..%2f` не
  // выглядит обходом каталога, пока `%2f` остаётся тремя символами.
  const firstNormaliser = active.findIndex((name) => NORMALISERS.has(name));
  if (firstNormaliser !== -1) {
    const decoder = active.slice(firstNormaliser + 1).find((name) => DECODERS.has(name));
    if (decoder !== undefined) {
      diag.report('decodeAfterNormalise', 'transforms', {
        decode: decoder,
        normalise: active[firstNormaliser],
      });
    }
  }

  for (const [earlier, superseded] of Object.entries(SUPERSEDES)) {
    const at = active.indexOf(earlier);
    if (at === -1) continue;
    const later = active.slice(at + 1).find((name) => superseded.includes(name));
    if (later !== undefined) {
      diag.report('redundantTransform', 'transforms', { name: later, previous: earlier });
    }
  }
}

/**
 * Переживёт ли аргумент оператора конвейер преобразований.
 *
 * Самый частый способ написать правило, которое не сработает никогда:
 * привести вход к нижнему регистру и сравнить его с `POST`. Обе половины
 * по отдельности безупречны, а вместе не совпадут ни при каком запросе.
 */
function checkArgumentSurvivesPipeline(
  condition: VisualCondition,
  diag: Diagnostics,
): void {
  const literal = literalText(condition.operator);
  if (literal === null || literal.trim() === '') return;

  const active = effectiveTransforms(condition.transforms);
  const folding = caseFolding(active);
  if (folding === 'lowercase' && /[A-Z]/.test(literal)) {
    diag.report('caseNeverMatches', 'operator', {
      name: folding,
      value: short(condition.operator.argument),
    });
  }
  if (folding === 'uppercase' && /[a-z]/.test(literal)) {
    diag.report('caseNeverMatches', 'operator', {
      name: folding,
      value: short(condition.operator.argument),
    });
  }

  if (active.includes('removeWhitespace') && /\s/.test(literal)) {
    diag.report('whitespaceNeverMatches', 'operator', {
      name: 'removeWhitespace',
      value: short(condition.operator.argument),
    });
  } else if (active.includes('compressWhitespace') && /\s\s/.test(literal)) {
    diag.report('whitespaceNeverMatches', 'operator', {
      name: 'compressWhitespace',
      value: short(condition.operator.argument),
    });
  } else if (active.includes('trim') && /^\s|\s$/.test(literal)) {
    diag.report('whitespaceNeverMatches', 'operator', {
      name: 'trim',
      value: short(condition.operator.argument),
    });
  }

  // `t:md5` отдаёт сырые байты; сравнивать их с текстом можно только
  // после `t:hexEncode`, иначе совпадения не будет никогда.
  const last = active[active.length - 1];
  if (last === 'md5' || last === 'sha1') {
    diag.report('hashWithoutHexEncode', 'operator', { name: last });
  }
}

/** Оператор: аргумент, тип входа и то, что проверка вообще что-то отсеивает. */
function checkOperator(
  condition: VisualCondition,
  ctx: ConditionContext,
  diag: Diagnostics,
): void {
  const { name, argument, negated } = condition.operator;
  const meta = operatorMeta(name);
  // О незнакомом операторе уже сказано структурной проверкой: без него
  // неизвестно ни что оператор принимает, ни что отдаёт, и проверять нечем.
  if (!meta) return;

  const value = argument.trim();
  const constraints = conditionConstraints(condition.targets, condition.transforms);

  // Пустой аргумент не мешает ModSecurity загрузить правило (пустой шаблон
  // совпадает со всем), поэтому это предупреждение, а не ошибка: иначе
  // только что добавленное в конструкторе условие сразу ломало бы вкладку.
  const needsArgument = meta.arg !== 'none';
  if (needsArgument && value === '') diag.report('operatorArgumentRequired', 'operator', { name });
  if (!needsArgument && value !== '') {
    diag.report('operatorArgumentUnexpected', 'operator', { name });
  }
  if (meta.arg === 'number' && value !== '' && !isNumeric(value) && !isMacro(value)) {
    diag.report('nonNumericArgument', 'operator', { name });
  }
  if (meta.arg === 'ipList' && value !== '') {
    const bad = splitOperatorArgument(value, ',').filter((entry) => !isValidIpEntry(entry));
    if (bad.length > 0) diag.report('invalidIpEntry', 'operator', { value: short(bad.join(', ')) });
  }
  // Подсчёт (`&TX:...`) — снова число, известное наверняка, поэтому
  // послабление касается только целей, читающих само значение.
  const knownInput = !condition.targets.some(
    (target) =>
      !target.excludeOnly && !target.count && UNTYPED_COLLECTIONS.has(target.name),
  );
  if (knownInput && !meta.inputs.includes(constraints.inputKind)) {
    diag.report('operatorInputMismatch', 'operator', { name });
  }
  if (VALUE_BLIND_OPERATORS.has(name) && condition.transforms.length > 0) {
    diag.report('transformsWithoutCheck', 'transforms', { name });
  }
  if (name === 'rbl') diag.report('rblOnHotPath', 'operator');
  if (name === 'pm' && value !== '' && !/\s/.test(value)) {
    diag.report('singlePhraseList', 'operator', { value: short(value) });
  }

  if (LITERAL_OPERATORS.has(name) && value !== '' && !isMacro(value) && looksLikeRegex(value)) {
    diag.report('literalWithRegexSyntax', 'operator', { name, value: short(value) });
  }

  if (meta.arg === 'regex' && value !== '' && !isMacro(value)) {
    checkRegexArgument(condition, value, ctx, diag);
  }

  // Подсчёт и длина не бывают отрицательными, поэтому сравнение с нулём
  // снизу ничего не проверяет, а снизу-минус — не выполнится никогда.
  const nonNegative =
    constraints.inputKind === 'number' &&
    (condition.targets.some((t) => !t.excludeOnly && t.count) ||
      effectiveTransforms(condition.transforms).includes('length'));
  if (nonNegative && !negated && isNumeric(value)) {
    const n = Number(value);
    if ((name === 'ge' && n <= 0) || (name === 'gt' && n < 0)) {
      diag.report('alwaysTrueComparison', 'operator');
    }
    if ((name === 'lt' && n <= 0) || (name === 'le' && n < 0) || (name === 'eq' && n < 0)) {
      diag.report('neverTrueComparison', 'operator');
    }
  }
}

/**
 * В буквальном значении видна попытка написать шаблон.
 *
 * Признаки подобраны так, чтобы не спутать шаблон с обычным текстом:
 * точка, звёздочка и доллар сами по себе встречаются в путях, ценах и
 * расширениях, а вот `.*`, экранированный метасимвол или класс символов
 * в буквальном сравнении почти наверняка означают, что автор ждал regex.
 */
function looksLikeRegex(value: string): boolean {
  if (/\.[*+]/.test(value)) return true;
  if (/\\[dwsDWS]/.test(value)) return true;
  if (/\\[.*+?^$(){}|[\]]/.test(value)) return true;
  if (/\(\?[:=!]/.test(value)) return true;
  if (/\[\^?[^\]]+\]/.test(value)) return true;
  if (/\{\d+(,\d*)?\}/.test(value)) return true;
  return value.length > 1 && value.startsWith('^');
}

/** Разбор самого регулярного выражения. */
function checkRegexArgument(
  condition: VisualCondition,
  pattern: string,
  ctx: ConditionContext,
  diag: Diagnostics,
): void {
  const { name, negated } = condition.operator;

  const review = reviewRegex(pattern);
  // Запись PCRE, аналога которой в JavaScript нет: шаблон рабочий, просто
  // разобрать его здесь нечем. Молчание честнее выдуманной ошибки.
  if (review.unsupported !== null) return;
  if (review.regex === null) {
    diag.report('invalidRegex', 'operator', { name });
    return;
  }

  if (matchesAnything(pattern)) {
    diag.report(negated ? 'negationMatchesNothing' : 'matchesEverything', 'operator');
    return;
  }

  // Группа с квантором внутри, к которой применён ещё один квантор:
  // на подобранной строке разбор такого шаблона уходит в перебор.
  if (/\([^()]*[*+][^()]*\)\s*[*+{]/.test(pattern)) {
    diag.report('possibleRedos', 'operator');
  }

  const anchoredLiteral = /^\^([^\\^$.*+?()[\]{}|]+)\$$/.exec(pattern);
  if (anchoredLiteral) {
    diag.report('anchoredLiteralRegex', 'operator', { value: short(anchoredLiteral[1]) });
  } else if (isPlainText(pattern)) {
    diag.report('regexIsPlainText', 'operator', { value: short(pattern) });
    // Точка среди букв — не разделитель, а «любой символ»: `admin.php`
    // подойдёт и к `adminXphp`. Но говорить об этом стоит только когда
    // шаблон в остальном буквальный, иначе автор явно писал шаблон.
  } else if (!/[\\^$*+?()[\]{}|]/.test(pattern) && /\w\.\w/.test(pattern)) {
    diag.report('unescapedDot', 'operator', { value: short(pattern) });
  }

  if (/^\^?\.\*/.test(pattern) && pattern.replace(/^\^?\.\*/, '') !== '') {
    diag.report('redundantLeadingWildcard', 'operator');
  }

  if (!ctx.capture && /\((?!\?)/.test(pattern)) {
    diag.report('capturingGroupUnused', 'operator');
  }
}

/**
 * Структурные проверки условия: то, без чего условия попросту нет.
 *
 * Вынесены из смыслового прохода, потому что это единственные его ошибки, а
 * от ошибок зависит доступность визуальной вкладки. Смысловой проход идёт с
 * задержкой, и вкладка мигала бы: сперва открылась, потом заблокировалась.
 */
export function checkConditionStructure(condition: VisualCondition, diag: Diagnostics): void {
  if (condition.targets.length === 0) {
    diag.report('emptyTargets', 'targets');
    return;
  }

  const { name } = condition.operator;
  if (!operatorMeta(name)) diag.report('unknownOperator', 'operator', { name });
}

/**
 * Структурные проверки директивы конфигурации.
 *
 * Достаются почти даром: таблица `directives.ts` уже знает, сколько
 * аргументов директива принимает и из чего выбирается её значение, — и то,
 * что об этом умеет сказать форма, обязана сказать и панель замечаний.
 * Иначе строка, приехавшая из чужого конфига, краснела бы в конструкторе
 * молча, а свёрнутый блок не краснел бы вовсе.
 */
export function checkDirective(statement: DirectiveStatement, diag: Diagnostics): void {
  const name = canonicalDirectiveName(statement.name);
  if (name === null) return;

  const { form, refusal } = parseDirective(statement);

  if (refusal === 'args') {
    diag.report('directiveArgCount', { name, count: String(statement.args.length) });
    return;
  }
  if (refusal === 'syntax') {
    diag.report('directiveBadValue', { name, value: statement.args[0] ?? '' });
    return;
  }
  // Макрос в значении — не повод для замечания: раскрывает его движок, и
  // проверить `%{tx.limit}` отсюда всё равно нечем.
  if (form === null) return;

  // У исключения о недостающей выборке говорит `exclusionNoTarget`, и
  // вторая запись о том же читалась бы как две разные беды.
  if (form.arg === 'exclusion') return;

  for (const issue of directiveIssues(form)) {
    diag.report(issue.code, { name, value: issue.value });
  }
}

/**
 * Проверяет одно условие цепочки.
 *
 * Порядок разделов повторяет порядок чтения правила: что проверяем, чем
 * это обрабатываем, с чем сравниваем.
 */
export function checkCondition(
  condition: VisualCondition,
  ctx: ConditionContext,
  diag: Diagnostics,
): void {
  // Условие без областей проверки разбирать не по чему; сказано о нём в
  // структурной фазе.
  if (condition.targets.length === 0) return;

  checkTargets(condition, ctx, diag);
  checkTransforms(condition, diag);

  const constraints = conditionConstraints(condition.targets, condition.transforms);
  if (!constraints.transformsAllowed && condition.transforms.length > 0) {
    diag.report('countWithTransforms', 'transforms');
  }

  checkOperator(condition, ctx, diag);
  checkArgumentSurvivesPipeline(condition, diag);

  const noNormalisation =
    effectiveTransforms(condition.transforms).length === 0 &&
    LITERAL_OPERATORS.has(condition.operator.name) &&
    /[A-Za-z]/.test(condition.operator.argument) &&
    !isMacro(condition.operator.argument) &&
    condition.targets.some((t) => !t.excludeOnly && !t.count && USER_CONTROLLED.has(t.name));
  if (noNormalisation) diag.report('noNormalisation', 'transforms');
}

/* ------------------------------------------------------------------ */
/* Уровень правила                                                     */
/* ------------------------------------------------------------------ */

/** Весь текст правила, в котором могут встретиться ссылки на макросы. */
function macroCarriers(actions: VisualActions, conditions: VisualCondition[]): string[] {
  return [
    actions.msg,
    actions.logdata,
    ...actions.tags,
    ...actions.setvar,
    ...actions.extra.map((a) => a.value ?? ''),
    ...conditions.map((c) => c.operator.argument),
  ];
}

/** Логи: останется ли от срабатывания след и будет ли он полным. */
function checkLogging(
  actions: VisualActions,
  conditions: VisualCondition[],
  diag: Diagnostics,
): void {
  const blocking = BLOCKING.has(actions.disruptive);
  const refs = macroCarriers(actions, conditions).flatMap(captureRefs);
  const hasRegex = conditions.some((c) => CAPTURING_OPERATORS.has(c.operator.name));

  if (actions.capture && !hasRegex) diag.report('captureWithoutRegex', 'actions');
  if (!actions.capture && refs.length > 0) {
    diag.report('captureMissing', 'actions', { index: refs[0] });
  }
  if (actions.capture && hasRegex && refs.length === 0) {
    diag.report('captureUnused', 'actions');
  }

  if (blocking && actions.log === false) diag.report('blockWithoutLog', 'actions');
  if (actions.logdata !== '' && actions.log === false) {
    diag.report('logdataWithoutLog', 'actions');
  }
  if (blocking && actions.msg === '') diag.report('blockWithoutMsg', 'actions');
}

/** Переходы `skip` и `skipAfter` — ведут ли они куда-нибудь. */
function checkJumps(actions: VisualActions, ctx: RuleContext, diag: Diagnostics): void {
  for (const action of actions.extra) {
    if (action.name === 'skipAfter') {
      const label = action.value ?? '';
      // Метки CRS (`END-REQUEST-949-BLOCKING-EVALUATION` и прочие) заводит
      // включённый набор, и в открытых файлах их нет ни одной. Пока в наборе
      // есть `Include`, «метки нет» означало бы только то, что её не видно.
      if (label !== '' && !ctx.document.markers.has(label) && !ctx.document.hasIncludes) {
        diag.report('missingMarker', 'actions', { name: label });
      }
    }
    if (action.name === 'skip') {
      const count = Number.parseInt(action.value ?? '', 10);
      if (!Number.isNaN(count) && count > ctx.rulesAfter) {
        diag.report('skipBeyondEnd', 'actions', {
          count: String(count),
          rest: String(ctx.rulesAfter),
        });
      }
    }
  }
}

/**
 * Несовместимые сравнения одной и той же области в разных звеньях.
 *
 * Звенья цепочки соединены по И, поэтому два числовых сравнения одной
 * цели должны иметь непустое пересечение — иначе цепочка не сработает
 * ни при каких данных.
 */
function checkChainConsistency(conditions: VisualCondition[], diag: Diagnostics): void {
  const byTarget = new Map<string, { range: Range; label: string }>();

  for (const condition of conditions) {
    const range = rangeOf(condition.operator);
    if (range === null) continue;
    const key = condition.targets.map(targetSignature).join('+');
    const label = `@${condition.operator.name} ${condition.operator.argument}`;
    const previous = byTarget.get(key);
    if (previous === undefined) {
      byTarget.set(key, { range, label });
      continue;
    }
    const merged = intersect(previous.range, range);
    if (isEmptyRange(merged)) {
      diag.report('impossibleNumericRange', 'operator', {
        first: previous.label,
        second: label,
      });
    }
    byTarget.set(key, { range: merged, label });
  }
}

/**
 * Проверяет правило целиком: реакцию, фазу, логи и согласованность звеньев.
 *
 * Сообщения этого уровня относятся к головной директиве — там же, где
 * живут все действия правила.
 */
export function checkRule(
  actions: VisualActions,
  conditions: VisualCondition[],
  ctx: RuleContext,
  diag: Diagnostics,
): void {
  if (actions.phase === '') {
    diag.report('missingPhase', 'actions');
  } else {
    const declared = Number.parseInt(actions.phase, 10);
    if (!Number.isNaN(declared)) {
      for (const condition of conditions) {
        const required = conditionConstraints(condition.targets, condition.transforms).minPhase;
        if (required > declared) {
          diag.report('phaseTooEarly', 'actions', {
            phase: String(declared),
            required: String(required),
          });
          break;
        }
      }
      // Пятая фаза наступает, когда ответ уже отправлен: прерывать нечего.
      if (declared === 5 && actions.disruptive !== '' && actions.disruptive !== 'pass') {
        diag.report('disruptiveInLoggingPhase', 'actions', { name: actions.disruptive });
      }
    }
  }

  if (actions.disruptive === '') diag.report('noDisruptive', 'actions');

  // `redirect` и `proxy` без адреса ModSecurity не примет, а всем остальным
  // реакциям приписанное значение так же не нужно.
  if (takesDestination(actions.disruptive)) {
    if (actions.disruptiveValue === '') {
      diag.report('destinationMissing', 'actions', { name: actions.disruptive });
    }
  } else if (actions.disruptiveValue !== '') {
    diag.report('destinationUnexpected', 'actions', { name: actions.disruptive });
  }

  if (
    actions.status !== '' &&
    actions.disruptive !== 'deny' &&
    actions.disruptive !== 'redirect'
  ) {
    diag.report('statusWithoutBlock', 'actions');
  }

  const id = Number.parseInt(actions.id, 10);
  if (!Number.isNaN(id) && id >= CRS_ID_RANGE[0] && id <= CRS_ID_RANGE[1]) {
    diag.report('idInReservedRange', 'actions', { id: actions.id });
  }

  checkLogging(actions, conditions, diag);
  checkJumps(actions, ctx, diag);
  checkChainConsistency(conditions, diag);

  const seen = new Set<string>();
  for (const condition of conditions) {
    const signature = conditionSignature(condition);
    if (seen.has(signature)) diag.report('duplicateCondition', 'actions');
    seen.add(signature);
  }

  if (ctx.twinId !== undefined) {
    diag.report('duplicateRule', 'actions', { id: ctx.twinId });
  }

  for (const action of actions.extra) {
    // Исключения `ctl` конструктор правит полями, и говорить о них «поля нет»
    // значило бы отправлять человека в текст мимо готовой формы.
    if (isExclusionCtl(action)) continue;

    // Имя из базы ключевых слов — просто действие, которому не нашлось поля
    // в форме: правило верное, править его придётся текстом. Имени, которого
    // в базе нет, ModSecurity не знает тоже, и это опечатка — говорить о ней
    // тем же сообщением значило бы прятать ошибку среди оговорок редактора.
    const known = KNOWN_ACTIONS.has(action.name);
    diag.report(known ? 'actionNotEditable' : 'unknownAction', 'actions', {
      name: action.name,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Уровень документа                                                   */
/* ------------------------------------------------------------------ */

/**
 * Проверяет то, что относится к набору целиком, а не к отдельному правилу.
 *
 * Сообщение здесь одно, но важное: если движок переведён в режим
 * наблюдения, все `deny` набора — не более чем запись в журнале. Стоит оно у
 * самой директивы, пусть та и в другом файле: правят режим там, а не у
 * правила, которое из-за него молчит.
 */
export function checkDocument(context: DocumentContext, diag: Diagnostics): void {
  const engine = context.engine?.toLowerCase();
  if (context.hasBlockingRule && (engine === 'detectiononly' || engine === 'off')) {
    diag.inFile(fileMark(context.engineFile ?? LONE_FILE)).at(context.engineLine);
    diag.report('engineNotEnforcing', { mode: context.engine as string });
  }
}

/**
 * Со скольких снятых правил удаление считается широким.
 *
 * Десяток — это уже не «выключить ложное срабатывание», а «выключить
 * категорию»; иногда именно этого и хотят, поэтому не предупреждение, а совет.
 */
const BROAD_REMOVAL = 10;

/**
 * Строка директивы, безусловно снявшей все эти правила, если такая есть.
 *
 * Безусловно — значит директивой файла. `ctl` снимает правило только для тех
 * запросов, на которых сработал его носитель, поэтому «править нечего» про
 * такое правило сказать нельзя: на остальных запросах оно работает.
 *
 * Ответ есть только когда снято всё: если хоть одно правило выборки осталось,
 * исключение делает свою работу и придраться не к чему.
 */
function allRemovedBy(index: ExclusionIndex, matches: ExclusionMatch[]): number | null {
  let line: number | null = null;

  for (const match of matches) {
    const ref = index.byRule
      .get(blockRef(match.file, match.key))
      ?.removedBy.find((removal) => removal.source === 'directive');
    if (ref === undefined) return null;
    line ??= ref.line;
  }

  return line;
}

/**
 * Проверяет исключения: работают ли они и то ли делают, что задумано.
 *
 * Уровень тот же файловый, но вопрос свой. У обычной проверки ответ выводится
 * из самого правила; здесь всё держится на связи двух строк, и почти каждая
 * ошибка — не в том, как написано, а в том, что написанное ни к чему не
 * относится: номер, которого в файле нет, порядок, при котором исключение не
 * встречается со своей целью, вторая правка правила, уже снятого первой.
 *
 * Порядок — там, где директива и `ctl` расходятся сильнее всего, и расходятся
 * в противоположные стороны. Директива применяется при чтении конфигурации,
 * поэтому обязана стоять ниже цели; `ctl` применяется при срабатывании
 * носителя, поэтому обязан отработать раньше — а порядок исполнения задаёт
 * сначала фаза и только потом строка. Поэтому «не дотянулось» здесь одно, а
 * сообщений о нём два: причины у них разные, и чинят их по-разному.
 *
 * Замечание о директиве адресуется только строке: чинить придётся её, а
 * правило может быть и вовсе из чужого набора. У `ctl` адрес есть — он
 * написан внутри правила, и его карточка как раз то место, где о нём и надо
 * сказать.
 */
export function checkExclusions(index: ExclusionIndex, diag: Diagnostics): void {
  /** Отпечаток исключения → строка, где оно встретилось впервые. */
  const seen = new Map<string, number>();

  for (const { directive, matches, carrier } of exclusionList(index)) {
    diag.inFile(fileMark(directive.place.file));
    diag.at(
      directive.line,
      carrier === undefined ? undefined : { ruleKey: carrier.key, slot: 'actions' },
    );
    const target = exclusionSelectorText(directive);
    const applied = matches.filter((match) => match.applies);

    // Два одинаковых `ctl` в разных правилах — не повтор: условия у правил
    // разные, и каждое снимает своё. Повтор — это два одинаковых в одном
    // списке действий, поэтому отпечаток считается внутри носителя.
    const signature =
      carrier === undefined
        ? exclusionSignature(directive)
        : `${carrier.key}:${exclusionSignature(directive)}`;
    const first = seen.get(signature);
    if (first === undefined) seen.set(signature, directive.line);
    else diag.report('exclusionDuplicate', { name: directive.name, line: String(first) });

    if (directive.ids.some((range) => range.from > range.to)) {
      diag.report('exclusionEmptyRange', { target });
    }

    if (directive.selector === 'msg') {
      diag.report('exclusionByMsgFragile', { name: directive.name });
    }

    // Список целей заменяет прежний, а не добавляется к нему, поэтому цель
    // без `!` — это не исключение, а расширение проверки. Третий аргумент
    // меняет дело: с ним директива именно заменяет одну цель другой.
    if (
      directive.op === 'updateTarget' &&
      directive.replaced === undefined &&
      directive.targets.length > 0 &&
      directive.targets.every((variable) => !variable.exclusion)
    ) {
      diag.report('exclusionUpdateTargetNotExclusion', {
        name: directive.name,
        targets: directive.targets.map((variable) => variable.raw).join('|'),
      });
    }

    if (directive.op === 'updateAction') {
      const meta = directive.actions.find((a) => a.name === 'id' || a.name === 'phase');
      if (meta !== undefined) {
        diag.report('exclusionUpdateActionMetadata', {
          name: directive.name,
          action: meta.name,
        });
      }
    }

    // Записанное неверно `ctl` конфигурации не роняет: неизвестную выборку он
    // молча не находит. Поэтому то, о чём у директивы говорит компиляция
    // ошибкой, здесь приходится говорить предупреждением — и говорить точнее,
    // потому что ошибиться в этой записи можно там, где у директивы нечем.
    if (directive.source === 'ctl') {
      if (directive.badIds.length > 0) {
        diag.report('exclusionCtlBadId', {
          name: directive.name,
          value: directive.badIds.join(' '),
        });
      }

      if (directive.op === 'removeTarget' && directive.targets.length === 0) {
        diag.report('exclusionCtlNoTarget', { name: directive.name });
      }

      // Цель у записи `ctl` ровно одна: всё после `;` ModSecurity читает
      // одним именем с параметром, поэтому `ARGS:a|ARGS:b` для него параметр
      // `a|ARGS:b`, которого нет ни у одного правила. Список целей здесь не
      // «снимает не все», а не снимает ничего.
      if (directive.op === 'removeTarget' && directive.targets.length > 1) {
        diag.report('exclusionCtlTargetList', {
          name: directive.name,
          targets: directive.targets.map((variable) => variable.raw).join('|'),
        });
      }

      // Снимаемую цель движок сравнивает с целями правила по имени и
      // параметру, а `!` и `&` в это сравнение не входят: такая цель не
      // совпадёт ни с одной, и исключение промолчит. Вычитают цель директивой.
      const dead = directive.targets.find((variable) => variable.exclusion || variable.count);
      if (directive.op === 'removeTarget' && dead !== undefined) {
        diag.report('exclusionCtlDeadTarget', { name: directive.name, target: dead.raw });
      }

      // Носитель, обрывающий транзакцию, делает исключение бессмысленным:
      // до правила, которое он снял, дело всё равно не дойдёт.
      if (carrier !== undefined && carrier.stops !== '' && matches.length > 0) {
        diag.report('exclusionCtlCarrierStops', {
          name: directive.name,
          action: carrier.stops,
        });
      }
    }

    if (matches.length === 0) {
      // Промах выборки — совет, а не предупреждение: правило законно живёт в
      // файле, которого здесь нет. А в наборе, где своих правил нет вовсе, это
      // и вовсе обычное дело — надстройка над чужим набором, и молчать здесь
      // честнее.
      if (index.hasIds && !directive.incomplete) {
        diag.report('exclusionNoMatch', { name: directive.name, target });
      }
    } else if (applied.length === 0 && directive.source === 'directive') {
      // «Стоит выше правила» и «стоит в файле, который читают раньше» — один
      // промах, но чинят их по-разному: строку переносят, файл переставляют в
      // наборе. Поэтому сообщений два, и второе называет чужой файл.
      const first = matches[0];
      if (first.file === directive.place.file) {
        diag.report('exclusionBeforeRule', { name: directive.name, id: first.id });
      } else {
        diag.report('exclusionInEarlierFile', {
          name: directive.name,
          id: first.id,
          file: index.names.get(first.file) ?? '',
        });
      }
    } else if (applied.length === 0 && carrier !== undefined) {
      diag.report('exclusionCtlAfterRule', {
        name: directive.name,
        id: matches[0].id,
        phase: String(carrier.phase),
      });
    }

    if (directive.op === 'remove' && applied.length > BROAD_REMOVAL) {
      diag.report('exclusionTooBroad', {
        name: directive.name,
        count: String(applied.length),
      });
    }

    // Правило, которое директива уже сняла целиком. Правку в нём делать
    // нечего, а `ctl`, снимающий его второй раз, — не ошибка, а лишняя
    // строка: об этих двух случаях и сказано по-разному.
    const alreadyGone = applied.length > 0 ? allRemovedBy(index, applied) : null;
    if (alreadyGone !== null && directive.op !== 'remove') {
      diag.report('exclusionRemovedThenUpdated', {
        name: directive.name,
        line: String(alreadyGone),
      });
    } else if (alreadyGone !== null && directive.source === 'ctl') {
      diag.report('exclusionCtlAlreadyRemoved', {
        name: directive.name,
        line: String(alreadyGone),
      });
    }
  }
}
