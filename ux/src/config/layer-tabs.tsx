/*
  Навигация страницы конфигурации в два слоя.

  Первый ряд -- раздел страницы (что настраиваем: WAF, nginx, предпросмотр),
  второй, сразу под ним, -- группа выбранного раздела. Оба ряда стоят рядом,
  вне карточки: ряд вкладок внутри рамки с таблицей читается её шапкой, хотя
  переключает он всю страницу.

  Раньше разделы были лентой аккордеонов. Их приходилось раскрывать по одному
  и прокручивать мимо тех, что сейчас не нужны; со вкладками на экране ровно
  одна таблица, а что в ней -- видно по двум рядам сверху.

  Правила слоя -- docs/controller/ux/settings-table.md, «Навигация в два слоя».
*/
import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { UnderlayTabs } from "../components/fields.tsx";
import { FlushSectionProvider } from "../components/settings-table.tsx";

/** Вкладка второго слоя: имя на кнопке и подсказка над таблицей. */
export interface LayerItem<T extends string> {
  id: T;
  label: string;
  hint?: string;
}

/**
 * Выбранная вкладка переживает уход со страницы -- как раньше раскрытые
 * секции. Ключ свой у каждой страницы.
 */
export function useLayerTab<T extends string>(
  key: string,
  ids: readonly T[],
): [T, (next: T) => void] {
  const [tab, setTab] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null && (ids as readonly string[]).includes(raw)) {
        return raw as T;
      }
    } catch {
      // localStorage недоступен -- живём в памяти вкладки.
    }
    return ids[0];
  });

  return [
    tab,
    (next: T) => {
      setTab(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Некуда писать -- не страшно, умолчание разумное.
      }
    },
  ];
}

/**
 * Слой целиком: ряд разделов, ряд групп и карточка выбранной группы -- один
 * блок с равным шагом 8px. Шаг именно равный: неравные промежутки делили
 * переключатель на «панель» и «панель с таблицей», хотя это одна лестница из
 * трёх ступеней. Обычные 16px страницы остаются между слоем и тем, что
 * стоит выше или ниже него.
 */
export function LayerBar({ children }: { children: ReactNode }) {
  return <Stack spacing={1}>{children}</Stack>;
}

/** Второй ряд: группы выбранного раздела. */
export function LayerTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: readonly LayerItem<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <UnderlayTabs
      wrap
      value={value}
      onChange={onChange}
      items={items.map((item) => ({ value: item.id, label: item.label }))}
    />
  );
}

/**
 * Карточка слоя: шапка выбранной группы и её содержимое.
 *
 * Это та же карточка, что рисовала секция-аккордеон, только раскрывать её не
 * надо -- группу выбирают вкладкой. Шапка нужна: без неё таблица начиналась
 * сразу с серой строки подсказки, и у неё не было имени -- имя стояло только
 * на кнопке ряда.
 *
 * `flush` -- как у `Section`: содержимое само задаёт ритм (таблица идёт от
 * рамки до рамки и до самого низа), полей у карточки нет. Без него карточка
 * держит поля 16px, а таблицы выносят себя на них сами (`SectionBleed`) --
 * так живут списки данных, у которых рядом с таблицей есть алерты и кнопка
 * «создать».
 */
export function LayerCard({
  title,
  hint,
  flush,
  children,
}: {
  title: string;
  hint?: string;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: "5px",
        overflow: "hidden",
      }}
    >
      {/* Шапка -- та же, что у раскрытой секции: заливка, линия, два кегля. */}
      <Box
        sx={{
          px: 2,
          py: 1.1,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(0, 0, 0, 0.35)"
              : "rgba(19, 32, 44, 0.05)",
        }}
      >
        <Typography
          component="div"
          sx={{
            color: "secondary.main",
            fontSize: "0.8rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
            lineHeight: 1.25,
          }}
        >
          {title}
        </Typography>
        {/*
          Подсказка группы целиком, а не в обрез: в шапке аккордеона она
          жила в колонке 280px и обрывалась многоточием на первом же
          придаточном.
        */}
        {hint !== undefined && hint !== "" && (
          <Typography
            component="div"
            sx={{
              mt: 0.25,
              fontSize: "0.7rem",
              lineHeight: 1.3,
              fontWeight: 500,
              color: "text.secondary",
              opacity: 0.55,
            }}
          >
            {hint}
          </Typography>
        )}
      </Box>
      <FlushSectionProvider value={flush === true}>
        <Box sx={flush === true ? undefined : { p: 2 }}>
          <Stack spacing={flush === true ? 0 : 1.5}>{children}</Stack>
        </Box>
      </FlushSectionProvider>
    </Box>
  );
}
