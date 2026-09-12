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

/**
 * Тело редактора: строка вкладок с органами управления, содержимое, панель
 * замечаний.
 *
 * Это то, что в самостоятельном приложении стояло внутри его единственного
 * окна. Самого окна здесь нет: его даёт панель, вместе с заголовком, полосой
 * отказа и кнопками записи, — а редактор растягивается на всё, что окно ему
 * отвело. Растягивается сам: высоту ему задаёт окно, и просить её у
 * содержимого он не должен.
 *
 * Две вкладки редактора поверх одного и того же текста. Визуальная доступна
 * только тогда, когда правило компилируется: конструктор умеет работать лишь
 * с корректной моделью, а притворяться, что он понимает сломанный текст, —
 * худший из возможных вариантов. Если правило сломали уже внутри
 * конструктора, вкладка не переключается сама — там появляется объяснение и
 * предложение вернуться в текст.
 *
 * Выбор файла набора стоит в этой же строке, первым: в самостоятельном
 * приложении он жил в заголовке окна, но заголовок теперь у панели, а
 * ответ на «где я» должен быть рядом с тем, что правят. У одинокого файла
 * выбирать не из чего, и поля нет.
 */
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
      {/* Порядок в строке — от общего к частному: набор целиком, история
          документа, взгляд на него, что умеет этот взгляд, главное действие. */}
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
