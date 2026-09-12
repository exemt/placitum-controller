import type { ReactNode } from "react";
import Box from "@mui/material/Box";

import type { AuditParticipant, AuditSearchEvent } from "../api.ts";
import { inspectorName } from "../inspectors.ts";
import { useT, type Translate } from "../i18n/index.ts";

/** По схеме аудита отсутствие поля — `default`, не «профиля нет». */
export const DEFAULT_INSPECTOR_PROFILE = "default";

/**
 * Имя инспектора и профиль: `ip : strict`, профиль отдельным цветом.
 * Без профиля остаётся одно имя — иначе `ip:profile` сливается в кашу.
 */
export function InspectorRef({
  name,
  profile,
}: {
  name: string;
  profile?: string;
}): ReactNode {
  const shown = inspectorName(name);
  if (profile === undefined || profile === "") {
    return shown;
  }

  return (
    <>
      {shown}
      <Box component="span" sx={{ color: "text.disabled" }}>
        {" : "}
      </Box>
      <Box component="span" sx={{ color: "secondary.main", fontWeight: 600 }}>
        {profile}
      </Box>
    </>
  );
}

export function inspectorProfileOf(
  row: AuditSearchEvent,
  name: string,
): string {
  const map = row.inspectors_profile;
  if (map !== undefined) {
    const direct = map[name];
    if (direct !== undefined && direct !== "") {
      return direct;
    }

    const aliased = map[inspectorName(name)];
    if (aliased !== undefined && aliased !== "") {
      return aliased;
    }
  }

  return DEFAULT_INSPECTOR_PROFILE;
}

/** У модуля профиля нет. У инспектора пустое поле — тот же default, что на проводе. */
export function participantProfileOf(item: AuditParticipant): string {
  if (item.self) {
    return "";
  }

  if (item.profile !== undefined && item.profile !== "") {
    return item.profile;
  }

  for (const finding of item.findings ?? []) {
    if (finding.profile !== undefined && finding.profile !== "") {
      return finding.profile;
    }
  }

  return DEFAULT_INSPECTOR_PROFILE;
}

/**
 * Почему вынесен итог. Инспектор — «по ip : profile»; внутренние коды
 * модуля (score, таблица, лимит, отказ волны) — «модулем по …».
 */
export function VerdictReason({ row }: { row: AuditSearchEvent }): ReactNode {
  const t = useT();
  const code = row.code;
  const deny = row.verdict === "deny" || row.verdict === "redirect";
  const module = code !== "inspector";

  if (code === undefined || code === "" || !deny) {
    return t("incidentsPage.card.reasonLine.allow");
  }

  const prefix = reasonPrefix(t, row.verdict, module);

  if (code === "inspector") {
    return (
      <>
        {prefix}{" "}
        <InspectorRef name={row.by} profile={inspectorProfileOf(row, row.by)} />
      </>
    );
  }

  const via = reasonVia(t, code, row);
  const score =
    code === "score" && (row.deny_at ?? 0) > 0
      ? ` ${row.score}/${row.deny_at}`
      : "";

  return (
    <>
      {prefix} {via}
      {score !== "" && (
        <Box
          component="span"
          sx={{ ml: 0.75, fontFamily: "monospace", color: "text.secondary" }}
        >
          {score.trim()}
        </Box>
      )}
    </>
  );
}

function reasonPrefix(t: Translate, verdict: string, module: boolean): string {
  if (verdict === "redirect") {
    return t(
      module
        ? "incidentsPage.card.reasonLine.redirectModule"
        : "incidentsPage.card.reasonLine.redirect",
    );
  }

  return t(
    module
      ? "incidentsPage.card.reasonLine.denyModule"
      : "incidentsPage.card.reasonLine.deny",
  );
}

function reasonVia(t: Translate, code: string, row: AuditSearchEvent): string {
  const key = `incidentsPage.card.reasonLine.${code}`;
  const text = t(key, {
    status: row.status > 0 ? String(row.status) : "429",
    close: String(row.session?.close_code ?? ""),
  });

  return text === key ? code : text;
}
