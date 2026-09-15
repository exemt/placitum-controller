import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import type { Diagnostic } from '../../modsec/diagnostics';

interface CounterProps {
  hint: string;
  count: number;
  severity?: Diagnostic['severity'];
}

export function Counter({ hint, count, severity }: CounterProps) {
  return (
    <Tooltip title={hint}>
      <Chip
        size="small"
        variant="outlined"
        color={severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'default'}
        label={count}
      />
    </Tooltip>
  );
}
