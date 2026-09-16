import { createHash, type Hash } from "node:crypto";

export const SOURCE_SKIP_KEYS: ReadonlySet<string> = new Set([
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "description",
]);

const TAG = {
  null: "0",
  bool: "b",
  number: "n",
  string: "s",
  bytes: "x",
  date: "d",
  array: "a",
  object: "o",
} as const;

function feed(digest: Hash, value: unknown, skip: ReadonlySet<string>): void {
  if (value === null || value === undefined) {
    digest.update(TAG.null);
    digest.update("\0");
    return;
  }

  if (typeof value === "boolean") {
    digest.update(TAG.bool);
    digest.update(value ? "1" : "0");
    digest.update("\0");
    return;
  }

  if (typeof value === "number") {
    digest.update(TAG.number);
    digest.update(Number.isFinite(value) ? String(value === 0 ? 0 : value) : "nan");
    digest.update("\0");
    return;
  }

  if (typeof value === "string") {
    digest.update(TAG.string);
    digest.update(value);
    digest.update("\0");
    return;
  }

  if (value instanceof Date) {
    digest.update(TAG.date);
    digest.update(String(value.getTime()));
    digest.update("\0");
    return;
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    digest.update(TAG.bytes);
    digest.update(createHash("sha256").update(value).digest("hex"));
    digest.update("\0");
    return;
  }

  if (Array.isArray(value)) {
    digest.update(TAG.array);
    digest.update(String(value.length));
    digest.update("\0");
    for (const item of value) {
      feed(digest, item, skip);
    }
    return;
  }

  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    const keys = Object.keys(row)
      .filter((key) => !skip.has(key) && row[key] !== undefined)
      .sort();

    digest.update(TAG.object);
    digest.update(String(keys.length));
    digest.update("\0");

    for (const key of keys) {
      digest.update(key);
      digest.update("\0");
      feed(digest, row[key], skip);
    }
    return;
  }

  digest.update(TAG.string);
  digest.update(String(value));
  digest.update("\0");
}

export function sourceHash(
  value: unknown,
  skip: ReadonlySet<string> = SOURCE_SKIP_KEYS,
): string {
  const digest = createHash("sha256");
  feed(digest, value, skip);
  return `sha256:${digest.digest("hex")}`;
}
