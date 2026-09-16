# modsec-editor

Копия редактора правил ModSecurity из https://github.com/exemt/modsecEditor
(коммит `f9fb2fb`, 2026-08-01), встроенная в панель окном.

Ядро (`modsec/`), конструктор (`components/builder/`), подсветка и справка
по словам (`components/syntax/`) и диагностика взяты как есть. Ниже -- что
снято и что изменено, чтобы копию можно было сверить с upstream и подтянуть
оттуда правки.

Общее правило правок: редактор правит то, что уже заведено, и не заводит
ничего сам. Файлы приходят из каталога наборов, запись уходит туда же, а
всё, что в upstream создавало файлы из воздуха или с диска, снято.

## Что снято

- `App.tsx`, `main.tsx`, `index.css`, `assets/` -- оболочка самостоятельного
  приложения. Вместо неё `EditorFrame.tsx` (тело без окна) и `index.tsx`
  (`ModsecEditor`: провайдеры + тело; `ModsecTextEditor`: провайдеры + одна
  текстовая вкладка, ею панель заменяет поле ввода в карточке набора).
- `store/draft.ts` -- черновик в localStorage. Набор живёт на сервере,
  восстанавливать между сессиями нечего.
- Учебные примеры целиком: `data/` (29 наборов), `ExamplesDialog.tsx`,
  ключи `examples.*`, `exampleSectionKey`, поле `exampleId` у файла. Панель --
  не витрина: примеры заменяли текст правимого файла и стояли в одном меню с
  выгрузкой. Примеры внутри справки по слову (`details.example` в
  `modsecKeywords.ts`) остались -- это часть статьи, а не витрина.
- Заведение файлов: пункты меню «новый файл» и «добавить файлы/архив»,
  область перетаскивания и кнопки в окне файлов, `addFiles`/`newFile`/`setKey`
  в сторе, `openFiles`/`newFile`/`markSaved`/`replaceWorkspace` в контексте,
  чтение архива (`readArchive`) и разбор выбранного в файлы набора
  (`filesFrom`). Файл правил -- запись каталога наборов, и дорога к ней одна:
  своя страница, а в профиль набор добавляют селектором карточки профиля.
  Обратное действие осталось: снять набор с профиля -- правка порядка чтения.
- Тесты (`*.test.*`, `__mocks__`) -- у панели нет jest.

## Что изменено

- `store/index.ts` -- `makeStore()` вместо синглтона: стор на окно.
- `store/hooks.ts` -- свой контекст react-redux (`EditorStoreContext`),
  чтобы `Provider` редактора не перекрывал стор панели.
- `store/filesSlice.ts` -- у файла `key` (uuid набора на сервере) и
  `baseline` на входе (черновик формы против сохранённого).
- `context/WorkspaceProvider.tsx` -- `initialFiles` (много файлов),
  `single` (один файл, без органов набора); последний файл не убирается, а не
  очищается; стор, засеянный до монтирования, не пересеивается (управляемый
  редактор).
- `context/ruleContext.ts`, `RuleProvider.tsx` -- `replaceSource`: замена
  текста целиком отдельным шагом истории.
- `components/FileMenu.tsx` -- переписан: остались замена текста файлом с
  диска, выгрузка файла, выгрузка всех файлов архивом и копия в буфер.
  Выгрузка на диск больше не снимает отметку «правлен».
- `components/FileManagerDialog.tsx` -- то же про выгрузку; окно только про
  порядок чтения, выгрузку и снятие; единственный файл не убирается (кнопка
  выключена с причиной).
- `components/useFilePicker.tsx` -- отдаёт текст одного файла, а не файлы
  набора; `components/archive.ts` -- только упаковка.
- `components/FileSetControls.tsx` -- ширина поля выбора файла пропом.
- `components/RuleEditor.tsx` -- слой подсказки из темы (`zIndex.tooltip`).
- `theme.ts` -- `createEditorTheme({ zIndex, fontSize })` вместо готового
  объекта: слои панели (окна на 4000) и кегль под `html { font-size: 80% }`.
- `i18n/I18nProvider.tsx` -- язык только снаружи (из стора панели), без
  localStorage и `document.lang`.
- `i18n/translations.ts` -- ключи меню и окна файлов под новую семантику и
  под словарь панели: набор здесь -- один файл, а собрание файлов -- профиль
  (`files.title` = «Файлы профиля», `files.remove` = «убрать из профиля»).
  Добавлены `menu.replaceText`, `files.lastFile`, `files.readFailed`; сняты
  `menu.newSet`, `menu.newFile`, `menu.addFiles`, `menu.open*`,
  `menu.examples`, `files.create`, `files.addFromDisk`, `files.dropHere`,
  `files.archiveFailed`, `files.clear*`, `document.replace*Body` (кроме
  одного).
- `components/builder/TagMark.tsx` -- типизация `children.props` под
  `ReactElement<unknown>` из React 19.
- `modsec/markers.ts` -- снят неиспользуемый импорт (у панели
  `noUnusedLocals`).

Панельная сторона: `src/components/rules-editor/RulesEditorModal.tsx` (окно,
чтение и запись), `InlineRulesEditor.tsx` (управляемое поле на текстовой
вкладке -- в карточке набора вместо textarea), `editor-theme.ts` (тема под
панель); кнопка «Редактор» у иконок «скачать/залить» в карточке набора
(`pages/Lists.tsx`) и в подвале карточки профиля (`pages/Profiles.tsx`).

Лицензия upstream -- PolyForm Noncommercial 1.0.0, автор тот же.
