import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChipInput } from './ChipInput';
import { DefaultActionPanel } from './DefaultActionPanel';
import { ExclusionDirectivePanel } from './ExclusionDirectivePanel';
import { useLabel } from './useLabel';
import { useI18n } from '../../i18n/useI18n';
import { AUDIT_LOG_PARTS, directiveMeta } from '../../modsec/directives';
import type { DirectiveForm } from '../../modsec/directives';

/**
 * Колонка расшифровки части журнала аудита.
 *
 * Под самое длинное название — `K — Все совпавшие правила` — целиком: часть,
 * ушедшая в многоточие, не расшифрована, а только помечена как существующая.
 */
const PART_COLUMN = 200;

interface DirectivePanelProps {
  form: DirectiveForm;
  onChange: (next: DirectiveForm) => void;
}

/**
 * Содержимое раскрытой директивы.
 *
 * Раскрываются те, чья форма не ручается за высоту одной строки: набор
 * частей журнала, список типов ответа, умолчания фазы и семь директив-
 * исключений. Здесь их четыре ветки и ничего общего, кроме места, —
 * общее у них только то, что в строку они не поместились.
 */
export function DirectivePanel({ form, onChange }: DirectivePanelProps) {
  switch (form.arg) {
    case 'flags':
      return <FlagsPanel form={form} onChange={onChange} />;
    case 'list':
      return <ListPanel form={form} onChange={onChange} />;
    case 'actions':
      return <DefaultActionPanel form={form} onChange={onChange} />;
    case 'exclusion':
      return <ExclusionDirectivePanel form={form} onChange={onChange} />;
    default:
      return null;
  }
}

/**
 * Части записи журнала аудита.
 *
 * В файле это слипшаяся строка `ABIJDEFHZ`, и прочесть её можно только по
 * памяти. Здесь каждая буква — отдельный чип, который можно убрать и
 * переставить, а под полем стоит расшифровка выбранного: именно её и
 * держат в голове, глядя на такую строку.
 *
 * Буквы остаются буквами, а не превращаются в набор галочек, потому что
 * порядок в записи значим: `A` обязана быть первой, `Z` — последней, и
 * набор без порядка их не выразил бы.
 *
 * Расшифровка идёт колонками, а не столбцом в девять строк. Частей у записи
 * ровно столько, и столбец из них — это панель вдвое выше самого поля, ради
 * которого её раскрыли: подпись начинает весить больше, чем то, что она
 * подписывает. Колонками искать по-прежнему легко — часть остаётся одной
 * строкой, — а места это занимает вчетверо меньше. Порядок в расшифровке тот
 * же, что в поле: её читают, ведя взглядом от чипа вниз.
 */
function FlagsPanel({
  form,
  onChange,
}: {
  form: Extract<DirectiveForm, { arg: 'flags' }>;
  onChange: (next: DirectiveForm) => void;
}) {
  const { t } = useI18n();
  const localize = useLabel();

  const suggestions = Object.entries(AUDIT_LOG_PARTS).map(([value, part]) => ({
    value,
    hint: part.note,
  }));

  return (
    <Stack spacing={1}>
      <ChipInput
        monospace
        values={form.parts}
        onChange={(parts) => onChange({ ...form, parts })}
        label={t('builder.directiveParts')}
        dialogTitle={t('builder.directiveParts')}
        suggestions={suggestions}
        isValueValid={(value) => AUDIT_LOG_PARTS[value] !== undefined}
        invalidHint={t('builder.directiveUnknownFlagHint')}
        error={form.parts.length === 0}
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${PART_COLUMN}px, 1fr))`,
          columnGap: 2,
          rowGap: 0.25,
        }}
      >
        {form.parts.map((part, index) => (
          <Typography key={`${part}-${index}`} variant="caption" color="text.secondary" noWrap>
            {localize(AUDIT_LOG_PARTS[part]?.label, part)}
          </Typography>
        ))}
      </Box>
    </Stack>
  );
}

/** Список значений через пробел: типы содержимого, которые стоит проверять. */
function ListPanel({
  form,
  onChange,
}: {
  form: Extract<DirectiveForm, { arg: 'list' }>;
  onChange: (next: DirectiveForm) => void;
}) {
  const { t } = useI18n();
  const meta = directiveMeta(form.name);
  const localize = useLabel();

  return (
    <ChipInput
      monospace
      values={form.items}
      onChange={(items) => onChange({ ...form, items })}
      label={localize(meta?.label, t('builder.directiveValue'))}
      dialogTitle={localize(meta?.label, t('builder.directiveValue'))}
      suggestions={meta?.hints ?? []}
      // Пробел и запятая режут значение на чипы: вставленный из чужого
      // конфига список сразу распадается на типы, а не встаёт одним чипом.
      separators={[' ', ',']}
      error={form.items.length === 0}
    />
  );
}
