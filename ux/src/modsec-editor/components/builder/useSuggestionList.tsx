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

export const filterSuggestions = createFilterOptions<Suggestion>({
  stringify: (option) => `${option.value} ${option.hint.en} ${option.hint.ru}`,
  trim: true,
});

interface SuggestionListOptions {
  optionEnd?: (option: Suggestion) => ReactNode;
}

export function useSuggestionList(
  suggestions: Suggestion[],
  { optionEnd }: SuggestionListOptions = {},
) {
  const localize = useLabel();
  const grouped = suggestions.some((item) => item.group !== undefined);

  return {
    slotProps: {
      popper: {
        placement: 'bottom-start' as const,
        style: { width: 'fit-content', minWidth: 280, maxWidth: 'min(520px, 90vw)' },
      },
    },
    groupBy: grouped ? (option: Suggestion) => localize(option.group, '') : undefined,
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
