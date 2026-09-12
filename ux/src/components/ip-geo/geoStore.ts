import { fetchGeoLookupBatch } from "../../api.ts";

/**
 * Общий кэш и очередь пачки для карточек IP-адреса.
 *
 * Карточка не ходит в сеть сама: она зовёт `request(addr)` и подписывается
 * на результат. Очередь копится, пока рендер не остановится -- таймер тишины
 * сбрасывается на каждый новый адрес и стреляет, когда приходящих больше
 * нет. `maxWait` -- страховка на непрерывный поток (виртуальный список,
 * бесконечная прокрутка): без неё тишины могло бы не наступить никогда.
 *
 * Кэш живёт, пока жив `GeoStore`: один адрес спрашивается не больше одного
 * раза за время жизни вкладки, сколько бы карточек его ни показали. Ответ
 * даёт каталог пространства, поэтому на смену пространства заводится новый
 * `GeoStore` -- см. `IpGeoContext`.
 */

const QUIET_MS = 30;
const MAX_WAIT_MS = 200;
const MAX_BATCH = 200;

export type GeoStatus = "pending" | "ready" | "error";

export interface GeoHit {
  addr: string;
  status: GeoStatus;
  countries: { code: string; name?: string }[];
  asns: { asn: number; name?: string }[];
}

const EMPTY_COUNTRIES: GeoHit["countries"] = [];
const EMPTY_ASNS: GeoHit["asns"] = [];

const UNKNOWN: GeoHit = {
  addr: "",
  status: "pending",
  countries: EMPTY_COUNTRIES,
  asns: EMPTY_ASNS,
};

function normalize(addr: string): string {
  return addr.trim();
}

function pendingHit(addr: string): GeoHit {
  return { addr, status: "pending", countries: EMPTY_COUNTRIES, asns: EMPTY_ASNS };
}

function errorHit(addr: string): GeoHit {
  return { addr, status: "error", countries: EMPTY_COUNTRIES, asns: EMPTY_ASNS };
}

export class GeoStore {
  private readonly scope: string;
  private readonly entries = new Map<string, GeoHit>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly queue = new Set<string>();
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(scope: string) {
    this.scope = scope;
  }

  /** Карточка просит адрес. Не блокирует рендер: заявка уходит в очередь. */
  request(addr: string): void {
    const key = normalize(addr);
    // Пространства нет -- спрашивать некого: карточка подождёт store с ним.
    if (this.scope === "" || key === "" || this.entries.has(key)) {
      return;
    }

    this.entries.set(key, pendingHit(key));
    this.queue.add(key);
    this.scheduleFlush();
  }

  /** Текущее состояние адреса: снимок для useSyncExternalStore. */
  get(addr: string): GeoHit {
    const key = normalize(addr);
    return this.entries.get(key) ?? UNKNOWN;
  }

  subscribe(addr: string, listener: () => void): () => void {
    const key = normalize(addr);
    let set = this.listeners.get(key);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);

    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  private scheduleFlush(): void {
    if (this.quietTimer !== null) {
      clearTimeout(this.quietTimer);
    }
    this.quietTimer = setTimeout(() => this.flush(), QUIET_MS);

    if (this.maxWaitTimer === null) {
      this.maxWaitTimer = setTimeout(() => this.flush(), MAX_WAIT_MS);
    }
  }

  private flush(): void {
    if (this.quietTimer !== null) {
      clearTimeout(this.quietTimer);
      this.quietTimer = null;
    }
    if (this.maxWaitTimer !== null) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }

    if (this.queue.size === 0) {
      return;
    }

    const addrs = Array.from(this.queue);
    this.queue.clear();

    for (let i = 0; i < addrs.length; i += MAX_BATCH) {
      this.resolveChunk(addrs.slice(i, i + MAX_BATCH));
    }
  }

  private resolveChunk(addrs: string[]): void {
    fetchGeoLookupBatch(this.scope, addrs)
      .then((results) => {
        const byAddr = new Map(results.map((row) => [normalize(row.addr), row]));

        for (const addr of addrs) {
          const hit = byAddr.get(addr);

          if (hit === undefined || (hit.error !== undefined && hit.error !== "")) {
            this.set(addr, errorHit(addr));
            continue;
          }

          this.set(addr, {
            addr,
            status: "ready",
            countries: hit.countries,
            asns: hit.asns,
          });
        }
      })
      .catch(() => {
        for (const addr of addrs) {
          this.set(addr, errorHit(addr));
        }
      });
  }

  private set(addr: string, hit: GeoHit): void {
    this.entries.set(addr, hit);
    const set = this.listeners.get(addr);
    if (set === undefined) {
      return;
    }
    for (const listener of set) {
      listener();
    }
  }
}
