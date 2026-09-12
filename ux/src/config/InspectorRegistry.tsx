import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

import {
  fetchInspectors,
  serviceOfSubject,
  type CatalogBundle,
  type InspectorMeta,
} from "../api.ts";
import { TableIconButton } from "../components/data-table/index.ts";
import {
  DialogAlert,
  DialogFrame,
  DialogInput,
  DialogPick,
  DialogSection,
  type DialogOption,
} from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  dataActionCellSx,
  dataCellSx,
  dataHeadSx,
  SectionBleed,
} from "../components/settings-table.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { useCatalog } from "./editors.tsx";
import type { Doc } from "./inherit.ts";
import { Picker } from "./Picker.tsx";
import { BUILTIN_VARS } from "./VarsCatalog.tsx";

/**
 * Реестр `waf_inspector`: кто в контуре слушает шину.
 *
 * Опции ровно те, что принимает директива
 * (docs/directives/list/inspector.md):
 *
 *   waf_inspector <name> subject=<subject> [profile=] [audit=] [vars=]
 *                 [breaker=on|off] [breaker_threshold=] [breaker_window=]
 *                 [breaker_probe=];
 *
 * Имя -- ключ объявления, subject печатается со строки каталога процесса
 * (`decl.process`, без ключа -- само имя). «Два имени на один subject --
 * один процесс, разный profile» делается вторым объявлением со ссылкой на
 * тот же процесс, а не копией записи каталога: тема, фазы и inspector.conf
 * -- свойства процесса, объявление их не повторяет.
 *
 * Кого и в какой волне звать -- `waf_inspect` на сервере и пути, и звать
 * можно только объявленное здесь имя: вызов мимо объявлений компилятор
 * отвергает (`undeclared_inspector`).
 *
 * # что стоит в таблице, а что в диалоге
 *
 * Строка -- имя с темой и профиль: это то, чем инспектора зовут с маршрута.
 * Всё остальное объявление правится за шестерёнкой (правило 5 и 14
 * docs/controller/ux/settings-table.md): имя и процесс, аудит, предохранитель.
 *
 * Колонки аудита в таблице больше нет намеренно. `audit=` по умолчанию --
 * `waf.audit.inspector.<name>`, и его считает сам модуль
 * (`NGX_HTTP_WAF_AUDIT_PREFIX` в `ngx_http_waf_directives.c`): тема у каждого
 * имени своя, потому что подробности разбирают по имени. Колонка показывала
 * этот вывод подсказкой в каждой строке и читалась настройкой, которой кто-то
 * задал всем разное, -- хотя задано не было ничего. Отклонения от умолчаний
 * видно по цвету шестерёнки и её подсказке.
 */

// Метрика строки данных -- общая, см. settings-table.tsx.
const cellSx = dataCellSx;
const headSx = dataHeadSx;

/**
 * Колонка действий: шестерёнка и корзина. Ширина -- та же, что у строк
 * действий (`rules-table.ACTIONS_W`): две кнопки по 20 с зазором 4 и поле в
 * 16px у правого края, которое возвращает тема (`MuiTableCell` last-of-type).
 */
const ACTIONS_W = 72;
const actionCellSx = { ...dataActionCellSx, width: ACTIONS_W } as const;

/**
 * Ширины имени и профиля. Обе заданы, и остаток ширины таблицы забирает
 * пустая колонка перед действиями -- так профиль стоит сразу за именем, а не
 * уезжает к правому краю вслед за растущей колонкой имени.
 *
 * Имя -- 320: столько же у селектора «добавить инспектора» под таблицей, и
 * туда влезает `процесс · тема` алиаса. Что длиннее -- переносится, колонку
 * это не двигает.
 */
const NAME_W = 320;
const PROFILE_W = 260;

type Breaker = {
  enabled?: boolean;
  threshold?: number;
  windowMs?: number;
  probeMs?: number;
};

type Decl = {
  process?: string;
  profile?: string;
  audit?: string;
  breaker?: Breaker;
  /** `vars=`: поля секции vars этому имени -- имена полей либо `all`. */
  vars?: string[];
};

function asGraph(value: unknown): Record<string, Decl> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, Decl> = {};
  for (const [name, raw] of Object.entries(value as Doc)) {
    out[name] = raw !== null && typeof raw === "object" ? (raw as Decl) : {};
  }
  return out;
}

function clean(name: string, row: Decl): Decl {
  const next: Decl = {};
  // Ссылка на самого себя -- умолчание, её не пишем.
  if (row.process && row.process !== name) next.process = row.process;
  if (row.profile && row.profile !== "default") next.profile = row.profile;
  if (row.audit) next.audit = row.audit;
  const b = row.breaker ?? {};
  const breaker: Breaker = {};
  if (b.enabled !== undefined) breaker.enabled = b.enabled;
  if (typeof b.threshold === "number") breaker.threshold = b.threshold;
  if (typeof b.windowMs === "number") breaker.windowMs = b.windowMs;
  if (typeof b.probeMs === "number") breaker.probeMs = b.probeMs;
  if (Object.keys(breaker).length > 0) next.breaker = breaker;
  if (Array.isArray(row.vars) && row.vars.length > 0) next.vars = row.vars;
  return next;
}

/** Время nginx: `10s`, `500ms`, `1m`. В модели -- миллисекунды. */
export function parseTime(raw: string): number | undefined {
  const text = raw.trim().toLowerCase();
  if (text === "") return undefined;
  const m = text.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/);
  if (m === null) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const unit = m[2] ?? "ms";
  if (unit === "s") return Math.round(n * 1000);
  if (unit === "m") return Math.round(n * 60000);
  return Math.round(n);
}

export function formatTime(ms: number | undefined): string {
  if (ms === undefined) return "";
  if (ms % 60000 === 0) return `${ms / 60000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** Тема аудита по умолчанию -- та же, что считает модуль из имени. */
const auditDefault = (name: string) => `waf.audit.inspector.${name}`;

/**
 * Значение пункта «объявить новое имя»: он стоит в том же селекторе, что и
 * имена каталога, и от них его отличает ведущий пробел -- имя реестра
 * начинается с буквы (NAME_RE), поэтому такого имени в списке быть не может.
 */
const NEW_INSPECTOR = " new";

export function InspectorRegistry({
  scope,
  value,
  varNames,
  onChange,
}: {
  scope: string;
  value: Doc;
  /** Имена `waf_var` контура: вместе со стандартным набором -- выбор полей в `vars=`. */
  varNames: string[];
  onChange: (next: Doc) => void;
}) {
  const t = useT();
  const graph = asGraph(value.inspectors);
  const names = Object.keys(graph);
  const [rows, setRows] = useState<InspectorMeta[]>([]);
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await fetchInspectors(scope));
    } catch {
      setRows([]);
    } finally {
      setReady(true);
    }
  }, [scope]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byName = useMemo(() => new Map(rows.map((r) => [r.name, r])), [rows]);
  // Запись каталога за объявлением: своя либо по ссылке `process`.
  const processOf = (name: string) => graph[name]?.process ?? name;
  const metaOf = (name: string) => byName.get(processOf(name));
  const unknown = ready ? names.filter((n) => metaOf(n) === undefined) : [];
  const undeclared = rows.map((r) => r.name).filter((n) => !names.includes(n));

  const setGraph = (next: Record<string, Decl>) => {
    const waf = { ...value };
    if (Object.keys(next).length === 0) delete waf.inspectors;
    else waf.inspectors = next;
    onChange(waf);
  };

  const patch = (name: string, decl: Decl) =>
    setGraph({ ...graph, [name]: clean(name, decl) });

  /*
   * Снятие узла -- вместе со ссылками на него в чужих `after`. Карточка сама
   * `after` не показывает и не пишет (`clean` его выбрасывает), но в старых
   * документах он лежит и читается компилятором ради номера волны. Оставить
   * там имя, которого в реестре больше нет, значит оставить указатель в
   * никуда, поэтому чистим по сырому узлу, а не по `Decl`. То же самое
   * делает `stripFromAfter` на стороне контроллера.
   */
  const removeName = (gone: string) => {
    const raw = (value.inspectors ?? {}) as Record<string, { after?: string[] }>;
    const next: Record<string, Decl> = {};

    for (const [name, decl] of Object.entries(raw)) {
      if (name === gone) {
        continue;
      }
      const after = decl.after ?? [];
      if (!after.includes(gone)) {
        next[name] = decl as Decl;
        continue;
      }
      const kept = after.filter((item) => item !== gone);
      const { after: _dropped, ...rest } = decl;
      next[name] = (kept.length > 0 ? { ...rest, after: kept } : rest) as Decl;
    }

    setGraph(next);
  };

  return (
    <Stack spacing={1.5}>
      {unknown.length > 0 && (
        <Alert severity="error">{t("registry.unknown", { names: unknown.join(", ") })}</Alert>
      )}

      <SectionBleed scroll>
        <Table size="small" sx={{ "& td, & th": { borderLeft: 0, borderRight: 0 } }}>
          <TableHead>
            <TableRow>
              {/* Имя и профиль -- пара: профиль читают вместе с именем, за
                  которым он стоит. Поэтому ширина задана обоим, а свободную
                  забирает пустая колонка перед действиями: поле профиля на
                  всю страницу не становится ни понятнее, ни удобнее, а сам
                  профиль в конце строки не искали бы глазами. */}
              <TableCell sx={{ ...headSx, pl: 2, width: NAME_W }}>{t("registry.name")}</TableCell>
              <TableCell sx={{ ...headSx, width: PROFILE_W }}>{t("registry.profile")}</TableCell>
              <TableCell sx={headSx} />
              <TableCell sx={{ ...headSx, width: ACTIONS_W }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {names.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} sx={{ ...cellSx, pl: 2, color: "text.secondary" }}>
                  {t("registry.empty")}
                </TableCell>
              </TableRow>
            )}
            {names.map((name) => {
              const decl = graph[name] ?? {};
              const meta = metaOf(name);
              const aliased = decl.process !== undefined && decl.process !== name;
              const tuned = tunedParts(name, decl, t);
              return (
                <TableRow key={name} hover>
                  <TableCell sx={{ ...cellSx, pl: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ fontWeight: 700 }}>
                        <code>{name}</code>
                      </Box>
                      {/* У алиаса под именем -- процесс и его тема: видно,
                          кого это имя слушает, без похода в каталог. */}
                      <Box
                        sx={{
                          fontSize: "0.68rem",
                          fontFamily: meta === undefined ? undefined : "monospace",
                          color: meta === undefined ? "error.main" : "text.secondary",
                        }}
                      >
                        {meta === undefined
                          ? t("registry.notInCatalog", { process: processOf(name) })
                          : aliased
                            ? `${decl.process} · ${meta.subject}`
                            : meta.subject}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={cellSx}>
                    <ProfileCell
                      subject={meta?.subject}
                      value={decl.profile ?? ""}
                      onChange={(profile) => patch(name, { ...decl, profile })}
                    />
                  </TableCell>
                  {/* Остаток ширины: держит имя с профилем слева, а кнопки --
                      у правого края. */}
                  <TableCell sx={cellSx} />
                  {/* Шестерёнка и корзина -- у правого края, как в остальных
                      таблицах данных. Цвет шестерёнки говорит, задано ли в
                      объявлении хоть что-то сверх умолчаний директивы. */}
                  <TableCell sx={actionCellSx}>
                    <Box
                      sx={{
                        display: "flex",
                        gap: 0.5,
                        justifyContent: "flex-end",
                        alignItems: "center",
                      }}
                    >
                      <TableIconButton
                        color={tuned.length > 0 ? "info" : "primary"}
                        icon={<SettingsOutlinedIcon />}
                        tooltip={
                          tuned.length > 0
                            ? `${t("registry.settings")}: ${tuned.join(" · ")}`
                            : t("registry.settings")
                        }
                        aria-label={t("registry.settings")}
                        onClick={() => setEditing(name)}
                      />
                      <TableIconButton
                        color="error"
                        icon={<DeleteIcon />}
                        tooltip={t("registry.remove")}
                        onClick={() => removeName(name)}
                      />
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </SectionBleed>

      {/* Обычный путь -- объявить процесс из каталога под его же именем.
          Новое имя остаётся последним пунктом того же селектора: второе имя
          на тот же процесс -- это объявление со ссылкой `process` и своим
          профилем, а не копия записи каталога.

          Объявленные процессы из списка не пропадают, а стоят в нём
          погашенными с припиской: пропавший пункт читается «инспектора нет в
          каталоге», и его шли искать -- вместо ответа «имя уже занято». */}
      <Box sx={{ width: 320 }}>
        <Picker
          /*
           * Ключ сбрасывает выбор -- и заодно список. Пункт «объявить» не
           * меняет числа имён, поэтому без `adding` селектор оставался
           * раскрытым: окно открывалось, а список висел поверх него (фокус
           * ушёл в модалку мимо blur автокомплита).
           */
          key={`add-${names.length}-${adding}`}
          value=""
          placeholder={
            ready && undeclared.length === 0
              ? t("registry.allDeclared")
              : t("registry.addInspector")
          }
          options={[
            ...rows
              .filter((row) => !names.includes(row.name))
              .map((row) => ({ value: row.name, hint: row.subject })),
            ...rows
              .filter((row) => names.includes(row.name))
              .map((row) => ({
                value: row.name,
                hint: row.subject,
                note: t("registry.declared"),
                disabled: true,
              })),
            { value: NEW_INSPECTOR, label: t("registry.declare") },
          ]}
          onChange={(n) => {
            if (n === "") {
              return;
            }
            if (n === NEW_INSPECTOR) {
              setAdding(true);
              return;
            }
            setGraph({ ...graph, [n]: {} });
          }}
        />
      </Box>

      <DeclareDialog
        open={adding}
        rows={rows}
        taken={names}
        onClose={() => setAdding(false)}
        onDone={(name, decl) => {
          setAdding(false);
          setGraph({ ...graph, [name]: clean(name, decl) });
        }}
      />

      <SettingsDialog
        name={editing ?? undefined}
        decl={editing === null ? undefined : graph[editing]}
        rows={rows}
        taken={names.filter((n) => n !== editing)}
        varNames={varNames}
        onClose={() => setEditing(null)}
        onDone={(from, to, next) => {
          setEditing(null);
          // Ключ переезжает на месте: порядок строк реестра -- это порядок
          // объявления, и переименование не повод бросать имя в конец.
          setGraph(
            Object.fromEntries(
              Object.entries(graph).map(([key, decl]) => [
                key === from ? to : key,
                key === from ? clean(to, next) : decl,
              ]),
            ),
          );
        }}
      />
    </Stack>
  );
}

/**
 * Чем объявление отличается от умолчаний директивы -- строками для подсказки
 * шестерёнки. Пусто -- в объявлении только имя, процесс и профиль, и
 * рассказывать о нём нечего.
 */
function tunedParts(name: string, decl: Decl, t: Translate): string[] {
  const parts: string[] = [];

  if (decl.audit === "off") {
    parts.push(t("registry.auditOffTag"));
  } else if (decl.audit !== undefined && decl.audit !== auditDefault(name)) {
    parts.push(t("registry.auditOnTag", { subject: decl.audit }));
  }

  const b = decl.breaker ?? {};
  if (b.enabled === false) {
    parts.push(t("registry.breakerOffTag"));
  } else if (
    b.threshold !== undefined ||
    b.windowMs !== undefined ||
    b.probeMs !== undefined
  ) {
    parts.push(breakerSummary(b, t));
  }

  const vars = decl.vars ?? [];
  if (vars.includes("all")) {
    parts.push(t("registry.varsAllTag"));
  } else if (vars.length > 0) {
    parts.push(t("registry.varsTag", { fields: vars.join(", ") }));
  }

  return parts;
}

/**
 * Профили заводит не конфиг, а та подсистема, которой инспектор служит: у
 * адреса это «Адрес → Профили», у modsec -- «Правила → Профили», у калитки и
 * капчи -- свои страницы. Показывать чужой список нельзя: имена оттуда этот
 * инспектор не понимает.
 *
 * Ключ -- сервис, последнее звено темы ([serviceOfSubject]): у одного сервиса
 * в реестре несколько имён (`ip-ext`, `ip-admin`), а профили у них общие.
 * Каталог отдаёт профили всех сервисов сразу, здесь остаётся выбрать свои.
 *
 * Пусто -- либо профилей у сервиса не бывает вовсе (`vlai`), либо их
 * ещё не завели. Поле в обоих случаях остаётся свободным вводом: «какие
 * профили есть, решает инспектор», и список тут -- подсказка, а не словарь.
 */
function profilesOf(
  catalog: CatalogBundle | null,
  subject: string | undefined,
): { value: string }[] {
  if (subject === undefined) {
    return [];
  }
  const service = serviceOfSubject(subject);
  return (catalog?.profiles ?? [])
    .filter((row) => row.kind === service)
    .map((row) => ({ value: row.name }));
}

/**
 * Новое имя реестра: объявление, а не запись каталога. Процесс выбирается из
 * каталога, профиль -- прямо здесь: второе имя на тот же процесс с другим
 * профилем -- ровно то, ради чего `profile=` существует, и что раньше
 * требовало копии записи каталога с повтором темы, фаз и conf.
 */
function DeclareDialog({
  open,
  rows,
  taken,
  onClose,
  onDone,
}: {
  open: boolean;
  /** Каталог: процессы, на которые может сослаться объявление. */
  rows: InspectorMeta[];
  taken: string[];
  onClose: () => void;
  onDone: (name: string, decl: { process?: string; profile?: string }) => void;
}) {
  const t = useT();
  const catalog = useCatalog();
  const [name, setName] = useState("");
  const [process, setProcess] = useState("");
  const [profile, setProfile] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setProcess("");
      setProfile("");
    }
  }, [open]);

  const meta = rows.find((row) => row.name === process);
  const nameBad = nameError(name, taken, t);
  const ok = name !== "" && nameBad === undefined && meta !== undefined;

  // Профили процесса -- подсказка из его подсистемы; своё имя не выбрасывается.
  const profileOptions = profilesOf(catalog, meta?.subject);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("registry.declare")}
      hint={t("registry.declareBlurb")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!ok}
            onClick={() => onDone(name, { process, profile: profile || undefined })}
          >
            {t("common.create")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.25}>
        <DialogInput
          label={t("common.name")}
          hint={t("registry.nameHint")}
          placeholder="modsec-strict"
          value={name}
          error={nameBad !== undefined}
          onChange={setName}
        />
        {nameBad !== undefined && <DialogAlert tone="warning" text={nameBad} />}
        <DialogPick
          mono
          label={t("registry.process")}
          hint={t("registry.processHint")}
          value={process}
          options={processOptions(rows, process, t)}
          onChange={setProcess}
        />
        {/* Профиль -- свободный ввод: список здесь подсказка, а не словарь
            (см. [profilesOf]), поэтому поле рамочное, а не селектор. */}
        <DialogFrame label={t("registry.profile")} hint={t("registry.profileDeclareHint")}>
          <Picker
            free
            plain
            value={profile}
            onChange={setProfile}
            placeholder={t("registry.profilePick")}
            options={profileOptions}
            unknownLabel={t("registry.ownProfile")}
          />
        </DialogFrame>
      </Stack>
    </Modal>
  );
}

/**
 * Процессы каталога пунктами селектора: имя моноширинным, тема и фазы --
 * второй строкой пункта.
 *
 * Процесс, на который объявление ссылается, а каталог его не знает, остаётся
 * в списке помеченным: пропади пункт -- поле читалось бы пустым, а это не
 * «не выбрано», это дефект, который надо видеть и поправить.
 */
function processOptions(rows: InspectorMeta[], value: string, t: Translate): DialogOption[] {
  const options: DialogOption[] = rows.map((row) => ({
    value: row.name,
    label: row.name,
    hint: `${row.subject} · ${row.phases.join(", ")}`,
  }));
  if (value === "") {
    options.unshift({ value: "", label: t("registry.processPick") });
  } else if (!rows.some((row) => row.name === value)) {
    options.push({ value, label: value, tag: t("registry.processGone"), missing: true });
  }
  return options;
}

/**
 * Почему имя не примут -- словами. Погашенная кнопка «Сохранить» на этот
 * вопрос не отвечает, а прежняя подпись под полем («занято или недопустимо»)
 * называла обе причины сразу, не выбирая между ними.
 */
function nameError(name: string, taken: string[], t: Translate): string | undefined {
  if (name === "") {
    return undefined;
  }
  if (!NAME_RE.test(name)) {
    return t("registry.nameBad");
  }
  return taken.includes(name) ? t("registry.nameUsed") : undefined;
}

/**
 * Объявление целиком: имя, которым его зовут маршруты, процесс за этим
 * именем, аудит и предохранитель.
 *
 * Одно окно на всю строку, а не карандаш рядом с именем и шестерёнка у
 * предохранителя: и то и другое правит один и тот же ключ документа, а
 * выключатель прямо в строке правил конфигурацию мимо черновика -- закрыть
 * его, ничего не тронув, было нельзя. Здесь черновик держится до «Сохранить».
 *
 * Тема, фазы и conf правятся на странице каталога -- это свойства процесса, а
 * не объявления. Профиль остаётся в самой строке: его читают и меняют, глядя
 * на соседние строки, и ради него окно открывать незачем.
 */
function SettingsDialog({
  name: current,
  decl,
  rows,
  taken,
  varNames,
  onClose,
  onDone,
}: {
  name?: string;
  decl?: Decl;
  /** Каталог: процессы, на которые может сослаться объявление. */
  rows: InspectorMeta[];
  taken: string[];
  /** Имена `waf_var` контура -- вторая половина выбора полей, после стандартного набора. */
  varNames: string[];
  onClose: () => void;
  onDone: (from: string, to: string, decl: Decl) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [process, setProcess] = useState("");
  const [auditOn, setAuditOn] = useState(true);
  const [audit, setAudit] = useState("");
  const [breakerOn, setBreakerOn] = useState(true);
  const [pct, setPct] = useState("");
  const [win, setWin] = useState("");
  const [probe, setProbe] = useState("");
  const [varsOn, setVarsOn] = useState(false);
  const [vars, setVars] = useState<string[]>([]);
  const open = current !== undefined;

  useEffect(() => {
    if (current === undefined) {
      return;
    }
    const b = decl?.breaker ?? {};
    setName(current);
    setProcess(decl?.process ?? current);
    setAuditOn(decl?.audit !== "off");
    setAudit(decl?.audit === "off" ? "" : (decl?.audit ?? ""));
    setBreakerOn(b.enabled !== false);
    setPct(b.threshold === undefined ? "" : String(Math.round(b.threshold * 100)));
    setWin(formatTime(b.windowMs));
    setProbe(formatTime(b.probeMs));
    setVarsOn((decl?.vars ?? []).length > 0);
    setVars(decl?.vars ?? []);
  }, [current, decl]);

  const nameBad = nameError(name, taken, t);
  const processOk = rows.some((row) => row.name === process);
  const pctNum = pct.trim() === "" ? undefined : Number(pct.trim());
  const pctOk =
    pctNum === undefined || (Number.isFinite(pctNum) && pctNum > 0 && pctNum <= 100);
  const winOk = win.trim() === "" || parseTime(win) !== undefined;
  const probeOk = probe.trim() === "" || parseTime(probe) !== undefined;
  const varsOk = !varsOn || vars.length > 0;
  const ok =
    name !== "" && nameBad === undefined && processOk && pctOk && winOk && probeOk && varsOk;
  const renamed = current !== undefined && current !== name;

  /*
   * Выключенный предохранитель числа не теряет: `breaker=off` их не отменяет,
   * а оператор, щёлкнувший выключателем дважды, не должен набирать окно
   * заново. Пустое поле -- умолчание директивы, и `clean` его не пишет.
   */
  const breaker: Breaker = {
    enabled: breakerOn ? undefined : false,
    threshold: pctNum === undefined || !pctOk ? undefined : pctNum / 100,
    windowMs: parseTime(win),
    probeMs: parseTime(probe),
  };

  const draft: Decl = {
    ...decl,
    process,
    audit: auditOn ? (audit.trim() === "" ? undefined : audit.trim()) : "off",
    breaker,
    // Выключено -- пустой список: `clean` его не пишет, и старое значение не переживёт.
    vars: varsOn ? vars : [],
  };

  /*
   * Развёрнут тот блок, в котором что-то задано. Объявление без правок --
   * это три умолчания, и окно открывается пятью строками: имя, процесс и три
   * шапки со словами о том, что там стоит. Блок с операторской правкой открыт
   * сразу: ради него шестерёнку и жмут.
   */
  const tuned = {
    audit: decl?.audit !== undefined,
    breaker: Object.keys(decl?.breaker ?? {}).length > 0,
    vars: (decl?.vars ?? []).length > 0,
  };

  /*
   * Несохранённое -- сравнением с тем, что лежит в документе: оба через
   * `clean`, иначе пустое поле и отсутствующий ключ читались бы правкой, и
   * окно спрашивало бы «закрыть без сохранения?» на каждое закрытие.
   */
  const dirty =
    current !== undefined &&
    (renamed || JSON.stringify(clean(name, draft)) !== JSON.stringify(clean(current, decl ?? {})));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("registry.editTitle", { name: current ?? "" })}
      hint={t("registry.editBlurb")}
      dirty={dirty}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit
            disabled={!ok || current === undefined}
            onClick={() => {
              if (current !== undefined) {
                onDone(current, name, draft);
              }
            }}
          >
            {t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <Stack spacing={1.25}>
        {/* Имя и процесс -- не ось, а то, чем объявление является: выключить
            их нельзя, поэтому они стоят полями над блоками, а не в блоке. */}
        <DialogInput
          label={t("common.name")}
          hint={t("registry.nameHint")}
          value={name}
          error={nameBad !== undefined}
          onChange={setName}
        />
        {nameBad !== undefined && <DialogAlert tone="warning" text={nameBad} />}
        <DialogPick
          mono
          label={t("registry.process")}
          hint={t("registry.processHint")}
          value={process}
          options={processOptions(rows, process, t)}
          onChange={setProcess}
        />
        {/* Про переезд имени -- только когда переезжать есть куда: у имени,
            которое не примут, впереди своя правка, а не вызовы на маршрутах. */}
        {renamed && nameBad === undefined && (
          <DialogAlert tone="warning" text={t("registry.renameWarn")} />
        )}

        <DialogSection
          title={t("registry.audit")}
          hint={auditOn ? t("registry.auditBlurb") : t("registry.auditOffHint")}
          summary={
            auditOn
              ? audit.trim() === ""
                ? t("registry.auditDefaultSummary")
                : audit.trim()
              : ""
          }
          checked={auditOn}
          onCheck={setAuditOn}
          defaultOpen={tuned.audit}
        >
          {/* Placeholder -- умолчание директивы, и видно его должно быть до
              фокуса: подпись у поля окна поднята всегда (DialogInput). */}
          <DialogInput
            label={t("registry.auditSubject")}
            hint={t("registry.auditSubjectHint")}
            value={audit}
            placeholder={auditDefault(name)}
            onChange={setAudit}
          />
          <DialogAlert text={t("registry.auditHint")} />
        </DialogSection>

        <DialogSection
          title={t("registry.breaker")}
          hint={breakerOn ? t("registry.breakerBlurb") : t("registry.breakerOff")}
          summary={breakerOn ? breakerShort(breaker, t) : ""}
          checked={breakerOn}
          onCheck={setBreakerOn}
          defaultOpen={tuned.breaker}
        >
          {/* Три числа в один ряд: порознь они занимали окно целиком, а
              правило целиком читается строкой в шапке блока. */}
          <Stack direction="row" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <DialogInput
                label={t("registry.breakerThreshold")}
                value={pct}
                placeholder="50"
                error={!pctOk}
                end="%"
                onChange={setPct}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <DialogInput
                label={t("registry.breakerWindow")}
                value={win}
                placeholder="10s"
                error={!winOk}
                onChange={setWin}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <DialogInput
                label={t("registry.breakerProbe")}
                value={probe}
                placeholder="5s"
                error={!probeOk}
                onChange={setProbe}
              />
            </Box>
          </Stack>
          {(!pctOk || !winOk || !probeOk) && (
            <DialogAlert
              tone="warning"
              text={pctOk ? t("registry.breakerTimeBad") : t("registry.breakerPctBad")}
            />
          )}
          <DialogAlert text={t("registry.breakerHint")} />
        </DialogSection>

        <DialogSection
          title={t("registry.vars")}
          hint={varsOn ? t("registry.varsBlurb") : t("registry.varsOffHint")}
          summary={
            varsOn ? (vars.includes("all") ? t("registry.varsAllSummary") : vars.join(", ")) : ""
          }
          checked={varsOn}
          onCheck={(next) => {
            setVarsOn(next);
            // Включили с пустым списком -- начинаем с полного набора: чаще
            // всего нужен именно он, а снять лишнее проще, чем набрать.
            if (next && vars.length === 0) setVars(["all"]);
          }}
          defaultOpen={tuned.vars}
        >
          <VarsPicker value={vars} own={varNames} onChange={setVars} />
          {!varsOk && <DialogAlert tone="warning" text={t("registry.varsNone")} />}
          <DialogAlert text={t("registry.varsHint")} />
        </DialogSection>
      </Stack>
    </Modal>
  );
}

/**
 * Поля секции vars: «все», стандартный набор модуля, `waf_var` контура. «Все»
 * покрывает остальные -- при нём они показаны отмеченными и не трогаются, а в
 * документе остаётся ["all"]: поле, заведённое позже, доедет само. Имена из
 * документа, которых нет ни там, ни там, стоят рядом с waf_var, чтобы их
 * можно было снять: компилятор такое объявление не примет.
 */
function VarsPicker({
  value,
  own,
  onChange,
}: {
  value: string[];
  own: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useT();
  const all = value.includes("all");
  const builtin: string[] = BUILTIN_VARS.map((v) => v.name);
  const stale = value.filter((v) => v !== "all" && !builtin.includes(v) && !own.includes(v));
  const toggle = (name: string, next: boolean) =>
    onChange(
      next ? [...value.filter((v) => v !== name), name] : value.filter((v) => v !== name),
    );
  const box = (name: string, label: string, mono: boolean, bad = false) => (
    <FormControlLabel
      key={name}
      control={
        <Checkbox
          size="small"
          checked={name === "all" ? all : all || value.includes(name)}
          disabled={all && name !== "all"}
          onChange={(_, next) => toggle(name, next)}
          sx={{ p: 0.5 }}
        />
      }
      label={label}
      slotProps={{
        typography: {
          sx: {
            fontSize: "0.78rem",
            fontFamily: mono ? "monospace" : undefined,
            // Имени из документа нет ни в наборе модуля, ни в waf_var:
            // компилятор такое объявление не примет, и снять его нужно.
            color: bad ? "warning.main" : undefined,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        },
      }}
      /*
       * `-4px` гасит отрицательный отступ MUI (-11px) ровно на padding самой
       * галочки: квадратик встаёт на левую кромку колонки блока -- ту, по
       * которой стоят поля и рамки описаний, -- а не левее неё.
       */
      sx={{ mr: 0, ml: "-4px", minWidth: 0 }}
    />
  );

  /*
   * Галочки колонками, а не лентой с переносом: имена разной длины, и в ленте
   * второй ряд начинался под серединой первого -- набор читался списком,
   * который кто-то рассыпал. Ширина колонки -- по самому длинному имени
   * стандартного набора (`accept_language`), дальше сколько влезет.
   */
  const group = (title: string, names: string[], badFrom = names.length) => (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))",
          columnGap: 1,
          rowGap: 0.25,
          mt: 0.25,
        }}
      >
        {names.map((name, i) => box(name, name, true, i >= badFrom))}
      </Box>
    </Box>
  );

  return (
    <Stack spacing={1.25}>
      {/* «Все» покрывает остальные: при нём они показаны отмеченными и не
          трогаются, а в документе остаётся ["all"]. */}
      <Box>{box("all", t("registry.varsAll"), false)}</Box>
      {group(t("registry.varsBuiltin"), builtin)}
      {(own.length > 0 || stale.length > 0) &&
        group(t("registry.varsOwn"), [...own, ...stale], own.length)}
    </Stack>
  );
}

/**
 * `profile=` -- строка, которую понимает сам инспектор, поэтому список здесь
 * подсказка: профили той подсистемы, которой служит процесс ([profilesOf]).
 * Своё имя вводится руками и не выбрасывается.
 *
 * Пустой список -- не отдельная ветка, а другая подпись: поле ведёт себя
 * одинаково, а placeholder честно говорит, есть из чего выбирать или нет.
 */
function ProfileCell({
  subject,
  value,
  onChange,
}: {
  subject?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useT();
  const catalog = useCatalog();

  const options = useMemo(() => profilesOf(catalog, subject), [catalog, subject]);

  return (
    <Picker
      free
      plain
      value={value}
      onChange={onChange}
      options={options}
      placeholder={
        options.length === 0 ? t("registry.noProfileSource") : t("registry.profilePick")
      }
      unknownLabel={t("registry.ownProfile")}
    />
  );
}

/**
 * Предохранитель словами.
 *
 * `breaker_threshold=` -- доля таймаутов на окне (0.5), `breaker_window=` --
 * само окно (10s), `breaker_probe=` -- как часто пробовать, пока открыт (5s).
 * Три числа порознь не читаются: оператор видит значения, но не видит
 * правила, -- поэтому под полями стоит фраза, а в строке реестра от неё
 * остаётся подсказка шестерёнки.
 */
function breakerSummary(b: Breaker, t: Translate): string {
  return t("registry.breakerSummary", breakerWords(b));
}

/**
 * То же в шапке блока: там на слова остаётся треть строки, и полная фраза
 * обрывалась многоточием на самом интересном -- на пробе.
 */
function breakerShort(b: Breaker, t: Translate): string {
  return t("registry.breakerShort", breakerWords(b));
}

/** Три числа предохранителя с умолчаниями директивы вместо пустых полей. */
function breakerWords(b: Breaker): Record<string, string> {
  return {
    pct: String(b.threshold === undefined ? 50 : Math.round(b.threshold * 100)),
    window: formatTime(b.windowMs) || "10s",
    probe: formatTime(b.probeMs) || "5s",
  };
}
