/*
 * Живой темп маршрутов на страницах конфигурации.
 *
 * Своего сокета здесь нет и не нужно: `FleetSocket` смонтирован в корне
 * приложения, снимок флота лежит в Redux на любой странице, и секция `routes`
 * приезжает тем же кадром, что карточки нод. Странице остаётся сопоставить
 * свою строку с маршрутом.
 *
 * Путь узнаётся по uuid: компилятор печатает `waf_route_id` в каждый блок
 * location, модуль пишет его в аудит, агент -- в кадр. Пара имён остаётся
 * запасным ключом для кадра от модуля без директивы и для страницы серверов:
 * у сервера uuid в кадре нет, он сворачивается по имени блока `server {}`.
 */

import { useMemo } from "react";

import type { RouteTrafficView, StatusRates } from "./fleet.ts";
import { useAppSelector } from "./store/hooks.ts";

export const ZERO_CODES: StatusRates = {
  "2xx": 0,
  "3xx": 0,
  "4xx": 0,
  "5xx": 0,
};

export interface Traffic {
  rps: number;
  codes: StatusRates;
  /** Сколько нод видели маршрут в своём окне. */
  nodes: number;
}

/**
 * Имя блока `server {}`, каким его печатает компилятор и видит модуль.
 *
 * Первое имя списка, а не все: nginx считает основным именем сервера первое,
 * и в записи аудита стоит именно оно. Сервер без имён -- перехватчик по
 * умолчанию, модуль пишет его как `_`; если таких серверов в контуре
 * несколько, их темп сложится в одну строку -- разделить их по кадру нечем.
 */
export function nginxServerName(row: { server_names: string[] }): string {
  return row.server_names[0] ?? "_";
}

/**
 * Имя блока `location {}`. Точное совпадение и префикс различаются только
 * модификатором, а имя у них одно -- сам путь; именованный location несёт `@`
 * в имени, регулярное выражение -- само выражение.
 */
export function nginxLocationName(row: { match: string; path: string }): string {
  return row.match === "named" ? `@${row.path.replace(/^@/, "")}` : row.path;
}

export function routeKey(server: string, location: string): string {
  return `${server}\n${location}`;
}

/**
 * Есть ли вообще с чем сверяться. Пока снимка нет (сокет не поднялся,
 * контроллер перезапускается), в ячейке должен стоять прочерк, а не ноль:
 * «тихо» и «неизвестно» -- разные вещи, и рисовать их одинаково нельзя.
 */
export function useTrafficLive(): boolean {
  return useAppSelector((s) => s.fleet.snapshot !== null);
}

const EMPTY: RouteTrafficView[] = [];

function useRoutes(): RouteTrafficView[] {
  return useAppSelector((s) => s.fleet.snapshot?.routes) ?? EMPTY;
}

/**
 * Темп для страницы путей. Ключ -- uuid пути; строка без uuid лежит под
 * парой имён (`routeKey`), и страница пробует оба.
 */
export function useRouteTraffic(): Map<string, Traffic> {
  const routes = useRoutes();

  return useMemo(() => {
    const out = new Map<string, Traffic>();
    for (const row of routes) {
      const traffic = {
        rps: row.rps,
        codes: row.codes,
        nodes: row.nodes,
      };
      out.set(row.id ?? routeKey(row.server, row.location), traffic);
    }
    return out;
  }, [routes]);
}

/**
 * Тот же список, свёрнутый до сервера, -- для страницы серверов. Свёртка
 * здесь, а не в контроллере: возить обе развёртки одним кадром каждые четыре
 * секунды дороже, чем сложить десяток строк в браузере.
 *
 * `nodes` при свёртке -- максимум по путям, а не сумма: это число нод, а не
 * число пар «нода + путь».
 */
export function useServerTraffic(): Map<string, Traffic> {
  const routes = useRoutes();

  return useMemo(() => {
    const out = new Map<string, Traffic>();
    for (const row of routes) {
      const was = out.get(row.server);
      if (was === undefined) {
        out.set(row.server, {
          rps: row.rps,
          codes: { ...row.codes },
          nodes: row.nodes,
        });
        continue;
      }
      was.rps += row.rps;
      was.nodes = Math.max(was.nodes, row.nodes);
      for (const cls of ["2xx", "3xx", "4xx", "5xx"] as const) {
        was.codes[cls] += row.codes[cls];
      }
    }
    return out;
  }, [routes]);
}
