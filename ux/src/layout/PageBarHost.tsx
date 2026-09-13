import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import Typography from "@mui/material/Typography";

import PageBar, { type PageBarStatus } from "../components/PageBar.tsx";
import { useT } from "../i18n/index.ts";
import { crumbsForPath } from "./pageCrumbs.ts";

export type PageBarActions = {
  onCreate?: () => void;
  onUpdate?: () => void;
  onSave?: () => void;
  onSend?: () => void;
  onReset?: () => void;
  onUpload?: () => void;
  createDisabled?: boolean;
  updateDisabled?: boolean;
  saveDisabled?: boolean;
  sendDisabled?: boolean;
  resetDisabled?: boolean;
  uploadDisabled?: boolean;
  crumb?: string;
  meta?: string;
  flush?: boolean;
  status?: PageBarStatus[];
};

type HostState = {
  hasCreate: boolean;
  hasUpdate: boolean;
  hasSave: boolean;
  hasSend: boolean;
  hasReset: boolean;
  hasUpload: boolean;
  createDisabled?: boolean;
  updateDisabled?: boolean;
  saveDisabled?: boolean;
  sendDisabled?: boolean;
  resetDisabled?: boolean;
  uploadDisabled?: boolean;
  crumb?: string;
  meta?: string;
  flush?: boolean;
  status?: PageBarStatus[];
};

const empty: HostState = {
  hasCreate: false,
  hasUpdate: false,
  hasSave: false,
  hasSend: false,
  hasReset: false,
  hasUpload: false,
  flush: false,
};

const SetCtx = createContext<(state: HostState) => void>(() => {});
const CreateRefCtx = createContext<{ current?: () => void }>({});
const UpdateRefCtx = createContext<{ current?: () => void }>({});
const SaveRefCtx = createContext<{ current?: () => void }>({});
const SendRefCtx = createContext<{ current?: () => void }>({});
const ResetRefCtx = createContext<{ current?: () => void }>({});
const UploadRefCtx = createContext<{ current?: () => void }>({});
const StateCtx = createContext<HostState>(empty);

export function PageBarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HostState>(empty);
  const onCreateRef = useRef<(() => void) | undefined>(undefined);
  const onUpdateRef = useRef<(() => void) | undefined>(undefined);
  const onSaveRef = useRef<(() => void) | undefined>(undefined);
  const onSendRef = useRef<(() => void) | undefined>(undefined);
  const onResetRef = useRef<(() => void) | undefined>(undefined);
  const onUploadRef = useRef<(() => void) | undefined>(undefined);

  return (
    <SetCtx.Provider value={setState}>
      <CreateRefCtx.Provider value={onCreateRef}>
        <UpdateRefCtx.Provider value={onUpdateRef}>
          <SaveRefCtx.Provider value={onSaveRef}>
            <SendRefCtx.Provider value={onSendRef}>
              <ResetRefCtx.Provider value={onResetRef}>
                <UploadRefCtx.Provider value={onUploadRef}>
                  <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
                </UploadRefCtx.Provider>
              </ResetRefCtx.Provider>
            </SendRefCtx.Provider>
          </SaveRefCtx.Provider>
        </UpdateRefCtx.Provider>
      </CreateRefCtx.Provider>
    </SetCtx.Provider>
  );
}

export function usePageBar(actions: PageBarActions = {}): void {
  const setState = useContext(SetCtx);
  const onCreateRef = useContext(CreateRefCtx);
  const onUpdateRef = useContext(UpdateRefCtx);
  const onSaveRef = useContext(SaveRefCtx);
  const onSendRef = useContext(SendRefCtx);
  const onResetRef = useContext(ResetRefCtx);
  const onUploadRef = useContext(UploadRefCtx);
  const hasCreate = actions.onCreate !== undefined;
  const hasUpdate = actions.onUpdate !== undefined;
  const hasSave = actions.onSave !== undefined;
  const hasSend = actions.onSend !== undefined;
  const hasReset = actions.onReset !== undefined;
  const hasUpload = actions.onUpload !== undefined;

  onCreateRef.current = actions.onCreate;
  onUpdateRef.current = actions.onUpdate;
  onSaveRef.current = actions.onSave;
  onSendRef.current = actions.onSend;
  onResetRef.current = actions.onReset;
  onUploadRef.current = actions.onUpload;

  /*
   * Показатели -- список объектов, и страница пересобирает его на каждом
   * кадре снимка. В зависимостях он должен быть значением, а не ссылкой:
   * иначе живой сокет гнал бы setState на каждый рендер. Список короткий
   * (две-три записи из примитивов), подпись по нему дешевле, чем лишний
   * рендер всей оболочки.
   */
  const statusSig = JSON.stringify(actions.status ?? null);

  useLayoutEffect(() => {
    setState({
      hasCreate,
      hasUpdate,
      hasSave,
      hasSend,
      hasReset,
      hasUpload,
      createDisabled: actions.createDisabled,
      updateDisabled: actions.updateDisabled,
      saveDisabled: actions.saveDisabled,
      sendDisabled: actions.sendDisabled,
      resetDisabled: actions.resetDisabled,
      uploadDisabled: actions.uploadDisabled,
      crumb: actions.crumb,
      meta: actions.meta,
      flush: actions.flush === true,
      status: actions.status,
    });
    return () => setState(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- status по подписи
  }, [
    setState,
    hasCreate,
    hasUpdate,
    hasSave,
    hasSend,
    hasReset,
    hasUpload,
    actions.createDisabled,
    actions.updateDisabled,
    actions.saveDisabled,
    actions.sendDisabled,
    actions.resetDisabled,
    actions.uploadDisabled,
    actions.crumb,
    actions.meta,
    actions.flush,
    statusSig,
  ]);
}

export function usePageLayout(): { flush: boolean } {
  const state = useContext(StateCtx);
  return { flush: state.flush === true };
}

export function ShellPageBar() {
  const location = useLocation();
  const t = useT();
  const state = useContext(StateCtx);
  const onCreateRef = useContext(CreateRefCtx);
  const onUpdateRef = useContext(UpdateRefCtx);
  const onSaveRef = useContext(SaveRefCtx);
  const onSendRef = useContext(SendRefCtx);
  const onResetRef = useContext(ResetRefCtx);
  const onUploadRef = useContext(UploadRefCtx);

  const extraCrumbs =
    state.crumb === undefined ? [] : [{ label: state.crumb }];

  return (
    <PageBar
      crumbs={crumbsForPath(location.pathname, t, extraCrumbs)}
      flush={state.flush === true}
      status={state.status}
      extra={
        state.meta === undefined ? undefined : (
          <Typography
            component="span"
            title={t("config.uuid")}
            sx={{
              fontFamily: "monospace",
              fontSize: "0.7rem",
              color: "text.secondary",
              whiteSpace: "nowrap",
            }}
          >
            {state.meta}
          </Typography>
        )
      }
      createDisabled={state.createDisabled}
      updateDisabled={state.updateDisabled}
      saveDisabled={state.saveDisabled}
      sendDisabled={state.sendDisabled}
      resetDisabled={state.resetDisabled}
      uploadDisabled={state.uploadDisabled}
      onCreate={
        state.hasCreate
          ? () => {
              onCreateRef.current?.();
            }
          : undefined
      }
      onUpdate={
        state.hasUpdate
          ? () => {
              onUpdateRef.current?.();
            }
          : undefined
      }
      onSave={
        state.hasSave
          ? () => {
              onSaveRef.current?.();
            }
          : undefined
      }
      onSend={
        state.hasSend
          ? () => {
              onSendRef.current?.();
            }
          : undefined
      }
      onReset={
        state.hasReset
          ? () => {
              onResetRef.current?.();
            }
          : undefined
      }
      onUpload={
        state.hasUpload
          ? () => {
              onUploadRef.current?.();
            }
          : undefined
      }
    />
  );
}
