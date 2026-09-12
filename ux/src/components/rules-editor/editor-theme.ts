import { useMemo } from "react";
import { useTheme, type Theme } from "@mui/material/styles";

import { createEditorTheme } from "../../modsec-editor/index.tsx";

/**
 * Базовый кегль темы редактора при корне документа панели: панель ужимает
 * html до 80%, и 13px самостоятельного редактора здесь равны 16.
 */
const EDITOR_FONT_SIZE = 16;

/**
 * Тема редактора под панель: слои панели (окна на 4000, подсказки выше) и
 * кегль под её корень. Одна на окно и на встроенный редактор -- чтобы
 * подсказка по слову в карточке и в окне была одного размера.
 */
export function useEditorTheme(): Theme {
  const panel = useTheme();
  return useMemo(
    () => createEditorTheme({ zIndex: panel.zIndex, fontSize: EDITOR_FONT_SIZE }),
    [panel.zIndex],
  );
}
