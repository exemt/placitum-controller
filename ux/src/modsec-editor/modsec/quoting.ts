const NEEDS_QUOTES = /[\s|,'"]/;

const REGEX_META = /[.\\+*?()[\]{}^$|/]/g;

export function needsQuotes(value: string): boolean {
  return NEEDS_QUOTES.test(value);
}

export function decodeQuoted(raw: string): string {
  if (raw.length < 2 || !raw.startsWith("'") || !raw.endsWith("'")) return raw;
  return raw.slice(1, -1).replace(/\\(['\\])/g, '$1');
}

export function encodeQuoted(value: string): string {
  if (!needsQuotes(value)) return value;
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function isPatternSelector(value: string): boolean {
  return value.length >= 2 && value.startsWith('/') && value.endsWith('/');
}

export type SelectorIssue = 'v2only' | 'ambiguous';

export function selectorIssue(value: string): SelectorIssue | null {
  if (value === '' || !needsQuotes(value)) return null;
  if (/['\\]/.test(value)) return 'ambiguous';
  if (isPatternSelector(value) && !/\s/.test(value)) return null;
  return 'v2only';
}

export function selectorPattern(value: string): string | null {
  if (!/\s/.test(value)) return null;
  if (/[|,'"]/.test(value)) return null;

  const body = value
    .replace(REGEX_META, (ch) => `\\${ch}`)
    .replace(/ /g, '\\x20')
    .replace(/\t/g, '\\x09');
  return `/^${body}$/`;
}
