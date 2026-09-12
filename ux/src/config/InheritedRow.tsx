import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { Optional } from "../components/fields.tsx";
import { SettingsRow, UnitSelect } from "../components/settings-table.tsx";
import { useT } from "../i18n/index.ts";
import {
  dropKey,
  offValue,
  resolve,
  seedFor,
  setKey,
  type Doc,
  type ParentChain,
} from "./inherit.ts";

/** Состояние строки, которое видят редактор и чипы подстановок. */
export interface InheritedCtx {
  /** Действующее значение: своё либо унаследованное. */
  value: unknown;
  inheriting: boolean;
  off: boolean;
  set: (next: unknown) => void;
  /** Убрать свой ключ -- вернуть наследование. */
  drop: () => void;
}

/**
 * Одна строка настройки маршрута со всеми тремя состояниями ключа.
 *
 * Редактор открыт всегда. Переопределение -- это и есть выбор значения, а не
 * отдельный шаг перед ним: заставлять нажимать карандаш, чтобы потом выбрать
 * из двух пунктов, значит требовать два действия там, где смысл у оператора
 * один.
 *
 * Состояние видно по тому, что показано в редакторе, и по правому слоту:
 *
 *   наследует       значение родителя, приглушённое, галочка стоит
 *   переопределено  своё значение обычным цветом, галочка снята
 *   снято           `none` -- маршрут гасит то, что разрешено выше
 *                   (только у ключей с `offable`: селектор «задать / none»
 *                   в колонке единиц, пока галочка снята)
 *
 * Строка -- та же `SettingsRow`, что у директив ядра: имя, значение с чипами
 * подстановок у правого края ячейки, правый слот с галочкой. Раньше у неё были
 * чипы источника («из http», «вместо on»), кнопки возврата и снятия и своя
 * ячейка с редакторами второго уровня -- на одной вкладке с ядром nginx это
 * читалось чужой таблицей, а правый слот гулял по ширине от строки к строке.
 */
export function InheritedRow({
  label,
  help,
  fieldKey,
  doc,
  parents,
  onChange,
  offable,
  unit,
  seed: emptySeed,
  end,
  children,
}: {
  label: string;
  help?: string;
  fieldKey: string;
  doc: Doc;
  parents: ParentChain;
  onChange: (next: Doc) => void;
  /** Ключ умеет «снять родительское». Не у всех директив это выразимо. */
  offable?: boolean;
  /** Единица значения в правом слоте строки: та же колонка, что у размеров. */
  unit?: ReactNode;
  /**
   * С чего начать своё значение, когда наследовать нечего: ни родитель, ни
   * модуль его не задали. Пустая строка ключом не становится, и без этого
   * галочку было бы не снять.
   */
  seed?: unknown;
  /**
   * Хвост ячейки значения: чипы подстановок, как у строк ядра nginx. Получает
   * то же состояние, что редактор, -- чип, повторяющий своё значение, снимает
   * ключ тем же движением, что и выбор.
   */
  end?: (row: InheritedCtx) => ReactNode;
  /**
   * Редактор строки. Получает действующее значение -- своё либо
   * унаследованное, -- поэтому правка всегда начинается с того, что работает
   * сейчас, а не с пустого места.
   */
  children: (value: unknown, set: (next: unknown) => void, row: InheritedCtx) => ReactNode;
}) {
  const t = useT();
  const state = resolve(doc, fieldKey, parents);
  const inheriting = state.state === "inherit";
  const set = (next: unknown) => onChange(setKey(doc, fieldKey, next));
  const ctx: InheritedCtx = {
    value: state.value,
    inheriting,
    off: state.state === "off",
    set,
    drop: () => onChange(dropKey(doc, fieldKey)),
  };

  /*
    Правый слот -- то же, что у строк http: галочка «по умолчанию», только
    здесь она значит «наследовать». Снять её -- задать своё, и поле тут же
    получает действующее значение; поставить -- убрать ключ.

    Ключ, который умеет `none`, получает второй выбор -- «задать / none» -- в
    колонке единиц: это тот же 80px-селектор, что `mb` у размеров, и стоит он
    на той же вертикали. В слоте галочки он был шире её, и разделители строки
    уезжали влево. Пока ключ наследуется, выбора нет -- как нет единиц у
    запертого поля.
  */
  const seed = () => {
    const inherited = seedFor(fieldKey, state);
    set(inherited === "" || inherited === undefined ? emptySeed : inherited);
  };
  const aside = (
    <Optional
      overridden={!inheriting}
      onOverridden={(on) => (on ? seed() : ctx.drop())}
    />
  );
  const modeSelect =
    offable === true && !inheriting ? (
      <UnitSelect<"set" | "off">
        label={label}
        value={state.state === "off" ? "off" : "set"}
        options={[
          { value: "set", label: t("routeSettings.kind.override") },
          { value: "off", label: t("routeSettings.kind.none") },
        ]}
        onChange={(next) => {
          if (next === "off" && state.state !== "off") {
            onChange({ ...doc, [fieldKey]: offValue(fieldKey) });
          } else if (next === "set" && state.state === "off") {
            seed();
          }
        }}
      />
    ) : undefined;

  return (
    <SettingsRow
      quiet
      grow
      label={label}
      help={help}
      unit={modeSelect ?? unit}
      check={aside}
      end={ctx.off ? undefined : end?.(ctx)}
    >
      <Box
        sx={{
          width: "100%",
          minWidth: 0,
          // Приглушено, пока значение чужое. Цвет здесь -- единственная
          // разница между «так настроено тут» и «так пришло сверху».
          opacity: inheriting ? 0.62 : 1,
        }}
      >
        {ctx.off ? (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("inherit.off")}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>{children(state.value, set, ctx)}</Box>
            {/*
              Откуда приехало унаследованное: та же скобка, что у запертых
              полей ядра -- `1m (http)`. Здесь значение стоит в редакторе, и
              скобка идёт следом за ним.
            */}
            {inheriting && state.from !== undefined && (
              <Typography
                component="span"
                sx={{ fontSize: "0.7rem", color: "text.secondary", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                ({t(`inherit.tag.${state.from}`)})
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </SettingsRow>
  );
}
