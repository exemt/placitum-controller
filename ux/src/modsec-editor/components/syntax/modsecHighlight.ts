import { ACTIONS, DIRECTIVES } from './modsecKeywords';

export type TokenType =
  | 'comment'
  | 'string'
  | 'macro'
  | 'directive'
  | 'transform'
  | 'operator'
  | 'action'
  | 'variable'
  | 'number'
  | 'text';

export interface Token {
  type: TokenType;
  value: string;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordRegex(keywords: readonly string[]): RegExp {
  const alternatives = [...keywords]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  return new RegExp(`\\b(?:${alternatives})\\b`, 'y');
}

const RULES: { type: TokenType; re: RegExp }[] = [
  { type: 'comment', re: /#[^\n]*/y },
  { type: 'string', re: /'(?:[^'\\]|\\.)*'/y },
  { type: 'macro', re: /%\{[^}]*\}/y },
  { type: 'directive', re: keywordRegex(DIRECTIVES) },
  { type: 'directive', re: /\bSec[A-Za-z][A-Za-z0-9]*\b/y },
  { type: 'transform', re: /\bt:[a-zA-Z0-9]+/y },
  { type: 'operator', re: /!?@[a-zA-Z]+/y },
  { type: 'action', re: keywordRegex(ACTIONS) },
  { type: 'variable', re: /&?[A-Z][A-Z0-9_]+(?::[A-Za-z0-9_.-]+)?/y },
  { type: 'number', re: /\b\d+\b/y },
  { type: 'text', re: /\s+|[\s\S]/y },
];

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < source.length) {
    let matched = false;

    for (const rule of RULES) {
      rule.re.lastIndex = pos;
      const m = rule.re.exec(source);
      if (m && m.index === pos && m[0].length > 0) {
        tokens.push({ type: rule.type, value: m[0] });
        pos += m[0].length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      tokens.push({ type: 'text', value: source[pos] });
      pos += 1;
    }
  }

  return tokens;
}
