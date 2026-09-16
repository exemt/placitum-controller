import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";

import { ConfirmModal, Modal } from "../Modal.tsx";
import { updateRuleFile, updateRuleSet } from "../../api.ts";
import { useT } from "../../i18n/index.ts";
import { useAppSelector } from "../../store/hooks.ts";
import { noticeOfError, type FormNotice } from "../../store/slices/forms.ts";
import {
  ModsecEditor,
  makeStore,
  markSaved,
  type NewFile,
} from "../../modsec-editor/index.tsx";
import { useEditorTheme } from "./editor-theme.ts";

export interface EditorSeed {
  uuid: string;
  name: string;
  text: string;
  baseline?: string;
}

export interface EditorSaved {
  files: { uuid: string; name: string; text: string }[];
}

export type RulesEditorProps = {
  scope: string;
  name: string;
  mode: "file" | "profile";
  profileId?: string;
  load: () => Promise<EditorSeed[]>;
  onClose: () => void;
  onSaved: (saved: EditorSaved) => void;
};

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function RulesEditorModal({
  scope,
  name,
  mode,
  profileId,
  load,
  onClose,
  onSaved,
}: RulesEditorProps) {
  const t = useT();
  const locale = useAppSelector((s) => s.ui.locale);
  const theme = useEditorTheme();

  const [store] = useState(makeStore);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store],
  );
  const files = useSyncExternalStore(
    subscribe,
    () => store.getState().files.files,
  );

  const [seeds, setSeeds] = useState<NewFile[] | null>(null);
  const [savedOrder, setSavedOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);

  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let alive = true;
    loadRef
      .current()
      .then((rows) => {
        if (!alive) {
          return;
        }
        setSeeds(
          rows.map((row) => ({
            key: row.uuid,
            name: row.name,
            source: row.text,
            baseline: row.baseline,
          })),
        );
        setSavedOrder(rows.map((row) => row.uuid));
      })
      .catch((err: unknown) => {
        if (alive) {
          setNotice(noticeOfError(err));
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const changed = files.filter((file) => file.source !== file.baseline).length;
  const orderChanged =
    mode === "profile" &&
    seeds !== null &&
    !sameList(
      files.map((file) => file.key ?? ""),
      savedOrder,
    );
  const dirty = changed > 0 || orderChanged;

  const status =
    changed > 0
      ? t("rulesEditor.changed", { count: changed })
      : orderChanged
        ? t("rulesEditor.orderChanged")
        : t("rulesEditor.clean");

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const keys: string[] = [];
      const saved: EditorSaved["files"] = [];
      for (const file of store.getState().files.files) {
        const key = file.key;
        if (key === undefined) {
          continue;
        }
        if (file.source !== file.baseline) {
          await updateRuleFile(scope, key, { text_raw: file.source });
          store.dispatch(markSaved(file.id));
        }
        keys.push(key);
        saved.push({ uuid: key, name: file.name, text: file.source });
      }
      if (
        mode === "profile" &&
        profileId !== undefined &&
        !sameList(keys, savedOrder)
      ) {
        await updateRuleSet(scope, profileId, { files: keys });
      }
      setSavedOrder(keys);
      onSaved({ files: saved });
    } catch (err: unknown) {
      setNotice(noticeOfError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t(mode === "file" ? "rulesEditor.titleFile" : "rulesEditor.titleProfile")}
        label={`${name} · ${status}`}
        size="xl"
        busy={busy}
        notice={notice}
        onNoticeClose={() => setNotice(null)}
        flush
        spacing={0}
        scroll={false}
        dirty={dirty}
        sx={{ height: "calc(100% - 64px)" }}
        actions={
          <>
            <Button
              disabled={busy}
              onClick={() => {
                if (dirty) {
                  setAskDiscard(true);
                } else {
                  onClose();
                }
              }}
            >
              {t("common.close")}
            </Button>
            <Modal.Submit
              disabled={!dirty || seeds === null}
              onClick={() => void save()}
            >
              {t("common.save")}
            </Modal.Submit>
          </>
        }
      >
        {seeds === null ? (
          <Box sx={{ p: 2 }}>
            {notice === null && <LinearProgress />}
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
              {t("rulesEditor.loading")}
            </Typography>
          </Box>
        ) : (
          <ModsecEditor
            store={store}
            locale={locale}
            theme={theme}
            files={seeds}
            single={mode === "file"}
          />
        )}
      </Modal>

      {askDiscard && (
        <ConfirmModal
          open
          title={t("modal.dirtyTitle")}
          text={t("modal.dirtyText")}
          confirmLabel={t("modal.discard")}
          danger
          onClose={() => setAskDiscard(false)}
          onConfirm={() => {
            setAskDiscard(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
