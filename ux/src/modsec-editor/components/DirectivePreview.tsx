import { BlockPreview } from './BlockPreview';
import { useWorkspace } from '../context/workspaceContext';
import { useI18n } from '../i18n/useI18n';
import type { ChipProps } from '@mui/material/Chip';
import type { SxProps, Theme } from '@mui/material/styles';

interface DirectivePreviewProps {
  /** Файл, в котором стоит директива (или носитель `ctl`). */
  file: string;
  /** Ключ блока — директивы или правила-носителя. */
  blockKey: string;
  /**
   * Подпись на чипе: имя (`SecRuleRemoveById`) или вся строка (`ref.text`).
   *
   * Адреса по одному имени нет: одно имя бывает много раз, и «первое»
   * врало бы о выборе. Вызывающий передаёт уже известное место.
   */
  caption: string;
  preview?: boolean;
  mode?: 'chip' | 'icons';
  onNavigate?: () => void;
  chipColor?: ChipProps['color'];
  chipVariant?: ChipProps['variant'];
  chipSx?: SxProps<Theme>;
}

/**
 * Директива (или блок-носитель исключения) как переход с превью исходника.
 *
 * Без поиска по имени: адрес обязан прийти снаружи — из `ExclusionRef` или
 * с самой строки директивы.
 */
export function DirectivePreview({
  file,
  blockKey,
  caption,
  preview = true,
  mode = 'chip',
  onNavigate,
  chipColor,
  chipVariant,
  chipSx,
}: DirectivePreviewProps) {
  const { t } = useI18n();
  const { activeId, nameOf } = useWorkspace();

  const foreign = file !== activeId ? nameOf(file) : '';
  const label = caption === '' ? t('builder.unset') : caption;

  const reveal =
    foreign === ''
      ? t('builder.directivePreviewReveal', { name: label })
      : t('builder.directivePreviewRevealIn', { name: label, file: foreign });
  const peek =
    foreign === ''
      ? t('builder.directivePreviewPeek', { name: label })
      : t('builder.directivePreviewPeekIn', { name: label, file: foreign });
  const text =
    foreign === ''
      ? t('builder.directivePreviewText', { name: label })
      : t('builder.directivePreviewTextIn', { name: label, file: foreign });

  return (
    <BlockPreview
      file={file}
      blockKey={blockKey}
      caption={caption}
      hints={{ reveal, peek, text }}
      preview={preview}
      mode={mode}
      onNavigate={onNavigate}
      chipColor={chipColor}
      chipVariant={chipVariant}
      chipSx={chipSx}
    />
  );
}
