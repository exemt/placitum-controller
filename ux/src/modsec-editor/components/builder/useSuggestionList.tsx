import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { createFilterOptions } from '@mui/material/Autocomplete';
import type { AutocompleteRenderGroupParams } from '@mui/material/Autocomplete';
import type { HTMLAttributes, Key, ReactNode } from 'react';
import { useLabel } from './useLabel';
import { ListSection } from './ListSection';
import type { Suggestion } from '../../modsec/suggestions';

/**
 * Отбор вариантов по набранному тексту.
 *
 * Ищем не только по значению, но и по пояснению, и сразу на обоих языках:
 * тот, кто не помнит написание `X-Forwarded-For`, наберёт «прокси» или
 * «proxy» — вариант всё равно должен найтись.
 */
export const filterSuggestions = createFilterOptions<Suggestion>({
  stringify: (option) => `${option.value} ${option.hint.en} ${option.hint.ru}`,
  trim: true,
});

interface SuggestionListOptions {
  /**
   * Отметка справа от варианта.
   *
   * Когда она есть, число использований (`badge`) ей же и рисует — чипом
   * «N | i», а не отдельной цифрой рядом. Без `optionEnd` остаётся голый
   * чип с числом. Клики список не выбирают — это обязанность отметки.
   */
  optionEnd?: (option: Suggestion) => ReactNode;
}

/**
 * Оформление выпадающего списка готовых вариантов.
 *
 * Вынесено из полей, потому что список подсказок появляется не в одном
 * месте: поле ввода и набор чипов подсказывают одинаково, и выглядеть эти
 * списки обязаны тоже одинаково.
 *
 * Значение варианта стоит первым и моноширинным — его предстоит увидеть в
 * тексте правила буква в букву. Пояснение идёт строкой ниже и отвечает на
 * вопрос «а это что», ради которого список и заведён. Справа — отметка
 * с числом мест в наборе, если варианту есть что сказать о себе.
 */
export function useSuggestionList(
  suggestions: Suggestion[],
  { optionEnd }: SuggestionListOptions = {},
) {
  const localize = useLabel();
  const grouped = suggestions.some((item) => item.group !== undefined);

  return {
    // Ширину панели список берёт по содержимому, а не по полю: колонка
    // конструктора узкая, и пояснение — то, ради чего список открыли, —
    // обрезалось бы на втором слове. Запас шире обычного: справа ещё
    // чип с числом и значком сведений.
    slotProps: {
      popper: {
        placement: 'bottom-start' as const,
        style: { width: 'fit-content', minWidth: 280, maxWidth: 'min(520px, 90vw)' },
      },
    },
    groupBy: grouped ? (option: Suggestion) => localize(option.group, '') : undefined,
    // Заголовок раздела тот же, что и в списках базы знаний: разделены эти
    // списки по-разному, но выглядеть по-разному им незачем. Цвета у
    // подсказок нет — ни один их раздел не «подходит больше» остальных.
    renderGroup: (params: AutocompleteRenderGroupParams) => (
      <ListSection key={params.key} title={params.group}>
        {params.children}
      </ListSection>
    ),
    renderOption: (
      props: HTMLAttributes<HTMLLIElement> & { key: Key },
      option: Suggestion,
    ) => {
      const { key, ...rest } = props;
      const end = optionEnd?.(option);
      // Со своим `optionEnd` число рисует он сам (чип «N | i»). Голый
      // badge — запасной путь, если отметки нет.
      const badge =
        end == null && option.badge !== undefined && option.badge > 0
          ? option.badge
          : null;
      return (
        <Box
          component="li"
          key={key}
          {...rest}
          sx={{
            // Содержимое — ряд: текст слева, отметка справа. Иначе длинное
            // пояснение отодвинуло бы чип под следующую строку.
            display: 'flex !important',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Stack sx={{ minWidth: 0, flex: 1, pr: '2px' }}>
            <Typography
              variant="body2"
              noWrap
              sx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}
            >
              {option.value}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {localize(option.hint, '')}
            </Typography>
          </Stack>
          {badge !== null && (
            <Chip size="small" variant="outlined" label={badge} sx={{ flexShrink: 0 }} />
          )}
          {end != null && (
            <Box
              sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}
              // Клик по отметке не выбирает пункт: иначе Autocomplete
              // подставит имя и размонтирует отметку вместе со списком.
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {end}
            </Box>
          )}
        </Box>
      );
    },
  };
}
