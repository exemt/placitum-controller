/*
  `error_log` и `access_log` блока -- раздел «Логи» вкладки nginx.

  Два блока одной секции, каждый -- заголовок с селектором и таблица под ним,
  как фазы инспекторов в «Параметрах защиты» (`pages/WafProtect.tsx`). Раньше
  это были две строки таблицы настроек с подстроками внутри ячейки: у
  приёмника, тега, формата и условия не было своих заголовков, селектор
  приёмника стоял без подписи, а `access_log off` -- то, чем глушат лог на
  `= /healthz`, -- после переезда из «Основных настроек» в матрицу потерялся
  вовсе: кнопку «снять» давала строка наследования, а не редактор.

  Состояние `access_log` -- селектор в шапке блока: наследовать (на http --
  умолчание nginx), `off`, свой список. Таблица одна на все три: у своего
  списка строки правятся, у остальных вместо строк -- заметка, почему их нет.

  `error_log` -- одна строка: ключ один, и список тут не нужен. «Не задано» в
  приёмнике значит «взять у родителя» на сервере и пути и «умолчание nginx»
  на http -- подпись у первого пункта своя на каждом уровне.

  Приёмник добавляется диалогом ([AddDialog]) -- у «+» и у пункта «задать»:
  в таблице адрес спрятан за словом «сокет агента», а формат и условие стоят
  через две колонки, и строка, дописанная молча, показывала себя уже после
  нажатия. Правится же приёмник на месте, в своей строке: правка -- это одно
  поле, а не выбор всего приёмника заново.

  Приёмник выбирается, а не набирается: умолчание -- сокет агента, откуда
  строки попадают в раздел «Логи» (`AGENT_LOG_SOCK`, он же `log_sock` в
  agent.conf). Тег сокета становится там колонкой «сервис». Файл виден только
  на самой ноде. Чужой syslog (`server=10.0.0.1:514`) разбору не поддаётся и
  правится строкой целиком -- пункт «своё» показывается, только когда такое
  значение уже стоит.
*/
import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import {
  DraftCell,
  EditorCellScope,
  FilterCell,
  FilterSelect,
  TableIconButton,
  TableNoticeRow,
  type FilterOption,
} from "../components/data-table/index.ts";
import {
  DialogLines,
  DialogRow,
  DialogSelect,
  DialogText,
  dialogLabelSx,
} from "../components/dialog-kit.tsx";
import { Modal } from "../components/Modal.tsx";
import { dataActionCellSx } from "../components/settings-table.tsx";
import { flushTableSx, headCellSx, HeadCell, TableBlock } from "../components/table-block.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import { useInherited } from "../components/fields.tsx";
import { useCatalog } from "./editors.tsx";
import type { Doc } from "./inherit.ts";
import type { NginxLevel } from "./nginx-directives.tsx";

const DEST_W = 150;
const LEVEL_W = 110;
const FORMAT_W = 150;
const COND_W = 160;
const ACTIONS_W = 48;

/**
 * Сокет агента ноды. То же значение, что `log_sock` в agent.conf
 * (`nginx/agent/agent.conf`): агент открывает его сам, nginx только пишет.
 * Расходятся -- строки уходят в никуда, поэтому умолчание одно на оба конца.
 */
export const AGENT_LOG_SOCK = "/var/run/waf/log.sock";

/**
 * Тег syslog -- это колонка `service` в waf.log. Один на оба лога: строка
 * запроса и строка ошибки приезжают от одного nginx, а различает их уровень.
 */
const DEFAULT_TAG = "nginx";

/** Куда пишет файловый приёмник, когда его выбрали вместо сокета. */
const FILE_ACCESS = "/var/log/nginx/access.log";
const FILE_ERROR = "/var/log/nginx/error.log";

const ERROR_LEVELS = [
  "debug",
  "info",
  "notice",
  "warn",
  "error",
  "crit",
  "alert",
  "emerg",
] as const;

/**
 * `nohostname` -- не украшение: без него в датаграмме между отметкой времени
 * и тегом встаёт имя хоста, и в контейнере это случайный hex идентификатора.
 * Кто записал строку, контур и так знает -- это нода, чей агент её принял.
 */
function syslogPath(sock: string, tag: string): string {
  const at = sock.trim() === "" ? AGENT_LOG_SOCK : sock.trim();
  const name = tag.trim() === "" ? DEFAULT_TAG : tag.trim();

  return `syslog:server=unix:${at},tag=${name},nohostname`;
}

/**
 * Разбор обратно. Чужой адрес сокета сохраняется как есть: контур мог
 * переопределить `log_sock`, и подменять его умолчанием при первом же
 * открытии формы значило бы тихо сломать ноду.
 */
function syslogOf(path: string): { sock: string; tag: string } | null {
  if (!path.startsWith("syslog:")) {
    return null;
  }

  let sock = "";
  let tag = DEFAULT_TAG;

  for (const part of path.slice("syslog:".length).split(",")) {
    if (part.startsWith("server=unix:")) {
      sock = part.slice("server=unix:".length);
    } else if (part.startsWith("tag=")) {
      tag = part.slice("tag=".length);
    }
  }

  return sock === "" ? null : { sock, tag };
}

type DestKind = "" | "socket" | "file" | "other";

function destOf(path: string): DestKind {
  if (path.trim() === "") {
    return "";
  }
  if (syslogOf(path) !== null) {
    return "socket";
  }
  return path.startsWith("syslog:") ? "other" : "file";
}

/** Пункты селектора приёмника. «Не задано» -- только там, где его можно выбрать. */
function destOptions(
  t: Translate,
  kind: DestKind,
  unsetLabel: string | undefined,
): FilterOption<DestKind>[] {
  const items: FilterOption<DestKind>[] = [];
  if (unsetLabel !== undefined) {
    items.push({ value: "", label: unsetLabel });
  }
  items.push({ value: "socket", label: t("logs.dest.socket") });
  items.push({ value: "file", label: t("logs.dest.file") });
  if (kind === "other") {
    items.push({ value: "other", label: t("logs.dest.other") });
  }
  return items;
}

/** Смена приёмника: сокет получает тег и адрес, файл -- путь по умолчанию. */
function switchDest(current: string, next: DestKind, file: string): string {
  const sys = syslogOf(current);
  if (next === "socket") {
    return syslogPath(sys?.sock ?? AGENT_LOG_SOCK, sys?.tag ?? DEFAULT_TAG);
  }
  if (next === "file") {
    return file;
  }
  return "";
}

/**
 * Две ячейки приёмника: вид и адрес. У сокета в адресе стоит тег (он же
 * «сервис» в журнале), у файла -- путь, у чужого syslog -- строка целиком.
 * Одно поле на всё, потому что в модели это одно значение.
 *
 * Чужой адрес сокета показывается рядом с тегом приглушённо: тег без адреса
 * не отвечает на «куда именно», а расхождение с `log_sock` ноды -- ровно тот
 * случай, когда строки исчезают молча. Штатный адрес не повторяется в каждой
 * строке -- он в подсказке колонки.
 */
function DestCells({
  t,
  value,
  file,
  unsetLabel,
  disabled,
  onChange,
}: {
  t: Translate;
  value: string;
  file: string;
  /** Подпись пункта «не задано»; без неё пункта нет. */
  unsetLabel?: string;
  disabled?: boolean;
  onChange: (next: string) => void;
}) {
  const sys = syslogOf(value);
  const kind = destOf(value);
  const foreignSock = sys !== null && sys.sock !== AGENT_LOG_SOCK;

  return (
    <>
      <FilterSelect
        value={kind}
        unset=""
        width={DEST_W}
        disabled={disabled}
        placeholder={t("logs.dest.label")}
        options={destOptions(t, kind, unsetLabel)}
        onChange={(next) => {
          if (next !== kind) {
            onChange(switchDest(value, next, file));
          }
        }}
      />
      {foreignSock ? (
        <FilterCell>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0, width: "100%" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <InlineInput
                value={sys.tag}
                placeholder={DEFAULT_TAG}
                disabled={disabled}
                onChange={(raw) => onChange(syslogPath(sys.sock, raw))}
              />
            </Box>
            <Box
              component="span"
              sx={{
                fontSize: "0.68rem",
                fontFamily: "monospace",
                color: "text.secondary",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {sys.sock}
            </Box>
          </Stack>
        </FilterCell>
      ) : (
        <DraftCell
          mono
          disabled={disabled || kind === ""}
          value={kind === "" ? "" : sys !== null ? sys.tag : value}
          placeholder={kind === "" ? "" : sys !== null ? DEFAULT_TAG : file}
          onChange={(raw) =>
            onChange(sys !== null ? syslogPath(sys.sock, raw) : raw)
          }
        />
      )}
    </>
  );
}

/** Поле адреса внутри составной ячейки -- тот же вид, что у `DraftCell`. */
function InlineInput({
  value,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <Box
      component="input"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      sx={{
        width: "100%",
        border: 0,
        outline: 0,
        background: "transparent",
        color: "inherit",
        fontFamily: "monospace",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        p: 0,
      }}
    />
  );
}

// -- error_log ---------------------------------------------------------------

function errorRow(value: unknown): Doc {
  // Строка -- дореформенная запись «путь [уровень]» целиком; показываем как путь.
  return (
    value !== null && typeof value === "object"
      ? value
      : typeof value === "string" && value !== ""
        ? { path: value }
        : {}
  ) as Doc;
}

function ErrorLogBlock({
  t,
  level,
  value,
  onChange,
}: {
  t: Translate;
  level: NginxLevel;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const own = errorRow(value);
  /*
   * Ключа нет -- строка показывает родительский error_log запертым, с
   * пометкой откуда. Любая правка заводит свой ключ: редактор начинает с
   * того, что действует сейчас, а не с пустого места.
   */
  const inherited = useInherited("errorLog");
  const inheriting = Object.keys(own).length === 0 && inherited !== null;
  const row = inheriting ? errorRow(inherited.value) : own;
  const path = typeof row.path === "string" ? row.path : "";
  const lvl = typeof row.level === "string" ? row.level : "";
  const fromTag = inheriting ? ` (${inherited.from})` : "";

  /* Пустой объект не хранится вовсе: пустой ключ в jsonb -- ключ, которого нет. */
  const commit = (next: Doc) => {
    onChange(Object.keys(next).length === 0 ? undefined : next);
  };

  return (
    <TableBlock title={"error_log" + fromTag} label={t("logs.errorHint")}>
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("logs.dest.label")} help={t("logs.destHelp")} width={DEST_W} />
            <HeadCell label={t("logs.target")} help={t("logs.targetHelp")} />
            <HeadCell label={t("logs.level")} help={t("logs.levelHelp")} width={LEVEL_W} />
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow sx={inheriting ? { opacity: 0.62 } : undefined}>
            <DestCells
              t={t}
              value={path}
              file={FILE_ERROR}
              unsetLabel={level === "http" ? t("common.default") : t("routeSettings.kind.inherit")}
              onChange={(next) => {
                // «Наследовать» -- это отсутствие ключа целиком: уровень без
                // приёмника печатать нечего, а хранить его значило бы держать
                // ключ, который выглядит как наследование.
                if (next === "") {
                  onChange(undefined);
                  return;
                }
                commit({ ...row, path: next });
              }}
            />
            <FilterSelect
              value={lvl}
              unset=""
              width={LEVEL_W}
              placeholder={t("logs.level")}
              options={[
                { value: "", label: "error" },
                ...ERROR_LEVELS.map((item) => ({ value: item, label: item })),
              ]}
              onChange={(next) => {
                const patch = { ...row };
                if (next === "") {
                  delete patch.level;
                } else {
                  patch.level = next;
                }
                commit(patch);
              }}
            />
          </TableRow>
        </TableBody>
      </Table>
    </TableBlock>
  );
}

// -- access_log --------------------------------------------------------------

type Entry = {
  path: string;
  format?: string;
  condition?: string;
  buffer?: string;
  flush?: string;
};

type ListKind = "inherit" | "off" | "override";

function kindOf(value: unknown): ListKind {
  if (value === "off") {
    return "off";
  }
  if (Array.isArray(value) || (typeof value === "string" && value !== "")) {
    return "override";
  }
  return "inherit";
}

function asEntries(value: unknown): Entry[] {
  // Строка -- дореформенная запись: хвост директивы целиком. Показать её как
  // путь честнее, чем пустое поле поверх живого значения.
  if (typeof value === "string" && value !== "" && value !== "off") {
    return [{ path: value }];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((row): row is Doc => row !== null && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      path: typeof row.path === "string" ? row.path : "",
      format: typeof row.format === "string" ? row.format : undefined,
      condition: typeof row.condition === "string" ? row.condition : undefined,
      buffer: typeof row.buffer === "string" ? row.buffer : undefined,
      flush: typeof row.flush === "string" ? row.flush : undefined,
    }));
}

function toDocs(rows: Entry[]): Doc[] {
  return rows.map((row) => {
    const next: Doc = { path: row.path };
    if (row.format) next.format = row.format;
    if (row.condition) next.condition = row.condition;
    if (row.buffer) next.buffer = row.buffer;
    if (row.flush) next.flush = row.flush;
    return next;
  });
}

/**
 * Новый приёмник -- диалогом.
 *
 * «+» раньше молча дописывал строку с сокетом агента, и куда именно поедут
 * строки, было видно только после нажатия -- в таблице, где адрес спрятан за
 * словом «сокет агента», а формат и условие стоят через две колонки. Диалог
 * собирает приёмник целиком до записи и показывает готовую директиву: тег и
 * путь сокета в ней видны так же, как их прочтёт nginx.
 *
 * Тем же диалогом открывается «задать» в шапке блока: свой список начинается
 * с приёмника, который выбрали, а не с того, который подставился. Отмена не
 * трогает документ -- блок остаётся на прежнем состоянии.
 *
 * Дубль не добавляется: две одинаковые строки `access_log` пишут один и тот
 * же файл дважды, и убрать потом придётся ту, которую не отличить.
 */
function AddDialog({
  t,
  formats,
  taken,
  onClose,
  onAdd,
}: {
  t: Translate;
  formats: readonly FilterOption[];
  /** Приёмники, которые в списке уже есть. */
  taken: readonly string[];
  onClose: () => void;
  onAdd: (row: Entry) => void;
}) {
  const [dest, setDest] = useState<"socket" | "file">("socket");
  const [tag, setTag] = useState(DEFAULT_TAG);
  const [file, setFile] = useState(FILE_ACCESS);
  const [format, setFormat] = useState("");
  const [condition, setCondition] = useState("");

  const path = dest === "socket" ? syslogPath(AGENT_LOG_SOCK, tag) : file.trim();
  const dup = taken.includes(path);
  const ready = path !== "" && !dup;
  const tail = [format, condition.trim()].filter((part) => part !== "").join(" ");
  const line = `access_log ${path}${tail === "" ? "" : ` ${tail}`};`;

  const add = () =>
    onAdd({
      path,
      format: format === "" ? undefined : format,
      condition: condition.trim() === "" ? undefined : condition.trim(),
    });

  return (
    <Modal
      onClose={onClose}
      title={t("logs.addTitle")}
      hint={t("logs.addHint")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={add}>
            {t("common.add")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={1.5}>
          <DialogRow label={t("logs.dest.label")} hint={t("logs.destHelp")}>
            <DialogSelect
              value={dest}
              width={150}
              options={[
                { value: "socket", label: t("logs.dest.socket") },
                { value: "file", label: t("logs.dest.file") },
              ]}
              onChange={setDest}
            />
          </DialogRow>
          <DialogRow label={t("logs.target")} hint={t("logs.targetHelp")}>
            <DialogText
              mono
              width={260}
              value={dest === "socket" ? tag : file}
              placeholder={dest === "socket" ? DEFAULT_TAG : FILE_ACCESS}
              onChange={(next) => (dest === "socket" ? setTag(next) : setFile(next))}
            />
          </DialogRow>
          <DialogRow label={t("logs.format")} hint={t("logs.formatHelp")}>
            <DialogSelect value={format} width={150} options={formats} onChange={setFormat} />
          </DialogRow>
          <DialogRow label={t("logs.conditionLabel")} hint={t("logs.conditionHelp")}>
            <DialogText
              mono
              width={160}
              value={condition}
              placeholder={t("logs.condition")}
              onChange={setCondition}
            />
          </DialogRow>
          {dup && (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
              <WarningAmberIcon color="warning" sx={{ fontSize: 15, flexShrink: 0 }} />
              <Typography sx={{ ...dialogLabelSx, color: "warning.main", whiteSpace: "normal" }}>
                {t("logs.addDup")}
              </Typography>
            </Stack>
          )}
          <DialogLines
            title={t("logs.emitted")}
            lines={ready ? [line] : []}
            empty={t("logs.addNothing")}
          />
        </Stack>
    </Modal>
  );
}

function AccessLogBlock({
  t,
  level,
  value,
  onChange,
}: {
  t: Translate;
  level: NginxLevel;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const catalog = useCatalog();
  const [adding, setAdding] = useState(false);
  const kind = kindOf(value);
  const own = kind === "override";
  /*
   * Наследуется -- таблица показывает строки родителя запертыми, с пометкой
   * откуда: так и инспекторы показывают чужой набор. Родитель тоже мог
   * поставить `off` -- тогда строк нет, и заметка говорит об этом.
   */
  const inherited = useInherited("accessLog");
  const shownInherited = kind === "inherit" && inherited !== null && inherited.value !== "off";
  const rows = own ? asEntries(value) : shownInherited ? asEntries(inherited.value) : [];
  const editable = own;
  const span = 5;

  const formats: FilterOption[] = [
    { value: "", label: t("logs.formatDefault") },
    ...(catalog?.log_formats ?? []).map((row) => ({ value: row.name, label: row.name })),
  ];

  const options: FilterOption<ListKind>[] = [
    {
      value: "inherit",
      label: level === "http" ? t("common.default") : t("routeSettings.kind.inherit"),
    },
    { value: "off", label: "off" },
    { value: "override", label: t("routeSettings.kind.override") },
  ];

  /* Свой список -- только когда он свой: показанные родительские строки в него не переезжают. */
  const ownRows = own ? rows : [];
  const setRows = (next: Entry[]) => onChange(toDocs(next));
  const patch = (index: number, fn: (row: Entry) => Entry) =>
    setRows(rows.map((row, i) => (i === index ? fn(row) : row)));

  /*
   * Смена состояния. «Задать» открывает то же добавление, что и «+»: свой
   * список начинается с приёмника, который выбрали. Подставленный сокет
   * агента был короче на щелчок, но записывал в документ строку, которую у
   * него не просили, -- и отменить её можно было только корзиной.
   */
  const setKind = (next: ListKind) => {
    if (next === kind) {
      return;
    }
    if (next === "inherit") {
      onChange(undefined);
    } else if (next === "off") {
      onChange("off");
    } else {
      setAdding(true);
    }
  };

  const empty =
    kind === "off"
      ? t("logs.offNotice")
      : kind === "inherit"
        ? inherited?.value === "off"
          ? t("logs.inheritOffNotice", { from: inherited.from })
          : t(level === "http" ? "logs.defaultNotice" : "logs.inheritNotice")
        : t("logs.emptyNotice");
  const fromTag = shownInherited ? ` (${inherited.from})` : "";

  return (
    <TableBlock
      title={"access_log" + fromTag}
      label={t("logs.accessHint")}
      kindLabel={t("logs.kind")}
      kind={kind}
      options={options}
      onKind={setKind}
      scroll
      last
    >
      <Table size="small" sx={flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("logs.dest.label")} help={t("logs.destHelp")} width={DEST_W} />
            <HeadCell label={t("logs.target")} help={t("logs.targetHelp")} />
            <HeadCell label={t("logs.format")} help={t("logs.formatHelp")} width={FORMAT_W} />
            <HeadCell label={t("logs.conditionLabel")} help={t("logs.conditionHelp")} width={COND_W} />
            {own ? (
              <FilterCell width={ACTIONS_W}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                  <TableIconButton
                    color="success"
                    icon={<AddIcon />}
                    tooltip={t("logs.add")}
                    onClick={() => setAdding(true)}
                  />
                </Box>
              </FilterCell>
            ) : (
              <TableCell sx={{ ...headCellSx, width: ACTIONS_W, minWidth: ACTIONS_W }} />
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow
              colSpan={span}
              kind={kind === "off" ? "none" : "empty"}
              message={empty}
            />
          )}
          {rows.map((row, index) => (
              <TableRow key={index} sx={editable ? undefined : { opacity: 0.62 }}>
                <DestCells
                  t={t}
                  value={row.path}
                  file={FILE_ACCESS}
                  disabled={!editable}
                  onChange={(next) => patch(index, (cur) => ({ ...cur, path: next }))}
                />
                <FilterSelect
                  value={row.format ?? ""}
                  unset=""
                  width={FORMAT_W}
                  disabled={!editable}
                  placeholder={t("logs.format")}
                  options={formats}
                  onChange={(next) =>
                    patch(index, (cur) => ({ ...cur, format: next === "" ? undefined : next }))
                  }
                />
                <DraftCell
                  mono
                  width={COND_W}
                  disabled={!editable}
                  value={row.condition ?? ""}
                  placeholder={t("logs.condition")}
                  onChange={(raw) =>
                    patch(index, (cur) => ({ ...cur, condition: raw === "" ? undefined : raw }))
                  }
                />
                <TableCell sx={dataActionCellSx}>
                  {editable && (
                    <TableIconButton
                      color="error"
                      icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                      tooltip={t("common.delete")}
                      onClick={() => {
                        const rest = rows.filter((_, i) => i !== index);
                        // Последнюю строку убрали -- список стал «наследовать»:
                        // пустой свой список не печатается и не хранится.
                        if (rest.length === 0) {
                          onChange(undefined);
                        } else {
                          setRows(rest);
                        }
                      }}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {adding && (
        <AddDialog
          t={t}
          formats={formats}
          taken={ownRows.map((row) => row.path)}
          onClose={() => setAdding(false)}
          onAdd={(row) => {
            setAdding(false);
            setRows([...ownRows, row]);
          }}
        />
      )}
    </TableBlock>
  );
}

/** Раздел «Логи»: два блока вплотную, разделяющую линию несёт первый. */
export function LogsTable({
  level,
  value,
  onChange,
}: {
  level: NginxLevel;
  value: Doc;
  onChange: (next: Doc) => void;
}) {
  const t = useT();
  const set = (key: string, next: unknown) => {
    const copy = { ...value };
    if (next === undefined) {
      delete copy[key];
    } else {
      copy[key] = next;
    }
    onChange(copy);
  };

  return (
    /*
     * Ячейки тут -- редактор, а не фильтр: заливка «поле заполнено» красила
     * синим обе таблицы целиком, потому что заполнены в них все поля.
     */
    <EditorCellScope>
    <Stack spacing={0}>
      <ErrorLogBlock
        t={t}
        level={level}
        value={value.errorLog}
        onChange={(next) => set("errorLog", next)}
      />
      <AccessLogBlock
        t={t}
        level={level}
        value={value.accessLog}
        onChange={(next) => set("accessLog", next)}
      />
    </Stack>
    </EditorCellScope>
  );
}
