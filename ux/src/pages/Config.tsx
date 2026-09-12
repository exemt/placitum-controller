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

/**
 * Вкладки страницы. Решения WAF (инспекторы, каталоги контура) и ядро nginx --
 * разные наборы, и правят их с разной частотой: раньше они шли одной лентой
 * секций, и до каталогов приходилось прокручивать шесть секций директив.
 */
type HttpView = "waf" | "nginx" | "preview";

/**
 * Разделы «WAF»: реестр инспекторов и каталоги контура. Реестр первый -- с
 * него начинают, каталоги отвечают на его строки.
 */
const WAF_TABS = ["inspectors", ...HTTP_CATALOG_IDS] as const;

type WafTab = (typeof WAF_TABS)[number];

const NGINX_TAB_KEY = "waf.config.nginxTab";
const WAF_TAB_KEY = "waf.config.wafTab";

/**
 * Имена `waf_var` контура -- для выбора полей в объявлении инспектора.
 * Стандартный набор модуля объявление знает само (`BUILTIN_VARS`).
 */
function ownVarNames(wafHttp: Doc): string[] {
  return asPairs(wafHttp.vars)
    .map((row) => asString(row.name))
    .filter((name) => name !== "" && !isBuiltinVar(name));
}

export default function Config() {
  const t = useT();
  /*
    Каталоги -- второй черновик той же страницы: записи свои, но копятся и
    сохраняются они той же кнопкой, что и документ. Раньше их ячейки писали
    на сервер сразу, и «не разослано» вспыхивало до «Сохранить».
  */
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

  const nginxTabs = nginxItems(t, "http");
  const wafItems: LayerItem<WafTab>[] = [
    {
      id: "inspectors",
      label: t("config.section.inspectors"),
      hint: t("config.section.inspectorsHint"),
    },
    ...httpCatalogItems(t),
  ];
  const itemOf = <T extends string>(items: LayerItem<T>[], id: T) =>
    items.find((item) => item.id === id);
  const nginxItem = itemOf(nginxTabs, nginxTab);
  const wafItem = itemOf(wafItems, wafTab);
  /*
    Заготовка -- то, что дерево печатает сейчас: включая raw, оператор
    продолжает свой конфиг, а не начинает пустой. Пишем через функциональный
    setDraft: пока preview ехал, оператор мог продолжить печатать, и слепок
    draft из замыкания стёр бы его правки.
  */
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

      {/*
        Навигация в два слоя: раздел страницы, под ним -- группа выбранного
        раздела. Второй ряд стоял шапкой карточки с таблицей и читался её
        заголовком, хотя переключает он страницу, а не строки.
      */}
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
      {/* Содержимое -- третья ступень того же слоя, шаг тот же. */}
      {view === "preview" ? (
        <Stack spacing={2}>
          {draft.raw ? (
            <>
              <Alert severity="warning">{t("config.rawWarn")}</Alert>
              {/*
                Пустой raw -- это чистый лист там, где оператор ждёт свой конфиг:
                он переключился, чтобы поправить сгенерированный текст, а не
                написать nginx.conf с нуля. Заготовку печатает тот же
                компилятор -- дерево, как если бы raw не был включён.
              */}
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
              {/* Та же вкладка -- то же окно: raw тоже идёт до низа страницы. */}
              <NginxEditor
                fill
                label={t("config.rawNginx")}
                value={draft.raw_nginx}
                onChange={(raw_nginx) => setDraft({ ...draft, raw_nginx })}
              />
            </>
          ) : (
            /*
              Узел http: серверы и апстримы стоят заглушками `include` по uuid,
              их текст -- в своих карточках. Файл целиком печатается без узла --
              им засевают «Свой конфиг» (`seedRaw`).
            */
            <PreviewDock
              scope={scope}
              draft={{ http: sanitize(draft) }}
              node={{ kind: "http" }}
              enabled
            />
          )}
        </Stack>
      ) : view === "nginx" ? (
        /*
          Ядро http {}: вкладка -- группа директив, внутри та же таблица
          настроек, что за кнопкой «Дополнительные параметры» у сервера и пути.
          Раскрытыми секциями эти шесть групп занимали страницу целиком, хотя
          правят их несравнимо реже инспекторов и каталогов.
        */
        <LayerCard
          flush
          title={nginxItem?.label ?? ""}
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
        /*
          Решений по запросу на этой странице нет. Контур объявляет инспекторов
          и каталоги, на которые ссылаются по имени; что делать с запросом --
          решает сервер, потому что на проде серверы принадлежат разным
          клиентам.
        */
        <LayerCard title={wafItem?.label ?? ""} hint={wafItem?.hint}>
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
