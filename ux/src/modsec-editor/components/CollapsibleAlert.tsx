import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import { useI18n } from '../i18n/useI18n';
import type { AlertColor } from '@mui/material/Alert';

interface CollapsibleAlertProps {
  severity: AlertColor;
  summary: string;
  detail?: string | null;
}

export function CollapsibleAlert({ severity, summary, detail }: CollapsibleAlertProps) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const hasDetail = detail !== undefined && detail !== null && detail !== '';

  return (
    <Alert
      severity={severity}
      sx={{ alignItems: 'flex-start', '& .MuiAlert-message': { minWidth: 0, flex: 1 } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{summary}</Box>
        {hasDetail && (
          <Button
            size="small"
            color="inherit"
            sx={{ flexShrink: 0, mt: -0.5 }}
            onClick={() => setShown(!shown)}
          >
            {shown ? t('app.hideDetails') : t('app.details')}
          </Button>
        )}
      </Box>
      {hasDetail && (
        <Collapse in={shown} unmountOnExit>
          <Box
            component="pre"
            sx={{
              m: 0,
              mt: 1,
              maxHeight: 160,
              overflow: 'auto',
              fontFamily: 'ui-monospace, Consolas, monospace',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              opacity: 0.85,
            }}
          >
            {detail}
          </Box>
        </Collapse>
      )}
    </Alert>
  );
}
