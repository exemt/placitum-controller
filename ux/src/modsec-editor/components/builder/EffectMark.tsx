import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { BlockPreview } from '../BlockPreview';
import { useForeignFile } from '../../context/useForeignFile';
import { useI18n } from '../../i18n/useI18n';
import type { TranslationKey } from '../../i18n/translations';
import type { ExclusionRef, ExclusionSource } from '../../modsec/exclusions';

/** Подпись и подсказка отметки — по тому, что с правилом сделали и кто. */
const EFFECT_MARKS = {
  removed: {
    directive: ['builder.effectRemoved', 'builder.effectRemovedHint'],
    ctl: ['builder.effectRemovedRuntime', 'builder.effectRemovedRuntimeHint'],
  },
  changed: {
    directive: ['builder.effectChanged', 'builder.effectChangedHint'],
    ctl: ['builder.effectChangedRuntime', 'builder.effectChangedRuntimeHint'],
  },
} as const satisfies Record<
  string,
  Record<ExclusionSource, readonly [TranslationKey, TranslationKey]>
>;

/**
 * Отметка о том, что с правилом сделало исключение.
 *
 * Условная правка отличается от безусловной не силой формулировки, а тем, что
 * про такое правило нельзя сказать «не работает»: на остальных запросах оно
 * работает. Поэтому цветом выделено только безусловное снятие — покрасить как
 * выключенное правило, снятое `ctl`, значило бы сказать неправду.
 *
 * Место у отметки одно — шапка карточки: она единственное, что говорит о
 * снятом правиле свёрнутой карточке, и читать её приходится без наведения. В
 * списке исключений отметки нет вовсе, потому что рядом там стоит сама запись:
 * `SecRuleUpdateTargetById` говорит «изменено» лучше, чем слово «изменено».
 *
 * Нажатие и превью ведут к блоку исключения: директиве или правилу-носителю
 * `ctl`. Адрес уже в {@link ExclusionRef} — искать по имени незачем.
 */
export function EffectMark({ mark, removed }: { mark: ExclusionRef; removed: boolean }) {
  const { t } = useI18n();
  const [label, hint] = EFFECT_MARKS[removed ? 'removed' : 'changed'][mark.source];
  const strong = removed && mark.source === 'directive';
  // Правит правило и файл, включённый позже: тогда строка называется вместе с
  // файлом — иначе она отсылает к строке того файла, который открыт.
  const foreign = useForeignFile(mark.file);
  const where = t(hint, { name: mark.name, line: String(mark.line) });
  const caption = t(label);
  const tip =
    foreign === '' ? where : `${where} · ${t('builder.markFile', { file: foreign })}`;

  if (mark.key === '') {
    return (
      <Tooltip title={tip}>
        <Chip
          size="small"
          color={strong ? 'warning' : undefined}
          variant="outlined"
          label={caption}
          sx={{ flexShrink: 0 }}
        />
      </Tooltip>
    );
  }

  // На чипе одно слово («выключено») — подробности, кто и где снял, идут в
  // aria-label, как раньше в Tooltip: свёрнутой карточке иначе нечего читать.
  const peek =
    foreign === ''
      ? t('builder.directivePreviewPeek', { name: mark.name })
      : t('builder.directivePreviewPeekIn', { name: mark.name, file: foreign });
  const text =
    foreign === ''
      ? t('builder.directivePreviewText', { name: mark.name })
      : t('builder.directivePreviewTextIn', { name: mark.name, file: foreign });

  return (
    <BlockPreview
      file={mark.file}
      blockKey={mark.key}
      caption={caption}
      hints={{ reveal: tip, peek, text }}
      chipColor={strong ? 'warning' : undefined}
      chipVariant="outlined"
    />
  );
}
