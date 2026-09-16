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

const filterFiles = createFilterOptions<WorkspaceFile>({
  stringify: (file) => file.name,
  trim: true,
});

function EditedMark() {
  return (
    <Typography component="span" variant="body2" color="text.secondary" aria-hidden>
      •
    </Typography>
  );
}

export function FileSetControls({ width = 560 }: { width?: number }) {
  const { t } = useI18n();
  const { files, activeId, selectFile } = useWorkspace();
  const [managing, setManaging] = useState(false);
  const [listed, setListed] = useState(false);
  const [hinted, setHinted] = useState(false);

  const active = files.find((file) => file.id === activeId) ?? null;

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      {active !== null && (
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
            disableClearable
            options={files}
            value={active}
            onChange={(_, next) => selectFile(next.id)}
            filterOptions={filterFiles}
            getOptionLabel={(file) => file.name}
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
            sx={{ width, minWidth: 160, maxWidth: '100%' }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={t('document.search')}
                slotProps={{
                  ...params.slotProps,
                  input: {
                    ...params.slotProps.input,
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
