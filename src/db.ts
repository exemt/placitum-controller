import pg from "pg";

const { Pool } = pg;

export type Pool = pg.Pool;

export function createPool(url: string): pg.Pool {
  return new Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 10_000,
  });
}

export function pgCode(err: unknown): string | undefined {
  if (err !== null && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }

  return undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  if (err !== null && typeof err === "object" && "constraint" in err) {
    const constraint = (err as { constraint: unknown }).constraint;
    return typeof constraint === "string" ? constraint : undefined;
  }

  return undefined;
}
