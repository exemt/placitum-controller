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
  /** Стор редактора — тот, что завёл хранитель; см. `makeStore`. */
  store: EditorStore;
  locale: Locale;
  /** Тема редактора; см. `createEditorTheme`. */
  theme: Theme;
  /** Файлы набора в порядке чтения. Читаются один раз, при монтировании. */
  files: NewFile[];
  /** Редактор открыт на одном файле: набора нет, органов набора тоже. */
  single?: boolean;
}

/**
 * Редактор правил ModSecurity целиком: стор, язык, тема, набор, тело.
 *
 * Собран как самостоятельное приложение, только без окна: окно, заголовок и
 * кнопки записи даёт панель, а редактор занимает то, что ему отвели. Стор
 * приходит снаружи, потому что запись делает хранитель: ему нужно прочитать
 * файлы и снять с записанных отметку «правлен» — и то и другое через стор, а
 * не через дерево компонентов.
 *
 * Заводить файлы редактор не умеет вовсе: набор правил — запись каталога, и
 * дорога к ней одна, своя страница. Здесь правят то, что уже заведено, а
 * порядок чтения и состав профиля — окном файлов.
 *
 * Набор объявлен выше вкладок: имя правимого файла стоит в строке вкладок,
 * а значит, о наборе должны знать и строка, и содержимое. Раскрытие карточек
 * конструктора живёт ещё выше вкладок по той же причине: уйти в текст и
 * вернуться — не повод забыть, какие правила были открыты.
 */
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

/**
 * Только текстовая вкладка: редактор одного файла без строки вкладок,
 * конструктора и панели замечаний.
 *
 * Им заменяют поле ввода там, где текст правят на месте -- в карточке
 * набора. Провайдеры те же, что у полного редактора, потому что и текстовой
 * вкладке нужны разбор и смысловой проход: отметки замечаний на полях
 * считаются по ним. Раскрытие карточек конструктора здесь ни к чему.
 */
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
