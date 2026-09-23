import { useState } from "react";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";

import { BlockHead } from "../components/BlockHead.tsx";
import { Modal } from "../components/Modal.tsx";
import { NginxEditor, UnderlayTabs } from "../components/fields.tsx";
import {
  LayerBar,
  LayerCard,
  LayerTabs,
  useLayerTab,
} from "../config/layer-tabs.tsx";
import {
  nginxCount,
  nginxItems,
  NginxSectionBody,
  nginxSectionsFor,
  type NginxLevel,
} from "../config/nginx-directives.tsx";
import {
  routeCount,
  RouteGroupBody,
  routeItems,
  type RouteProtocol,
  type RouteLevel,
} from "../config/RouteForm.tsx";
import type { ParentChain } from "../config/inherit.ts";
import type { Translate } from "../i18n/index.ts";
import type { Doc } from "./config-fields.tsx";

export type { NginxLevel };

type ParamsView = "waf" | "nginx";

const PARAMS_VIEWS: readonly ParamsView[] = ["waf", "nginx"];

interface ParamsDocs {
  waf: Doc;
  nginx: Doc;
}

export function RouteParams({
  t,
  level,
  protocol,
  waf,
  nginx,
  wafParents,
  nginxParents,
  onWaf,
  onNginx,
}: {
  t: Translate;
  level: RouteLevel;
  protocol?: RouteProtocol;
  waf: Doc;
  nginx: Doc;
  wafParents: ParentChain;
  nginxParents: ParentChain;
  onWaf: (next: Doc) => void;
  onNginx: (next: Doc) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = routeCount(level, waf, protocol) + nginxCount(level, nginx);

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          border: 1,
          borderColor: "divider",
          borderRadius: "5px",
          px: 2,
          py: 1.25,
        }}
      >
        <BlockHead
          title={t("config.section.nginxParams")}
          label={t(`config.section.${level}NginxHint`)}
        />
        <Box sx={{ flex: 1, minWidth: 0 }} />
        {count > 0 && (
          <Chip
            size="small"
            variant="outlined"
            color="primary"
            label={count}
            title={t("config.section.nginxParamsSet", { n: String(count) })}
            sx={{ height: 20, fontSize: "0.7rem" }}
          />
        )}
        <Button variant="outlined" size="small" onClick={() => setOpen(true)}>
          {t("config.section.nginxParamsOpen")}
        </Button>
      </Box>
      {open && (
        <RouteParamsDialog
          t={t}
          level={level}
          protocol={protocol}
          value={{ waf, nginx }}
          wafParents={wafParents}
          nginxParents={nginxParents}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            onWaf(next.waf);
            onNginx(next.nginx);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function RouteParamsDialog({
  t,
  level,
  protocol,
  value,
  wafParents,
  nginxParents,
  onClose,
  onApply,
}: {
  t: Translate;
  level: RouteLevel;
  protocol?: RouteProtocol;
  value: ParamsDocs;
  wafParents: ParentChain;
  nginxParents: ParentChain;
  onClose: () => void;
  onApply: (next: ParamsDocs) => void;
}) {
  const wafItems = routeItems(t, level, protocol);
  const nginxTabs = nginxItems(t, level);
  const [view, setView] = useLayerTab<ParamsView>(
    `waf.route.paramsView.${level}`,
    PARAMS_VIEWS,
  );
  const [wafTab, setWafTab] = useLayerTab(
    `waf.route.wafTab.${level}`,
    wafItems.map((item) => item.id),
  );
  const [nginxTab, setNginxTab] = useLayerTab(
    `waf.route.nginxTab.${level}`,
    nginxSectionsFor(level).map((section) => section.id),
  );
  const [draft, setDraft] = useState<ParamsDocs>(value);
  const wafItem = wafItems.find((row) => row.id === wafTab) ?? wafItems[0];
  const nginxItem = nginxTabs.find((row) => row.id === nginxTab) ?? nginxTabs[0];

  return (
    <Modal
      onClose={onClose}
      size="lg"
      spacing={0}
      title={t("config.section.nginxParams")}
      help="05-protection#маршруты"
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onApply(draft)}>
            {t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
        <LayerBar>
          <UnderlayTabs
            value={view}
            onChange={setView}
            items={[
              { value: "waf", label: t("config.tab.waf") },
              { value: "nginx", label: t("config.tab.nginx") },
            ]}
          />
          {view === "waf" ? (
            <LayerTabs items={wafItems} value={wafTab} onChange={setWafTab} />
          ) : (
            <LayerTabs items={nginxTabs} value={nginxTab} onChange={setNginxTab} />
          )}
          <Box sx={{ minHeight: 360 }}>
            {view === "waf" ? (
              <LayerCard flush title={wafItem?.label ?? ""} hint={wafItem?.hint}>
                <RouteGroupBody
                  level={level}
                  protocol={protocol}
                  group={wafItem?.id ?? ""}
                  waf={draft.waf}
                  parents={wafParents}
                  onChange={(waf) => setDraft((cur) => ({ ...cur, waf }))}
                />
              </LayerCard>
            ) : (
              <LayerCard flush title={nginxItem?.label ?? ""} hint={nginxItem?.hint}>
                <NginxSectionBody
                  t={t}
                  level={level}
                  section={nginxItem?.id ?? ""}
                  parents={nginxParents}
                  value={draft.nginx}
                  onChange={(nginx) => setDraft((cur) => ({ ...cur, nginx }))}
                />
              </LayerCard>
            )}
          </Box>
        </LayerBar>
    </Modal>
  );
}

export type RouteMode = "config" | "raw" | "preview";

export function routeMode(raw: boolean): RouteMode {
  return raw ? "raw" : "config";
}

export function RouteModeTabs({
  t,
  mode,
  onMode,
  raw = true,
}: {
  t: Translate;
  mode: RouteMode;
  onMode: (next: RouteMode) => void;
  raw?: boolean;
}) {
  return (
    <UnderlayTabs
      value={mode}
      onChange={onMode}
      items={[
        { value: "config", label: t("config.mode.config") },
        ...(raw ? [{ value: "raw" as const, label: t("config.mode.raw") }] : []),
        { value: "preview", label: t("config.mode.preview") },
      ]}
    />
  );
}

export function RawForm({
  t,
  level,
  value,
  onChange,
}: {
  t: Translate;
  level: NginxLevel;
  value: string;
  onChange: (next: string) => void;
}) {
  const page = level === "server" ? "servers" : "paths";

  return (
    <>
      <Alert severity="warning">
        <AlertTitle sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
          {t(`${page}.rawWarn`)}
        </AlertTitle>
        {t(`config.mode.rawKept${level === "server" ? "Server" : "Location"}`)}
      </Alert>
      <NginxEditor
        wide
        minRows={20}
        maxRows={60}
        label={t(`${page}.rawNginx`)}
        helper={t(`${page}.rawHelp`)}
        value={value}
        onChange={onChange}
      />
    </>
  );
}
