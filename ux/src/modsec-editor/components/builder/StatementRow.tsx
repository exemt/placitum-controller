import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { BlockActions } from './BlockActions';
import { BlockHeader, BlockTitle } from './BlockHeader';
import { CommitField } from './CommitField';
import { MarkerField } from './MarkerField';
import { useI18n } from '../../i18n/useI18n';
import type { ReactElement, ReactNode } from 'react';
import type { TranslationKey } from '../../i18n/translations';

interface StatementRowProps {
  kind: TranslationKey;
  title: ReactNode;
  icon?: ReactElement;
  text: string;
  marks?: ReactNode;
  onCommit: (text: string) => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function StatementRow({
  kind,
  title,
  icon,
  text,
  marks,
  onCommit,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onDelete,
}: StatementRowProps) {
  const { t } = useI18n();

  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <BlockHeader
        toggle={null}
        title={
          typeof title === 'string' || icon !== undefined ? (
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: 'center',
                minWidth: 0,
                '& .MuiSvgIcon-root': { fontSize: 18, color: 'text.secondary' },
              }}
            >
              {icon}
              {typeof title === 'string' ? <BlockTitle>{title}</BlockTitle> : title}
            </Stack>
          ) : (
            title
          )
        }
        marks={marks}
        actions={
          <BlockActions
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            duplicateLabel="builder.duplicateLine"
            deleteLabel="builder.deleteLine"
          />
        }
      >
        {kind === 'builder.marker' ? (
          <MarkerField
            value={text}
            onCommit={onCommit}
            aria-label={t(kind)}
          />
        ) : (
          <CommitField
            fullWidth
            value={text}
            onCommit={(next) => onCommit(next.trim())}
            sx={{
              '& .MuiInputBase-input': { fontFamily: 'ui-monospace, Consolas, monospace' },
            }}
            slotProps={{ htmlInput: { 'aria-label': t(kind), spellCheck: false } }}
          />
        )}
      </BlockHeader>
    </Paper>
  );
}
