import { useEffect, useMemo, useState } from "react";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { Link as RouterLink } from "react-router-dom";

import { fetchSpaceHttp } from "../api.ts";
import {
  DraftCell,
  FilterCell,
  FilterSelect,
  FilterText,
  HEAD_H,
  TableIconButton,
  TableNotice,
  TableNoticeRow,
  type FilterOption,
} from "../components/data-table/index.ts";
import {
  DialogFrame,
  DialogInput,
  DialogUnit,
  DialogLines,
  DialogNote,
  DialogPick,
  type DialogOption,
} from "../components/dialog-kit.tsx";
import {
  CELL_PX,
  flushTableSx,
  HeadCell,
  headCellSx,
  SectionNotice,
  TableBlock,
  TableCols,
} from "../components/table-block.tsx";
import { Modal } from "../components/Modal.tsx";
import {
  dragSx,
  GripCell,
  GRIP_W,
  moveTo,
  useRowDrag,
} from "../components/row-drag.tsx";
import {
  CondDialog,
  asConds,
  condTail,
  withConds,
  type Cond,
} from "../config/CondDialog.tsx";
import { useCatalog } from "../config/editors.tsx";
import {
  isAddressDataset,
  isAddressVariable,
  VariableEdit,
} from "../config/VariableEdit.tsx";
import type { Translate } from "../i18n/index.ts";
import { asRecord, asString, setKey, type Doc } from "./config-fields.tsx";

/**
 * Локальный слой маршрута: `waf_local_check` и `waf_local_rate`.
 *
 * Он решает до шины -- разрешающий набор, бан по набору и лимит частоты стоят
 * дешевле опроса инспекторов, и его исход окончателен: 403 или 429 без единого
 * сообщения наружу. Поэтому он не строка в общих параметрах, а секция рядом с
 * инспекцией.
 *
 * Проверки -- одна таблица. Модуль идёт по списку сверху вниз и берёт первую
 * совпавшую строку, каким бы ни было её `action=`
 * (`local/ngx_http_waf_dataset.c`: «порядок -- по объявлению, первое совпадение
 * решает»). Разрешения выше запретов -- соглашение оператора, а не поведение
 * модуля, поэтому порядок здесь задаётся мышью и сохраняется как набран; форма
 * лишь предупреждает, когда запрет закрывает лежащее ниже разрешение.
 *
 * Лимиты -- отдельная таблица, и вот это уже от модуля: сначала все проверки,
 * потом все лимиты (`runtime/ngx_http_waf_handler.c`,
 * `ngx_http_waf_local_checks`), сколько бы строк ни стояло между ними в файле.
 * Одна общая таблица врала бы, будто лимит можно поднять выше проверки.
 *
 * Наследование -- замена ключа целиком: путь, который задаёт свои правила, не
 * получает серверных. Поэтому «задать» на пути открывается копией серверных
 * строк: пустой список означал бы молча снятый бан. Счётчики от копии не
 * двоятся -- подпись правила считается по ключу, rate и burst, без места
 * объявления (`local/ngx_http_waf_rate.c`), то есть одинаковое правило на
 * сервере и на пути -- один счётчик на ноду.
 *
 * Уровня в таблицах нет: сервер и путь показывает один компонент и одни и те
 * же колонки. Унаследованное -- та же таблица, запертая (правило 9
 * `docs/controller/ux/settings-table.md`): вторым видом того же списка --
 * строками директив -- оператор читал одно и то же дважды, а на вопрос «что
 * здесь побежит» строки отвечали хуже таблицы.
 */

type Level = "server" | "location";

export type CheckAction = "block" | "allow" | "wave";

/** `waf_local_check <набор> <значение> action= [response=] [if ...]`. */
export interface LocalCheck {
  dataset: string;
  variable: string;
  action: CheckAction;
  response?: string;
  conds?: Cond[];
}

/** `waf_local_rate <ключ> rate= burst= [count=] [action=] [response=] [hash=md5] [list= ttl=]`. */
export interface LocalRate {
  key: string;
  rate: string;
  burst: number;
  count?: "requests" | "waves" | "frames";
  action?: "block" | "pass";
  response?: string;
  /** Корзина по md5 ключа: длинный ключ влезает в узел shm, в набор уезжает сырой. */
  hash?: boolean;
  list?: string;
  ttl?: string;
  conds?: Cond[];
}

type ListKey = "localChecks" | "localRates";

/**
 * Что можно выбрать на пути. Третьего пункта нет: «снять» -- это «задать» с
 * пустой таблицей, тот же документ (пустой массив), и отдельный пункт назывался
 * бы тем же самым другими словами. На сервере нет и этих двух: наследовать там
 * нечего -- решения в `http {}` компилятор отвергает (`route_at_http`), а
 * пустой список и отсутствие ключа означают одно -- слой не работает.
 */
const KINDS = ["inherit", "override"] as const;
type Kind = (typeof KINDS)[number];

const CHECK_ACTIONS: CheckAction[] = ["allow", "wave", "block"];
const COUNTS = ["requests", "waves", "frames"] as const;
const RATE_ACTIONS = ["block", "pass"] as const;
const RATE_UNITS = ["s", "m"] as const;

/**
 * Единица в `rate=` обязательна: `rate=100` модуль отвергает, потому что
 * толковать её в пользу секунд значило бы лимит в шестьдесят раз жёстче
 * задуманного (`local/ngx_http_waf_rate.c`). Форма проверяет то же самое --
 * до сохранения, а не ошибкой сборки.
 */
const RATE_RE = /^\d+r\/[sm]$/;

/**
 * Единицы скорости -- ровно те две, что принимает модуль: `r/s` и `r/m`
 * (`local/ngx_http_waf_rate.c`, «must end with r/s or r/m»). Часа у директивы
 * нет, и добавлять его пересчётом нельзя: 100 в час -- это 1.67 в минуту, а
 * дробное число директива не берёт.
 */
type RateUnit = "s" | "m";

/** `10r/s` -> число и единица; мусор -- в цифры и секунды. */
function rateParts(value: string): { n: string; unit: RateUnit } {
  const m = /^(\d*)r\/([sm])$/.exec(value.trim());
  if (m === null) {
    return { n: value.replace(/\D/g, ""), unit: "s" };
  }
  return { n: m[1] ?? "", unit: (m[2] as RateUnit | undefined) ?? "s" };
}

function rateOf(n: string, unit: RateUnit): string {
  /* Пустое число -- пустой ключ, а не `r/m`: строка внизу окна показывает то,
     что задано, и «rate=r/m» читалось бы набранным значением. */
  return n === "" ? "" : `${n}r/${unit}`;
}

/*
 * Ширины колонок. Одна константа на колонку: её же получает `TableCols`, и
 * ширина, заданная ячейкой, не расходится с шириной колонки. Колонка, которой
 * ширина не задана (значение проверки, ключ лимита), забирает остаток --
 * остальные тогда не растут вместе с таблицей.
 */
const ACTIONS_W = 104;
const DATASET_W = 150;
const ACTION_W = 96;
const PAGE_W = 130;
const RATE_W = 92;
const BURST_W = 76;
const OUTCOME_W = 140;

const CHECK_COLS = [GRIP_W, DATASET_W, undefined, ACTION_W, PAGE_W, ACTIONS_W];
const RATE_COLS = [GRIP_W, undefined, RATE_W, BURST_W, OUTCOME_W, ACTIONS_W];
const SPAN = 6;

/** Заготовки новой строки: диалог открывается на них, а не на пустоте. */
const NEW_CHECK: LocalCheck = {
  dataset: "",
  variable: "$binary_remote_addr",
  action: "block",
};
const NEW_RATE: LocalRate = { key: "$binary_remote_addr", rate: "10r/s", burst: 20 };

/**
 * Подсказка колонки: сначала ключ директивы, потом что он делает.
 *
 * Подписи колонок -- по-русски: «action=» в шапке ничего не говорит тому, кто
 * пришёл посмотреть, что здесь побежит. Связь с файлом держится подсказкой:
 * без неё «Скорость» не найти в конфиге глазами.
 */
function colHint(key: string, text: string): string {
  return `\`${key}\`\n\n${text}`;
}

function isPass(row: LocalCheck): boolean {
  return row.action === "allow" || row.action === "wave";
}

function asChecks(value: unknown): LocalCheck[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: LocalCheck[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Doc;
    const action: CheckAction =
      rec.action === "allow" || rec.action === "wave"
        ? rec.action
        : "block";
    const row: LocalCheck = {
      dataset: asString(rec.dataset),
      variable: asString(rec.variable),
      action,
    };
    // `response=` есть только у block: разрешающей проверке нечего показать.
    if (action === "block" && asString(rec.response) !== "") {
      row.response = asString(rec.response);
    }
    const conds = asConds(rec.conds);
    if (conds.length > 0) {
      row.conds = conds;
    }
    rows.push(row);
  }
  return rows;
}

function asRates(value: unknown): LocalRate[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: LocalRate[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Doc;
    const row: LocalRate = {
      key: asString(rec.key),
      rate: asString(rec.rate),
      // Умолчание директивы -- корзина без запаса, и это осмысленное значение.
      burst: typeof rec.burst === "number" && Number.isFinite(rec.burst) ? rec.burst : 0,
    };
    if (rec.count === "waves" || rec.count === "requests" || rec.count === "frames") {
      row.count = rec.count;
    }
    if (rec.action === "pass" || rec.action === "block") {
      row.action = rec.action;
    }
    for (const key of ["response", "list", "ttl"] as const) {
      const text = asString(rec[key]);
      if (text !== "") {
        row[key] = text;
      }
    }
    const conds = asConds(rec.conds);
    if (conds.length > 0) {
      row.conds = conds;
    }
    rows.push(row);
  }
  return rows;
}

/** Строка директивы: то, что окажется в файле, слово в слово. */
function checkLine(row: LocalCheck): string {
  const parts = ["waf_local_check", row.dataset, row.variable, `action=${row.action}`];
  if (row.response) {
    parts.push(`response=${row.response}`);
  }
  return `${parts.join(" ")}${condTail(row.conds)};`;
}

function rateLine(row: LocalRate): string {
  const parts = ["waf_local_rate", row.key, `rate=${row.rate}`, `burst=${String(row.burst)}`];
  if (row.count) {
    parts.push(`count=${row.count}`);
  }
  if (row.action) {
    parts.push(`action=${row.action}`);
  }
  if (row.response) {
    parts.push(`response=${row.response}`);
  }
  if (row.hash) {
    parts.push("hash=md5");
  }
  if (row.list) {
    parts.push(`list=${row.list}`);
  }
  if (row.ttl) {
    parts.push(`ttl=${row.ttl}`);
  }
  return `${parts.join(" ")}${condTail(row.conds)};`;
}

export function WafLocal({
  t,
  scope,
  value,
  onChange,
  parent,
  level = "location",
}: {
  t: Translate;
  scope: string;
  value: Doc;
  onChange: (next: Doc) => void;
  /** Документ сервера: на пути он и есть родитель, http решений не хранит. */
  parent?: Doc;
  level?: Level;
}) {
  /*
   * Зона -- условие существования слоя: `waf_local_check` без объявленной
   * `waf_shm_zone` это `nginx -t`, а не тихое «выключено». Компилятор такую
   * конфигурацию теперь не собирает (`shm_zone_required`), и предупредить об
   * этом стоит здесь, где правила заводят, а не в ошибке превью.
   */
  const [shmZone, setShmZone] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchSpaceHttp(scope)
      .then((doc) => {
        if (alive) {
          const zone = asRecord(doc.waf_http).shmZone;
          setShmZone(asString(asRecord(zone).name) !== "");
        }
      })
      .catch(() => {
        if (alive) {
          setShmZone(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [scope]);

  const parentChecks = useMemo(() => asChecks(parent?.localChecks), [parent]);
  const parentRates = useMemo(() => asRates(parent?.localRates), [parent]);

  const checksKind = kindOf(value.localChecks, level);
  const ratesKind = kindOf(value.localRates, level);

  /*
   * Выбор «наследовать / задать» -- только на пути: на сервере наследовать
   * нечего, и список из одного пункта в шапке блока ничего не выбирает.
   */
  const kindOptions: FilterOption<Kind>[] =
    level === "server"
      ? []
      : KINDS.map((item) => ({ value: item, label: t(`routeSettings.kind.${item}`) }));

  const checks = useMemo(
    () => (checksKind === "inherit" ? parentChecks : asChecks(value.localChecks)),
    [checksKind, parentChecks, value.localChecks],
  );
  const rates = useMemo(
    () => (ratesKind === "inherit" ? parentRates : asRates(value.localRates)),
    [ratesKind, parentRates, value.localRates],
  );

  const setKind = (key: ListKey, next: Kind) => {
    if (next === "inherit") {
      onChange(setKey(value, key, undefined));
      return;
    }
    // «Задать» открывается копией родительского: наследование здесь замена, и
    // пустой список означал бы снятый бан, а не «то же самое, но своё».
    const own = key === "localChecks" ? asChecks(value.localChecks) : asRates(value.localRates);
    const from = key === "localChecks" ? parentChecks : parentRates;
    onChange(setKey(value, key, own.length > 0 ? own : from));
  };

  const setChecks = (rows: LocalCheck[]) => {
    onChange(setKey(value, "localChecks", rows));
  };
  const setRates = (rows: LocalRate[]) => {
    onChange(setKey(value, "localRates", rows));
  };

  /*
   * Чем объяснить пустую таблицу. У своего списка это разные состояния:
   * правил нет вовсе -- или они сняты, и тогда в файл уйдёт `none`, снимающий
   * серверные. У чужого -- одно: выше ничего не задано.
   */
  const emptyText = (own: boolean, above: number, off: string, none: string, parentless: string) =>
    !own ? parentless : above > 0 ? off : none;

  const checksEmpty = emptyText(
    checksKind === "override",
    parentChecks.length,
    t("local.off"),
    t("local.emptyChecks"),
    t("local.parentEmptyChecks"),
  );
  const ratesEmpty = emptyText(
    ratesKind === "override",
    parentRates.length,
    t("local.offRate"),
    t("local.emptyRates"),
    t("local.parentEmptyRates"),
  );

  // Блоки идут вплотную: свои поля и разделяющую линию каждый несёт сам.
  return (
    <Stack spacing={0}>
      {shmZone === false && (checks.length > 0 || rates.length > 0) && (
        <SectionNotice>
          <TableNotice
            kind="error"
            title={t("local.noShmTitle")}
            message={t("local.noShm")}
            action={
              <Link component={RouterLink} to="/config">
                {`${t("nav.config")}: ${t("nav.http")}`}
              </Link>
            }
          />
        </SectionNotice>
      )}

      <TableBlock
        title={t("local.checks")}
        label={t("local.checksHint")}
        kindLabel={t("local.kind")}
        kind={checksKind}
        options={kindOptions}
        onKind={(next) => setKind("localChecks", next)}
      >
        <ChecksTable
          t={t}
          rows={checks}
          empty={checksEmpty}
          onChange={checksKind === "override" ? setChecks : undefined}
        />
      </TableBlock>

      <TableBlock
        title={t("local.rates")}
        label={t("local.ratesHint")}
        kindLabel={t("local.kind")}
        kind={ratesKind}
        options={kindOptions}
        onKind={(next) => setKind("localRates", next)}
        last
      >
        <RatesTable
          t={t}
          rows={rates}
          empty={ratesEmpty}
          onChange={ratesKind === "override" ? setRates : undefined}
        />
      </TableBlock>
    </Stack>
  );
}

/**
 * Чем задан ключ. Массив -- своё (в том числе пустое: снять), нет ключа --
 * родительское. На сервере родителя нет, поэтому нет ключа и пустой список
 * значат одно и то же -- «правил нет», и показывать это выбором нечем.
 */
function kindOf(value: unknown, level: Level): Kind {
  if (Array.isArray(value)) {
    return "override";
  }
  return level === "server" ? "override" : "inherit";
}

/**
 * Набор из каталога: имя, набранное руками, ловится только `nginx -t` на ноде.
 *
 * У пункта стоит тип набора. Он не украшение: пара «набор + значение»
 * работает, только если они сошлись -- `ipv4` сравнивается с адресом, а
 * `string` со всем остальным (`VariableEdit` тем же типом сужает список
 * переменных). Без типа в списке оператор узнавал о несовпадении на ноде.
 */
function datasetOptions(
  t: Translate,
  rows:
    | {
        name: string;
        kind: string;
        type?: string;
        in_nginx: boolean;
        active: boolean;
        ttl?: string;
        hash?: boolean;
      }[]
    | undefined,
  current: string,
  onlyActive = false,
  emptyLabel?: string,
): DialogOption<string>[] {
  const picked = (rows ?? [])
    .filter((row) => row.kind === "list" && row.in_nginx !== false)
    .filter((row) => !onlyActive || row.active);
  const names = picked.map((row) => row.name);
  const options: DialogOption<string>[] = [
    { value: "", label: emptyLabel ?? t("local.pickList") },
  ];
  for (const row of picked) {
    /*
     * Откуда берётся состав -- у каждого набора, а не только у динамических.
     * Пометка на половине списка читалась не «этот динамический, а тот
     * локальный», а «про этот что-то известно, про тот нет».
     */
    const marks = [
      row.active ? t("local.dynamicList") : t("local.staticList"),
      row.active && row.ttl !== undefined ? `ttl=${row.ttl}` : "",
      /* Набор хранит md5: сравнение и автобан хешируют сами, оператору знать. */
      row.hash === true ? t("local.hashedList") : "",
    ].filter((item) => item !== "");
    options.push({
      value: row.name,
      label: row.name,
      tag: row.type,
      hint: marks.join(" · "),
    });
  }
  // Имя из документа, которого в каталоге нет, не выбрасывается: иначе ячейка
  // показывала бы пустоту там, где в базе лежит ссылка.
  if (current !== "" && !names.includes(current)) {
    options.push({
      value: current,
      label: current,
      tag: t("local.notDeclaredTag"),
      hint: t("local.notDeclared"),
      missing: true,
    });
  }
  return options;
}

function pageOptions(
  t: Translate,
  rows: { name: string; type?: string; status?: number; page?: string }[] | undefined,
  current: string,
): DialogOption<string>[] {
  const names = (rows ?? []).map((row) => row.name);
  const options: DialogOption<string>[] = [{ value: "", label: t("local.defaultPage") }];
  for (const row of rows ?? []) {
    const marks = [
      row.status === undefined ? "" : String(row.status),
      row.page ?? "",
    ].filter((item) => item !== "");
    options.push({
      value: row.name,
      label: row.name,
      tag: row.type,
      ...(marks.length > 0 ? { hint: marks.join(" · ") } : {}),
    });
  }
  if (current !== "" && !names.includes(current)) {
    options.push({
      value: current,
      label: current,
      tag: t("local.notDeclaredTag"),
      hint: t("local.notDeclared"),
      missing: true,
    });
  }
  return options;
}

function uniq(items: string[]): string[] {
  return [...new Set(items.filter((item) => item !== ""))];
}

/**
 * Кнопки строки правила: настройки (только у лимита), условия, удаление.
 * Сами условия живут в диалоге; на кнопке -- сколько их, в подсказке -- какие.
 *
 * У чужой строки кнопок нет, но заданные условия видны: это часть ответа на
 * «что здесь побежит», и прятать их вместе с правкой значило бы показывать
 * строку работающей на всяком запросе.
 */
function RowActions({
  t,
  conds,
  editable,
  onSettings,
  onCond,
  onDelete,
}: {
  t: Translate;
  conds: Cond[];
  editable: boolean;
  onSettings?: () => void;
  onCond: () => void;
  onDelete: () => void;
}) {
  const count = conds.length;
  return (
    <FilterCell width={ACTIONS_W}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 0.5,
          width: "100%",
        }}
      >
        {editable && onSettings !== undefined && (
          <TableIconButton
            icon={<SettingsOutlinedIcon />}
            tooltip={t("local.rateConfigure")}
            onClick={onSettings}
          />
        )}
        {(editable || count > 0) && (
          <TableIconButton
            icon={
              <Badge
                badgeContent={count}
                color="primary"
                sx={{
                  "& .MuiBadge-badge": {
                    fontSize: "0.6rem",
                    height: 14,
                    minWidth: 14,
                    px: 0.5,
                    top: -2,
                    right: -4,
                  },
                }}
              >
                <FilterAltIcon />
              </Badge>
            }
            disabled={!editable}
            tooltip={count === 0 ? t("local.addCond") : `${t("local.conds")}:${condTail(conds)}`}
            onClick={onCond}
          />
        )}
        {editable && (
          <TableIconButton
            color="error"
            icon={<DeleteIcon />}
            tooltip={t("common.delete")}
            onClick={onDelete}
          />
        )}
      </Box>
    </FilterCell>
  );
}

/**
 * «+» шапки открывает диалог: правило собирается целиком и до записи. Молча
 * добавленная пустая строка выглядела рабочей, а в файл не собиралась --
 * набора у неё не было, у лимита не было ключа.
 */
function AddCell({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <FilterCell width={ACTIONS_W}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
        <TableIconButton color="success" icon={<AddIcon />} tooltip={label} onClick={onAdd} />
      </Box>
    </FilterCell>
  );
}

/** Пустая ячейка колонки: колонка остаётся на месте, когда ей нечего дать. */
function EmptyCell({ width }: { width: number }) {
  return <TableCell sx={{ ...headCellSx, width, minWidth: 0 }} />;
}

/** Ячейка набора и ячейка значения: тип набора решает, что предлагать. */
function DatasetCells({
  t,
  row,
  editable,
  onChange,
}: {
  t: Translate;
  row: LocalCheck;
  editable: boolean;
  onChange: (next: LocalCheck) => void;
}) {
  const catalog = useCatalog();
  const type = catalog?.datasets.find((item) => item.name === row.dataset)?.type;

  return (
    <>
      <FilterSelect
        value={row.dataset}
        width={DATASET_W}
        disabled={!editable}
        options={datasetOptions(t, catalog?.datasets, row.dataset)}
        unset=""
        onChange={(dataset) => onChange({ ...row, dataset })}
      />
      <FilterCell active={row.variable !== ""} grow>
        <VariableEdit
          value={row.variable}
          datasetType={type}
          disabled={!editable}
          onChange={(variable) => onChange({ ...row, variable })}
        />
      </FilterCell>
    </>
  );
}

/**
 * Проверки одной таблицей.
 *
 * Две таблицы -- разрешения отдельно, запреты отдельно -- показывали приоритет,
 * которого в файле нет: между ними оставалась граница, которую нельзя ни
 * увидеть, ни сдвинуть, хотя модуль читает один список сверху вниз. Здесь
 * порядок ровно один, он же порядок строк в конфиге, и меняется он
 * перетаскиванием.
 *
 * `response=` есть только у `block`: разрешающей строке нечего отдавать
 * клиенту, и такую директиву отвергает компилятор (`response_only_with_block`).
 *
 * Нет `onChange` -- список чужой: те же колонки, поля заперты, кнопок строки
 * нет.
 */
function ChecksTable({
  t,
  rows,
  empty,
  onChange,
}: {
  t: Translate;
  rows: LocalCheck[];
  empty: string;
  /** Нет обработчика -- набор наследуется: показываем, но не даём править. */
  onChange?: (next: LocalCheck[]) => void;
}) {
  const catalog = useCatalog();
  const editable = onChange !== undefined;
  const drag = useRowDrag(rows.length, (from, to) => onChange?.(moveTo(rows, from, to)));
  const [condOpen, setCondOpen] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const actionOptions: FilterOption<CheckAction>[] = CHECK_ACTIONS.map((action) => ({
    value: action,
    label: action,
  }));

  /*
   * Запрет выше разрешения -- рабочая конфигурация, а не ошибка: решает первое
   * совпадение, и оператор мог хотеть именно этого. Но чаще это опечатка
   * порядка, поэтому строка предупреждения -- а не молчание и не правка
   * порядка за спиной у того, кто его набрал. У чужой таблицы её нет: строку
   * оттуда не перетащить, а сказано это будет на своём уровне.
   */
  const shadowed = useMemo(() => {
    let blocked = false;
    for (const row of rows) {
      if (isPass(row)) {
        if (blocked) {
          return true;
        }
        continue;
      }
      blocked = true;
    }
    return false;
  }, [rows]);

  // Набор не выбран -- строка не соберётся: `waf_local_check` без имени набора
  // это `nginx -t`, а не «правило про всех».
  const noDataset = rows.some((row) => row.dataset === "");

  const patch = (index: number, edit: (row: LocalCheck) => void) =>
    onChange?.(
      rows.map((item, i) => {
        if (i !== index) {
          return item;
        }
        const next = { ...item };
        edit(next);
        return next;
      }),
    );

  return (
    <Box sx={{ minWidth: 0, overflowX: "hidden" }}>
      <Table
        size="small"
        sx={{
          ...flushTableSx,
          userSelect: drag.drag === null ? "auto" : "none",
        }}
      >
        <TableCols widths={CHECK_COLS} />
        <TableHead>
          <TableRow>
            {/* Шапка колонки хвата объединена с первой подписью: см. HeadCell. */}
            <HeadCell label={t("local.dataset")} colSpan={2} />
            <HeadCell label={t("local.value")} />
            <HeadCell
              label={t("local.decision")}
              help={colHint("action=", t("local.actionHint"))}
            />
            <HeadCell
              label={t("local.page")}
              help={colHint("response=", t("local.responseHint"))}
            />
            {editable ? (
              <AddCell label={t("local.addCheck")} onAdd={() => setAddOpen(true)} />
            ) : (
              <EmptyCell width={ACTIONS_W} />
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow colSpan={SPAN} kind="empty" message={empty} />
          )}
          {rows.map((row, index) => {
            const blocks = row.action === "block";
            return (
              <TableRow
                key={`${row.dataset}-${index}`}
                data-rule=""
                sx={editable ? dragSx(drag, index) : undefined}
              >
                {editable ? (
                  <GripCell index={index} drag={drag} title={t("local.drag")} />
                ) : (
                  <EmptyCell width={GRIP_W} />
                )}
                <DatasetCells
                  t={t}
                  row={row}
                  editable={editable}
                  onChange={(next) =>
                    onChange?.(rows.map((item, i) => (i === index ? next : item)))
                  }
                />
                <FilterSelect
                  value={row.action}
                  width={ACTION_W}
                  disabled={!editable}
                  options={actionOptions}
                  unset="block"
                  onChange={(action) =>
                    patch(index, (next) => {
                      next.action = action;
                      if (action !== "block") {
                        delete next.response;
                      }
                    })
                  }
                />
                {/*
                    У разрешающей строки колонка не исчезает, а запирается:
                    пустое место на её месте читалось бы как «страница по
                    умолчанию», которой у allow нет вовсе.
                  */}
                <FilterSelect
                  value={blocks ? (row.response ?? "") : ""}
                  width={PAGE_W}
                  disabled={!editable || !blocks}
                  options={
                    blocks
                      ? pageOptions(t, catalog?.deny_responses, row.response ?? "")
                      : [{ value: "", label: "—" }]
                  }
                  unset=""
                  onChange={(response) =>
                    patch(index, (next) => {
                      if (response === "") {
                        delete next.response;
                      } else {
                        next.response = response;
                      }
                    })
                  }
                />
                <RowActions
                  t={t}
                  conds={row.conds ?? []}
                  editable={editable}
                  onCond={() => setCondOpen(index)}
                  onDelete={() => onChange?.(rows.filter((_, i) => i !== index))}
                />
              </TableRow>
            );
          })}
          {editable && shadowed && (
            <TableNoticeRow
              colSpan={SPAN}
              severity="warning"
              title={t("local.orderTitle")}
              message={t("local.orderHint")}
            />
          )}
          {noDataset && (
            <TableNoticeRow
              colSpan={SPAN}
              severity="warning"
              title={t("local.badRowTitle")}
              message={t("local.noDataset")}
            />
          )}
        </TableBody>
      </Table>

      {editable && condOpen !== null && rows[condOpen] !== undefined && (
        <CondDialog
          t={t}
          title={rows[condOpen].dataset}
          conds={rows[condOpen].conds ?? []}
          line={(conds) => checkLine(withConds(rows[condOpen] as LocalCheck, conds))}
          onClose={() => setCondOpen(null)}
          onApply={(conds) => {
            onChange?.(rows.map((item, i) => (i === condOpen ? withConds(item, conds) : item)));
            setCondOpen(null);
          }}
        />
      )}

      {editable && addOpen && (
        <CheckDialog
          t={t}
          title={t("local.addCheckTitle")}
          submit={t("common.add")}
          row={NEW_CHECK}
          onClose={() => setAddOpen(false)}
          onApply={(next) => {
            onChange?.([...rows, next]);
            setAddOpen(false);
          }}
        />
      )}
    </Box>
  );
}

/** Что лимит сделает, когда корзина переполнится, -- одной строкой. */
function rateSummary(t: Translate, row: LocalRate): string {
  const parts: string[] = [];
  if (row.count === "waves") {
    parts.push(t("local.sumWaves"));
  } else if (row.count === "frames") {
    parts.push(t("local.sumFrames"));
  }
  if (row.action === "pass") {
    parts.push(t("local.sumPass"));
    return parts.join(" · ");
  }
  parts.push(row.response ? t("local.sumPage", { name: row.response }) : t("local.sumPageDefault"));
  if (row.hash) {
    parts.push(t("local.sumHash"));
  }
  if (row.list) {
    parts.push(
      row.ttl
        ? t("local.sumBanTtl", { list: row.list, ttl: row.ttl })
        : t("local.sumBan", { list: row.list }),
    );
  }
  return parts.join(" · ");
}

/**
 * Подпись счётчика: то, чем модуль отличает счётчики одного правила от чужих
 * (`local/ngx_http_waf_rate.c`, `rule->sig`). Место объявления в неё не
 * входит, условия `if` -- тоже: две строки с одинаковыми ключом, `rate=`,
 * `burst=` и `count=` считают в одну корзину, и запрос, попавший в обе,
 * начисляется дважды.
 */
function rateSig(row: LocalRate): string {
  return [row.key.trim(), row.rate.trim(), String(row.burst), row.count ?? "requests"].join("|");
}

/** Чем назвать строку в предупреждении: ключом, а без ключа -- номером. */
function rateLabel(row: LocalRate, index: number): string {
  return row.key.trim() === "" ? `#${String(index + 1)}` : row.key.trim();
}

/**
 * Лимиты частоты. Смотрятся после всех проверок, поэтому разрешающий набор
 * выключает лимит для своих, а не наоборот.
 *
 * В строке -- то, чем лимиты различаются между собой: ключ, скорость, запас.
 * Остальные пять ключей директивы (`count=`, `action=`, `response=`, `list=`,
 * `ttl=`) правятся в диалоге: девять колонок в карточку не помещались, а
 * половина из них у обычного лимита пуста. Что в них выбрано, читается в
 * колонке решения -- открывать диалог, чтобы это узнать, не приходится.
 *
 * Тот же диалог заводит новую строку: у лимита восемь ключей с единицами и
 * умолчаниями, и собрать его надо целиком до записи, а не доводить пустую
 * строку в таблице.
 */
function RatesTable({
  t,
  rows,
  empty,
  onChange,
}: {
  t: Translate;
  rows: LocalRate[];
  empty: string;
  /** Нет обработчика -- набор наследуется: показываем, но не даём править. */
  onChange?: (next: LocalRate[]) => void;
}) {
  const catalog = useCatalog();
  const editable = onChange !== undefined;
  const drag = useRowDrag(rows.length, (from, to) => onChange?.(moveTo(rows, from, to)));
  const [open, setOpen] = useState<number | null>(null);
  const [condOpen, setCondOpen] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const patch = (index: number, edit: (row: LocalRate) => void) =>
    onChange?.(
      rows.map((item, i) => {
        if (i !== index) {
          return item;
        }
        const next = { ...item };
        edit(next);
        return next;
      }),
    );

  /*
   * Что не соберётся на ноде. Проверяет то же, что валидатор контроллера
   * (`compile/waf-validate.ts`), но до сохранения: ошибка сборки приходит
   * позже и не показывает, какая именно строка её вызвала.
   */
  const broken = uniq(
    rows
      .filter((row) => row.key.trim() === "" || !RATE_RE.test(row.rate.trim()))
      .map(rateLabel),
  );

  // Корзина одна на подпись: одинаковые строки не «дублируют лимит», а считают
  // каждый запрос дважды -- лимит срабатывает вдвое раньше набранного.
  const twins = useMemo(() => {
    const seen = new Map<string, number>();
    for (const row of rows) {
      const sig = rateSig(row);
      seen.set(sig, (seen.get(sig) ?? 0) + 1);
    }
    return uniq(
      rows.filter((row) => (seen.get(rateSig(row)) ?? 0) > 1).map((row, index) => rateLabel(row, index)),
    );
  }, [rows]);

  // Автобан без срока: `ttl=` нет ни у правила, ни у набора -- `nginx -t`.
  const banNoTtl = uniq(
    rows
      .filter((row) => {
        if (!row.list || row.ttl) {
          return false;
        }
        const ds = catalog?.datasets.find((item) => item.name === row.list);
        return ds !== undefined && asString(ds.ttl) === "";
      })
      .map((row) => row.list ?? ""),
  );

  const editing = open === null ? undefined : rows[open];

  return (
    <Box sx={{ minWidth: 0, overflowX: "hidden" }}>
      <Table
        size="small"
        sx={{
          ...flushTableSx,
          userSelect: drag.drag === null ? "auto" : "none",
        }}
      >
        <TableCols widths={RATE_COLS} />
        <TableHead>
          <TableRow>
            {/* Шапка колонки хвата объединена с первой подписью: см. HeadCell. */}
            <HeadCell label={t("local.key")} colSpan={2} />
            <HeadCell
              label={t("local.speed")}
              help={colHint("rate=", t("local.rateFieldHint"))}
            />
            <HeadCell
              label={t("local.reserve")}
              help={colHint("burst=", t("local.burstHint"))}
            />
            <HeadCell label={t("local.outcome")} help={t("local.rateHint")} />
            {editable ? (
              <AddCell label={t("local.addRate")} onAdd={() => setAddOpen(true)} />
            ) : (
              <EmptyCell width={ACTIONS_W} />
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow colSpan={SPAN} kind="empty" message={empty} />
          )}
          {rows.map((row, index) => (
            <TableRow
              key={`${row.key}-${index}`}
              data-rule=""
              sx={editable ? dragSx(drag, index) : undefined}
            >
              {editable ? (
                <GripCell index={index} drag={drag} title={t("local.drag")} />
              ) : (
                <EmptyCell width={GRIP_W} />
              )}
              <FilterCell active={row.key !== ""} grow>
                <VariableEdit
                  value={row.key}
                  disabled={!editable}
                  onChange={(key) =>
                    patch(index, (next) => {
                      next.key = key;
                    })
                  }
                />
              </FilterCell>
              <FilterText
                value={row.rate}
                placeholder="10r/s"
                width={RATE_W}
                mono
                plain
                disabled={!editable}
                onChange={(rate) =>
                  patch(index, (next) => {
                    next.rate = rate;
                  })
                }
              />
              <DraftCell
                value={String(row.burst)}
                placeholder="0"
                width={BURST_W}
                disabled={!editable}
                onChange={(raw) =>
                  patch(index, (next) => {
                    const n = Number(raw.trim());
                    next.burst = raw.trim() === "" || !Number.isInteger(n) || n < 0 ? 0 : n;
                  })
                }
              />
              <TableCell
                title={rateSummary(t, row)}
                sx={{
                  py: 0,
                  height: HEAD_H,
                  px: CELL_PX,
                  maxWidth: 0,
                  fontSize: "0.75rem",
                  color: "text.secondary",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {rateSummary(t, row)}
              </TableCell>
              <RowActions
                t={t}
                conds={row.conds ?? []}
                editable={editable}
                onSettings={() => setOpen(index)}
                onCond={() => setCondOpen(index)}
                onDelete={() => onChange?.(rows.filter((_, i) => i !== index))}
              />
            </TableRow>
          ))}
          {broken.length > 0 && (
            <TableNoticeRow
              colSpan={SPAN}
              severity="warning"
              title={t("local.badRowTitle")}
              message={t("local.badRate", { keys: broken.join(", ") })}
            />
          )}
          {twins.length > 0 && (
            <TableNoticeRow
              colSpan={SPAN}
              severity="warning"
              title={t("local.dupRuleTitle")}
              message={t("local.dupRule", { keys: twins.join(", ") })}
            />
          )}
          {banNoTtl.length > 0 && (
            <TableNoticeRow
              colSpan={SPAN}
              severity="warning"
              title={t("local.banNoTtlTitle")}
              message={t("local.banNoTtl", { lists: banNoTtl.join(", ") })}
            />
          )}
        </TableBody>
      </Table>

      {editable && condOpen !== null && rows[condOpen] !== undefined && (
        <CondDialog
          t={t}
          title={rows[condOpen].key}
          conds={rows[condOpen].conds ?? []}
          line={(conds) => rateLine(withConds(rows[condOpen] as LocalRate, conds))}
          onClose={() => setCondOpen(null)}
          onApply={(conds) => {
            onChange?.(rows.map((item, i) => (i === condOpen ? withConds(item, conds) : item)));
            setCondOpen(null);
          }}
        />
      )}

      {editable && open !== null && editing !== undefined && (
        <RateDialog
          t={t}
          title={t("local.rateSettings", { key: editing.key })}
          submit={t("common.apply")}
          row={editing}
          onClose={() => setOpen(null)}
          onApply={(next) => {
            onChange?.(rows.map((item, i) => (i === open ? next : item)));
            setOpen(null);
          }}
        />
      )}

      {editable && addOpen && (
        <RateDialog
          t={t}
          title={t("local.addRateTitle")}
          submit={t("common.add")}
          row={NEW_RATE}
          onClose={() => setAddOpen(false)}
          onApply={(next) => {
            onChange?.([...rows, next]);
            setAddOpen(false);
          }}
        />
      )}
    </Box>
  );
}

/**
 * Правило проверки целиком: набор, значение, решение и страница.
 *
 * Диалог заводит строку, а не доводит её в таблице: пустая строка с
 * невыбранным набором выглядела рабочей, а в файл не собиралась
 * (`nginx -t`: набор -- первое слово директивы). Внизу -- строка, которая
 * уйдёт в конфиг.
 */
function CheckDialog({
  t,
  title,
  submit,
  row,
  onClose,
  onApply,
}: {
  t: Translate;
  title: string;
  submit: string;
  row: LocalCheck;
  onClose: () => void;
  onApply: (next: LocalCheck) => void;
}) {
  const catalog = useCatalog();
  const [draft, setDraft] = useState<LocalCheck>(row);

  const type = catalog?.datasets.find((item) => item.name === draft.dataset)?.type;
  const blocks = draft.action === "block";
  const variable = draft.variable.trim();

  /*
   * Пара «набор адресов + строка запроса» собирается в файл и проходит
   * `nginx -t`, но не совпадает ни разу: набор сравнивает адреса. Ошибка
   * заводится сменой набора уже после выбора значения, поэтому ловится она
   * здесь, а не сужением списка -- список сужается только для нового выбора.
   */
  const mismatch =
    draft.dataset !== "" &&
    variable !== "" &&
    isAddressDataset(type) &&
    !isAddressVariable(variable);

  const ready = draft.dataset !== "" && variable !== "" && !mismatch;

  const patch = (edit: (next: LocalCheck) => void) => {
    const next = { ...draft };
    edit(next);
    setDraft(next);
  };

  /*
   * Фраза о попадании и промахе. Незаполненное называется словом («значение»,
   * «набор»), а не пустотой: окно открывается пустым, и фраза с дырами вместо
   * подлежащего не читается вовсе.
   */
  const value = variable === "" ? t("local.someValue") : variable;
  const dataset = draft.dataset === "" ? t("local.someList") : draft.dataset;
  const outcome =
    draft.action === "allow"
      ? t("local.outAllow")
      : draft.action === "wave"
        ? t("local.outWave")
        : draft.response
          ? t("local.outBlock", { page: draft.response })
          : t("local.outBlockDefault");

  return (
    <Modal
      onClose={onClose}
      title={title}
      notice={
        mismatch
          ? {
              severity: "warning",
              title: t("local.mismatchTitle"),
              text: t("local.mismatchText", {
                dataset: draft.dataset,
                type: type ?? "",
                value: variable,
              }),
            }
          : null
      }
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={() => onApply(draft)}>
            {submit}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2}>
          {/*
            Порядок полей -- порядок слов директивы: набор, значение, ключи.
            Так окно читается тем же, чем станет, а строка внизу подтверждает
            это буквально.
          */}
          <DialogPick
            mono
            label={t("local.checkWhere")}
            hint={t("local.datasetHint")}
            value={draft.dataset}
            options={datasetOptions(t, catalog?.datasets, draft.dataset)}
            onChange={(name) =>
              patch((next) => {
                next.dataset = name;
              })
            }
          />

          <DialogFrame label={t("local.checkWhat")} hint={t("local.valueHint")}>
            <VariableEdit
              value={draft.variable}
              datasetType={type}
              onChange={(variable) =>
                patch((next) => {
                  next.variable = variable;
                })
              }
            />
          </DialogFrame>

          {/*
            Два ключа в строку: `response=` есть только у `block`, и рядом
            видно, что запирает соседнее поле.
          */}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Box sx={{ width: 180, flexShrink: 0 }}>
              <DialogPick
                mono
                label="action="
                hint={t("local.actionHint")}
                value={draft.action}
                options={CHECK_ACTIONS.map((action) => ({ value: action, label: action }))}
                onChange={(action) =>
                  patch((next) => {
                    next.action = action;
                    // `response=` есть только у block: allow отдавать нечего.
                    if (action !== "block") {
                      delete next.response;
                    }
                  })
                }
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <DialogPick
                mono
                label="response="
                hint={blocks ? t("local.responseHint") : t("local.passNoPageCheck")}
                disabled={!blocks}
                value={blocks ? (draft.response ?? "") : ""}
                options={
                  blocks
                    ? pageOptions(t, catalog?.deny_responses, draft.response ?? "")
                    : [{ value: "", label: t("common.none") }]
                }
                onChange={(response) =>
                  patch((next) => {
                    if (response === "") {
                      delete next.response;
                    } else {
                      next.response = response;
                    }
                  })
                }
              />
            </Box>
          </Stack>

          {/*
            Обещать попадание у несходящейся пары нельзя: фраза «есть в наборе»
            была бы прямой неправдой -- в этом наборе такого значения не
            окажется никогда.
          */}
          <DialogNote
            title={t("local.meansTitle")}
            hint={t("local.meansHint")}
            lines={
              mismatch
                ? [{ text: t("local.meansNever", { dataset }), muted: true }]
                : [
                    { text: t("local.meansHit", { value, dataset, outcome }) },
                    { text: t("local.meansMiss", { value, dataset }), muted: true },
                  ]
            }
          />

          <DialogLines title={t("local.lineTitle")} lines={[checkLine(draft)]} />
        </Stack>
    </Modal>
  );
}

/**
 * Лимит целиком: ключ, скорость, запас и остальные пять ключей директивы.
 *
 * Одно окно и на правку (шестерёнка строки), и на новую строку («+» шапки):
 * это одна и та же запись, и два разных вида для неё означали бы, что заводят
 * и правят по-разному. Правка держится черновиком до «Применить»: строка уже
 * лежит в несохранённом документе карточки, и закрыть окно, ничего не тронув,
 * оператор должен уметь. Внизу -- строка, которая уйдёт в конфиг: у директивы
 * с шестью необязательными ключами это единственный способ увидеть результат
 * целиком.
 */
function RateDialog({
  t,
  title,
  submit,
  row,
  onClose,
  onApply,
}: {
  t: Translate;
  title: string;
  submit: string;
  row: LocalRate;
  onClose: () => void;
  onApply: (next: LocalRate) => void;
}) {
  const catalog = useCatalog();
  const [draft, setDraft] = useState<LocalRate>(row);
  /*
   * Запас набирается строкой: модель держит его числом, и контролируемое
   * значение съедало бы пустое поле -- стереть «20», чтобы набрать «5»,
   * было нельзя.
   */
  const [burst, setBurst] = useState(String(row.burst));
  /* Скорость -- по той же причине строкой: стереть «10», чтобы набрать «5». */
  const [rateNum, setRateNum] = useState(() => rateParts(row.rate).n);
  const [rateUnit, setRateUnit] = useState<RateUnit>(() => rateParts(row.rate).unit);

  const pass = draft.action === "pass";
  const list = catalog?.datasets.find((item) => item.name === draft.list);
  const listTtl = asString(list?.ttl);
  const key = draft.key.trim();
  const banned = draft.list !== undefined && draft.list !== "";

  /*
   * Два запрета автобана, и оба ловятся здесь, а не на ноде.
   *
   * Срок: `list=` без `ttl=` берёт срок набора, а если его нет ни там, ни там
   * -- `nginx -t` отвергает строку (docs/directives/list/dataset.md). Роняется
   * при этом весь шаблон, поэтому оставлять такое до рассылки нельзя.
   *
   * Тип: набор адресов принимает только адрес или префикс, и ключ-строка в
   * него не ляжет -- бан будет уходить в никуда молча.
   */
  const ttlMissing = banned && (draft.ttl ?? "").trim() === "" && listTtl === "";
  const listMismatch = banned && isAddressDataset(list?.type) && !isAddressVariable(key);

  const ready =
    key !== "" && RATE_RE.test(draft.rate.trim()) && !ttlMissing && !listMismatch;

  const notice = ttlMissing
    ? {
        severity: "warning" as const,
        title: t("local.ttlMissingTitle"),
        text: t("local.ttlMissingText", { list: draft.list ?? "" }),
      }
    : listMismatch
      ? {
          severity: "warning" as const,
          title: t("local.listMismatchTitle"),
          text: t("local.listMismatchText", {
            list: draft.list ?? "",
            type: list?.type ?? "",
            key,
          }),
        }
      : null;

  const patch = (edit: (next: LocalRate) => void) => {
    const next = { ...draft };
    edit(next);
    setDraft(next);
  };

  return (
    <Modal
      onClose={onClose}
      title={title}
      notice={notice}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={() => onApply(draft)}>
            {submit}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2}>
          {/*
            Восемь ключей директивы читаются тремя вопросами, и поля стоят
            так же: чем считаем -- с какой скоростью -- что делаем на
            превышении. В столбик они занимали два экрана, и `ttl=` уезжал от
            своего `list=`, хотя без него не существует.
          */}
          <DialogFrame label={t("local.key")} hint={t("local.keyHint")}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", width: "100%", minWidth: 0 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <VariableEdit
                  value={draft.key}
                  onChange={(key) =>
                    patch((next) => {
                      next.key = key;
                    })
                  }
                />
              </Box>
              {/*
                Корзина по md5 ключа. Галочка рядом с ключом, а не среди полей
                исхода: она про то, чем считаем, а не что делаем на превышении.
                Адресу хеш не нужен -- у него и так 4 или 16 байт.
              */}
              {!isAddressVariable(key) && (
                <Tooltip arrow placement="top" title={t("local.hashHint")}>
                  <FormControlLabel
                    sx={{ mr: 0, flexShrink: 0 }}
                    label={t("local.hashLabel")}
                    slotProps={{ typography: { sx: { fontSize: "0.78rem", fontFamily: "monospace" } } }}
                    control={
                      <Checkbox
                        size="small"
                        checked={draft.hash === true}
                        sx={{ p: 0.5 }}
                        onChange={(_, checked) =>
                          patch((next) => {
                            if (checked) {
                              next.hash = true;
                            } else {
                              delete next.hash;
                            }
                          })
                        }
                      />
                    }
                  />
                </Tooltip>
              )}
            </Stack>
          </DialogFrame>

          <Stack direction="row" spacing={1.5}>
            <Box sx={{ flex: 1.4, minWidth: 0 }}>
              <DialogUnit
                label="rate="
                hint={t("local.rateFieldHint")}
                value={rateNum}
                unit={rateUnit}
                units={RATE_UNITS.map((item) => ({
                  value: item,
                  label: t(`local.rateUnit.${item}`),
                }))}
                placeholder="10"
                onChange={(n) => {
                  setRateNum(n);
                  patch((next) => {
                    next.rate = rateOf(n, rateUnit);
                  });
                }}
                onUnit={(unit) => {
                  setRateUnit(unit);
                  patch((next) => {
                    next.rate = rateOf(rateNum, unit);
                  });
                }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <DialogInput
                label="burst="
                hint={t("local.burstHint")}
                value={burst}
                placeholder="0"
                onChange={(raw) => {
                  setBurst(raw);
                  patch((next) => {
                    const n = Number(raw.trim());
                    next.burst = raw.trim() === "" || !Number.isInteger(n) || n < 0 ? 0 : n;
                  });
                }}
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <DialogPick
                mono
                label="count="
                hint={t("local.countHint")}
                value={draft.count ?? "requests"}
                options={COUNTS.map((item) => ({ value: item, label: item }))}
                onChange={(count) =>
                  patch((next) => {
                    // `requests` -- умолчание директивы, ключом не пишем.
                    if (count === "requests") {
                      delete next.count;
                    } else {
                      next.count = count === "frames" ? "frames" : "waves";
                    }
                  })
                }
              />
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5}>
            <Box sx={{ width: 180, flexShrink: 0 }}>
              <DialogPick
                mono
                label="action="
                hint={t("local.rateActionHint")}
                value={draft.action ?? "block"}
                options={RATE_ACTIONS.map((item) => ({ value: item, label: item }))}
                onChange={(action) =>
                  patch((next) => {
                    if (action === "block") {
                      delete next.action;
                      return;
                    }
                    next.action = "pass";
                    /*
                     * `action=pass` вместе с `list=` модуль отвергает: банить
                     * ключ и одновременно пропускать его -- противоречие.
                     * Страницы у пропускающего лимита тоже нет: клиенту ничего
                     * не отдаётся.
                     */
                    delete next.list;
                    delete next.ttl;
                    delete next.response;
                  })
                }
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <DialogPick
                mono
                label="response="
                hint={pass ? t("local.passNoPage") : t("local.rateResponseHint")}
                disabled={pass}
                value={draft.response ?? ""}
                options={pageOptions(t, catalog?.deny_responses, draft.response ?? "")}
                onChange={(response) =>
                  patch((next) => {
                    if (response === "") {
                      delete next.response;
                    } else {
                      next.response = response;
                    }
                  })
                }
              />
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5}>
            {/*
              Автобан пишет ключ в overlay набора и публикует событие на шину:
              internal-набор держит состав в конфиге, писать туда некуда,
              поэтому здесь только active.
            */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <DialogPick
                mono
                label="list="
                hint={pass ? t("local.passNoBan") : t("local.listHint")}
                disabled={pass}
                value={draft.list ?? ""}
                options={datasetOptions(
                  t,
                  catalog?.datasets,
                  draft.list ?? "",
                  true,
                  t("local.noBan"),
                )}
                onChange={(list) =>
                  patch((next) => {
                    if (list === "") {
                      delete next.list;
                      delete next.ttl;
                    } else {
                      next.list = list;
                    }
                  })
                }
              />
            </Box>
            {/*
              Срок есть только у автобана: `ttl=` без `list=` модуль отвергает.
              Пусто при выбранном наборе -- берётся его собственный ttl; нет и
              там -- строка не соберётся.
            */}
            <Box sx={{ width: 180, flexShrink: 0 }}>
              <DialogInput
                label="ttl="
                hint={t("local.ttlHint")}
                value={draft.ttl ?? ""}
                disabled={draft.list === undefined}
                placeholder={
                  draft.list === undefined
                    ? "—"
                    : listTtl !== ""
                      ? listTtl
                      : t("local.ttlNeeded")
                }
                onChange={(raw) =>
                  patch((next) => {
                    const ttl = raw.trim();
                    if (ttl === "") {
                      delete next.ttl;
                    } else {
                      next.ttl = ttl;
                    }
                  })
                }
              />
            </Box>
          </Stack>

          <DialogLines title={t("local.lineTitle")} lines={[rateLine(draft)]} />
        </Stack>
    </Modal>
  );
}
