export type SetvarOp = 'set' | 'add' | 'sub' | 'delete';

export const SETVAR_COLLECTIONS = [
  'tx',
  'ip',
  'session',
  'user',
  'global',
  'resource',
  'env',
] as const;

export interface SetvarAssignment {
  collection: string;
  name: string;
  op: SetvarOp;
  value: string;
  separator: '.' | ':';
}

const PLAIN_NAME = /^[A-Za-z_][\w.-]*$/;

const TARGET = /^([A-Za-z_][\w]*)([.:])(.+)$/;

function writable(collection: string): boolean {
  return (SETVAR_COLLECTIONS as readonly string[]).includes(collection);
}

export function readSetvar(raw: string): SetvarAssignment | null {
  const text = raw.trim();
  if (text === '') return null;

  const removal = text.startsWith('!');
  const body = removal ? text.slice(1).trim() : text;

  const eq = body.indexOf('=');
  if (removal && eq !== -1) return null;

  const target = TARGET.exec(removal || eq === -1 ? body : body.slice(0, eq));
  if (target === null) return null;

  const collection = target[1].toLowerCase();
  const name = target[3].trim();
  if (!writable(collection) || !PLAIN_NAME.test(name)) return null;

  const separator = target[2] as '.' | ':';
  if (removal) return { collection, name, op: 'delete', value: '', separator };

  if (eq === -1) return null;

  const right = body.slice(eq + 1);
  if (right.startsWith('+')) {
    return { collection, name, op: 'add', value: right.slice(1), separator };
  }
  if (right.startsWith('-')) {
    return { collection, name, op: 'sub', value: right.slice(1), separator };
  }
  return { collection, name, op: 'set', value: right, separator };
}

export function writeSetvar(assignment: SetvarAssignment): string {
  const { collection, name, op, value, separator } = assignment;
  const target = `${collection}${separator}${name}`;

  switch (op) {
    case 'delete':
      return `!${target}`;
    case 'add':
      return `${target}=+${value}`;
    case 'sub':
      return `${target}=-${value}`;
    default:
      return `${target}=${value}`;
  }
}

export function readSetvarTarget(raw: string): { collection: string; name: string } | null {
  const text = raw.trim();
  const body = text.startsWith('!') ? text.slice(1).trim() : text;
  const eq = body.indexOf('=');
  const target = TARGET.exec(eq === -1 ? body : body.slice(0, eq));
  if (target === null) return null;

  return { collection: target[1].toLowerCase(), name: target[3].trim() };
}

const NEW_VAR_NAME = 'var';

export function freeVarName(taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) used.add(name.toLowerCase());

  if (!used.has(NEW_VAR_NAME)) return NEW_VAR_NAME;
  let n = 2;
  while (used.has(`${NEW_VAR_NAME}_${n}`)) n += 1;
  return `${NEW_VAR_NAME}_${n}`;
}

export function makeSetvar(name: string): string {
  return writeSetvar({ collection: 'tx', name, op: 'set', value: '1', separator: '.' });
}
