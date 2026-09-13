import type { Uuid } from "./id.ts";

export const UPSTREAM_METHODS = [
  "round_robin",
  "least_conn",
  "ip_hash",
  "hash",
] as const;

export type UpstreamMethod = (typeof UPSTREAM_METHODS)[number];

export function isUpstreamMethod(value: string): value is UpstreamMethod {
  return (UPSTREAM_METHODS as readonly string[]).includes(value);
}

/**
 * Именованный `upstream {}`. Не принадлежит серверу: путь ссылается на него,
 * и один пул может обслуживать несколько виртуальных хостов.
 */
export interface Upstream {
  id: Uuid;
  httpSpaceId: Uuid;
  name: string;
  method: UpstreamMethod;
  hashKey?: string;
  keepalive?: number;
  keepaliveRequests?: number;
  keepaliveTimeoutMs?: number;
  /**
   * Узлы пула слушают TLS: `proxy_pass` пойдёт по `https`, и путь получит
   * `proxy_ssl_*`. Порт сам по себе ничего не решает -- 443 без этого ключа
   * остаётся обычным HTTP и приносит «400 plain HTTP to HTTPS port».
   */
  tls?: boolean;
  /**
   * Имя для SNI (`proxy_ssl_name`). Умолчание nginx -- хост из `proxy_pass`,
   * то есть имя пула: своё имя здесь обязательно всем, кроме пула из одного
   * узла, за который компилятор подставит его хост.
   */
  tlsName?: string;
  /** Значение `Host:` к защищаемому серверу; перекрывает заголовок пути. */
  hostHeader?: string;
}

export interface UpstreamPeer {
  id: Uuid;
  upstreamId: Uuid;
  host: string;
  port: number;
  weight: number;
  maxFails?: number;
  failTimeoutMs?: number;
  backup: boolean;
  down: boolean;
  /**
   * `server … resolve`: имя узла резолвится на лету, а не при загрузке
   * конфигурации. nginx стартует и тогда, когда имени ещё нет в DNS (соседний
   * контейнер не поднят), и сам следит за сменой адресов. Нужен `resolver` в
   * `http`; пул с таким узлом компилятор кладёт в разделяемую память (`zone`).
   */
  resolve: boolean;
  position: number;
}

export interface UpstreamTree extends Upstream {
  peers: UpstreamPeer[];
}

/**
 * Пул глазами пути: что нужно знать, чтобы напечатать `proxy_pass` и соседей.
 * Узлы -- только хостами: имя в рукопожатии одно на пул, портов там нет.
 */
export interface UpstreamWire {
  tls?: boolean;
  tlsName?: string;
  hostHeader?: string;
  peers?: readonly { host: string }[];
}

/** Единственный хост пула -- за него можно решать; у разных узлов имя своё. */
function soleHost(up: UpstreamWire): string | undefined {
  const hosts = new Set((up.peers ?? []).map((peer) => peer.host));
  const [first] = hosts;
  return hosts.size === 1 ? first : undefined;
}

/** Имя в рукопожатии: своё, иначе хост единственного узла. */
export function upstreamSni(up: UpstreamWire): string | undefined {
  const own = up.tlsName?.trim();
  return own !== undefined && own !== "" ? own : soleHost(up);
}

/**
 * Значение `Host:`. Пусто -- заголовок остаётся делом пути; но у пула за TLS
 * умолчание есть: имя, которым уже назвались в рукопожатии. Разные имя и
 * заголовок -- это 421 с любого узла, различающего виртуальные серверы.
 */
export function upstreamHost(up: UpstreamWire): string | undefined {
  const own = up.hostHeader?.trim();
  if (own !== undefined && own !== "") {
    return own;
  }
  return up.tls === true ? upstreamSni(up) : undefined;
}
