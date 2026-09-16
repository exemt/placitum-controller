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

export function InlineRulesEditor({
  name,
  value,
  onChange,
}: {
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

  useEffect(() => {
    if (seeded && source !== valueRef.current) {
      onChangeRef.current(source);
    }
  }, [seeded, source]);

  useEffect(() => {
    if (value !== selectSource(store.getState().files)) {
      store.dispatch(applyRuleSource(value, "skip"));
    }
  }, [value, store]);

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
