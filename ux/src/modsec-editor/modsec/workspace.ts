import type { VisualBlock } from './model';
import type { ParsedStatement } from './types';

export interface WorkspaceUnit {
  id: string;
  name: string;
  blocks: VisualBlock[];
  statements: ParsedStatement[];
}

export interface WorkspacePlace {
  file: string;
  order: number;
  index: number;
}

export const LONE_FILE = '';

export function before(a: WorkspacePlace, b: WorkspacePlace): boolean {
  if (a.order !== b.order) return a.order < b.order;
  return a.index < b.index;
}

export function blockRef(file: string, key: string): string {
  return `${file}#${key}`;
}

export function statementRef(file: string, index: number): string {
  return `${file}#${index}`;
}

export function placeIn(unit: WorkspaceUnit, order: number, index: number): WorkspacePlace {
  return { file: unit.id, order, index };
}

export function fileOrder(units: readonly WorkspaceUnit[]): Map<string, number> {
  const order = new Map<string, number>();
  units.forEach((unit, index) => order.set(unit.id, index));
  return order;
}

export function fileMark(id: string): string | undefined {
  return id === LONE_FILE ? undefined : id;
}

export function loneUnit(blocks: VisualBlock[], statements: ParsedStatement[]): WorkspaceUnit {
  return { id: LONE_FILE, name: '', blocks, statements };
}
