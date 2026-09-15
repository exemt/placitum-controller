const RAW = import.meta.glob("../../help/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type HelpSection = {
  no: number;
  sub?: number;
  slug: string;
  title: string;
  body?: string;
};

const PLAN: { no: number; sub?: number; slug: string; title: string }[] = [
  { no: 1, slug: "01-about", title: "О продукте" },
  { no: 2, slug: "02-deploy", title: "Развёртывание" },
  { no: 3, slug: "03-upgrade", title: "Обновление" },
  { no: 4, slug: "04-interface", title: "Вход и интерфейс" },
  { no: 5, slug: "05-protection", title: "Настройка защиты веб-приложений" },
  { no: 6, slug: "06-inspectors", title: "Инспекторы" },
  { no: 6, sub: 1, slug: "06-modsec", title: "Правила обработки трафика" },
  { no: 6, sub: 2, slug: "06-ip", title: "IP фильтр" },
  { no: 6, sub: 3, slug: "06-auth", title: "Второй фактор" },
  { no: 6, sub: 4, slug: "06-captcha", title: "Капча" },
  { no: 6, sub: 5, slug: "06-json", title: "Допуск по спецификации" },
  { no: 6, sub: 6, slug: "06-counter", title: "Счётчик" },
  { no: 6, sub: 7, slug: "06-vlai", title: "Классификатор" },
  { no: 6, sub: 8, slug: "06-rewrite", title: "Правка ответов" },
  { no: 6, sub: 9, slug: "06-cookie", title: "Куки" },
  { no: 6, sub: 10, slug: "06-action", title: "Автодействия" },
  { no: 7, slug: "07-data", title: "Данные, списки и наборы адресов" },
  { no: 8, slug: "08-events", title: "События безопасности" },
  { no: 9, slug: "09-logs", title: "Журналы" },
  { no: 10, slug: "10-monitoring", title: "Мониторинг состояния" },
  { no: 11, slug: "11-admin", title: "Администрирование" },
  { no: 12, slug: "12-reference", title: "Справочники" },
  { no: 13, slug: "13-troubleshooting", title: "Решение проблем" },
];

function titleOf(body: string, fallback: string): string {
  const line = body.split("\n").find((row) => row.startsWith("# "));
  return line === undefined ? fallback : line.slice(2).trim();
}

function bodyOf(slug: string): string | undefined {
  const key = Object.keys(RAW).find((path) => path.endsWith(`/${slug}.md`));
  return key === undefined ? undefined : RAW[key];
}

export const SECTIONS: HelpSection[] = PLAN.map((row) => {
  const body = bodyOf(row.slug);
  return {
    no: row.no,
    sub: row.sub,
    slug: row.slug,
    title: body === undefined ? row.title : titleOf(body, row.title),
    body,
  };
});

export function numberOf(row: HelpSection): string {
  return row.sub === undefined
    ? String(row.no).padStart(2, "0")
    : `${row.no}.${row.sub}`;
}

export function sectionBySlug(slug: string): HelpSection | undefined {
  return SECTIONS.find((row) => row.slug === slug);
}

export const FIRST_WRITTEN = SECTIONS.find((row) => row.body !== undefined);

export function headingsOf(body: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line.startsWith("## ")) {
      continue;
    }
    const text = line.slice(3).trim();
    out.push({ id: slugify(text), text });
  }
  return out;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
