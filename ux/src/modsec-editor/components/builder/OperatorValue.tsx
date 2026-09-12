import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import { ChipInput } from './ChipInput';
import { ChoiceField } from './ChoiceField';
import { CommitField } from './CommitField';
import { LongTextField } from './LongTextField';
import { useLabel } from './useLabel';
import { useI18n } from '../../i18n/useI18n';
import { OPERATOR_COLUMN, TOGGLE_COLUMN } from './layout';
import { CONTROL_HEIGHT } from '../../theme';
import {
  operatorArgLabel,
  operatorListSeparator,
  operatorMeta,
  splitOperatorArgument,
} from '../../modsec/semantics';
import { operatorChoices } from '../../modsec/choices';
import { isValidIpEntry } from '../../modsec/ip';
import { operatorValueSuggestions, recommendedOperators } from '../../modsec/suggestions';
import type { ValueKind } from '../../modsec/semantics';
import type { VisualOperator, VisualTarget } from '../../modsec/model';

interface OperatorValueProps {
  operator: VisualOperator;
  /** Области проверки — по ним подбираются подсказки к значению. */
  targets: VisualTarget[];
  /** Тип значения, приходящего на вход оператору. */
  inputKind: ValueKind;
  onChange: (next: VisualOperator) => void;
}

/**
 * Сравнение: отрицание, оператор и его значение.
 *
 * Список операторов знает тип входа: если проверка считает элементы
 * (`&ARGS`), «содержит» уезжает в самый низ с пометкой, что сравнивать
 * текстом здесь нечего. Убирать его совсем нельзя — исчезнувший из списка
 * оператор читается как поломка конструктора, а не как несовместимость.
 *
 * Поле значения выбирается по тому, что оператор ожидает: список сетей или
 * фраз даётся набором чипов, всё остальное — строкой с кнопкой развернуть.
 */
export function OperatorValue({
  operator,
  targets,
  inputKind,
  onChange,
}: OperatorValueProps) {
  const { t } = useI18n();
  const label = useLabel();

  const meta = operatorMeta(operator.name);
  const takesArgument = meta === null || meta.arg !== 'none';
  const separator = operatorListSeparator(operator.name);
  const operatorLabel = label(meta?.label, operator.name);
  const suggestions = operatorValueSuggestions(operator.name, targets, inputKind);
  // Тип приписан к подписи поля: сам оператор выбран выше и уже уехал в
  // закрытый список, а по одному слову «Значение» не видно, ждут здесь
  // выражение, число или список сетей.
  const argLabel = operatorArgLabel(operator.name);
  const valueLabel = argLabel
    ? `${t('builder.value')} (${label(argLabel, '')})`
    : t('builder.value');
  const choices = operatorChoices(
    inputKind,
    recommendedOperators(targets, inputKind),
    operator.name,
  );

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'start', width: '100%', minWidth: 0 }}
    >
      <Box
        sx={{
          flex: `0 0 ${TOGGLE_COLUMN}px`,
          height: CONTROL_HEIGHT,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Tooltip title={t('builder.negate')}>
          <ToggleButton
            size="small"
            value="negate"
            // Отрицание переворачивает смысл проверки — включённым оно
            // красное, как и всё, что меняет исход правила.
            color="error"
            selected={operator.negated}
            onChange={() => onChange({ ...operator, negated: !operator.negated })}
            sx={{ flex: 1, fontWeight: 700 }}
          >
            !
          </ToggleButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: `0 0 ${OPERATOR_COLUMN}px`, minWidth: 0 }}>
        <ChoiceField
          prefix="@"
          label={t('builder.operator')}
          choices={choices}
          value={operator.name}
          onChange={(name) => onChange({ ...operator, name })}
          inputSx={{ color: 'secondary.light', fontWeight: 500 }}
        />
      </Box>

      {!takesArgument && (
        <CommitField
          size="small"
          fullWidth
          disabled
          label={valueLabel}
          placeholder={t('builder.noArgument')}
          value=""
          onCommit={() => {}}
        />
      )}

      {takesArgument && separator !== null && (
        <ChipInput
          fullWidth
          monospace
          label={valueLabel}
          placeholder={t('builder.addValue')}
          dialogTitle={`${t('builder.value')} — ${operatorLabel}`}
          separators={[separator]}
          suggestions={suggestions}
          values={splitOperatorArgument(operator.argument, separator)}
          onChange={(values) =>
            onChange({ ...operator, argument: values.join(separator) })
          }
          // Сеть или адрес — единственный список, форму записи которого
          // можно проверить саму по себе, без знания, что в неё попадёт.
          isValueValid={meta?.arg === 'ipList' ? isValidIpEntry : undefined}
          invalidHint={meta?.arg === 'ipList' ? t('builder.ipInvalid') : undefined}
          sx={{ minWidth: 0 }}
        />
      )}

      {takesArgument && separator === null && (
        <LongTextField
          fullWidth
          monospace
          label={valueLabel}
          placeholder={t('builder.value')}
          dialogTitle={`${t('builder.value')} — ${operatorLabel}`}
          regex={meta?.arg === 'regex'}
          suggestions={suggestions}
          value={operator.argument}
          onCommit={(argument) => onChange({ ...operator, argument })}
          sx={{ minWidth: 0 }}
        />
      )}
    </Stack>
  );
}
