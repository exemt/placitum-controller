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

export function FileMenu() {
  const { t } = useI18n();
  const { source, replaceSource } = useRule();
  const { files, activeId, nameOf, textOf } = useWorkspace();

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);

  const edited = files.find((file) => file.id === activeId)?.edited === true;

  const replace = (text: string) => {
    if (edited) setPending(text);
    else replaceSource(text);
  };

  const picker = useFilePicker({
    accept: FILE_ACCEPT,
    onText: replace,
    onError: () => setNotice('files.readFailed'),
  });

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
