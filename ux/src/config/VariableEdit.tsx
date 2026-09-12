import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";

import { useT } from "../i18n/index.ts";

/**
 * Переменная, которую локальная проверка сравнивает со списком.
 *
 * Раньше это была строка, и оператору полагалось помнить, что адрес для
 * `type=cidr` -- `$binary_remote_addr`, а ключ из заголовка пишется
 * `$http_x_api_key` со схлопнутым дефисом. Ошибка в имени не ловится ничем:
 * nginx подставит пустое значение, проверка не сработает ни разу, и маршрут
 * будет выглядеть защищённым.
 *
 * Здесь выбор из известных плюс три разбора с параметром -- заголовок, cookie
 * и аргумент строки запроса, -- потому что именно они и нужны на практике:
 * ключ API в заголовке, идентификатор сессии в cookie, токен в query.
 *
 * Тип набора решает, что предлагать: `cidr` сравнивается только с адресом,
 * `string` -- со всем остальным. Показывать адресу список заголовков значило бы
 * предлагать заведомо неработающую пару.
 */

export interface VariableHint {
  name: string;
  hint: string;
}

/** Разбор с параметром: префикс записи, подпись пункта, образец имени. */
export interface VariableParser {
  id: string;
  prefix: string;
  label: string;
  sample: string;
  /** Имя берётся как набрано (селектор модуля), а не сводится к A-Za-z0-9_. */
  raw: boolean;
}

/**
 * Каталог значений: что предлагать в списке. У условий вызова на маршруте --
 * переменные nginx, у условий профиля инспектора действий -- поля его
 * сообщения (pages/action-conds.tsx); форма записи и редактор одни.
 */
export interface VariableCatalog {
  /** Значения, с которыми сравним набор адресов. */
  address: VariableHint[];
  known: VariableHint[];
  parsers: VariableParser[];
}

const ADDRESS_VARS: VariableHint[] = [
  { name: "$binary_remote_addr", hint: "адрес клиента, 4 или 16 байт" },
  { name: "$remote_addr", hint: "адрес клиента строкой" },
];

const STRING_VARS: VariableHint[] = [
  { name: "$http_user_agent", hint: "User-Agent" },
  { name: "$http_referer", hint: "Referer" },
  { name: "$host", hint: "имя хоста запроса" },
  { name: "$request_method", hint: "метод" },
  { name: "$uri", hint: "путь без строки запроса" },
  { name: "$request_uri", hint: "путь со строкой запроса" },
  { name: "$scheme", hint: "http или https" },
  { name: "$ssl_client_s_dn", hint: "субъект клиентского сертификата" },
];

/**
 * Разборы с параметром. Два вида, и разница между ними не косметическая.
 *
 * Переменная nginx (`$http_x_api_key`) даёт одно значение и требует имени из
 * `A-Za-z0-9_`: дефис схлопывается, регистр теряется, второе вхождение куки не
 * видно вовсе.
 *
 * Селектор модуля (`$waf_request_cookies.sid`) переменной nginx не является --
 * его разбирают сами директивы, -- поэтому имя берётся как пришло с провода, а
 * значений даёт столько, сколько их в запросе: `?sid=ok&sid=inject` -- два, и
 * набор спрашивается о каждом. Проверка, смотрящая только на первое вхождение,
 * обходится добавлением одного параметра. `*` -- все пары объекта.
 */
const PARSERS: VariableParser[] = [
  { id: "http", prefix: "$http_", label: "заголовок", sample: "X-Api-Key", raw: false },
  { id: "cookie", prefix: "$cookie_", label: "cookie", sample: "session", raw: false },
  { id: "arg", prefix: "$arg_", label: "аргумент", sample: "token", raw: false },
  {
    id: "sel_headers",
    prefix: "$waf_request_headers.",
    label: "заголовок: все значения",
    sample: "x-api-key",
    raw: true,
  },
  {
    id: "sel_cookies",
    prefix: "$waf_request_cookies.",
    label: "cookie: все значения",
    sample: "sid",
    raw: true,
  },
  {
    id: "sel_args",
    prefix: "$waf_request_args.",
    label: "аргумент: все значения",
    sample: "token",
    raw: true,
  },
];

/** Каталог условий вызова и локального слоя: переменные nginx. */
export const NGINX_CATALOG: VariableCatalog = {
  address: ADDRESS_VARS,
  known: STRING_VARS,
  parsers: PARSERS,
};

/**
 * Набор, который сравнивают только с адресом.
 *
 * Правило живёт здесь, рядом со списком адресных переменных, а не у окна: тем
 * же правилом сужается список, и разойдись они, окно предлагало бы то, что сам
 * же считает несовместимым.
 */
export function isAddressDataset(type: string | undefined): boolean {
  return type === "cidr" || type === "ipv4" || type === "ip";
}

/** Значение, которое с таким набором сойдётся. */
export function isAddressVariable(value: string): boolean {
  return ADDRESS_VARS.some((row) => row.name === value.trim());
}

const selectSx = {
  fontSize: "0.78rem",
  "& .MuiSelect-select": { py: 0, pl: 0, minHeight: "unset" },
  "& .MuiOutlinedInput-notchedOutline": { border: 0 },
  "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
} as const;

const inputSx = {
  fontSize: "0.78rem",
  width: "100%",
  "& input": { p: 0 },
} as const;

/**
 * Имя в готовую запись. У переменной nginx оно приводится к `A-Za-z0-9_`
 * (`X-Api-Key` -> `$http_x_api_key`), у селектора остаётся как набрано: имя
 * пары может быть любым, и приведение сломало бы `sess.id` или `X-Ja3`.
 */
export function toVariable(
  parser: string,
  name: string,
  parsers: readonly VariableParser[] = PARSERS,
): string {
  const row = parsers.find((p) => p.id === parser);
  const prefix = row?.prefix ?? "$http_";
  if (row?.raw === true) {
    const raw = name.trim();
    return raw === "" ? "" : `${prefix}${raw}`;
  }
  const cleaned = name.trim().toLowerCase().replace(/-/g, "_").replace(/[^a-z0-9_]/g, "");
  return cleaned === "" ? "" : `${prefix}${cleaned}`;
}

/** Обратный разбор: по значению понять, это разбор с параметром или готовая. */
function split(value: string, catalog: VariableCatalog): { parser: string | null; name: string } {
  for (const p of catalog.parsers) {
    if (value.startsWith(p.prefix)) {
      const tail = value.slice(p.prefix.length);
      // `$http_user_agent` -- в списке готовых, а не разбор заголовка.
      const known = [...catalog.address, ...catalog.known].some((v) => v.name === value);
      if (!known && tail !== "") {
        return { parser: p.id, name: tail };
      }
    }
  }
  return { parser: null, name: "" };
}

export function VariableEdit({
  value,
  onChange,
  datasetType,
  disabled,
  catalog = NGINX_CATALOG,
}: {
  value: unknown;
  onChange: (next: string) => void;
  /** Тип набора: `cidr` сравним только с адресом. */
  datasetType?: string;
  /**
   * Чужая строка: значение показывается, но не правится. Прятать его нельзя --
   * «что здесь побежит» и есть вопрос, с которым приходят на чужой уровень.
   */
  disabled?: boolean;
  /** Что предлагать; умолчание -- переменные nginx. */
  catalog?: VariableCatalog;
}) {
  const t = useT();
  const current = typeof value === "string" ? value : "";
  const parsed = split(current, catalog);
  const [parser, setParser] = useState<string | null>(parsed.parser);
  const [name, setName] = useState(parsed.name);

  const cidr = isAddressDataset(datasetType);

  const known = useMemo(
    () => (cidr ? catalog.address : [...catalog.address, ...catalog.known]),
    [cidr, catalog],
  );

  /*
   * Адресному набору разборы не предлагаются вовсе, но уже набранный остаётся
   * пунктом: значение вне списка MUI показывает пустотой, и правило выглядело
   * бы стёртым, хотя оно в документе.
   */
  const parsersShown = cidr
    ? catalog.parsers.filter((row) => row.id === parser)
    : catalog.parsers;

  const active = parser ?? "";
  const selectValue = parser !== null ? `parser:${parser}` : current;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", width: "100%" }}>
      <Select
        value={known.some((v) => v.name === selectValue) || selectValue.startsWith("parser:")
          ? selectValue
          : current === ""
            ? ""
            : "custom"}
        disabled={disabled}
        displayEmpty
        onChange={(e) => {
          const picked = String(e.target.value);
          if (picked.startsWith("parser:")) {
            const id = picked.slice(7);
            setParser(id);
            onChange(toVariable(id, name, catalog.parsers));
            return;
          }
          setParser(null);
          setName("");
          onChange(picked === "custom" ? current : picked);
        }}
        variant="outlined"
        sx={{ ...selectSx, flex: parser === null ? 1 : 0.9, minWidth: 120 }}
        renderValue={(v) => {
          const raw = String(v);
          if (raw === "") {
            return <Box component="span" sx={{ color: "text.disabled" }}>{t("vars.pick")}</Box>;
          }
          if (raw.startsWith("parser:")) {
            const p = catalog.parsers.find((x) => x.id === raw.slice(7));
            return p === undefined ? raw : p.label;
          }
          return raw === "custom" ? current : raw;
        }}
      >
        <ListSubheader sx={{ fontSize: "0.68rem", lineHeight: 2 }}>
          {t("vars.known")}
        </ListSubheader>
        {known.map((v) => (
          <MenuItem key={v.name} value={v.name} sx={{ fontSize: "0.78rem" }}>
            <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
              <code>{v.name}</code>
              <Box sx={{ flex: 1 }} />
              <Box component="span" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                {v.hint}
              </Box>
            </Box>
          </MenuItem>
        ))}
        {parsersShown.length > 0 && (
          <ListSubheader sx={{ fontSize: "0.68rem", lineHeight: 2 }}>
            {t("vars.parsers")}
          </ListSubheader>
        )}
        {parsersShown.map((p) => (
            <MenuItem key={p.id} value={`parser:${p.id}`} sx={{ fontSize: "0.78rem" }}>
              <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
                <span>{p.label}</span>
                <Box sx={{ flex: 1 }} />
                <Box component="span" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                  {p.prefix}…
                </Box>
              </Box>
            </MenuItem>
          ))}
        {current !== "" && !known.some((v) => v.name === current) && parser === null && (
          <MenuItem value="custom" sx={{ fontSize: "0.78rem" }}>
            <code>{current}</code>
          </MenuItem>
        )}
      </Select>

      {parser !== null && (
        <InputBase
          value={name}
          disabled={disabled}
          placeholder={catalog.parsers.find((p) => p.id === active)?.sample}
          onChange={(e) => {
            setName(e.target.value);
            onChange(toVariable(parser, e.target.value, catalog.parsers));
          }}
          sx={{ ...inputSx, flex: 1.1 }}
        />
      )}

      {parser !== null && current !== "" && (
        <Box component="code" sx={{ fontSize: "0.68rem", color: "text.secondary", flexShrink: 0 }}>
          {current}
        </Box>
      )}
    </Stack>
  );
}
