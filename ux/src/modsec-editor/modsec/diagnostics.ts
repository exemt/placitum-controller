export type DiagnosticSeverity = 'error' | 'warning' | 'advice';

export type DiagnosticTopic =
  | 'structure'
  | 'logic'
  | 'coverage'
  | 'environment'
  | 'logging'
  | 'performance'
  | 'style';

type Kind = readonly [DiagnosticSeverity, DiagnosticTopic];

export const DIAGNOSTIC_CATALOG = {
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
  directiveBadValue: ['warning', 'structure'],
  directiveUnknownFlag: ['warning', 'structure'],

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

  caseNeverMatches: ['warning', 'logic'],
  whitespaceNeverMatches: ['warning', 'logic'],
  hashWithoutHexEncode: ['warning', 'logic'],
  conflictingCaseTransforms: ['warning', 'logic'],
  impossibleNumericRange: ['warning', 'logic'],
  literalWithRegexSyntax: ['warning', 'logic'],
  negationMatchesNothing: ['warning', 'logic'],
  neverTrueComparison: ['warning', 'logic'],

  matchesEverything: ['warning', 'logic'],
  alwaysTrueComparison: ['warning', 'logic'],

  phaseTooEarly: ['warning', 'coverage'],
  decodeAfterNormalise: ['warning', 'coverage'],
  noNormalisation: ['advice', 'coverage'],
  unescapedDot: ['advice', 'coverage'],
  overlappingTargets: ['advice', 'coverage'],
  exclusionTooBroad: ['advice', 'coverage'],

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

  captureWithoutRegex: ['warning', 'logging'],
  captureMissing: ['warning', 'logging'],
  blockWithoutLog: ['warning', 'logging'],
  logdataWithoutLog: ['warning', 'logging'],
  captureUnused: ['advice', 'logging'],
  blockWithoutMsg: ['advice', 'logging'],

  possibleRedos: ['warning', 'performance'],
  regexIsPlainText: ['advice', 'performance'],
  anchoredLiteralRegex: ['advice', 'performance'],
  redundantLeadingWildcard: ['advice', 'performance'],
  capturingGroupUnused: ['advice', 'performance'],
  rblOnHotPath: ['advice', 'performance'],

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

export type DiagnosticCode = keyof typeof DIAGNOSTIC_CATALOG;

export function severityOf(code: DiagnosticCode): DiagnosticSeverity {
  return DIAGNOSTIC_CATALOG[code][0];
}

export function topicOf(code: DiagnosticCode): DiagnosticTopic {
  return DIAGNOSTIC_CATALOG[code][1];
}

export type DiagnosticSlot = 'targets' | 'transforms' | 'operator' | 'actions';

export interface DiagnosticAnchor {
  ruleKey: string;
  condition?: number;
  slot?: DiagnosticSlot;
  index?: number;
}

export interface Diagnostic {
  severity: DiagnosticSeverity;
  topic: DiagnosticTopic;
  code: DiagnosticCode;
  params?: Record<string, string>;
  file?: string;
  line?: number;
  anchor?: DiagnosticAnchor;
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  private file?: string;
  private line?: number;
  private anchor?: DiagnosticAnchor;

  inFile(file: string | undefined): this {
    this.file = file;
    return this;
  }

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
