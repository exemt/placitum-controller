import { BlockPreview } from './BlockPreview';
import { useWorkspace } from '../context/workspaceContext';
import { useI18n } from '../i18n/useI18n';

interface RulePreviewProps {
  /** Значение `id` правила — то, что написано на чипе. */
  id: string;
  /** Файл, в котором стоит правило. */
  file: string;
  /** Ключ блока модели — по нему конструктор находит карточку. */
  ruleKey: string;
  /**
   * Текст перед номером на чипе: «Правило : 942100».
   *
   * В списке исключений номер сам за себя, а в общем списке блоков без слова
   * «Правило» чип не отличить от соседних меток и директив.
   */
  preText?: string;
  /**
   * Показывать ли превью по наведению.
   *
   * `false` — чистый переход: номер ведёт в конструктор, без подсказки,
   * модалки и иконки текста. Так чип ставят в шапке, где исходник уже виден.
   */
  preview?: boolean;
  /**
   * Как показать управление.
   *
   * `chip` — номер со ссылкой и (при превью) иконкой текста.
   * `icons` — глаз с той же подсказкой и переход в текстовый редактор;
   * так ставят в поле id раскрытой карточки, где номер уже набран.
   */
  mode?: 'chip' | 'icons';
  /** Перед переходом — закрыть родительское окно или подсказку. */
  onNavigate?: () => void;
}

/**
 * Номер правила как переход: наведение показывает исходник, нажатие — карточку.
 *
 * Каркас общий — {@link BlockPreview}; здесь только подпись и подсказки про id.
 */
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
