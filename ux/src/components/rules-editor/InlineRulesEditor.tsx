import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Box from "@mui/material/Box";

import { useAppSelector } from "../../store/hooks.ts";
import {
  ModsecTextEditor,
  applyRuleSource,
  makeStore,
  replaceWorkspace,
  selectSource,
} from "../../modsec-editor/index.tsx";
import { useEditorTheme } from "./editor-theme.ts";

/**
 * Текстовый редактор правил вместо поля ввода: подсветка, номера строк,
 * отметки замечаний на полях, справка по слову под курсором.
 *
 * Снаружи это управляемое поле -- `value` и `onChange`, как у `TextField`,
 * которое оно заменяет: форма держит черновик у себя и ничего о редакторе
 * не знает. Внутри у редактора свой стор с историей отмены, и два эффекта
 * держат его и форму в согласии: правка в редакторе уходит наверх, а текст,
 * пришедший сверху (деталь дочиталась, залили файл с диска), ложится в стор
 * без шага истории -- отменять чужую замену нечем.
 *
 * Стор засевается до первого рендера, а не эффектом провайдера: иначе первый
 * кадр видел бы пустой стор и отправил бы наверх пустую строку вместо
 * черновика.
 */
export function InlineRulesEditor({
  name,
  value,
  onChange,
}: {
  /** Имя файла: подпись выгрузки и справки, на текст не влияет. */
  name: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const locale = useAppSelector((s) => s.ui.locale);
  const theme = useEditorTheme();

  const [seed] = useState(() => [{ name, source: value }]);
  const [store] = useState(() => {
    const created = makeStore();
    created.dispatch(replaceWorkspace({ files: seed }));
    return created;
  });

  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );
  const files = useSyncExternalStore(subscribe, () => store.getState().files);
  const source = selectSource(files);
  const seeded = files.files.length > 0;

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Наверх: правка в редакторе -- это правка черновика формы.
  useEffect(() => {
    if (seeded && source !== valueRef.current) {
      onChangeRef.current(source);
    }
  }, [seeded, source]);

  // Вниз: текст, заменённый снаружи, без шага истории.
  useEffect(() => {
    if (value !== selectSource(store.getState().files)) {
      store.dispatch(applyRuleSource(value, "skip"));
    }
  }, [value, store]);

  /*
   * Кегль кода в карточке -- панельный, а не редакторский: строка правила
   * стоит здесь рядом с полями формы и подписями, и код на треть крупнее
   * соседей читается вставкой из другого приложения. В окне редактора кегль
   * остаётся своим: там код -- единственное содержимое, и мельчить его
   * незачем. Отступы внутри редактора заданы в em и ужимаются вместе с ним.
   */
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        "--rule-editor-font-size": "0.85rem",
      }}
    >
      <ModsecTextEditor store={store} locale={locale} theme={theme} files={seed} />
    </Box>
  );
}
