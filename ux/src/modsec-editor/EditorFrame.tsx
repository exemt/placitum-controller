import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import RuleEditor from './components/RuleEditor';
import { DebugPanel } from './components/DebugPanel';
import { EditorToolbar, HistoryButtons } from './components/EditorToolbar';
import { FileMenu } from './components/FileMenu';
import { FileSetControls } from './components/FileSetControls';
import { VisualBuilder } from './components/builder/VisualBuilder';
import { useI18n } from './i18n/useI18n';
import { useRule } from './context/ruleContext';
import { useWorkspace } from './context/workspaceContext';
import { useEditorView } from './context/editorViewContext';
import type { EditorTab } from './context/editorViewContext';

export function EditorFrame() {
  const { t } = useI18n();
  const { compiled } = useRule();
  const { single } = useWorkspace();
  const { tab, setTab } = useEditorView();

  const visualBlocked = !compiled.ok;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        color: 'text.primary',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pl: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        {!single && (
          <>
            <FileSetControls width={320} />
            <Divider orientation="vertical" sx={{ height: 20 }} />
          </>
        )}

        <FileMenu />
        <Divider orientation="vertical" sx={{ height: 20 }} />

        <HistoryButtons />
        <Divider orientation="vertical" sx={{ height: 20 }} />

        <Tabs
          value={tab}
          onChange={(_, next: EditorTab) => setTab(next)}
          sx={{ flexShrink: 0 }}
        >
          <Tab value="text" label={t('tab.text')} />
          <Tab
            value="visual"
            label={
              <Tooltip title={visualBlocked ? t('tab.visualBlocked') : ''}>
                <span>{t('tab.visual')}</span>
              </Tooltip>
            }
            disabled={visualBlocked && tab !== 'visual'}
          />
        </Tabs>

        <EditorToolbar tab={tab} />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        {tab === 'text' ? <RuleEditor /> : <VisualBuilder />}
      </Box>
      <DebugPanel />
    </Box>
  );
}
