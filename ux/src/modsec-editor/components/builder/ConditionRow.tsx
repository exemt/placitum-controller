import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { Bracket, BracketLine } from './Bracket';
import { TargetRow } from './TargetRow';
import { TransformPipeline } from './TransformPipeline';
import { PipelinePreview } from './PipelinePreview';
import { OperatorValue } from './OperatorValue';
import { useI18n } from '../../i18n/useI18n';
import {
  CONDITION_PADDING,
  CONDITION_PADDING_TOP,
  TARGET_COLUMN,
  TRANSFORM_COLUMN,
} from './layout';
import { CONTROL_HEIGHT } from '../../theme';
import { DiagnosticNotes } from '../diagnostics/DiagnosticNotes';
import { conditionConstraints } from '../../modsec/semantics';
import { makeTarget } from '../../modsec/model';
import type { Diagnostic } from '../../modsec/diagnostics';
import type { VisualCondition } from '../../modsec/model';

interface ConditionRowProps {
  condition: VisualCondition;
  diagnostics: Diagnostic[];
  onChange: (next: VisualCondition) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function ConditionRow({
  condition,
  diagnostics,
  onChange,
  onRemove,
  canRemove,
}: ConditionRowProps) {
  const { t } = useI18n();
  const theme = useTheme();
  const constraints = conditionConstraints(condition.targets, condition.transforms);

  const [previewOpen, setPreviewOpen] = useState(false);

  const previewShown =
    constraints.transformsAllowed && (condition.transforms.length > 0 || previewOpen);

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          lg: `minmax(${TARGET_COLUMN}px, 1.2fr) ${TRANSFORM_COLUMN}px minmax(340px, 1fr)`,
        },
        gap: 1.5,
        alignItems: 'start',
        p: CONDITION_PADDING,
        pt: CONDITION_PADDING_TOP,
        pr: 5,
        borderRadius: 1.5,
        bgcolor: 'action.hover',
      }}
    >
      <BracketLine name="condition" top={theme.spacing(CONDITION_PADDING_TOP)} />

      <Box sx={{ minWidth: 0 }}>
        <Bracket label={t('builder.or')} color="warning.main" line="target">
          <Stack spacing={2}>
            {condition.targets.map((target, index) => (
              <TargetRow
                key={`${target.name}-${index}`}
                target={target}
                canRemove={condition.targets.length > 1}
                onChange={(next) =>
                  onChange({
                    ...condition,
                    targets: condition.targets.map((v, i) => (i === index ? next : v)),
                  })
                }
                onRemove={() =>
                  onChange({
                    ...condition,
                    targets: condition.targets.filter((_, i) => i !== index),
                  })
                }
              />
            ))}

            <Box sx={{ position: 'relative', display: 'flex' }}>
              <BracketLine name="target" height="100%" />
              <Button
                size="small"
                variant="outlined"
                color="warning"
                startIcon={<AddIcon />}
                onClick={() =>
                  onChange({ ...condition, targets: [...condition.targets, makeTarget()] })
                }
              >
                {t('builder.addOr')}
              </Button>
            </Box>
          </Stack>
        </Bracket>
      </Box>

      <TransformPipeline
        transforms={condition.transforms}
        baseKind={constraints.baseKind}
        targets={condition.targets}
        disabled={!constraints.transformsAllowed}
        disabledReason={t('builder.transformsBlocked')}
        onChange={(transforms) => onChange({ ...condition, transforms })}
      />

      <OperatorValue
        operator={condition.operator}
        targets={condition.targets}
        inputKind={constraints.inputKind}
        onChange={(operator) => onChange({ ...condition, operator })}
      />

      {diagnostics.length > 0 && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Divider sx={{ mb: 1.5 }} />
          <DiagnosticNotes items={diagnostics} />
        </Box>
      )}

      {previewShown && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Divider sx={{ mb: 1 }} />
          <PipelinePreview
            transforms={condition.transforms}
            operator={condition.operator}
            targets={condition.targets}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          />
        </Box>
      )}

      <Box
        sx={{
          position: 'absolute',
          top: (theme) => theme.spacing(CONDITION_PADDING_TOP),
          right: (theme) => theme.spacing(1),
          height: CONTROL_HEIGHT,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Tooltip title={t('builder.deleteCondition')}>
          <span>
            <IconButton size="small" disabled={!canRemove} onClick={onRemove}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
