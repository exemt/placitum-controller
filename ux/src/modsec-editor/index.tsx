import { Provider } from 'react-redux';
import { ThemeProvider } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { EditorFrame } from './EditorFrame';
import RuleEditor from './components/RuleEditor';
import { BuilderViewProvider } from './context/BuilderViewProvider';
import { EditorViewProvider } from './context/EditorViewProvider';
import { WorkspaceProvider } from './context/WorkspaceProvider';
import { I18nProvider } from './i18n/I18nProvider';
import type { Locale } from './i18n/translations';
import { EditorStoreContext } from './store/hooks';
import type { EditorStore } from './store';
import type { NewFile } from './store/filesSlice';

export { makeStore } from './store';
export type { EditorStore, RootState as EditorState } from './store';
export {
  applyRuleSource,
  markSaved,
  replaceWorkspace,
  selectSource,
} from './store/filesSlice';
export type { EditorFile, NewFile } from './store/filesSlice';
export { createEditorTheme } from './theme';
export type { Locale as EditorLocale } from './i18n/translations';

export interface ModsecEditorProps {
  store: EditorStore;
  locale: Locale;
  theme: Theme;
  files: NewFile[];
  single?: boolean;
}

export function ModsecEditor({
  store,
  locale,
  theme,
  files,
  single,
}: ModsecEditorProps) {
  return (
    <Provider store={store} context={EditorStoreContext}>
      <I18nProvider locale={locale}>
        <ThemeProvider theme={theme}>
          <WorkspaceProvider initialFiles={files} single={single}>
            <EditorViewProvider>
              <BuilderViewProvider>
                <EditorFrame />
              </BuilderViewProvider>
            </EditorViewProvider>
          </WorkspaceProvider>
        </ThemeProvider>
      </I18nProvider>
    </Provider>
  );
}

export function ModsecTextEditor({
  store,
  locale,
  theme,
  files,
}: Omit<ModsecEditorProps, 'single'>) {
  return (
    <Provider store={store} context={EditorStoreContext}>
      <I18nProvider locale={locale}>
        <ThemeProvider theme={theme}>
          <WorkspaceProvider initialFiles={files} single>
            <EditorViewProvider>
              <RuleEditor />
            </EditorViewProvider>
          </WorkspaceProvider>
        </ThemeProvider>
      </I18nProvider>
    </Provider>
  );
}
