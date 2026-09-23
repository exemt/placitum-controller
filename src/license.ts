/*
 * The commercial license of this installation: a key from the license server
 * (placitum-license), a signed document that names the licensee, the term
 * and the granted products. The key is checked here with the public keys of
 * the server, offline; the state is what the panel and the feeds client ask.
 *
 * The key format is the one of placitum-license/token: PLC1.<base64url
 * JSON>.<base64url Ed25519 signature over the JSON bytes>.
 */

import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";

import type { Pool } from "./db.ts";
import { log } from "./log.ts";

export const KEY_PREFIX = "PLC1";

/*
 * The public keys of the license server, "ed25519:<base64>", one per key id.
 * The production key goes here once the server has one; until then, and for
 * a stand with its own server, CONTROLLER_LICENSE_KEYS adds keys.
 */
export const BUILTIN_KEYS: string[] = [];

export interface LicenseDoc {
  v: number;
  id: string;
  iss: string;
  kid: string;
  iat: number;
  nbf?: number;
  exp?: number;
  licensee: { name: string; email?: string };
  grants: { product: string }[];
  installations?: number;
  note?: string;
}

export type LicenseTerm = "active" | "expired" | "pending";
export type LicenseState = LicenseTerm | "missing" | "invalid";

export type Keyring = Map<string, KeyObject>;

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Reads "ed25519:<base64>" keys, comma or whitespace separated, into a keyring by key id. */
export function parseKeys(...sources: string[]): Keyring {
  const ring: Keyring = new Map();

  for (const source of sources) {
    for (const item of source.split(/[\s,]+/)) {
      const text = item.trim();

      if (text === "") {
        continue;
      }

      if (!text.startsWith("ed25519:")) {
        log("warn", "license key ignored: not ed25519", { key: text.slice(0, 16) });
        continue;
      }

      const raw = Buffer.from(text.slice("ed25519:".length), "base64");

      if (raw.length !== 32) {
        log("warn", "license key ignored: bad length", { key: text.slice(0, 16) });
        continue;
      }

      ring.set(keyId(raw), createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" }));
    }
  }

  return ring;
}

/** The key id of a raw public key: the first eight hex digits of its SHA-256, as the server derives it. */
export function keyId(raw: Buffer): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 8);
}

export type VerifyResult =
  | { ok: true; doc: LicenseDoc }
  | { ok: false; error: "format" | "unknown_key" | "signature" };

function isDoc(value: unknown): value is LicenseDoc {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const doc = value as Record<string, unknown>;
  const licensee = doc.licensee as Record<string, unknown> | undefined;

  return (
    doc.v === 1 &&
    typeof doc.id === "string" &&
    doc.id !== "" &&
    typeof doc.kid === "string" &&
    typeof doc.iat === "number" &&
    typeof licensee === "object" &&
    licensee !== null &&
    typeof licensee.name === "string" &&
    Array.isArray(doc.grants) &&
    doc.grants.every(
      (g) => typeof g === "object" && g !== null && typeof (g as { product?: unknown }).product === "string",
    )
  );
}

/** Parses a key and checks its signature against the keyring. Dates are not looked at: see termOf. */
export function verifyKey(key: string, ring: Keyring): VerifyResult {
  const parts = key.trim().split(".");

  if (parts.length !== 3 || parts[0] !== KEY_PREFIX) {
    return { ok: false, error: "format" };
  }

  let body: Buffer;
  let sig: Buffer;
  let parsed: unknown;

  try {
    body = Buffer.from(parts[1], "base64url");
    sig = Buffer.from(parts[2], "base64url");
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return { ok: false, error: "format" };
  }

  if (sig.length !== 64 || !isDoc(parsed)) {
    return { ok: false, error: "format" };
  }

  const pub = ring.get(parsed.kid);

  if (pub === undefined) {
    return { ok: false, error: "unknown_key" };
  }

  if (!verify(null, body, pub, sig)) {
    return { ok: false, error: "signature" };
  }

  return { ok: true, doc: parsed };
}

/** Where the term of a license stands at the moment. */
export function termOf(doc: LicenseDoc, now = new Date()): LicenseTerm {
  const t = Math.floor(now.getTime() / 1000);

  if (doc.nbf !== undefined && doc.nbf !== 0 && t < doc.nbf) {
    return "pending";
  }

  if (doc.exp !== undefined && doc.exp !== 0 && t >= doc.exp) {
    return "expired";
  }

  return "active";
}

export function hasGrant(doc: LicenseDoc, product: string): boolean {
  return doc.grants.some((g) => g.product === product);
}

/** The one row of the license table: the key as applied, and when. */
export interface StoredLicense {
  key: string;
  appliedAt: Date;
}

/*
 * The license table holds one row. The schema ships it; an installation
 * from before the table gets it here, so an upgrade needs no hand work.
 */
export class LicenseStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async ensure(): Promise<void> {
    await this.pool.query(
      `create table if not exists license (
         id integer primary key default 1 check (id = 1),
         key text not null,
         applied_at timestamptz not null default now()
       )`,
    );
    await this.pool.query(`alter table datasets add column if not exists source jsonb`);
  }

  async get(): Promise<StoredLicense | null> {
    const { rows } = await this.pool.query<{ key: string; applied_at: Date }>(
      `select key, applied_at from license where id = 1`,
    );

    return rows.length === 0 ? null : { key: rows[0].key, appliedAt: rows[0].applied_at };
  }

  async put(key: string): Promise<StoredLicense> {
    const { rows } = await this.pool.query<{ key: string; applied_at: Date }>(
      `insert into license (id, key, applied_at) values (1, $1, now())
       on conflict (id) do update set key = excluded.key, applied_at = now()
       returning key, applied_at`,
      [key],
    );

    return { key: rows[0].key, appliedAt: rows[0].applied_at };
  }

  async clear(): Promise<void> {
    await this.pool.query(`delete from license where id = 1`);
  }
}

export interface LicenseView {
  state: LicenseState;
  error: string | null;
  doc: LicenseDoc | null;
  grants: string[];
  applied_at: string | null;
  server: string;
}

/*
 * The license in memory: loaded once from the table, replaced from the
 * panel. Listeners (the feeds client) hear about a change.
 */
export class LicenseService {
  private stored: StoredLicense | null = null;
  private verified: VerifyResult | null = null;
  private listeners = new Set<() => void>();
  private readonly store: LicenseStore;
  private readonly ring: Keyring;
  readonly serverUrl: string;

  constructor(store: LicenseStore, ring: Keyring, serverUrl: string) {
    this.store = store;
    this.ring = ring;
    this.serverUrl = serverUrl;
  }

  async load(): Promise<void> {
    await this.store.ensure();
    this.stored = await this.store.get();
    this.verified = this.stored === null ? null : verifyKey(this.stored.key, this.ring);

    if (this.stored !== null) {
      log("info", "license loaded", { state: this.view().state, id: this.doc()?.id ?? null });
    }
  }

  /** The key text, for the feeds client; null without a valid, current license. */
  key(): string | null {
    return this.state() === "active" && this.stored !== null ? this.stored.key : null;
  }

  doc(): LicenseDoc | null {
    return this.verified?.ok === true ? this.verified.doc : null;
  }

  state(now = new Date()): LicenseState {
    if (this.stored === null || this.verified === null) {
      return "missing";
    }

    if (!this.verified.ok) {
      return "invalid";
    }

    return termOf(this.verified.doc, now);
  }

  /** Whether the current license grants the product. */
  allows(product: string): boolean {
    const doc = this.doc();

    return this.state() === "active" && doc !== null && hasGrant(doc, product);
  }

  view(): LicenseView {
    const doc = this.doc();

    return {
      state: this.state(),
      error: this.verified !== null && !this.verified.ok ? this.verified.error : null,
      doc,
      grants: doc === null ? [] : doc.grants.map((g) => g.product),
      applied_at: this.stored?.appliedAt.toISOString() ?? null,
      server: this.serverUrl,
    };
  }

  /** Applies a key from the panel: only a key that verifies is stored. */
  async apply(key: string): Promise<VerifyResult> {
    const result = verifyKey(key, this.ring);

    if (!result.ok) {
      return result;
    }

    this.stored = await this.store.put(key.trim());
    this.verified = result;
    log("info", "license applied", { id: result.doc.id, licensee: result.doc.licensee.name, grants: result.doc.grants.length });
    this.notify();

    return result;
  }

  async remove(): Promise<void> {
    await this.store.clear();
    this.stored = null;
    this.verified = null;
    log("info", "license removed");
    this.notify();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
