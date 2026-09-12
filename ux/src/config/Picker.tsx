import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";

import { useT } from "../i18n/index.ts";

/**
 * Выбор имени с поиском.
 *
 * Простой `Select` годится, пока пунктов пять. Их не пять: наборов в контуре
 * до 32, профилей адреса под тридцать, инспекторов до 64 -- и оператор знает,
 * что ищет, но не помнит, где оно в списке. Поэтому здесь поиск по подстроке
 * -- по имени и по подписи пункта, -- подпись у каждого пункта и группировка.
 *
 * `free` -- когда список подсказка, а не закон. У `profile=` именно так:
 * «какие профили есть, решает инспектор» (docs/directives/list/inspector.md),
 * поэтому имя, которого нет в каталоге, вводится руками и не выбрасывается.
 */

export interface PickerOption {
  value: string;
  /** Правая колонка пункта: subject, тип набора, статус. */
  hint?: string;
  /** Заголовок группы. */
  group?: string;
  /**
   * Подпись вместо самого значения. Нужна пунктам-действиям («завести новый
   * список»): у них значение -- служебный маркер, и показывать его оператору
   * незачем.
   */
  label?: string;
  /**
   * Пункт виден, но не выбирается: имя уже занято, набор уже объявлен.
   * Вычеркнуть его из списка нельзя -- пропавший пункт читается «этого в
   * каталоге нет», и его идут искать вместо ответа «оно уже здесь».
   */
  disabled?: boolean;
  /** Приписка перед значением: почему пункт погашен. */
  note?: string;
}

export function Picker({
  value,
  onChange,
  options,
  placeholder,
  free,
  unknownLabel,
  plain,
  width,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  options: PickerOption[];
  placeholder?: string;
  free?: boolean;
  /** Подпись пометки, когда значение есть, а в списке его нет. */
  unknownLabel?: string;
  /** Без рамки: строка формы уже обрамлена таблицей. */
  plain?: boolean;
  width?: number | string;
  /** Выбирать нечего: список исчерпан, и поле объясняет это подписью. */
  disabled?: boolean;
}) {
  const t = useT();
  const known = options.some((o) => o.value === value);
  const grouped = options.some((o) => o.group !== undefined);

  return (
    <Autocomplete
      size="small"
      freeSolo={free === true}
      autoHighlight
      openOnFocus
      disabled={disabled === true}
      disableClearable={false}
      value={value === "" ? null : value}
      options={options.map((o) => o.value)}
      // Поиск идёт по подписи, а не по значению: у пункта-действия значение --
      // служебный маркер, и без этого он пропадает из списка, стоит набрать
      // первую букву его же названия.
      getOptionLabel={(v) => options.find((o) => o.value === v)?.label ?? v}
      groupBy={grouped ? (v) => options.find((o) => o.value === v)?.group ?? "" : undefined}
      getOptionDisabled={(v) => options.find((o) => o.value === v)?.disabled === true}
      // Поиск -- по всему пункту: подпись справа (профиль, тема, тип набора)
      // -- часть ответа «то ли это», и найти пункт по ней так же законно, как
      // по имени.
      filterOptions={(values, state) => {
        const q = state.inputValue.trim().toLowerCase();
        if (q === "") {
          return values;
        }
        return values.filter((v) => {
          const row = options.find((o) => o.value === v);
          return [row?.label ?? v, row?.hint].some(
            (s) => s !== undefined && s.toLowerCase().includes(q),
          );
        });
      }}
      /*
       * Гашение погашенного пункта -- своё: `aria-disabled` MUI даёт 0.38, и
       * приписка, ради которой пункт оставлен в списке, на ней не читается.
       * Правило живёт у списка, а не в `sx` строки: у списка оно того же веса,
       * что у собственного правила MUI, и перебивает его порядком.
       */
      slotProps={{
        listbox: {
          sx: { '& .MuiAutocomplete-option[aria-disabled="true"]': { opacity: 0.62 } },
        },
      }}
      onChange={(_, next) => onChange(next ?? "")}
      onInputChange={(_, next, reason) => {
        // При freeSolo ввод -- это и есть значение: иначе набранное имя
        // теряется, стоит увести фокус.
        if (free === true && reason === "input") {
          onChange(next);
        }
      }}
      renderOption={(props, option) => {
        const row = options.find((o) => o.value === option);
        const { key, ...rest } = props as { key?: string } & Record<string, unknown>;
        return (
          <Box
            component="li"
            key={key ?? option}
            {...rest}
            sx={{ display: "flex", gap: 1, fontSize: "0.8rem" }}
          >
            {/* Приписка -- кеглем подсказки, а не имени: это ответ «почему
                погашено», а не часть значения. */}
            {row?.note !== undefined && (
              <Box component="span" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                {row.note}
              </Box>
            )}
            {row?.label === undefined ? (
              <Box component="code">{option}</Box>
            ) : (
              <Box component="span">{row.label}</Box>
            )}
            <Box sx={{ flex: 1 }} />
            {row?.hint !== undefined && (
              <Box component="span" sx={{ fontSize: "0.68rem", color: "text.secondary" }}>
                {row.hint}
              </Box>
            )}
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          variant={plain === true ? "standard" : "outlined"}
          placeholder={placeholder ?? t("catalog.pick")}
          // slotProps целиком, а не только input: в htmlInput лежит
          // getInputProps() автокомплита -- role, aria-expanded, ref и
          // обработчики раскрытия. Перезаписать здесь один ключ значит снять
          // их все, и поле остаётся обычным текстовым: список не открывается
          // ни по клику, ни по вводу.
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps?.input,
              ...(plain === true ? { disableUnderline: true } : {}),
              ...(value !== "" && !known
                ? {
                    startAdornment: (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={unknownLabel ?? t("catalog.unknown")}
                        sx={{ height: 20, fontSize: "0.66rem", mr: 0.5 }}
                      />
                    ),
                  }
                : {}),
            },
          }}
          sx={
            plain === true
              ? {
                  // Метрика второго уровня: то же, что у полей рядом.
                  "& .MuiInputBase-root": {
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    py: 0,
                    height: 24,
                  },
                  "& input": { p: "0 !important" },
                  // Кнопки списка и очистки -- того же размера, что действия
                  // строки: иначе рядом видны три разных круга.
                  "& .MuiAutocomplete-endAdornment .MuiIconButton-root": {
                    p: 0,
                    width: 20,
                    height: 20,
                    borderRadius: "3px",
                  },
                  "& .MuiAutocomplete-endAdornment .MuiSvgIcon-root": {
                    fontSize: 16,
                  },
                }
              : { "& .MuiInputBase-root": { fontSize: "0.8rem" } }
          }
        />
      )}
      sx={{ width: width ?? "100%" }}
    />
  );
}
