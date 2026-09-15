import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { DiagnosticLine } from './DiagnosticLine';
import type { Diagnostic } from '../../modsec/diagnostics';

interface DiagnosticNotesProps {
  items: Diagnostic[];
}

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
