import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { DiagnosticLine } from './DiagnosticLine';
import type { Diagnostic } from '../../modsec/diagnostics';

interface DiagnosticNotesProps {
  items: Diagnostic[];
}

/**
 * Замечания рядом с тем, к чему они относятся.
 *
 * В конструкторе у сообщения уже есть контекст — оно стоит под своим
 * условием или под действиями правила, — поэтому адрес не показывается,
 * а сам блок отделён от полей только слева цветной чертой: список должен
 * читаться как примечание, а не как ещё одна панель.
 */
export function DiagnosticNotes({ items }: DiagnosticNotesProps) {
  if (items.length === 0) return null;

  const worst = items.some((d) => d.severity === 'error')
    ? 'error.main'
    : items.some((d) => d.severity === 'warning')
      ? 'warning.main'
      : 'divider';

  return (
    <Box sx={{ pl: 1.5, borderLeft: 2, borderColor: worst }}>
      <Stack>
        {items.map((diagnostic, index) => (
          <DiagnosticLine key={index} diagnostic={diagnostic} />
        ))}
      </Stack>
    </Box>
  );
}
