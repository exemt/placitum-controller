import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useRule } from '../../context/ruleContext';
import { useBuilderView } from '../../context/builderViewContext';
import { useEditorView } from '../../context/editorViewContext';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { diagnosticKey, fixKey, slotKey } from '../../i18n/translations';
import { quickFixFor } from '../../modsec/fixes';
import { findRule } from '../../modsec/model';
import type { Diagnostic } from '../../modsec/diagnostics';

export function SeverityIcon({ severity }: { severity: Diagnostic['severity'] }) {
  if (severity === 'error') return <ErrorOutlineIcon fontSize="small" color="error" />;
  if (severity === 'warning') return <WarningAmberIcon fontSize="small" color="warning" />;
  return <LightbulbOutlinedIcon fontSize="small" color="disabled" />;
}

interface DiagnosticLineProps {
  diagnostic: Diagnostic;
  showPlace?: boolean;
}

export function DiagnosticLine({ diagnostic, showPlace = false }: DiagnosticLineProps) {
  const { t } = useI18n();
  const { compiled, updateRule } = useRule();
  const { revealLine } = useEditorView();
  const { revealRule } = useBuilderView();
  const { files, activeId, nameOf } = useWorkspace();
  const { anchor } = diagnostic;

  const foreign = diagnostic.file !== undefined && diagnostic.file !== activeId;

  const fix = quickFixFor(diagnostic);
  const rule = foreign ? null : findRule(compiled.model, anchor?.ruleKey);

  const place = showPlace
    ? [
        anchor?.condition !== undefined
          ? t('debug.condition', { index: String(anchor.condition) })
          : null,
        anchor?.slot !== undefined ? t(slotKey(anchor.slot)) : null,
        files.length > 1 && diagnostic.file !== undefined
          ? t('debug.inFile', { file: nameOf(diagnostic.file) })
          : null,
      ].filter((part): part is string => part !== null)
    : [];
  const line = showPlace ? diagnostic.line : undefined;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', py: 0.5 }}>
      <SeverityIcon severity={diagnostic.severity} />
      <Typography
        variant="body2"
        color={diagnostic.severity === 'advice' ? 'text.secondary' : 'text.primary'}
        sx={{ flex: 1 }}
      >
        {t(diagnosticKey(diagnostic.code), diagnostic.params)}
      </Typography>

      {fix !== null && rule !== null && (
        <Button
          size="small"
          sx={{ py: 0, minWidth: 0, whiteSpace: 'nowrap' }}
          onClick={() => updateRule(fix.apply(rule))}
        >
          {t(fixKey(fix.kind), fix.params)}
        </Button>
      )}

      {place.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {place.join(' · ')}
        </Typography>
      )}

      {showPlace && anchor !== undefined && (rule !== null || foreign) && (
        <Link
          component="button"
          variant="caption"
          underline="hover"
          onClick={() => revealRule(anchor.ruleKey, diagnostic.file)}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {t('debug.inBuilder')}
        </Link>
      )}

      {line !== undefined && (
        <Link
          component="button"
          variant="caption"
          underline="hover"
          onClick={() => revealLine(line, diagnostic.file)}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {t('debug.line', { line: String(line) })}
        </Link>
      )}
    </Stack>
  );
}
