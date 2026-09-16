import { BlockPreview } from './BlockPreview';
import { useWorkspace } from '../context/workspaceContext';
import { useI18n } from '../i18n/useI18n';

interface RulePreviewProps {
  id: string;
  file: string;
  ruleKey: string;
  preText?: string;
  preview?: boolean;
  mode?: 'chip' | 'icons';
  onNavigate?: () => void;
}

export function RulePreview({
  id,
  file,
  ruleKey,
  preText,
  preview = true,
  mode = 'chip',
  onNavigate,
}: RulePreviewProps) {
  const { t } = useI18n();
  const { activeId, nameOf } = useWorkspace();

  const foreign = file !== activeId ? nameOf(file) : '';
  const label = id === '' ? t('builder.unset') : id;
  const caption =
    preText === undefined || preText === '' ? label : `${preText} : ${label}`;

  const reveal =
    foreign === ''
      ? t('builder.exclusionReveal', { id: label })
      : t('builder.exclusionRevealIn', { id: label, file: foreign });
  const peek =
    foreign === ''
      ? t('builder.rulePreviewPeek', { id: label })
      : t('builder.rulePreviewPeekIn', { id: label, file: foreign });
  const text =
    foreign === ''
      ? t('builder.rulePreviewText', { id: label })
      : t('builder.rulePreviewTextIn', { id: label, file: foreign });

  return (
    <BlockPreview
      file={file}
      blockKey={ruleKey}
      caption={caption}
      hints={{ reveal, peek, text }}
      preview={preview}
      mode={mode}
      onNavigate={onNavigate}
    />
  );
}
