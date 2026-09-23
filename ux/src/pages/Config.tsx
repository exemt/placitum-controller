import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";

import { NginxEditor, UnderlayTabs } from "../components/fields.tsx";
import ChannelNotice from "../components/ChannelNotice.tsx";
import { ConfirmModal } from "../components/Modal.tsx";
import { useT } from "../i18n/index.ts";
import { asString, type Doc } from "./config-fields.tsx";
import { asPairs, sanitize, useHttpDraft } from "../config/http-draft.tsx";
import { isBuiltinVar } from "../config/VarsCatalog.tsx";
import { useHttpCatalogDraft } from "../config/catalog-draft.tsx";
import { CatalogProvider } from "../config/editors.tsx";
import { PreviewDock } from "../config/PreviewDock.tsx";
import { useCatalogBundle } from "../config/usePreview.ts";
import { previewConfig } from "../api.ts";
import {
  HttpCatalogs,
  httpCatalogItems,
  HTTP_CATALOG_IDS,
} from "../config/HttpCatalogs.tsx";
import { InspectorRegistry } from "../config/InspectorRegistry.tsx";
import {
  nginxItems,
  NginxSectionBody,
  nginxSectionsFor,
} from "../config/nginx-directives.tsx";
import {
  LayerBar,
  LayerCard,
  LayerTabs,
  useLayerTab,
  type LayerItem,
} from "../config/layer-tabs.tsx";

type HttpView = "waf" | "nginx" | "preview";

const WAF_TABS = ["inspectors", ...HTTP_CATALOG_IDS] as const;

type WafTab = (typeof WAF_TABS)[number];

const NGINX_TAB_KEY = "waf.config.nginxTab";
const CATALOG_HELP: Record<string, string> = {
  lists: "07-data#списки-в-модуле",
  deny: "05-protection#страницы-блокировки",
  advanced: "05-config#http-инспекторы-и-справочники",
};

const WAF_TAB_KEY = "waf.config.wafTab";

function ownVarNames(wafHttp: Doc): string[] {
  return asPairs(wafHttp.vars)
    .map((row) => asString(row.name))
    .filter((name) => name !== "" && !isBuiltinVar(name));
}

export default function Config() {
  const t = useT();
  const catalogs = useHttpCatalogDraft();
  const { scope, doc, draft, setDraft, loading, error } = useHttpDraft(catalogs);
  const [view, setView] = useState<HttpView>("waf");
  const [rawConfirm, setRawConfirm] = useState(false);
  const [rawSeeding, setRawSeeding] = useState(false);
  const catalog = useCatalogBundle(scope);
  const [nginxTab, setNginxTab] = useLayerTab(
    NGINX_TAB_KEY,
    nginxSectionsFor("http").map((section) => section.id),
  );
  const [wafTab, setWafTab] = useLayerTab<WafTab>(WAF_TAB_KEY, WAF_TABS);

  useEffect(() => {
    setView(doc?.raw === true ? "preview" : "waf");
    setRawConfirm(false);
  }, [doc?.uuid]);

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  if (loading && draft === null) {
    return <Typography color="text.secondary">{t("config.loading")}</Typography>;
  }

  if (draft === null || doc === null) {
    return <Alert severity="warning">{t("config.empty")}</Alert>;
  }

  const setNginx = (next: Doc) => setDraft({ ...draft, nginx: next });
  const setWaf = (next: Doc) => setDraft({ ...draft, waf: next });

  const nginxTabs = nginxItems(t, "http").map((item) => ({
    ...item,
    help: "05-config#http-настройки-nginx",
  }));
  const wafItems: LayerItem<WafTab>[] = [
    {
      id: "inspectors",
      label: t("config.section.inspectors"),
      hint: t("config.section.inspectorsHint"),
      help: "06-inspectors#каталог-объявление-вызов",
    },
    ...httpCatalogItems(t).map((item) => ({ ...item, help: CATALOG_HELP[item.id] })),
  ];
  const itemOf = <T extends string>(items: LayerItem<T>[], id: T) =>
    items.find((item) => item.id === id);
  const nginxItem = itemOf(nginxTabs, nginxTab);
  const wafItem = itemOf(wafItems, wafTab);
  const seedRaw = () => {
    setRawSeeding(true);
    void previewConfig(scope, { http: { ...sanitize(draft), raw: false } })
      .then((row) => {
        if (row.text !== "") {
          setDraft((cur) =>
            cur === null || cur.raw_nginx.trim() !== ""
              ? cur
              : { ...cur, raw_nginx: row.text },
          );
        }
      })
      .finally(() => setRawSeeding(false));
  };

  return (
    <CatalogProvider value={catalog}>
    <Stack spacing={2}>
      <ChannelNotice id="nginx" />
      {error !== null && <Alert severity="error">{error}</Alert>}

      <LayerBar>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <UnderlayTabs
          value={view}
          onChange={setView}
          items={[
            { value: "waf", label: t("config.tab.waf") },
            { value: "nginx", label: t("config.tab.nginx") },
            { value: "preview", label: t("config.tab.preview") },
          ]}
        />
        <Box sx={{ flexGrow: 1 }} />
        <FormControlLabel
          sx={{ mr: 0 }}
          control={
            <Switch
              size="small"
              checked={draft.raw}
              onChange={(_, checked) => {
                if (checked) {
                  setRawConfirm(true);
                  return;
                }
                setDraft({ ...draft, raw: false });
              }}
            />
          }
          label={t("config.raw")}
        />
      </Stack>
      {view === "nginx" && (
        <LayerTabs items={nginxTabs} value={nginxTab} onChange={setNginxTab} />
      )}
      {view === "waf" && (
        <LayerTabs items={wafItems} value={wafTab} onChange={setWafTab} />
      )}
      {view === "preview" ? (
        <Stack spacing={2}>
          {draft.raw ? (
            <>
              <Alert severity="warning">{t("config.rawWarn")}</Alert>
              {draft.raw_nginx.trim() === "" && (
                <Alert
                  severity="info"
                  action={
                    <Button
                      size="small"
                      disabled={rawSeeding || scope === null}
                      onClick={seedRaw}
                    >
                      {t("config.rawSeed")}
                    </Button>
                  }
                >
                  {t("config.rawEmpty")}
                </Alert>
              )}
              <NginxEditor
                fill
                label={t("config.rawNginx")}
                value={draft.raw_nginx}
                onChange={(raw_nginx) => setDraft({ ...draft, raw_nginx })}
              />
            </>
          ) : (
            <PreviewDock
              scope={scope}
              draft={{ http: sanitize(draft) }}
              node={{ kind: "http" }}
              enabled
            />
          )}
        </Stack>
      ) : view === "nginx" ? (
        <LayerCard
          flush
          title={nginxItem?.label ?? ""}
          help={nginxItem?.help}
          hint={nginxItem?.hint}
        >
          <NginxSectionBody
            t={t}
            level="http"
            section={nginxTab}
            value={draft.nginx}
            onChange={setNginx}
          />
        </LayerCard>
      ) : (
        <LayerCard title={wafItem?.label ?? ""} hint={wafItem?.hint} help={wafItem?.help}>
          {wafTab === "inspectors" ? (
            <InspectorRegistry
              scope={scope}
              value={draft.waf}
              varNames={ownVarNames(draft.waf_http)}
              onChange={setWaf}
            />
          ) : (
            <HttpCatalogs catalog={catalogs} only={wafTab} />
          )}
        </LayerCard>
      )}
      </LayerBar>

      {rawConfirm && (
        <ConfirmModal
          open
          color="warning"
          title={t("config.rawWarnTitle")}
          text={t("config.rawWarn")}
          confirmLabel={t("config.rawConfirm")}
          onClose={() => setRawConfirm(false)}
          onConfirm={() => {
            setDraft({ ...draft, raw: true });
            setView("preview");
            setRawConfirm(false);
            if (draft.raw_nginx.trim() === "" && scope !== null) {
              seedRaw();
            }
          }}
        />
      )}
    </Stack>
    </CatalogProvider>
  );
}
