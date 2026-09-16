import { useMemo } from "react";
import { useTheme, type Theme } from "@mui/material/styles";

import { createEditorTheme } from "../../modsec-editor/index.tsx";

const EDITOR_FONT_SIZE = 16;

export function useEditorTheme(): Theme {
  const panel = useTheme();
  return useMemo(
    () => createEditorTheme({ zIndex: panel.zIndex, fontSize: EDITOR_FONT_SIZE }),
    [panel.zIndex],
  );
}
