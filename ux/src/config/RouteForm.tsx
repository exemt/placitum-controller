import { useMemo } from "react";

import { InheritModeProvider } from "../components/fields.tsx";
import { SettingsTable, UnitLabel } from "../components/settings-table.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { CatalogEdit, ScoreEdit } from "./editors.tsx";
import { InheritedRow, type InheritedCtx } from "./InheritedRow.tsx";
import { CookieDefaultsEdit } from "./LocalRules.tsx";
import { ExceptionEdit } from "./ExceptionEdit.tsx";
import type { Doc, Level, ParentChain } from "./inherit.ts";
import type { LayerItem } from "./layer-tabs.tsx";
import {
  BOOL_OPTIONS,
  boolToOption,
  optionToBool,
  pickPresets,
  PickValue,
  RowInput,
  RowList,
  valuePresets,
} from "./route-editors.tsx";

/**
 * Решения по запросу -- одни группы на сервер и путь.
 *
 * Живут они в окне «Дополнительные параметры» (`pages/route-fields.tsx`):
 * первый ряд -- WAF или nginx, второй -- группа, ниже карточка с её таблицей.
 * Группа здесь -- вкладка, а не раздел одной длинной таблицы: в карточке
 * маршрута развёрнутой секцией они отодвигали инспекторов и слой на второй
 * экран, хотя правят их несравнимо реже.
 *
 * Ядра nginx здесь нет совсем -- ни gzip, ни логов: всё, что печатается
 * директивой nginx, правится матрицей (`config/nginx-directives.tsx`) на
 * вкладке nginx того же окна. Раньше gzip и логи стояли строками этой формы
 * ради подписи «откуда приехало значение», но две половины одного gzip в
 * разных вкладках читались хуже, чем одна без подписи.
 *
 * Локального слоя здесь нет: `waf_local_check` и `waf_local_rate` -- порядок и
 * таблица, а не «директива и значение», и живут они своей секцией
 * (`pages/WafLocal.tsx`) рядом с инспекцией.
 *
 * `WafRouteSettings` -- один документ, и наследование у него одно на все
 * ключи, поэтому группы одни: сервер задаёт, путь переопределяет.
 *
 * На `http {}` этих групп нет вовсе. Контур объявляет инспекторов и настраивает
 * процесс; что делать с запросом -- решает хост. На проде серверы принадлежат
 * разным клиентам, и общий на контур бюджет с общим набором инспекторов для них
 * либо избыточен, либо недостаточен. Компилятор ключ решения на пространстве
 * отвергает (`route_at_http`), поэтому и предлагать его негде.
 */

type Editor =
  | { kind: "bool" }
  | { kind: "num"; unit?: string; presets?: readonly number[] }
  | { kind: "text"; placeholder?: string; presets?: readonly string[] }
  | { kind: "choice"; options: readonly string[] }
  | { kind: "list"; placeholder?: string }
  | { kind: "score" }
  | { kind: "catalog"; catalog: "deny_responses" | "datasets" | "log_formats" }
  | { kind: "cookieDefaults" }
  | { kind: "exception" };

interface FieldSpec {
  key: string;
  /** Имя директивы: подпись строки -- то, что окажется в файле. */
  directive: string;
  editor: Editor;
  /** Ключ умеет «снять родительское». */
  offable?: boolean;
  /** На каких уровнях поле показывается. По умолчанию на всех. */
  levels?: Level[];
}

interface GroupSpec {
  id: string;
  fields: FieldSpec[];
}

const BODY_LIMIT = ["block", "trim", "pass"] as const;
const DENY_MODES = ["fast", "deterministic"] as const;
const HOLD_MODES = ["gate", "monitor"] as const;
const FRAME_AUDIT = ["off", "deny", "all"] as const;
const AUDIT_SAMPLES = [2, 5, 10, 100] as const;
/** Ограничитель ping/pong: умолчание модуля 10r/s, off снимает. */
const CONTROL_RATES = ["2r/s", "10r/s", "60r/m", "off"] as const;
/** Срок записи кеша вердикта: модуль принимает не больше часа. */
const CACHE_TTLS = ["10s", "30s", "1m", "5m"] as const;
const CACHE_STREAMS = ["both", "c2s", "s2c"] as const;
/** Подстановки бюджета: от «почти не ждать» до секунды. */
const DEADLINE_MS = [100, 250, 500, 1000, 2000] as const;
const BODY_SIZES = ["256k", "1m", "8m", "64m"] as const;

/**
 * Порядок групп -- порядок вопросов, которые оператор задаёт себе про
 * маршрут: включён ли WAF, сколько ждём и что делаем при отказе, чем
 * отвечаем, что с телом, что с cookie, что на фазе ответа.
 *
 * Группы «Аудит» здесь нет. `waf_audit_body` и `waf_audit_mask` -- то, что
 * уже делает `waf_preview` (срез тела в записи и mask=/deny=, секция «Снимок»);
 * `waf_audit sample= on=` -- этап 8, модуль директиву не принимает и
 * компилятор её не печатает. Форма, которая пишет в jsonb поле, на которое
 * никто не смотрит, -- не форма. Модель и парсер ключи хранят: когда
 * сэмплирование появится в модуле, строка вернётся уже живой.
 */
const GROUPS: GroupSpec[] = [
  {
    id: "core",
    fields: [
      { key: "enabled", directive: "waf", editor: { kind: "bool" } },
      {
        key: "deadlineMs",
        directive: "waf_deadline",
        editor: { kind: "num", unit: "ms", presets: DEADLINE_MS },
      },
      {
        key: "denyMode",
        directive: "waf_deny_mode",
        editor: { kind: "choice", options: DENY_MODES },
      },
    ],
  },
  {
    id: "policies",
    fields: [
      /*
       * Одна строка на все причины «вердикта нет»: хвост директивы целиком,
       * как у waf_send и waf_archive. Класс необязателен -- строка без него
       * задаёт все шесть, а порядок строк ничего не решает: класс, названный
       * дважды на уровне, отвергает сборка.
       */
      { key: "exception", directive: "waf_exception", editor: { kind: "exception" } },
    ],
  },
  {
    id: "score",
    fields: [
      { key: "scoreDeny", directive: "waf_score_deny", editor: { kind: "score" } },
      {
        key: "denyResponseDefault",
        directive: "waf_deny_response_default",
        editor: { kind: "catalog", catalog: "deny_responses" },
      },
      {
        key: "redirectAllow",
        directive: "waf_redirect_allow",
        editor: { kind: "list", placeholder: "/waf/captcha  https://example.com" },
        offable: true,
      },
      {
        key: "actionMax",
        directive: "waf_action_max",
        editor: { kind: "text", placeholder: "192" },
      },
      {
        key: "actionsMax",
        directive: "waf_actions_max",
        editor: { kind: "num", presets: [0, 8, 16, 32, 64] },
      },
    ],
  },
  {
    id: "body",
    fields: [
      {
        key: "bodyLimit",
        directive: "waf_body_limit",
        editor: { kind: "text", placeholder: "1m", presets: BODY_SIZES },
      },
      {
        key: "bodyLimitPolicy",
        directive: "waf_body_limit · политика",
        editor: { kind: "choice", options: BODY_LIMIT },
      },
    ],
  },
  /*
   * Отладочный заголовок -- здесь, а не в «Логах»: логи теперь целиком nginx
   * (вкладка nginx), а `waf_debug_header` -- ответ модуля клиенту, такой же
   * атрибут ответа, как cookie.
   */
  {
    id: "cookie",
    fields: [
      {
        key: "cookieDefaults",
        directive: "waf_cookie_defaults",
        editor: { kind: "cookieDefaults" },
      },
      { key: "debugHeader", directive: "waf_debug_header", editor: { kind: "bool" } },
    ],
  },
  /*
   * Фаза ответа: дедлайн, счёт и удержание. Отдельного разрешения читать тело
   * ответа нет -- о нём говорит снимок (`waf_capture response body=`), и он же
   * задаёт потолок удержания (docs/directives/list/hold.md).
   */
  {
    id: "phaseResponse",
    fields: [
      {
        key: "responseDeadlineMs",
        directive: "waf_deadline response",
        editor: { kind: "num", unit: "ms", presets: DEADLINE_MS },
      },
      {
        key: "responseHold",
        directive: "waf_hold response",
        editor: { kind: "choice", options: HOLD_MODES },
      },
      {
        key: "responseScoreDeny",
        directive: "waf_score_deny response",
        editor: { kind: "score" },
      },
    ],
  },
  /*
   * Фаза кадров WebSocket, обе стороны: бюджет и порог одной строкой `frame`.
   * Удержания здесь нет -- модуль ведёт кадры только в gate. Снимок тела кадра
   * -- строки `frame:c2s` и `frame:s2c` в таблице снимка, как у других фаз.
   * Группа есть только у websocket-пути (groupsFor).
   */
  {
    id: "phaseFrame",
    fields: [
      {
        key: "frameDeadlineMs",
        directive: "waf_deadline frame",
        editor: { kind: "num", unit: "ms", presets: DEADLINE_MS },
      },
      {
        key: "frameScoreDeny",
        directive: "waf_score_deny frame",
        editor: { kind: "score" },
      },
      /*
       * Рукопожатие: у websocket-пути оба ключа печатаются и без записи --
       * 426 без апгрейда и снятие permessage-deflate. Здесь их выключают.
       */
      {
        key: "requireUpgrade",
        directive: "waf_require_upgrade",
        editor: { kind: "bool" },
      },
      {
        key: "requireUpgradeResponse",
        directive: "waf_require_upgrade response=",
        editor: { kind: "catalog", catalog: "deny_responses" },
      },
      {
        key: "wsStripExtensions",
        directive: "waf_ws_strip_extensions",
        editor: { kind: "list" },
      },
      /*
       * Аудит кадров: сколько записей уходит в журнал. deny -- умолчание
       * модуля (кадр с отказом, подменой или счётом), all с сэмплом -- для
       * отладки маршрута, off глушит и кадры, и итог сессии.
       */
      {
        key: "frameAudit",
        directive: "waf_audit_frames",
        editor: { kind: "choice", options: FRAME_AUDIT },
      },
      {
        key: "frameAuditSample",
        directive: "waf_audit_frames sample=",
        editor: { kind: "num", presets: AUDIT_SAMPLES },
      },
      /*
       * Сборка фрагментов, ограничитель ping/pong и кеш вердикта. Все три
       * -- умолчания модуля без записи (off, 10r/s, кеш выключен); кеш
       * печатается только с названным сроком.
       */
      {
        key: "frameReassemble",
        directive: "waf_frame_reassemble",
        editor: { kind: "bool" },
      },
      {
        key: "frameControlRate",
        directive: "waf_frame_control_rate",
        editor: { kind: "text", placeholder: "10r/s", presets: CONTROL_RATES },
      },
      {
        key: "frameCacheTtl",
        directive: "waf_frame_cache ttl=",
        editor: { kind: "text", placeholder: "30s", presets: CACHE_TTLS },
      },
      {
        key: "frameCacheStream",
        directive: "waf_frame_cache: сторона",
        editor: { kind: "choice", options: CACHE_STREAMS },
      },
    ],
  },
];

/** Только сервер и путь: на http решений нет. */
export type RouteLevel = Exclude<Level, "http">;

/**
 * Протокол пути решает, какие фазы у него есть: http -- запрос и ответ,
 * websocket -- рукопожатие и кадры. У сервера протокола нет: он смешивает
 * пути обоих, и групп кадров у него не бывает.
 */
export type RouteProtocol = "http" | "websocket";

/** Фазы, которыми живёт уровень с этим протоколом. */
export function phasesFor(
  level: RouteLevel,
  protocol: RouteProtocol | undefined,
): ("request" | "response" | "frame")[] {
  if (level === "location" && protocol === "websocket") {
    return ["request", "frame"];
  }
  return ["request", "response"];
}

const PHASE_GROUPS: Record<string, "response" | "frame"> = {
  phaseResponse: "response",
  phaseFrame: "frame",
};

function groupsFor(level: RouteLevel, protocol?: RouteProtocol): GroupSpec[] {
  const phases = phasesFor(level, protocol);
  return GROUPS.filter((group) => {
    const phase = PHASE_GROUPS[group.id];
    return phase === undefined || phases.includes(phase);
  })
    .map((group) => ({
      ...group,
      fields: group.fields.filter(
        (field) => field.levels === undefined || field.levels.includes(level),
      ),
    }))
    .filter((group) => group.fields.length > 0);
}

/** Вкладки второго ряда: группа и её подсказка. */
export function routeItems(
  t: Translate,
  level: RouteLevel,
  protocol?: RouteProtocol,
): LayerItem<string>[] {
  return groupsFor(level, protocol).map((group) => ({
    id: group.id,
    label: t(`config.group.${group.id}`),
    hint: hint(t, group.id),
  }));
}

/** Ключи решений уровня: из них считается счётчик на кнопке окна. */
export function routeKeys(level: RouteLevel, protocol?: RouteProtocol): string[] {
  return groupsFor(level, protocol).flatMap((group) => group.fields.map((field) => field.key));
}

function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Сколько решений уровень записал своими: столько ключей уедет в файл. */
export function routeCount(level: RouteLevel, waf: Doc, protocol?: RouteProtocol): number {
  return routeKeys(level, protocol).filter((key) => isSet(waf[key])).length;
}

/**
 * Таблица одной группы. Абзаца над ней нет: «пустое поле берётся у родителя»
 * сказано подсказкой карточки, а имя группы стоит её шапкой.
 */
export function RouteGroupBody({
  level,
  protocol,
  group,
  waf,
  parents,
  onChange,
}: {
  level: RouteLevel;
  protocol?: RouteProtocol;
  group: string;
  waf: Doc;
  parents: ParentChain;
  onChange: (next: Doc) => void;
}) {
  const t = useT();
  const found = useMemo(
    () => groupsFor(level, protocol).find((row) => row.id === group),
    [level, protocol, group],
  );
  if (found === undefined) {
    return null;
  }

  return (
    <InheritModeProvider value={parents}>
    <SettingsTable>
      {found.fields.map((field) => (
        <InheritedRow
          key={field.key}
          label={field.directive}
          unit={
            field.editor.kind === "num" && field.editor.unit !== undefined ? (
              <UnitLabel>{field.editor.unit}</UnitLabel>
            ) : undefined
          }
          help={t(`config.help.${field.key}`)}
          fieldKey={field.key}
          doc={waf}
          parents={parents}
          onChange={onChange}
          offable={field.offable}
          seed={seedOf(field.editor)}
          end={(row) => renderEnd(field.editor, row)}
        >
          {(value, set) => renderEditor(field.editor, value, set)}
        </InheritedRow>
      ))}
    </SettingsTable>
    </InheritModeProvider>
  );
}

function renderEditor(
  editor: Editor,
  value: unknown,
  set: (next: unknown) => void,
) {
  switch (editor.kind) {
    case "bool":
      return <PickValue value={boolToOption(value)} />;
    case "choice":
      return <PickValue value={value} />;
    case "num":
      // Единица стоит в правом слоте строки, а не хвостом у значения.
      return <RowInput number value={value} onChange={set} />;
    case "text":
      return <RowInput mono value={value} onChange={set} placeholder={editor.placeholder} />;
    case "list":
      return <RowList value={value} onChange={set} placeholder={editor.placeholder} />;
    case "score":
      return <ScoreEdit value={value} onChange={set} />;
    case "catalog":
      return <CatalogEdit value={value} onChange={set} kind={editor.catalog} />;
    case "cookieDefaults":
      return <CookieDefaultsEdit value={value} onChange={set} />;
    case "exception":
      return <ExceptionEdit value={value} onChange={set} />;
  }
}

/**
 * Своё значение, когда наследовать нечего. Первая подстановка или первый
 * вариант -- то же, чем начинает поле на странице http по снятию галочки.
 */
function seedOf(editor: Editor): unknown {
  switch (editor.kind) {
    case "bool":
      return true;
    case "num":
      return editor.presets?.[0] ?? 0;
    case "text":
      return editor.presets?.[0] ?? editor.placeholder ?? "-";
    case "choice":
      return editor.options[0];
    case "list":
      return (editor.placeholder ?? "").split(/\s+/).filter(Boolean).slice(0, 1);
    case "score":
      return { threshold: 100 };
    case "catalog":
      return "";
    case "cookieDefaults":
      return {};
    /* Первое своё значение -- умолчание модуля, записанное явно. */
    case "exception":
      return ["request timeout deny"];
  }
}

/** Чипы у правого края ячейки: варианты выбора или подстановки значения. */
function renderEnd(editor: Editor, row: InheritedCtx) {
  switch (editor.kind) {
    case "bool":
      return pickPresets(row, BOOL_OPTIONS, optionToBool, boolToOption);
    case "choice":
      return pickPresets(row, editor.options);
    case "num":
    case "text":
      return editor.presets === undefined ? undefined : valuePresets(row, editor.presets);
    default:
      return undefined;
  }
}

function hint(t: Translate, id: string): string | undefined {
  const path = `config.group.${id}Hint`;
  const text = t(path);
  return text === path ? undefined : text;
}
