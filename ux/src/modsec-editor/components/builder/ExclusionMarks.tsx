import { useState } from 'react';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { RuleMatchesDialog } from '../RuleMatchesDialog';
import { RulePreview } from '../RulePreview';
import { useI18n } from '../../i18n/useI18n';
import type { ExclusionEntry } from '../../modsec/exclusions';

/**
 * Сколько правил названо номерами, прежде чем остаток назван числом.
 *
 * `SecRuleRemoveByTag` снимает сотни правил, и списком это не читается; шесть
 * номеров позволяют узнать, о том ли наборе речь, а число рядом честнее, чем
 * оборванный список без предупреждения. Полный перечень — за «посмотреть все».
 */
const SHOWN_RULES = 6;

interface ExclusionMarksProps {
  entry: ExclusionEntry;
  /**
   * Номера правил уже стоят в самой строке — здесь их не повторять.
   *
   * Так у фразы `ctl`-исключения: номер, до которого запись дотянулась, встаёт
   * ссылкой внутрь фразы, и вторым списком рядом он читался бы не как тот же
   * номер, а как другие правила.
   */
  named?: boolean;
}

/**
 * Отметки у строки исключения: кого оно задевает и работает ли вообще.
 *
 * Исключение — единственная запись файла, чей смысл лежит не в ней:
 * `SecRuleRemoveById 942100` сама по себе не говорит ни того, есть ли такое
 * правило, ни того, дотянется ли она до него. Дотянется только вниз — директива
 * применяется при чтении конфигурации, — поэтому строка, стоящая выше своей
 * цели, выглядит осмысленной и не делает ничего. Об этом здесь и сказано, рядом
 * с самой директивой, а не в отдельной сводке: порядок строк — и есть ответ.
 *
 * У `ctl` не дотянуться значит противоположное — «сработал слишком поздно», —
 * поэтому одна и та же отметка объясняется по-разному. Причина промаха тут
 * важнее самого промаха: чинят её переносом в другую фазу, а не вниз по файлу.
 */
export function ExclusionMarks({ entry, named = false }: ExclusionMarksProps) {
  const { t } = useI18n();
  const { directive, matches } = entry;
  const [listOpen, setListOpen] = useState(false);

  const shown = matches.slice(0, SHOWN_RULES);
  const inactive = matches.length > 0 && matches.every((match) => !match.applies);
  const inactiveHint =
    directive.source === 'ctl' ? 'builder.exclusionLateHint' : 'builder.exclusionInactiveHint';

  return (
    <>
      {matches.length === 0 && (
        <Tooltip title={t('builder.exclusionNoMatchHint')}>
          <Chip
            size="small"
            variant="outlined"
            label={t('builder.exclusionNoMatch')}
            sx={{ flexShrink: 0 }}
          />
        </Tooltip>
      )}

      {matches.length > 0 && !named && (
        <>
          {/* Номер сам за себя не говорит: «1000» рядом с директивой читается
              как её аргумент — то же число, что набрано в поле слева, — а не
              как правило, до которого она дотянулась. Подпись стоит одна на
              всю россыпь: приписанная к каждому номеру, она вытеснила бы из
              строки сами номера. */}
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {t(matches.length === 1 ? 'builder.exclusionRule' : 'builder.exclusionRules')}
          </Typography>

          {/* Правило может лежать в другом файле — превью и переход это
              учитывают сами: ключ блока считается внутри файла. */}
          {shown.map((match) => (
            <RulePreview
              key={`${match.file}-${match.key}`}
              id={match.id}
              file={match.file}
              ruleKey={match.key}
            />
          ))}

          {/* Число — размер всей выборки, не «хвоста»: иначе «+40» обещало бы
              сорок правил в окне, а в окне лежали бы все сорок шесть.
              Чип, как у номеров рядом: иначе подпись выглядела бы подписью
              к россыпи, а не тем же действием — открыть полный список. */}
          {matches.length > shown.length && (
            <Chip
              size="small"
              component="button"
              label={t('builder.rulePreviewViewAll', { count: String(matches.length) })}
              onClick={() => setListOpen(true)}
              sx={{ flexShrink: 0 }}
            />
          )}

          <RuleMatchesDialog
            open={listOpen}
            onClose={() => setListOpen(false)}
            ids={matches.map((match) => match.id)}
          />
        </>
      )}

      {inactive && (
        <Tooltip title={t(inactiveHint)}>
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={t('builder.exclusionInactive')}
            sx={{ flexShrink: 0 }}
          />
        </Tooltip>
      )}
    </>
  );
}
