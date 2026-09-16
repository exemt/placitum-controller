import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import type { SxProps, Theme } from '@mui/material/styles';
import { BlockPreview } from './BlockPreview';
import { useWorkspace } from '../context/workspaceContext';
import { useI18n } from '../i18n/useI18n';

interface MarkerPreviewProps {
  label: string;
  preText?: string;
  caption?: string;
  file?: string;
  blockKey?: string;
  preview?: boolean;
  mode?: 'chip' | 'icons';
  onNavigate?: () => void;
  chipSx?: SxProps<Theme>;
}

export function MarkerPreview({
  label,
  preText,
  caption,
  file: knownFile,
  blockKey: knownKey,
  preview = true,
  mode = 'chip',
  onNavigate,
  chipSx,
}: MarkerPreviewProps) {
  const { t } = useI18n();
  const { activeId, nameOf, markerOf } = useWorkspace();

  const located =
    knownFile !== undefined && knownKey !== undefined
      ? { file: knownFile, key: knownKey, label }
      : markerOf(label);

  const name = label === '' ? t('builder.unset') : label;
  const text =
    caption ??
    (preText === undefined || preText === '' ? name : `${preText} : ${name}`);

  if (located === null) {
    return (
      <Tooltip title={t('builder.markerPreviewMissing', { label: text })}>
        <Chip
          size="small"
          variant="outlined"
          label={text}
          sx={[{ flexShrink: 0 }, ...(chipSx === undefined ? [] : Array.isArray(chipSx) ? chipSx : [chipSx])]}
        />
      </Tooltip>
    );
  }

  const foreign = located.file !== activeId ? nameOf(located.file) : '';

  const reveal =
    foreign === ''
      ? t('builder.markerPreviewReveal', { label: name })
      : t('builder.markerPreviewRevealIn', { label: name, file: foreign });
  const peek =
    foreign === ''
      ? t('builder.markerPreviewPeek', { label: name })
      : t('builder.markerPreviewPeekIn', { label: name, file: foreign });
  const textHint =
    foreign === ''
      ? t('builder.markerPreviewText', { label: name })
      : t('builder.markerPreviewTextIn', { label: name, file: foreign });

  return (
    <BlockPreview
      file={located.file}
      blockKey={located.key}
      caption={text}
      hints={{ reveal, peek, text: textHint }}
      preview={preview}
      mode={mode}
      onNavigate={onNavigate}
      chipSx={chipSx}
    />
  );
}
