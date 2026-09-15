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

const KNOWN_ACTIONS = new Set<string>(ACTIONS);

export interface DocumentContext {
  engine: string | null;
  requestBodyAccess: boolean | null;
  responseBodyAccess: boolean | null;
  markers: Set<string>;
  transactionVars: Set<string>;
  xmlProcessor: boolean;
  hasBlockingRule: boolean;
  hasIncludes: boolean;
  engineFile?: string;
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

export interface ConditionContext {
  document: DocumentContext;
  capture: boolean;
}

export interface RuleContext {
  document: DocumentContext;
  rulesAfter: number;
  twinId?: string;
}

const LITERAL_OPERATORS = new Set([
  'streq',
  'contains',
  'beginsWith',
  'endsWith',
  'containsWord',
  'within',
  'strmatch',
]);

const CAPTURING_OPERATORS = new Set([
  'rx',
  'verifyCC',
  'verifyCPF',
  'verifySSN',
  'validateHash',
  'gsbLookup',
]);

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

const SUPERSEDES: Record<string, string[]> = {
  removeWhitespace: ['trim', 'trimLeft', 'trimRight', 'compressWhitespace'],
  urlDecodeUni: ['urlDecode'],
  normalizePathWin: ['normalizePath', 'normalisePath'],
};

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

const UNTYPED_COLLECTIONS = new Set(['TX', 'IP', 'SESSION', 'USER', 'ENV', 'GEO']);

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

const CONTAINED_IN: Record<string, string> = {
  ARGS_GET: 'ARGS',
  ARGS_POST: 'ARGS',
  ARGS_GET_NAMES: 'ARGS_NAMES',
  ARGS_POST_NAMES: 'ARGS_NAMES',
};

const VALUE_BLIND_OPERATORS = new Set(['unconditionalMatch', 'noMatch', 'geoLookup']);

const BLOCKING = new Set(['deny', 'drop', 'redirect', 'proxy', 'block']);

const CRS_ID_RANGE: [number, number] = [900000, 999999];

export function isMacro(value: string): boolean {
  return /%\{[^}]*\}/.test(value);
}

export function isNumeric(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}

function short(value: string, limit = 40): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

function regexLiteral(pattern: string): string {
  return pattern
    .replace(/%\{[^}]*\}/g, ' ')
    .replace(/\\[pP]\{[^}]*\}/g, ' ')
    .replace(/\\./g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(\?[a-zA-Z:=!<>#-]*\)?/g, ' ')
    .replace(/[*+?{}()|^$.]/g, ' ');
}

function literalText(operator: VisualOperator): string | null {
  const { name, argument } = operator;
  if (argument.trim() === '') return null;
  if (LITERAL_OPERATORS.has(name)) {
    return isMacro(argument) ? null : argument;
  }
  if (name === 'rx' && !argument.startsWith('(?i)')) {
    return regexLiteral(argument);
  }
  return null;
}

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
  return /\(\s*\||\|\s*\)|\|\s*\|/.test(pattern);
}

function isPlainText(pattern: string): boolean {
  return pattern !== '' && !/[\\^$.*+?()[\]{}|]/.test(pattern);
}

function caseFolding(transforms: string[]): 'lowercase' | 'uppercase' | null {
  let folding: 'lowercase' | 'uppercase' | null = null;
  for (const name of transforms) {
    if (name === 'none') folding = null;
    else if (name === 'lowercase' || name === 'uppercase') folding = name;
  }
  return folding;
}

function effectiveTransforms(transforms: string[]): string[] {
  const reset = transforms.lastIndexOf('none');
  return reset === -1 ? transforms : transforms.slice(reset + 1);
}

function captureRefs(text: string): string[] {
  const found = [...text.matchAll(/%\{tx[.:](\d)\}/gi)];
  return found.map((m) => m[1]);
}

export function targetSignature(target: VisualTarget): string {
  const prefix = target.count ? '&' : '';
  const params = [...target.params].sort().join(',');
  return `${prefix}${target.name}|${target.mode}|${params}|${target.excludeOnly ?? false}`;
}

export function conditionSignature(condition: VisualCondition): string {
  const targets = condition.targets.map(targetSignature).join('+');
  const { name, negated, argument } = condition.operator;
  return `${targets}#${condition.transforms.join('.')}#${negated ? '!' : ''}${name} ${argument}`;
}

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
      if (!/^[A-Za-z_][\w-]*$/.test(param)) continue;
      if (!document.transactionVars.has(param.toLowerCase())) {
        diag.report('txNeverSet', 'targets', { name: param });
      }
    }
  }
}

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

  const last = active[active.length - 1];
  if (last === 'md5' || last === 'sha1') {
    diag.report('hashWithoutHexEncode', 'operator', { name: last });
  }
}

function checkOperator(
  condition: VisualCondition,
  ctx: ConditionContext,
  diag: Diagnostics,
): void {
  const { name, argument, negated } = condition.operator;
  const meta = operatorMeta(name);
  if (!meta) return;

  const value = argument.trim();
  const constraints = conditionConstraints(condition.targets, condition.transforms);

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

function looksLikeRegex(value: string): boolean {
  if (/\.[*+]/.test(value)) return true;
  if (/\\[dwsDWS]/.test(value)) return true;
  if (/\\[.*+?^$(){}|[\]]/.test(value)) return true;
  if (/\(\?[:=!]/.test(value)) return true;
  if (/\[\^?[^\]]+\]/.test(value)) return true;
  if (/\{\d+(,\d*)?\}/.test(value)) return true;
  return value.length > 1 && value.startsWith('^');
}

function checkRegexArgument(
  condition: VisualCondition,
  pattern: string,
  ctx: ConditionContext,
  diag: Diagnostics,
): void {
  const { name, negated } = condition.operator;

  const review = reviewRegex(pattern);
  if (review.unsupported !== null) return;
  if (review.regex === null) {
    diag.report('invalidRegex', 'operator', { name });
    return;
  }

  if (matchesAnything(pattern)) {
    diag.report(negated ? 'negationMatchesNothing' : 'matchesEverything', 'operator');
    return;
  }

  if (/\([^()]*[*+][^()]*\)\s*[*+{]/.test(pattern)) {
    diag.report('possibleRedos', 'operator');
  }

  const anchoredLiteral = /^\^([^\\^$.*+?()[\]{}|]+)\$$/.exec(pattern);
  if (anchoredLiteral) {
    diag.report('anchoredLiteralRegex', 'operator', { value: short(anchoredLiteral[1]) });
  } else if (isPlainText(pattern)) {
    diag.report('regexIsPlainText', 'operator', { value: short(pattern) });
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

export function checkConditionStructure(condition: VisualCondition, diag: Diagnostics): void {
  if (condition.targets.length === 0) {
    diag.report('emptyTargets', 'targets');
    return;
  }

  const { name } = condition.operator;
  if (!operatorMeta(name)) diag.report('unknownOperator', 'operator', { name });
}

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
  if (form === null) return;

  if (form.arg === 'exclusion') return;

  for (const issue of directiveIssues(form)) {
    diag.report(issue.code, { name, value: issue.value });
  }
}

export function checkCondition(
  condition: VisualCondition,
  ctx: ConditionContext,
  diag: Diagnostics,
): void {
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

function checkJumps(actions: VisualActions, ctx: RuleContext, diag: Diagnostics): void {
  for (const action of actions.extra) {
    if (action.name === 'skipAfter') {
      const label = action.value ?? '';
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
      if (declared === 5 && actions.disruptive !== '' && actions.disruptive !== 'pass') {
        diag.report('disruptiveInLoggingPhase', 'actions', { name: actions.disruptive });
      }
    }
  }

  if (actions.disruptive === '') diag.report('noDisruptive', 'actions');

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
    if (isExclusionCtl(action)) continue;

    const known = KNOWN_ACTIONS.has(action.name);
    diag.report(known ? 'actionNotEditable' : 'unknownAction', 'actions', {
      name: action.name,
    });
  }
}

export function checkDocument(context: DocumentContext, diag: Diagnostics): void {
  const engine = context.engine?.toLowerCase();
  if (context.hasBlockingRule && (engine === 'detectiononly' || engine === 'off')) {
    diag.inFile(fileMark(context.engineFile ?? LONE_FILE)).at(context.engineLine);
    diag.report('engineNotEnforcing', { mode: context.engine as string });
  }
}

const BROAD_REMOVAL = 10;

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

export function checkExclusions(index: ExclusionIndex, diag: Diagnostics): void {
  const seen = new Map<string, number>();

  for (const { directive, matches, carrier } of exclusionList(index)) {
    diag.inFile(fileMark(directive.place.file));
    diag.at(
      directive.line,
      carrier === undefined ? undefined : { ruleKey: carrier.key, slot: 'actions' },
    );
    const target = exclusionSelectorText(directive);
    const applied = matches.filter((match) => match.applies);

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

      if (directive.op === 'removeTarget' && directive.targets.length > 1) {
        diag.report('exclusionCtlTargetList', {
          name: directive.name,
          targets: directive.targets.map((variable) => variable.raw).join('|'),
        });
      }

      const dead = directive.targets.find((variable) => variable.exclusion || variable.count);
      if (directive.op === 'removeTarget' && dead !== undefined) {
        diag.report('exclusionCtlDeadTarget', { name: directive.name, target: dead.raw });
      }

      if (carrier !== undefined && carrier.stops !== '' && matches.length > 0) {
        diag.report('exclusionCtlCarrierStops', {
          name: directive.name,
          action: carrier.stops,
        });
      }
    }

    if (matches.length === 0) {
      if (index.hasIds && !directive.incomplete) {
        diag.report('exclusionNoMatch', { name: directive.name, target });
      }
    } else if (applied.length === 0 && directive.source === 'directive') {
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
