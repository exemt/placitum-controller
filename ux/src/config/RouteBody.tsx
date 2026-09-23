import { useState, type ReactNode } from "react";
import Divider from "@mui/material/Divider";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";

import type { PreviewDraft, PreviewNode } from "../api.ts";
import { Section } from "../components/fields.tsx";
import { TableIconButton } from "../components/data-table/TableIconButton.tsx";
import { Form } from "../components/Form.tsx";
import type { Translate } from "../i18n/index.ts";
import { RawForm, RouteModeTabs, RouteParams, routeMode } from "../pages/route-fields.tsx";
import { WafLocal } from "../pages/WafLocal.tsx";
import { WafProtect } from "../pages/WafProtect.tsx";
import { RouteCapture } from "./CaptureTable.tsx";
import type { Doc, ParentChain } from "./inherit.ts";
import { PreviewDock } from "./PreviewDock.tsx";
import { phasesFor, type RouteLevel, type RouteProtocol } from "./RouteForm.tsx";

export function RoutePower({
  t,
  enabled,
  onChange,
}: {
  t: Translate;
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const label = enabled ? t("common.enabled") : t("common.disabled");
  return (
    <TableIconButton
      icon={<PowerSettingsNewIcon />}
      tooltip=""
      color={enabled ? "success" : "error"}
      aria-label={label}
      onClick={() => onChange(!enabled)}
    />
  );
}

export function RouteOffNotice({ t, level }: { t: Translate; level: RouteLevel }) {
  const key = level === "server" ? "servers" : "paths";
  return (
    <>
      <Divider sx={{ flexShrink: 0 }} />
      <Form.Notice
        notice={{
          severity: "warning",
          title: t(`${key}.offTitle`),
          text: t(`${key}.offHint`),
        }}
        sx={{ borderBottom: 0 }}
      />
    </>
  );
}

export function RouteBody({
  t,
  scope,
  level,
  protocol,
  raw,
  onRaw,
  rawNginx,
  onRawNginx,
  waf,
  nginx,
  onWaf,
  onNginx,
  parents,
  wafParent,
  outside,
  own,
  preview,
}: {
  t: Translate;
  scope: string;
  level: RouteLevel;
  protocol?: RouteProtocol;
  raw: boolean;
  onRaw: (next: boolean) => void;
  rawNginx: string;
  onRawNginx: (next: string) => void;
  waf: Doc;
  nginx: Doc;
  onWaf: (next: Doc) => void;
  onNginx: (next: Doc) => void;
  parents: { waf: ParentChain; nginx: ParentChain };
  wafParent?: Doc;
  outside: ReactNode;
  own?: ReactNode;
  preview: { draft: PreviewDraft; node: PreviewNode };
}) {
  const phases = phasesFor(level, protocol);
  const [showPreview, setShowPreview] = useState(false);
  return (
    <>
      <RouteModeTabs
        t={t}
        mode={showPreview ? "preview" : routeMode(raw)}
        onMode={(next) => {
          setShowPreview(next === "preview");
          if (next !== "preview") {
            onRaw(next === "raw");
          }
        }}
      />
      {showPreview ? (
        <PreviewDock scope={scope} draft={preview.draft} node={preview.node} />
      ) : (
        <>
      {outside}
      {raw ? (
        <RawForm t={t} level={level} value={rawNginx} onChange={onRawNginx} />
      ) : (
        <>
          {own}
          <Section
            title={t("routeSettings.local")}
            hint={t("routeSettings.localHint")}
            flush
            help="05-protection#локальный-слой-списки-и-лимиты"
          >
            <WafLocal
              t={t}
              scope={scope}
              level={level}
              value={waf}
              onChange={onWaf}
              parent={wafParent}
            />
          </Section>
          <Section
            title={t("routeSettings.protect")}
            hint={t("routeSettings.protectHint")}
            flush
            help="05-protection#включение-защиты-на-маршруте"
          >
            <WafProtect
              t={t}
              scope={scope}
              level={level}
              phases={phases}
              value={waf}
              onChange={onWaf}
              parent={wafParent}
            />
          </Section>
          <Section
            title={t("config.group.capture")}
            hint={t("config.group.captureHint")}
            flush
            help="05-protection#копия-данных"
          >
            <RouteCapture
              waf={waf}
              nginx={nginx}
              phases={phases}
              wafParents={parents.waf}
              onWaf={onWaf}
            />
          </Section>
          <RouteParams
            t={t}
            level={level}
            protocol={protocol}
            waf={waf}
            nginx={nginx}
            wafParents={parents.waf}
            nginxParents={parents.nginx}
            onWaf={onWaf}
            onNginx={onNginx}
          />
        </>
      )}
        </>
      )}
    </>
  );
}
