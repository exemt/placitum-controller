import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import type { SxProps, Theme } from '@mui/material/styles';
import { BlockPreview } from './BlockPreview';
import { useWorkspace } from '../context/workspaceContext';
import { useI18n } from '../i18n/useI18n';

interface MarkerPreviewProps {
  /** Имя метки — то, что ищет `skipAfter`. */
  label: string;
  /**
   * Текст перед именем на чипе: «Метка : END».
   *
   * В списке блоков без слова «Метка» чип не отличить от соседних правил;
   * в `skipAfter` слово лишнее — там подписью служит вся запись действия.
   */
  preText?: string;
  /**
   * Подпись на чипе целиком; перекрывает `preText` и имя.
   *
   * У `skipAfter` пишут `skipAfter:END`, а не одно `END`: иначе чип в «прочих
   * действиях» потерял бы имя действия рядом с соседними `initcol` и `exec`.
   */
  caption?: string;
  /**
   * Известный адрес — когда вызывающий уже знает файл и ключ.
   *
   * Без них место берётся из набора по имени (`markerOf`).
   */
  file?: string;
  blockKey?: string;
  preview?: boolean;
  mode?: 'chip' | 'icons';
  onNavigate?: () => void;
  chipSx?: SxProps<Theme>;
}

/**
 * Метка как переход: наведение показывает исходник, нажатие — строку в конструкторе.
 *
 * Нет в наборе — чип без перехода: `skipAfter` на несуществующую метку
 * некуда вести, и притворяться адресом хуже, чем сказать об отсутствии.
 */
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
