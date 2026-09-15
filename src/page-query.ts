export type PageQuery = {
  page: number;
  pageSize: number;
  offset: number;
};

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 200;

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

export function pageCount(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) {
    return 0;
  }

  return Math.ceil(total / pageSize);
}

export function pageEnvelope(
  count: number,
  total: number,
  page: number,
  pageSize: number,
): {
  total: number;
  count: number;
  page: number;
  page_size: number;
  page_count: number;
} {
  return {
    total,
    count,
    page,
    page_size: pageSize,
    page_count: pageCount(total, pageSize),
  };
}

export function pageQuery(query: object): PageQuery {
  const row = query as Record<string, unknown>;
  const pageRaw = Number.parseInt(firstString(row.page) ?? "0", 10);
  const sizeRaw = Number.parseInt(
    firstString(row.page_size) ?? String(DEFAULT_PAGE_SIZE),
    10,
  );
  const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? Math.floor(pageRaw) : 0;
  const pageSize = Number.isFinite(sizeRaw)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(sizeRaw)))
    : DEFAULT_PAGE_SIZE;

  return { page, pageSize, offset: page * pageSize };
}

export function attachmentName(name: string): string {
  const safe = name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return `${safe.length > 0 ? safe : "addresses"}.txt`;
}
