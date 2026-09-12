import { useState } from 'react';
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import { FileManagerDialog } from './FileManagerDialog';
import { useI18n } from '../i18n/useI18n';
import { useWorkspace } from '../context/workspaceContext';
import type { WorkspaceFile } from '../context/workspaceContext';

/**
 * Отбор файлов по набранному.
 *
 * Ищем по имени и только по нему: больше у файла в этом списке ничего нет, а
 * искать по содержимому значило бы обещать поиск по правилам, которого здесь
 * нет. Отбор идёт по любой части имени, а не по началу: файлы набора CRS
 * различаются серединой — `REQUEST-942-APPLICATION-ATTACK-SQLI`, — и поиск по
 * началу нашёл бы по слову «sqli» ровно ничего.
 */
const filterFiles = createFilterOptions<WorkspaceFile>({
  stringify: (file) => file.name,
  trim: true,
});

/** Отметка правки — та же точка, что стояла в закрытом списке. */
function EditedMark() {
  return (
    <Typography component="span" variant="body2" color="text.secondary" aria-hidden>
      •
    </Typography>
  );
}

/**
 * Какой файл набора правят и вход в сам набор.
 *
 * Стоит в заголовке, а не над содержимым: это не действие над текстом, а ответ
 * на вопрос «где я» — того же рода, что выбор языка рядом. Правят один файл,
 * держат открытыми все, и переход между ними должен быть под рукой, не открывая
 * менеджера.
 *
 * Поле со списком, а не список: набор бывает и в тридцать файлов — столько
 * приходит с CRS, — и такой список открывается прокруткой, в которой имена
 * отличаются одним словом посередине. Набранное сужает список до подходящих
 * имён, и это то же поле, что в конструкторе: выбор из известного перечня,
 * который ищут набором. Отдельной строки поиска в заголовке поэтому нет — само
 * поле выбора и есть строка ввода.
 *
 * Имя файла при этом не правится: набранное отбирает, а не переименовывает, и
 * по уходе из поля в нём снова стоит имя открытого файла. Переименования нет
 * нигде в редакторе, так что подменить его набор в этом поле не может.
 *
 * Значок менеджера виден всегда, даже когда файл в наборе один: вторым файлом
 * набор обзаводится через него же.
 */
export function FileSetControls({ width = 560 }: { width?: number }) {
  const { t } = useI18n();
  const { files, activeId, selectFile } = useWorkspace();
  const [managing, setManaging] = useState(false);
  /** Список файлов раскрыт. */
  const [listed, setListed] = useState(false);
  /** На поле наведено: подсказка была бы показана, если бы список был закрыт. */
  const [hinted, setHinted] = useState(false);

  const active = files.find((file) => file.id === activeId) ?? null;

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      {active !== null && (
        // `describeChild`: у поля есть имя, и подсказка обязана остаться
        // описанием, а не подменить это имя собой.
        //
        // Пока список раскрыт, подсказки нет: всплывает она под полем, то есть
        // ровно над теми именами, ради которых список и открыли.
        <Tooltip
          title={t('document.sectionHint')}
          describeChild
          open={hinted && !listed}
          onOpen={() => setHinted(true)}
          onClose={() => setHinted(false)}
        >
          <Autocomplete<WorkspaceFile, false, true, false>
            openOnFocus
            onOpen={() => setListed(true)}
            onClose={() => setListed(false)}
            selectOnFocus
            handleHomeEndKeys
            autoHighlight
            // Пустого значения у поля не бывает: правят всегда какой-то файл,
            // и крестик «очистить» предложил бы состояние, которого нет.
            disableClearable
            options={files}
            value={active}
            onChange={(_, next) => selectFile(next.id)}
            filterOptions={filterFiles}
            getOptionLabel={(file) => file.name}
            // Файл — это его `id`, а не имя: одноимённые файлы в наборе
            // случаются, и сравнение по имени спутало бы их между собой.
            isOptionEqualToValue={(option, value) => option.id === value.id}
            noOptionsText={t('document.noMatch')}
            renderOption={(props, file) => {
              const { key, ...rest } = props;
              return (
                <Box component="li" key={key} {...rest}>
                  <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                    {file.name}
                  </Typography>
                  {file.edited && <EditedMark />}
                </Box>
              );
            }}
            // Ширина поля — это ширина видимого имени и всего списка под ним:
            // выпадающий список повторяет её. Имена набора CRS длинные и
            // различаются серединой, поэтому узкое поле обрезает их как раз
            // там, где они и отличаются друг от друга. Сжиматься поле при
            // этом умеет: на узком окне место первым уступает заголовок, но
            // отдать его целиком он не может.
            sx={{ width, minWidth: 160, maxWidth: '100%' }}
            renderInput={(params) => (
              // `params.slotProps` держит привязку поля к списку: свои
              // значения можно только дописывать поверх, но не подменять.
              // Высоту полю задаёт тема: в заголовке оно стоит рядом с
              // кнопками, и совпадать они обязаны точно, а не на глаз.
              <TextField
                {...params}
                placeholder={t('document.search')}
                slotProps={{
                  ...params.slotProps,
                  input: {
                    ...params.slotProps.input,
                    // Точка стоит слева от стрелки, у самого имени: она о
                    // файле, а стрелка — о списке.
                    endAdornment: (
                      <>
                        {active.edited && <EditedMark />}
                        {params.slotProps.input.endAdornment}
                      </>
                    ),
                  },
                  htmlInput: {
                    ...params.slotProps.htmlInput,
                    'aria-label': t('document.section'),
                  },
                }}
              />
            )}
          />
        </Tooltip>
      )}

      {/* Кнопка в рамке, а не голый значок: в заголовке она стоит между полем
          и переключателем языка, и элемент без рамки посреди двух обведённых
          читается провалом в ряду. Рамку и высоту даёт тот же ToggleButton,
          что и кнопки языка, — совпадать они обязаны точно, а не на глаз.
          Нажатое состояние — открытый менеджер: пока окно на экране, видно,
          какая кнопка его открыла. */}
      <Tooltip title={t('files.manageHint')}>
        <ToggleButton
          size="small"
          value="manage"
          selected={managing}
          aria-label={t('files.manage')}
          onClick={() => setManaging(true)}
        >
          <FolderCopyIcon fontSize="small" />
        </ToggleButton>
      </Tooltip>

      <FileManagerDialog open={managing} onClose={() => setManaging(false)} />
    </Stack>
  );
}
