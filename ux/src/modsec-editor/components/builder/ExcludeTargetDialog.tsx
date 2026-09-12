import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ParamList } from './ParamList';
import { SuggestField } from './SuggestField';
import { useI18n } from '../../i18n/useI18n';
import { DIALOG_FIELD_TOP } from '../../theme';
import { excludeTargetLine } from '../../modsec/exclusions';
import { selectorSupport } from '../../modsec/semantics';
import { VARIABLE_SUGGESTIONS, selectorSuggestions } from '../../modsec/suggestions';
import type { ParamMode } from './ParamList';

interface ExcludeTargetDialogProps {
  open: boolean;
  onClose: () => void;
  /** Номер правила: исключение называет свою цель числом и ничем иным. */
  id: string;
  /** Дописать строку под правило. */
  onAppend: (line: string) => void;
}

/**
 * Окно, в котором у правила вычитают одну цель.
 *
 * Решений у исключения два, и в окне живёт только второе. Снять правило
 * целиком — решение без полей: запись известна по одному номеру, и окно, в
 * котором нечего заполнить, спросило бы согласие дважды; та кнопка стоит прямо
 * на полосе секции ({@link ExclusionsSection}). Здесь спрашивают цель и её
 * параметры — без них строка не соберётся вовсе, и спросить их больше негде.
 *
 * Так неравнозначность двух решений видна ещё до нажатия и без пояснений: у
 * простого нет формы, у бережного она есть. А что появится в файле, сказано
 * над полями — тем же текстом, что стоит в подсказке открывающей кнопки.
 */
export function ExcludeTargetDialog({ open, onClose, id, onAppend }: ExcludeTargetDialogProps) {
  const { t } = useI18n();

  // `ARGS` заранее: ложное срабатывание почти всегда приходит из параметра
  // запроса, и в частом случае остаётся набрать одно имя поля.
  const [scope, setScope] = useState('ARGS');
  const [mode, setMode] = useState<ParamMode>('all');
  const [params, setParams] = useState<string[]>([]);

  // Положений у переключателя два: снять коллекцию целиком или снять
  // перечисленные параметры. Третьего, «ВСЕ, КРОМЕ», у исключения не бывает —
  // терм без `!` не сужает цель правила, а добавляет ему ещё одну.
  const support = selectorSupport(scope);
  const modes: ParamMode[] = support === 'required' ? ['only'] : ['all', 'only'];

  // Положение выбрано, а перечислять нечего: строка сняла бы всю коллекцию,
  // то есть не то, что написано на переключателе.
  const incomplete = mode !== 'all' && params.length === 0;

  // Закрытое окно спрашивает заново: набранная и не выписанная цель — это
  // брошенное решение, а не черновик, к которому вернутся.
  const close = () => {
    setScope('ARGS');
    setMode('all');
    setParams([]);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{t('builder.excludeTargetTitle', { id })}</DialogTitle>
      {/* Отступ повторяет собственный селектор MUI: правило «под заголовком
          отступа нет» весит два класса и обычному `sx` не уступает. */}
      <DialogContent sx={{ '&.MuiDialogContent-root': { pt: `${DIALOG_FIELD_TOP}px` } }}>
        <Stack spacing={1.75}>
          <Typography variant="body2" color="text.secondary">
            {t('builder.excludeTargetHint', { id })}
          </Typography>

          {/* Переменная названа «Цель», а не «Область проверки», как в
              условии: там перечисляют, где правило смотрит, здесь — что у
              него вычитают. А параметры набираются тем же списком, что и в
              условии, и по той же причине, по которой их там список:
              снимают их одним решением, и одна строка файла снимает
              столько, сколько в ней перечислено. */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'flex-start' }}
          >
            <Box sx={{ width: 190 }}>
              <SuggestField
                required
                label={t('builder.exclusionTargetScope')}
                suggestions={VARIABLE_SUGGESTIONS}
                value={scope}
                onCommit={(next) => {
                  // Сбрасываем то, что новая переменная не поддерживает:
                  // у скаляра вроде `REQUEST_METHOD` параметров нет вовсе,
                  // а там, где параметр обязателен, коллекции целиком нет.
                  const nextSupport = selectorSupport(next);
                  setScope(next);
                  if (nextSupport === 'none') setParams([]);
                  if (nextSupport !== 'optional') {
                    setMode(nextSupport === 'required' ? 'only' : 'all');
                  }
                }}
                inputSx={{ color: 'warning.light', fontWeight: 500 }}
              />
            </Box>

            {support !== 'none' && (
              <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
                <ParamList
                  mode={mode}
                  values={params}
                  modes={modes}
                  note={t('builder.excludeTargetNoExcept')}
                  allNote={t('builder.excludeTargetAllHint')}
                  requiredNote={t('builder.excludeTargetParamRequired')}
                  suggestions={selectorSuggestions(scope)}
                  onChange={(next) => {
                    setMode(next.mode);
                    setParams(next.values);
                  }}
                />
              </Box>
            )}
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={close}>{t('app.cancel')}</Button>
        {/* Выписанная строка — конец разговора: смотреть на неё надо в файле,
            рядом с правилом и остальными исключениями, а не в окне поверх. */}
        <Button
          variant="contained"
          disabled={scope === '' || incomplete}
          onClick={() => {
            onAppend(excludeTargetLine(id, scope, mode === 'only' ? params : []));
            close();
          }}
        >
          {t('builder.excludeTarget')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
