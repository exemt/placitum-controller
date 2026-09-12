import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChoiceField } from './ChoiceField';
import { DirectivePanel } from './DirectivePanel';
import { DirectiveValue } from './DirectiveRow';
import { useLabel } from './useLabel';
import { useI18n } from '../../i18n/useI18n';
import { DIALOG_FIELD_TOP } from '../../theme';
import { directiveChoices } from '../../modsec/choices';
import { compileDocument } from '../../modsec/compile';
import {
  directiveMeta,
  emitDirective,
  isPanelArg,
  makeDirectiveForm,
} from '../../modsec/directives';
import { parseModsec } from '../../modsec/parser';
import type { DirectiveForm } from '../../modsec/directives';

const MONO = 'ui-monospace, Consolas, monospace';

interface AddDirectiveDialogProps {
  open: boolean;
  onClose: () => void;
  /** Дописать готовую строку в конец файла. */
  onAdd: (line: string) => void;
}

/**
 * Окно, в котором заводят новую директиву.
 *
 * Окно, а не пустая строка в конце списка, и причина не в оформлении. Имя —
 * единственное, что у директивы нельзя переиграть потом: от него зависит вид
 * аргумента, то есть вся её форма. А незаполненная директива не загрузится, и
 * одна такая ошибка блокирует конструктор на весь файл — то есть строка,
 * появившаяся в файле недособранной, отняла бы возможность её же и дособрать.
 * Поэтому решение целиком принимается здесь, а в файл уходит готовая строка.
 *
 * Поля — те же, которыми директива правится потом: список имён, из которого
 * опечатку не набрать, и под ним аргумент по своему виду. Кнопка гаснет, пока
 * строка не собралась, и рядом сказано, почему она гаснет.
 *
 * Прозы в окне столько, сколько нужно прямо сейчас, и место у неё одно. Пока
 * имя не выбрано, читать в окне нечего кроме подсказки о самом выборе — она и
 * стоит. После выбора подсказка уже сработала, а нужным становится другое: что
 * делает выбранное. В открытом списке это было написано у каждой строки, а у
 * выбранного исчезало — и значение заполнялось под именем, о котором больше
 * ничего не сказано.
 */
export function AddDirectiveDialog({ open, onClose, onAdd }: AddDirectiveDialogProps) {
  const { t } = useI18n();
  const localize = useLabel();
  const [form, setForm] = useState<DirectiveForm | null>(null);

  const line = form === null ? '' : emitDirective(form);

  // Годность считается не перечнем условий, а тем же разбором, который увидит
  // конструктор: у семи директив-исключений незаполненность своя — выборка,
  // цель, номер, который не читается числом, — и второй список этих условий
  // разошёлся бы с первым молча.
  const ready = form !== null && compileDocument(parseModsec(line)).ok;

  const meta = form === null ? null : directiveMeta(form.name);
  const about =
    meta === null
      ? t('builder.addDirectiveHint')
      : `${localize(meta.label, form?.name ?? '')} — ${localize(meta.note, '')}`;

  // Ширину задаёт не «раскрывается ли директива», а сколько полей встаёт в
  // ряд. У набора частей журнала и списка типов ответа поле одно, у
  // исключения — колонка в меру секции целей, и обоим хватает узкого окна.
  // А умолчания фазы спрашивают фазу, реакцию и код ответа одной строкой:
  // в узком окне она переносится, и три поля встают лестницей.
  const wide = form !== null && form.arg === 'actions';

  const close = () => {
    setForm(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth={wide ? 'md' : 'sm'}>
      <DialogTitle>{t('builder.addDirective')}</DialogTitle>
      {/* Отступ повторяет собственный селектор MUI: под заголовком окна
          верхний отступ снят, и подпись первого поля срезалась бы краем
          прокрутки. */}
      <DialogContent sx={{ '&.MuiDialogContent-root': { pt: `${DIALOG_FIELD_TOP}px` } }}>
        <Stack spacing={1.75}>
          <ChoiceField
            raw
            autoFocus
            label={t('builder.directive')}
            value={form?.name ?? ''}
            choices={directiveChoices(form?.name ?? '')}
            emptyLabel={t('builder.addDirectivePick')}
            // Набранное за прежним именем не переезжает: вид аргумента у
            // нового свой, и `On` в наборе частей журнала означал бы не то.
            onChange={(name) => setForm(name === '' ? null : makeDirectiveForm(name))}
          />

          {/* Пояснение стоит под именем, а не над ним: оно про выбранное, и
              читают его, уже глядя на поле аргумента. */}
          <Typography variant="body2" color="text.secondary">
            {about}
          </Typography>

          {form !== null &&
            (isPanelArg(form.arg) ? (
              <DirectivePanel form={form} onChange={setForm} />
            ) : (
              // Поле аргумента собрано под строку списка и ширину берёт от
              // ряда: в окне ряд ему нужен свой.
              <Stack direction="row">
                <DirectiveValue form={form} onChange={setForm} />
              </Stack>
            ))}

          {/* Последним стоит то, что окно после себя оставит, — у самой кнопки,
              которая это выпишет. Собранную строку показывает не придирчивость:
              кавычки расставляет сборка по виду аргумента, и в полях их не
              видно ни у подписи набора, ни у регулярного выражения. А пока
              строка не собралась, на том же месте стоит причина, по которой
              кнопка погасла: недособранную запись показывать строкой значило бы
              показать то, чего в файле не будет. */}
          {form !== null &&
            (ready ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {t('builder.addDirectiveLine')}
                </Typography>
                {/* Подложка отделяет текст файла от подписей интерфейса так же,
                    как код в тексте, — тем же приёмом, что в строках списка. */}
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: MONO,
                    px: 0.75,
                    borderRadius: 0.5,
                    bgcolor: 'action.hover',
                    wordBreak: 'break-all',
                  }}
                >
                  {line}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="warning.main">
                {t('builder.addDirectiveIncomplete')}
              </Typography>
            ))}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={close}>{t('app.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!ready}
          onClick={() => {
            onAdd(line);
            close();
          }}
        >
          {t('builder.addDirectiveAction')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
