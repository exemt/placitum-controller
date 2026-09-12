/*
 * Общие читалки недоверенных документов калитки: разбор jsonb из базы и тела
 * запроса в типизированный док. Живут отдельно, потому что нужны и источнику
 * (auth-source-doc.ts), и профилю (auth-profile-doc.ts), а тянуть один док в
 * другой значило бы завести кольцо импортов.
 */

export class DocError extends Error {}

export function fail(message: string): never {
  throw new DocError(message);
}

export function obj(value: unknown, path: string): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }

  return value as Record<string, unknown>;
}

export function arr(value: unknown, path: string): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }

  return value;
}

export function str(value: unknown, path: string, def = ""): string {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "string") {
    fail(`${path} must be a string`);
  }

  return value.trim();
}

export function num(value: unknown, path: string, def: number): number {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a number`);
  }

  return value;
}

export function bool(value: unknown, path: string, def: boolean): boolean {
  if (value === undefined || value === null) {
    return def;
  }

  if (typeof value !== "boolean") {
    fail(`${path} must be a boolean`);
  }

  return value;
}

export function list(value: unknown, path: string, def: string[] = []): string[] {
  if (value === undefined || value === null) {
    return [...def];
  }

  if (!Array.isArray(value)) {
    fail(`${path} must be an array`);
  }

  return value.map((item, i) => {
    if (typeof item !== "string") {
      fail(`${path}[${i}] must be a string`);
    }

    return item.trim();
  });
}

export function seconds(value: unknown, path: string, def: number): number {
  const v = num(value, path, def);

  if (!Number.isInteger(v) || v < 0) {
    fail(`${path} must be a non-negative whole number of seconds`);
  }

  return v;
}

export function isBcrypt(value: string): boolean {
  return (
    value.startsWith("$2a$") ||
    value.startsWith("$2b$") ||
    value.startsWith("$2y$")
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function storeRef(value: unknown, path: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const v = str(value, path);

  if (!UUID_RE.test(v)) {
    fail(`${path} must be a store object uuid`);
  }

  return v.toLowerCase();
}

/* --- печать YAML ------------------------------------------------------------ */

const HOUR = 3600;

export function duration(s: number): string {
  if (s === 0) {
    return "0";
  }

  // Суток у time.ParseDuration нет: "1d" инспектор не разберёт, сутки
  // печатаются часами.
  if (s % HOUR === 0) {
    return `${s / HOUR}h`;
  }

  if (s % 60 === 0) {
    return `${s / 60}m`;
  }

  return `${s}s`;
}

/*
 * Кавычки ставятся всегда. YAML без них угадывает тип, и путь /waf/login,
 * логин yes и код 012345 читаются как что угодно, кроме строки.
 */
export function q(value: string): string {
  return JSON.stringify(value);
}

export function seq(values: string[]): string {
  return `[${values.map(q).join(", ")}]`;
}
