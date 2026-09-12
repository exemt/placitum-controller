import type { InspectorDecl } from "./model/waf-route.ts";

export type { InspectorDecl };

/**
 * Значения: узкий уровень, потом широкий — последний побеждает.
 * Порядок ключей: http, затем новые имена с server, затем с location.
 * Этот порядок печатается как последовательность waf_inspector.
 */
export function mergeInspectorGraphs(
  http: Record<string, InspectorDecl> | undefined,
  servers: Array<{
    server?: Record<string, InspectorDecl>;
    locations?: Array<Record<string, InspectorDecl> | undefined>;
  }>,
): Record<string, InspectorDecl> {
  const values: Record<string, InspectorDecl> = {};
  for (const srv of servers) {
    for (const loc of srv.locations ?? []) {
      Object.assign(values, loc);
    }
    Object.assign(values, srv.server);
  }
  Object.assign(values, http);

  const order: string[] = [];
  const seen = new Set<string>();
  const push = (map?: Record<string, InspectorDecl>) => {
    if (map === undefined) {
      return;
    }
    for (const name of Object.keys(map)) {
      if (values[name] !== undefined && !seen.has(name)) {
        seen.add(name);
        order.push(name);
      }
    }
  };
  push(http);
  for (const srv of servers) {
    push(srv.server);
    for (const loc of srv.locations ?? []) {
      push(loc);
    }
  }

  const out: Record<string, InspectorDecl> = {};
  for (const name of order) {
    out[name] = values[name]!;
  }
  return out;
}

export function placeBelowParents(
  order: string[],
  name: string,
  after: readonly string[],
): string[] {
  const rest = order.filter((item) => item !== name);
  if (after.length === 0) {
    return [...rest, name];
  }
  const pos = new Map(rest.map((item, i) => [item, i]));
  let insert = 0;
  for (const parent of after) {
    const i = pos.get(parent);
    if (i !== undefined) {
      insert = Math.max(insert, i + 1);
    }
  }
  return [...rest.slice(0, insert), name, ...rest.slice(insert)];
}

export function parentsAbove(
  order: string[],
  name: string,
  after: readonly string[],
): boolean {
  const pos = new Map(order.map((item, i) => [item, i]));
  const self = pos.get(name);
  if (self === undefined) {
    return false;
  }
  return after.every((parent) => {
    const i = pos.get(parent);
    return i !== undefined && i < self;
  });
}

export function needsList(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function joinNeeds(items: string[]): string | undefined {
  return items.length === 0 ? undefined : items.join(",");
}

export function patchNeeds(current: string[], next: string[]): string[] {
  if (next.length === 0) {
    return [];
  }
  const added = next.filter((item) => !current.includes(item));
  if (added.includes("none")) {
    return ["none"];
  }
  return next.filter((item) => item !== "none");
}

export function canMoveRow(
  names: string[],
  index: number,
  dir: -1 | 1,
  afterOf: (name: string) => readonly string[],
): boolean {
  const j = index + dir;
  if (j < 0 || j >= names.length) {
    return false;
  }
  const next = [...names];
  const [row] = next.splice(index, 1);
  next.splice(j, 0, row);
  const moving = dir === -1 ? row : names[j];
  return parentsAbove(next, moving, afterOf(moving));
}

export function moveRow(names: string[], index: number, dir: -1 | 1): string[] | undefined {
  const j = index + dir;
  if (j < 0 || j >= names.length) {
    return undefined;
  }
  const next = [...names];
  const [row] = next.splice(index, 1);
  next.splice(j, 0, row);
  return next;
}

export function moveToIndex(
  names: string[],
  name: string,
  index: number,
  afterOf: (n: string) => readonly string[],
): string[] | undefined {
  const from = names.indexOf(name);
  if (from < 0 || index < 0 || index >= names.length || from === index) {
    return undefined;
  }
  const next = [...names];
  const [item] = next.splice(from, 1);
  next.splice(index, 0, item);
  if (next.every((row) => parentsAbove(next, row, afterOf(row)))) {
    return next;
  }
  return undefined;
}

export type InspectorBodySync = {
  needs?: string;
  body?: string;
};

/**
 * body= уточняет needs=body. none снимает тело из заявки.
 * Уровень meta/preview/full добавляет body в needs, если его там не было.
 */
export function applyInspectorBody(
  needs: readonly string[],
  body: string | undefined,
): InspectorBodySync {
  if (body === undefined || body === "" || body === "none") {
    return {
      needs: joinNeeds(needs.filter((item) => item !== "body" && item !== "none")),
    };
  }
  const next = needs.filter((item) => item !== "none");
  if (!next.includes("body")) {
    next.push("body");
  }
  return { needs: joinNeeds(next), body };
}

export function applyInspectorNeeds(
  current: readonly string[],
  nextRaw: readonly string[],
  body: string | undefined,
): InspectorBodySync {
  const next = patchNeeds([...current], [...nextRaw]);
  if (!next.includes("body")) {
    return { needs: joinNeeds(next) };
  }
  return {
    needs: joinNeeds(next),
    body: body === "none" || body === "" ? undefined : body,
  };
}

/*
 * Порядок задаётся внутри фазы: волна -- это «после кого», а «после» имеет
 * смысл только там, где оба бегут. Фазы у инспектора теперь набор, поэтому
 * условие -- пересечение, а не равенство: двое могут встретиться на ответе,
 * даже если один из них ещё и на запросе.
 *
 * Пустой набор у любого из двоих означает «не знаем» -- запись пришла из
 * старого снимка, и запрещать по незнанию нечего.
 */
export function isAfterAllowed(
  name: string,
  parent: string,
  roleOf: (n: string) => string | undefined,
  phasesOf: (n: string) => readonly string[] | undefined,
): boolean {
  if (parent === name) {
    return false;
  }
  if (roleOf(parent) === "advisory") {
    return false;
  }

  const mine = phasesOf(name);
  const theirs = phasesOf(parent);

  if (mine?.length && theirs?.length
      && !mine.some((phase) => theirs.includes(phase)))
  {
    return false;
  }

  return true;
}

export function afterAllowed(
  name: string,
  names: readonly string[],
  roleOf: (n: string) => string | undefined,
  phasesOf: (n: string) => readonly string[] | undefined,
): string[] {
  return names.filter((parent) => isAfterAllowed(name, parent, roleOf, phasesOf));
}

/**
 * Номер волны из after: 0 у тех, чьих родителей нет в наборе,
 * иначе 1 + max(волна родителя). Цикл рвётся в 0 -- nginx больше
 * не проверяет after, и зацикленный jsonb не должен ронять компилятор.
 */
export function wavesFromAfter(
  names: readonly string[],
  afterOf: (name: string) => readonly string[],
): Map<string, number> {
  const set = new Set(names);
  const waves = new Map<string, number>();
  const visiting = new Set<string>();

  const waveOf = (name: string): number => {
    const hit = waves.get(name);
    if (hit !== undefined) {
      return hit;
    }
    if (visiting.has(name)) {
      return 0;
    }
    visiting.add(name);
    let wave = 0;
    for (const parent of afterOf(name)) {
      if (set.has(parent)) {
        wave = Math.max(wave, waveOf(parent) + 1);
      }
    }
    visiting.delete(name);
    waves.set(name, wave);
    return wave;
  };

  for (const name of names) {
    waveOf(name);
  }
  return waves;
}

export function afterRejected(
  name: string,
  after: readonly string[],
  roleOf: (n: string) => string | undefined,
  phasesOf: (n: string) => readonly string[] | undefined,
): string[] {
  return after.filter((parent) => !isAfterAllowed(name, parent, roleOf, phasesOf));
}

/**
 * Имя ушло из реестра -- убрать ссылки на него в чужих `after`, иначе там
 * остаётся указатель в никуда. Карточка реестра в UX делает то же самое своей
 * рукой (`removeName` в `config/InspectorRegistry.tsx`): документ она правит у
 * себя и целиком, поэтому импортировать отсюда нечего.
 */
export function stripFromAfter<T extends { after?: string[] }>(
  map: Record<string, T>,
  gone: string,
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [name, decl] of Object.entries(map)) {
    const after = (decl.after ?? []).filter((item) => item !== gone);
    if (after.length === 0) {
      const { after: _omit, ...rest } = decl;
      next[name] = rest as T;
    } else {
      next[name] = { ...decl, after };
    }
  }
  return next;
}

/**
 * Где имя из каталога ещё живёт. Каталог -- одна из двух половин записи:
 * вторая -- узел реестра в `*.waf.inspectors` и вызовы `waf_inspect` на
 * маршрутах. Удаление половины оставляло висящий узел, поэтому перед снятием
 * записи спрашиваем, кто на неё ссылается, и отвечаем списком мест.
 *
 * Уровень задаёт вызывающий: пространство, сервер, путь. Здесь -- чистый
 * обход, без Redux и без SQL.
 */
export interface InspectorUse {
  /** Человекочитаемое место: `space`, `server <name>`, `location <path>`. */
  at: string;
  /**
   * Узел реестра, вызов на маршруте, ссылка в чужом `after` или объявление,
   * слушающее эту запись как процесс (`process=`).
   */
  kind: "declared" | "called" | "after" | "process";
  /** Для `after` и `process` -- чьё это поле. */
  by?: string;
}

interface UseScope {
  at: string;
  waf?: {
    inspectors?: Record<string, { after?: string[]; process?: string }>;
    requestInspectors?: Array<{ name: string }> | "none" | "all";
    responseInspectors?: Array<{ name: string }> | "none" | "all";
    frameInspectors?: Array<{ name: string }> | "none" | "all";
    inspectorModes?: Record<string, unknown>;
    inspectorProfiles?: Record<string, unknown>;
  };
}

export function findInspectorUses(
  name: string,
  scopes: readonly UseScope[],
): InspectorUse[] {
  const out: InspectorUse[] = [];

  for (const scope of scopes) {
    const waf = scope.waf;
    if (waf === undefined) {
      continue;
    }

    const graph = waf.inspectors ?? {};

    if (graph[name] !== undefined) {
      out.push({ at: scope.at, kind: "declared" });
    }

    for (const [holder, decl] of Object.entries(graph)) {
      if (holder !== name && (decl.after ?? []).includes(name)) {
        out.push({ at: scope.at, kind: "after", by: holder });
      }
      // Чужое объявление слушает эту запись как процесс: снять её -- оставить
      // узел `holder` без темы.
      if (holder !== name && decl.process === name) {
        out.push({ at: scope.at, kind: "process", by: holder });
      }
    }

    for (const list of [waf.requestInspectors, waf.responseInspectors, waf.frameInspectors]) {
      if (Array.isArray(list) && list.some((ref) => ref.name === name)) {
        out.push({ at: scope.at, kind: "called" });
      }
    }

    /*
     * `inspectorModes` и `inspectorProfiles` -- старая форма тех же вызовов:
     * ключ там тоже имя из каталога, и висеть он будет ровно так же.
     */
    for (const map of [waf.inspectorModes, waf.inspectorProfiles]) {
      if (map !== undefined && Object.hasOwn(map, name)) {
        out.push({ at: scope.at, kind: "called" });
      }
    }
  }

  return out;
}
