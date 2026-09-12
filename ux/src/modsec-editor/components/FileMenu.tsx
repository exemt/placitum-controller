import { useState } from 'react';
import type { ReactNode } from 'react';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { ConfirmDialog } from './ConfirmDialog';
import { downloadFile, downloadSet } from './download';
import { FILE_ACCEPT, useFilePicker } from './useFilePicker';
import { useI18n } from '../i18n/useI18n';
import type { TranslationKey } from '../i18n/translations';
import { useRule } from '../context/ruleContext';
import { useWorkspace } from '../context/workspaceContext';

/**
 * Что делают с текстом открытого файла: откуда он берётся и куда уходит.
 *
 * Меню, а не ряд кнопок над текстом. Действий здесь четыре, делают их редко —
 * раз за сеанс залили, раз выгрузили, — и в виде постоянной полосы они всё
 * время занимали бы место у содержимого, ради которого редактор и открыт.
 *
 * Заводить файлы отсюда нельзя, и это не упущение. Файл правил — запись
 * каталога наборов: у неё есть имя, описание и профили, которые её включают.
 * Заведённая по дороге, из окна правки, она получила бы одно имя и появилась
 * бы в каталоге как побочный результат сохранения профиля. Поэтому набор
 * создают на своей странице, а в профиль его добавляют селектором в карточке
 * профиля — тем же, что и до появления редактора. Здесь остаётся правка того,
 * что уже есть.
 *
 * По той же причине с диска берут не файл, а текст: он заменяет содержимое
 * открытого файла. Если файл правлен, замена сперва спрашивает — молча
 * выбросить правку нельзя, а вернуть её после замены неоткуда, кроме отмены.
 *
 * Выгрузка на диск сохранением не считается: сохранённое — то, что записал
 * контроллер, и отметку «правлен» снимает только он.
 */
export function FileMenu() {
  const { t } = useI18n();
  const { source, replaceSource } = useRule();
  const { files, activeId, nameOf, textOf } = useWorkspace();

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  /** Текст, ждущий ответа на вопрос о правках открытого файла. */
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);

  const edited = files.find((file) => file.id === activeId)?.edited === true;

  /** Заменить текст открытого файла — сразу или после вопроса о правках. */
  const replace = (text: string) => {
    if (edited) setPending(text);
    else replaceSource(text);
  };

  const picker = useFilePicker({
    accept: FILE_ACCEPT,
    onText: replace,
    onError: () => setNotice('files.readFailed'),
  });

  /** Пункт меню: закрыть меню и сделать то, что в нём выбрали. */
  const pick = (action: () => void) => () => {
    setAnchor(null);
    action();
  };

  const saveActive = () => {
    downloadFile(nameOf(activeId), source);
  };

  const saveAll = () => {
    downloadSet(files.map((file) => ({ name: file.name, text: textOf(file.id) })));
  };

  // Доступ к буферу обмена может быть закрыт политикой страницы. Отвечаем и
  // на отказ: кнопка, которая иногда молчит, хуже кнопки, которая признаётся.
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('toolbar.copied');
    } catch {
      setNotice('toolbar.copyFailed');
    }
  };

  return (
    <>
      {/* `describeChild`: у кнопки есть подпись, и подсказка обязана остаться
          описанием, а не подменить имя кнопки собой. */}
      <Tooltip title={t('menu.fileHint')} describeChild>
        <Button
          size="small"
          color="inherit"
          endIcon={<ArrowDropDownIcon />}
          aria-haspopup="menu"
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ px: 1, flexShrink: 0 }}
        >
          {t('menu.file')}
        </Button>
      </Tooltip>

      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <Item
          icon={<UploadFileIcon fontSize="small" />}
          label={t('menu.replaceText')}
          onClick={pick(picker.open)}
        />

        <Divider />

        <Item
          icon={<DownloadIcon fontSize="small" />}
          label={t('menu.saveFile', { name: nameOf(activeId) })}
          onClick={pick(saveActive)}
        />
        {/* Один файл архивом не выгружают: это тот же файл, но в обёртке,
            которую придётся снимать вручную. */}
        {files.length > 1 && (
          <Item
            icon={<FolderZipIcon fontSize="small" />}
            label={t('menu.saveArchive')}
            onClick={pick(saveAll)}
          />
        )}
        <Item
          icon={<ContentCopyIcon fontSize="small" />}
          label={t('menu.copy')}
          onClick={pick(() => void copy(source))}
        />
      </Menu>

      {picker.input}

      <ConfirmDialog
        open={pending !== null}
        title={t('document.replaceTitle')}
        body={t('document.replaceBody', { name: nameOf(activeId) })}
        confirmLabel={t('document.replace')}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending !== null) replaceSource(pending);
          setPending(null);
        }}
      />

      <Snackbar
        open={notice !== null}
        autoHideDuration={2500}
        onClose={() => setNotice(null)}
        message={notice === null ? '' : t(notice)}
      />
    </>
  );
}

/** Пункт меню со значком: значки выравнивают подписи в колонку. */
function Item({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <MenuItem onClick={onClick}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText slotProps={{ primary: { variant: 'body2' } }}>{label}</ListItemText>
    </MenuItem>
  );
}
