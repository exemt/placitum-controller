/*
 * The sets the license server publishes (feeds): the catalog under the
 * license key of this installation, and the entries of one set. The client
 * keeps the catalog for an hour, so the panel can show "updates available"
 * without a round trip, and refreshes it on demand.
 */

import { log } from "./log.ts";
import type { LicenseService } from "./license.ts";

export interface FeedMeta {
  id: string;
  type: "ipv4" | "ip" | "string" | "numeric";
  product: string;
  title_en: string;
  title_ru: string;
  desc_en: string;
  desc_ru: string;
  version: number;
  sha256: string;
  count: number;
  updated: number;
}

export interface FeedCatalog {
  checked_at: string | null;
  error: string | null;
  feeds: FeedMeta[];
}

export interface FeedBody {
  type: FeedMeta["type"];
  version: number;
  sha256: string;
  count: number;
  entries: string[];
}

export class FeedsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const TIMEOUT_MS = 20_000;
const REFRESH_MS = 60 * 60 * 1000;

function isMeta(value: unknown): value is FeedMeta {
  const f = value as Record<string, unknown>;

  return (
    typeof f === "object" &&
    f !== null &&
    typeof f.id === "string" &&
    ["ipv4", "ip", "string", "numeric"].includes(f.type as string) &&
    typeof f.product === "string" &&
    typeof f.title_en === "string" &&
    typeof f.version === "number" &&
    typeof f.sha256 === "string" &&
    typeof f.count === "number"
  );
}

export class FeedsClient {
  private catalog: FeedCatalog = { checked_at: null, error: null, feeds: [] };
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<FeedCatalog> | null = null;
  private readonly baseUrl: string;
  private readonly license: LicenseService;
  private readonly fetchFn: typeof fetch;

  constructor(baseUrl: string, license: LicenseService, fetchFn: typeof fetch = fetch) {
    this.baseUrl = baseUrl;
    this.license = license;
    this.fetchFn = fetchFn;
  }

  /** Refreshes the catalog now and then every hour; a license change refreshes it again. */
  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.timer.unref();
    this.license.onChange(() => void this.refresh());
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  current(): FeedCatalog {
    return this.catalog;
  }

  /** The catalog: the kept one, or a fresh one when asked or when nothing is kept yet. */
  async get(force = false): Promise<FeedCatalog> {
    if (!force && this.catalog.checked_at !== null) {
      return this.catalog;
    }

    return this.refresh();
  }

  async refresh(): Promise<FeedCatalog> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }

    this.inFlight = this.load().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async load(): Promise<FeedCatalog> {
    const key = this.license.key();
    const at = new Date().toISOString();

    if (key === null) {
      this.catalog = { checked_at: at, error: "license_missing", feeds: [] };
      return this.catalog;
    }

    try {
      const res = await this.request("/api/v1/feeds", key);
      const body = (await res.json()) as { error?: string; feeds?: unknown[] };

      if (!res.ok) {
        this.catalog = { checked_at: at, error: body.error ?? `http_${res.status}`, feeds: [] };
        log("warn", "feeds catalog refused", { error: this.catalog.error });
        return this.catalog;
      }

      const feeds = Array.isArray(body.feeds) ? body.feeds.filter(isMeta) : [];
      this.catalog = { checked_at: at, error: null, feeds };
      log("info", "feeds catalog", { feeds: feeds.length });
    } catch (err) {
      this.catalog = { checked_at: at, error: "unreachable", feeds: [] };
      log("warn", "feeds catalog unreachable", { server: this.baseUrl, error: String(err) });
    }

    return this.catalog;
  }

  /** The entries of one set, with the version the server stamps on it. */
  async fetch(id: string): Promise<FeedBody> {
    const key = this.license.key();

    if (key === null) {
      throw new FeedsError("license_missing", 403);
    }

    let res: Response;

    try {
      res = await this.request(`/api/v1/feeds/${encodeURIComponent(id)}`, key);
    } catch (err) {
      log("warn", "feed fetch unreachable", { feed: id, error: String(err) });
      throw new FeedsError("unreachable");
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new FeedsError(body.error ?? `http_${res.status}`, res.status === 404 ? 404 : 502);
    }

    const type = res.headers.get("x-feed-type") ?? "";
    const version = Number(res.headers.get("x-feed-version") ?? "0");
    const sha256 = res.headers.get("x-feed-sha256") ?? "";
    const text = await res.text();
    const entries = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));

    if (!["ipv4", "ip", "string", "numeric"].includes(type) || !Number.isFinite(version) || version < 1) {
      throw new FeedsError("bad_feed");
    }

    return { type: type as FeedMeta["type"], version, sha256, count: entries.length, entries };
  }

  private request(path: string, key: string): Promise<Response> {
    return this.fetchFn(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json, text/plain" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}
