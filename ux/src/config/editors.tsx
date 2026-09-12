import { createContext, useContext, type ReactNode } from "react";
import InputBase from "@mui/material/InputBase";

import type { CatalogBundle } from "../api.ts";
import {
  EditorField,
  editorInputSx,
  SubRow,
} from "./editor-kit.tsx";
import { useT } from "../i18n/index.ts";
import type { Doc } from "./inherit.ts";
import { Picker } from "./Picker.tsx";

/**
 * Редакторы, которые встают внутрь строки `InheritedRow`. Компактные и без
 * рамки: рамку и подпись даёт строка, а здесь только значение.
 *
 * Отдельно от `fields.tsx` они лежат потому, что там поле само решает, задан
 * ключ или нет (галочка «по умолчанию»), а здесь это решает строка. Две
 * механики на одном экране путали бы: одна и та же галочка означала бы то
 * «умолчание модуля», то «наследовать от сервера».
 */

// Метрика второго уровня одна на все редакторы -- см. editor-kit.tsx.
// Простые поля (число, выбор, список) живут в route-editors.tsx метрикой
// первого уровня; здесь остались редакторы с несколькими параметрами.
const inputSx = editorInputSx;

export function TextEdit({
  value,
  onChange,
  placeholder,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  placeholder?: string;
}) {
  return (
    <InputBase
      value={typeof value === "string" ? value : ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      sx={inputSx}
    />
  );
}

const CatalogContext = createContext<CatalogBundle | null>(null);

export function CatalogProvider({
  value,
  children,
}: {
  value: CatalogBundle | null;
  children: ReactNode;
}) {
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogBundle | null {
  return useContext(CatalogContext);
}

export type CatalogKind = "deny_responses" | "datasets" | "log_formats" | "inspectors";

/**
 * Имя из каталога вместо свободного текста.
 *
 * Всё, на что маршрут ссылается по имени (`waf_deny_response_default`,
 * `waf_local_check <dataset>`), -- внешний ключ в
 * таблицу, которую контроллер и так отдаёт. Набранное руками имя ловится
 * компиляцией только у инспекторов; остальное молча уезжает на ноду и падает
 * там. Здесь выбор, а не ввод.
 *
 * Имя, которого в каталоге нет (пришло из базы раньше, каталог не загрузился),
 * не выбрасывается: оно остаётся отдельным пунктом с пометкой.
 */
export function CatalogEdit({
  value,
  onChange,
  kind,
  filter,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  kind: CatalogKind;
  filter?: (row: { name: string; kind?: string; in_nginx?: boolean }) => boolean;
}) {
  const catalog = useCatalog();
  const current = typeof value === "string" ? value : "";

  if (catalog === null) {
    return <TextEdit value={value} onChange={onChange} />;
  }

  const rows = (catalog[kind] ?? []).filter((row) =>
    filter === undefined
      ? true
      : filter(row as { name: string; kind?: string; in_nginx?: boolean }),
  );

  return (
    <Picker
      plain
      value={current}
      onChange={onChange}
      options={rows.map((row) => ({
        value: row.name,
        hint: summary(row as Record<string, unknown>),
      }))}
    />
  );
}

function summary(row: Record<string, unknown>): string {
  if (typeof row.status === "number") {
    return String(row.status);
  }
  if (typeof row.subject === "string") {
    return row.subject;
  }
  if (typeof row.summary === "string") {
    return row.summary.slice(0, 40);
  }
  // Набор: тип решает, с чем его сравнивать, режим -- откуда состав.
  if (typeof row.type === "string") {
    const mode = row.active === true ? "active" : "internal";
    return `${row.type} · ${mode}`;
  }
  return "";
}

/** Объект `{ threshold, response }` директивы `waf_score_deny`. */
export function ScoreEdit({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const t = useT();
  const row = (value !== null && typeof value === "object" ? value : {}) as Doc;
  const threshold = typeof row.threshold === "number" ? String(row.threshold) : "";

  return (
    <SubRow>
      <EditorField width={64}>
        <InputBase
          value={threshold}
          placeholder="100"
          onChange={(e) => {
            const n = Number(e.target.value.trim());
            onChange({ ...row, threshold: Number.isFinite(n) ? n : 0 });
          }}
          sx={inputSx}
        />
      </EditorField>
      <EditorField grow label={t("config.op.scorePage")}>
        <CatalogEdit
          kind="deny_responses"
          value={row.response}
          onChange={(next) => {
            const copy = { ...row };
            if (typeof next === "string" && next !== "") {
              copy.response = next;
            } else {
              delete copy.response;
            }
            onChange(copy);
          }}
        />
      </EditorField>
    </SubRow>
  );
}
