import { decodeQuoted } from './quoting';
import type {
  DirectiveStatement,
  ParsedDocument,
  ParsedStatement,
  RuleAction,
  RuleOperator,
  RuleVariable,
  SecActionStatement,
  SecMarkerStatement,
  SecRuleStatement,
  SourceSpan,
} from './types';

interface LogicalLine {
  text: string;
  raw: string;
  span: SourceSpan;
}

export function unfold(raw: string): string {
  return raw
    .split('\n')
    .map((line) => (hasTrailingBackslash(line) ? line.replace(/\\$/, ' ') : line))
    .join('');
}

function toLogicalLines(source: string): LogicalLine[] {
  const physical = source.split('\n');
  const result: LogicalLine[] = [];

  let rawBuffer: string[] = [];
  let startLine = 1;

  const flush = (endLine: number) => {
    const raw = rawBuffer.join('\n');
    result.push({ text: unfold(raw), raw, span: { startLine, endLine } });
    rawBuffer = [];
  };

  physical.forEach((line, index) => {
    const lineNo = index + 1;
    if (rawBuffer.length === 0) startLine = lineNo;
    rawBuffer.push(line);

    if (!hasTrailingBackslash(line)) flush(lineNo);
  });

  if (rawBuffer.length > 0) flush(physical.length);

  return result;
}

function hasTrailingBackslash(line: string): boolean {
  const match = /\\+$/.exec(line);
  if (!match) return false;
  return match[0].length % 2 === 1;
}

function splitArgs(text: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let hasContent = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '\\' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '\\' && text[i + 1] === '\\') {
        current += '\\\\';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      hasContent = true;
    } else if (/\s/.test(ch)) {
      if (hasContent) {
        args.push(current);
        current = '';
        hasContent = false;
      }
    } else {
      current += ch;
      hasContent = true;
    }
  }

  if (hasContent) args.push(current);
  return args;
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let braceDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      current += ch;
      if (ch === '\\' && i + 1 < text.length) {
        current += text[i + 1];
        i++;
      } else if (ch === "'") {
        inQuotes = false;
      }
      continue;
    }

    if (ch === "'") {
      inQuotes = true;
      current += ch;
    } else if (ch === '{') {
      braceDepth++;
      current += ch;
    } else if (ch === '}') {
      if (braceDepth > 0) braceDepth--;
      current += ch;
    } else if (ch === separator && braceDepth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  parts.push(current);
  return parts;
}

function unquote(raw: string): { value: string; quoted: boolean } {
  const value = decodeQuoted(raw);
  return { value, quoted: value !== raw };
}

export function parseVariables(text: string): RuleVariable[] {
  return splitTopLevel(text, '|')
    .flatMap((chunk) => splitTopLevel(chunk, ','))
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((raw) => {
      let rest = raw;
      let exclusion = false;
      let count = false;

      if (rest.startsWith('!')) {
        exclusion = true;
        rest = rest.slice(1);
      }
      if (rest.startsWith('&')) {
        count = true;
        rest = rest.slice(1);
      }

      const colon = rest.indexOf(':');
      const name = colon === -1 ? rest : rest.slice(0, colon);
      const selector = colon === -1 ? undefined : decodeQuoted(rest.slice(colon + 1));

      return { raw, name, selector, count, exclusion };
    });
}

export function parseOperator(text: string): RuleOperator {
  const raw = text;
  let rest = text.trim();
  let negated = false;

  if (rest.startsWith('!')) {
    negated = true;
    rest = rest.slice(1).trim();
  }

  if (rest.startsWith('@')) {
    const match = /^@(\S+)\s*([\s\S]*)$/.exec(rest);
    const name = match ? match[1] : rest.slice(1);
    const argument = match ? match[2] : '';
    return { raw, name, negated, argument, implicit: false };
  }

  return { raw, name: 'rx', negated, argument: rest, implicit: true };
}

export function parseActions(text: string): RuleAction[] {
  return splitTopLevel(text, ',')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((raw) => {
      const colon = raw.indexOf(':');
      if (colon === -1) {
        return { raw, name: raw, quoted: false };
      }
      const name = raw.slice(0, colon).trim();
      const { value, quoted } = unquote(raw.slice(colon + 1).trim());
      return { raw, name, value, quoted };
    });
}

function actionValue(actions: RuleAction[], name: string): string | undefined {
  return actions.find((a) => a.name === name)?.value;
}

function parseSecRule(
  args: string[],
  base: { raw: string; span: SourceSpan },
): SecRuleStatement {
  const variables = parseVariables(args[1] ?? '');
  const operator = parseOperator(args[2] ?? '');
  const actions = args[3] !== undefined ? parseActions(args[3]) : [];

  return {
    kind: 'SecRule',
    ...base,
    variables,
    operator,
    actions,
    id: actionValue(actions, 'id'),
    phase: actionValue(actions, 'phase'),
    msg: actionValue(actions, 'msg'),
    chained: actions.some((a) => a.name === 'chain'),
  };
}

function parseSecAction(
  args: string[],
  base: { raw: string; span: SourceSpan },
): SecActionStatement {
  const actions = args[1] !== undefined ? parseActions(args[1]) : [];
  return {
    kind: 'SecAction',
    ...base,
    actions,
    id: actionValue(actions, 'id'),
    phase: actionValue(actions, 'phase'),
  };
}

function parseSecMarker(
  args: string[],
  base: { raw: string; span: SourceSpan },
): SecMarkerStatement {
  return {
    kind: 'SecMarker',
    ...base,
    label: args[1] ?? '',
  };
}

function parseDirective(
  args: string[],
  base: { raw: string; span: SourceSpan },
): DirectiveStatement {
  return {
    kind: 'directive',
    ...base,
    name: args[0],
    args: args.slice(1),
  };
}

function parseLogicalLine(line: LogicalLine): ParsedStatement {
  const base = { raw: line.raw, span: line.span };
  const trimmed = line.text.trim();

  if (trimmed.length === 0) {
    return { kind: 'blank', ...base };
  }

  if (trimmed.startsWith('#')) {
    return {
      kind: 'comment',
      ...base,
      text: trimmed.replace(/^#\s?/, ''),
    };
  }

  const args = splitArgs(line.text);
  const directive = args[0];

  switch (directive) {
    case 'SecRule':
      return parseSecRule(args, base);
    case 'SecAction':
      return parseSecAction(args, base);
    case 'SecMarker':
      return parseSecMarker(args, base);
    default:
      return parseDirective(args, base);
  }
}

export function parseModsec(source: string): ParsedDocument {
  const statements = toLogicalLines(source).map(parseLogicalLine);
  const rules = statements.filter(
    (s): s is SecRuleStatement => s.kind === 'SecRule',
  );
  return { statements, rules };
}
