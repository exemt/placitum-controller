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

/**
 * Строит sticky-регулярку вида `\b(?:kw1|kw2|...)\b` из списка ключевых слов.
 * Более длинные слова идут первыми, чтобы жадно поглощать (skipAfter до skip).
 */
function keywordRegex(keywords: readonly string[]): RegExp {
  const alternatives = [...keywords]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  return new RegExp(`\\b(?:${alternatives})\\b`, 'y');
}

/**
 * Порядок важен: правила пробуются сверху вниз в текущей позиции.
 * Все regex со sticky-флагом (`y`), чтобы матчить строго от lastIndex.
 * Списки ключевых слов берутся из общей базы знаний `modsecKeywords`.
 */
const RULES: { type: TokenType; re: RegExp }[] = [
  { type: 'comment', re: /#[^\n]*/y },
  { type: 'string', re: /'(?:[^'\\]|\\.)*'/y },
  // Макросы раскрытия переменных: %{TX.score}, %{REMOTE_ADDR} и т.п.
  { type: 'macro', re: /%\{[^}]*\}/y },
  // Известные директивы конфигурации.
  { type: 'directive', re: keywordRegex(DIRECTIVES) },
  // Fallback: любая нераспознанная директива Sec* всё равно подсвечивается.
  { type: 'directive', re: /\bSec[A-Za-z][A-Za-z0-9]*\b/y },
  // Трансформации: t:lowercase, t:urlDecodeUni, ...
  { type: 'transform', re: /\bt:[a-zA-Z0-9]+/y },
  // Операторы: @rx, @detectSQLi, с необязательным отрицанием !@...
  { type: 'operator', re: /!?@[a-zA-Z]+/y },
  // Известные действия.
  { type: 'action', re: keywordRegex(ACTIONS) },
  // Переменные/коллекции: ARGS, TX:score, &REQUEST_HEADERS:User-Agent, ...
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

    // Страховка от зацикливания, если ни одно правило не сработало.
    if (!matched) {
      tokens.push({ type: 'text', value: source[pos] });
      pos += 1;
    }
  }

  return tokens;
}
