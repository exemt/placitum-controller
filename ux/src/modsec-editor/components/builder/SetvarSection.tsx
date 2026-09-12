import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { ChoiceField } from './ChoiceField';
import { LongTextField } from './LongTextField';
import { SideTitle } from './SideTitle';
import { SuggestField } from './SuggestField';
import { VariableBrowseHost, VariableMark } from './VariableMark';
import { COLLECTION_COLUMN, ICON_COLUMN, SETVAR_OP_COLUMN } from './layout';
import { useWorkspace } from '../../context/workspaceContext';
import { useI18n } from '../../i18n/useI18n';
import { setvarCollectionChoices, setvarOpChoices } from '../../modsec/choices';
import { collectionVariables } from '../../modsec/variables';
import {
  freeVarName,
  makeSetvar,
  readSetvar,
  readSetvarTarget,
  writeSetvar,
} from '../../modsec/setvar';
import { MACRO_SUGGESTIONS, SETVAR_SUGGESTIONS, setvarNameSuggestions } from '../../modsec/suggestions';
import type { SetvarOp } from '../../modsec/setvar';

/**
 * Колонки ряда присваивания: коллекция, имя, вид записи, значение и крестик.
 *
 * Сеткой, а не рядом полей: рядов у правила бывает десяток, и просматривают их
 * сверху вниз по одной колонке — «что здесь вообще выставляется». Колонка,
 * гуляющая от ряда к ряду вслед за длиной имени, превращает один список в
 * несколько, положенных друг под друга.
 *
 * Отметка переменной стоит в обойме поля имени, а не отдельной колонкой:
 * иначе ряд держал бы две иконочные клетки подряд — сведения и удаление, —
 * и взгляд искал бы крестик заново на каждом присваивании.
 */
const ROW_COLUMNS = [
  `${COLLECTION_COLUMN}px`,
  // Имени места больше, чем значению: `inbound_anomaly_score_threshold` — это
  // тридцать один знак, а справа от знака равенства обычно стоит число или
  // один макрос. Обрезанное имя при этом хуже обрезанного значения: значение
  // правят, уже зная, какую переменную выставляют.
  'minmax(160px, 1.5fr)',
  `${SETVAR_OP_COLUMN}px`,
  'minmax(120px, 1fr)',
  `${ICON_COLUMN}px`,
].join(' ');

interface SetvarSectionProps {
  /** Присваивания правила в порядке следования. */
  values: string[];
  onChange: (next: string[]) => void;
}

/**
 * Установка переменных: список присваиваний с формой на каждое.
 *
 * Раньше здесь стояло текстовое поле на весь `setvar`, и это было честно, но
 * мало: в `tx.anomaly_score=+%{tx.critical_anomaly_score}` четыре разных
 * вопроса, и один из них — знак `+` посреди строки — меняет смысл записи
 * целиком. `tx.score=1` затирает накопленный счёт, `tx.score=+1` к нему
 * прибавляет; обе записи правильные, обе загрузятся, и перепутанные они не
 * выдают себя ничем. Поэтому вид записи не набирают, а выбирают — тем же
 * полем, что оператор и реакцию.
 *
 * Заводят присваивание кнопкой, а не в текстовой вкладке, и заготовка у него
 * готовая — `tx.var=1` с незанятым именем. Спрашивать имя заранее означало бы
 * показать то же поле, но раньше: у переменной оно правится свободно, как имя
 * метки, и осмысленное вписывают на месте. Незанятое при этом обязательно:
 * второе присваивание тому же имени не заводит вторую переменную, а
 * переписывает первую.
 *
 * Разбор сходится не всегда — макрос в имени, коллекция, в которую движок не
 * пишет, запись без значения, — и тогда формы нет вовсе, а остаётся строка
 * целиком. Это та же честность, что и у директивы: форма, показывающая меньше,
 * чем есть в записи, сохранила бы ровно то, что показала.
 */
export function SetvarSection({ values, onChange }: SetvarSectionProps) {
  const { t } = useI18n();
  const { variables } = useWorkspace();

  const replace = (index: number, raw: string) =>
    onChange(values.map((value, i) => (i === index ? raw : value)));

  const remove = (index: number) => onChange(values.filter((_, i) => i !== index));

  /**
   * Имена, занятые в наборе и в самом правиле.
   *
   * Набор — потому что коллекция транзакции общая на файлы; правило — потому
   * что только что добавленный ряд в индексе появится лишь после переразбора
   * текста, а вторую кнопку нажимают, не дожидаясь его.
   */
  const add = () => {
    const taken = [
      ...collectionVariables(variables, 'tx'),
      ...values.map((value) => readSetvarTarget(value)).map((target) => target?.name ?? ''),
    ];
    onChange([...values, makeSetvar(freeVarName(taken))]);
  };

  return (
    <VariableBrowseHost>
      <Stack spacing={0.75}>
      <SideTitle label={t('builder.setvar')} />

      {values.map((raw, index) => {
        const assignment = readSetvar(raw);

        // Разбор не сошёлся: коллекцию с именем ещё видно, а формы уже нет.
        // Отметка при этом остаётся — о переменной с макросом в имени набор
        // знает ровно столько же, сколько о любой другой.
        if (assignment === null) {
          const target = readSetvarTarget(raw);
          return (
            <Box
              key={index}
              sx={{ display: 'grid', gridTemplateColumns: ROW_COLUMNS, gap: 1 }}
            >
              <Tooltip title={t('builder.setvarRaw')} placement="top-start" enterDelay={600}>
                <Box sx={{ gridColumn: 'span 4', minWidth: 0 }}>
                  <LongTextField
                    fullWidth
                    monospace
                    dialogTitle={t('builder.setvar')}
                    suggestions={SETVAR_SUGGESTIONS}
                    value={raw}
                    onCommit={(value) => replace(index, value)}
                    actions={
                      target === null ? undefined : (
                        <VariableMark collection={target.collection} name={target.name} />
                      )
                    }
                  />
                </Box>
              </Tooltip>

              <RemoveButton onRemove={() => remove(index)} />
            </Box>
          );
        }

        const { collection, name, op, value } = assignment;
        const commit = (next: Partial<typeof assignment>) =>
          replace(index, writeSetvar({ ...assignment, ...next }));

        return (
          <Box key={index} sx={{ display: 'grid', gridTemplateColumns: ROW_COLUMNS, gap: 1 }}>
            <ChoiceField
              label={t('builder.setvarCollection')}
              choices={setvarCollectionChoices(collection)}
              value={collection}
              onChange={(next) => commit({ collection: next })}
            />

            <SuggestField
              label={t('builder.setvarName')}
              monospace
              required
              suggestions={setvarNameSuggestions(collection, variables)}
              value={name}
              error={name === '' ? t('builder.setvarNameRequired') : undefined}
              onCommit={(next) => commit({ name: next })}
              optionEnd={(option) => (
                <VariableMark
                  collection={collection}
                  name={option.value}
                  count={option.badge}
                />
              )}
              endAdornment={
                <InputAdornment position="end">
                  <VariableMark collection={collection} name={name} />
                </InputAdornment>
              }
            />

            <ChoiceField
              label={t('builder.setvarOp')}
              choices={setvarOpChoices(op)}
              value={op}
              onChange={(next) =>
                commit({
                  op: next as SetvarOp,
                  // Удаление значения не принимает: оставленное, оно ушло бы в
                  // запись, которую ModSecurity читает не как удаление.
                  value: next === 'delete' ? '' : value,
                })
              }
            />

            {/* Значение свободное и с макросами: `%{tx.critical_anomaly_score}`
                в наборах CRS стоит чаще числа. */}
            <Tooltip
              title={op === 'delete' ? t('builder.setvarNoValue') : ''}
              placement="top-start"
            >
              <Box sx={{ minWidth: 0 }}>
                <LongTextField
                  fullWidth
                  monospace
                  label={t('builder.setvarValue')}
                  dialogTitle={t('builder.setvarValue')}
                  disabled={op === 'delete'}
                  suggestions={MACRO_SUGGESTIONS}
                  value={value}
                  onCommit={(next) => commit({ value: next })}
                />
              </Box>
            </Tooltip>

            <RemoveButton onRemove={() => remove(index)} />
          </Box>
        );
      })}

      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={add}>
          {t('builder.addSetvar')}
        </Button>
      </Box>
      </Stack>
    </VariableBrowseHost>
  );
}

/** Убрать присваивание — тот же крестик, что у области проверки. */
function RemoveButton({ onRemove }: { onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <Tooltip title={t('builder.deleteSetvar')}>
      <IconButton size="small" aria-label={t('builder.deleteSetvar')} onClick={onRemove}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}
