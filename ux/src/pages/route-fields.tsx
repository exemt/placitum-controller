/*
  Параметры сервера и пути: строка карточки и окно за ней.

  В окне два ряда вкладок -- та же лестница, что на странице http
  (`config/layer-tabs.tsx`): первый ряд -- WAF или nginx, второй -- группа
  выбранного ряда, под ним карточка с шапкой и таблицей. WAF -- решения по
  запросу (`config/RouteForm.tsx`): бюджет, сбои, счёт, тело, cookie, фаза
  ответа, аудит. nginx -- директивы ядра, которые уровень может
  переопределить; что именно -- решает матрица (`config/nginx-directives.tsx`).

  В карточке маршрута секций этих настроек нет: их полсотни, и развёрнутыми
  они отодвигали решения, которые правят каждый день (инспекторы, слой, снимок),
  на второй экран. Черновик до «Применить»: пока окно открыто, карточка под
  рукой не перерисовывается.
*/
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

/**
 * Строка карточки: имя, подсказка уровня, счётчик и кнопка. Стоит там же, где
 * стояла секция, и той же рамкой -- иначе она читается вываленной из стопки.
 * Счётчик один на оба документа: оператору важно, сколько строк уедет в
 * файл, а не в каком из двух jsonb они лежат.
 */
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

/**
 * Окно параметров уровня: ряд WAF/nginx, ряд групп и карточка выбранной --
 * ровно та же форма, что на странице http. Группа, которой у уровня нет, в
 * ряд не попадает: матрица и список групп решают это до формы.
 *
 * Черновик до «Применить», как у настроек лимита и условий: карточка и так
 * черновик, но окно правят с оглядкой на превью, и перерисовывать её на каждом
 * нажатии клавиши значит терять то, ради чего окно открыли. Черновик -- оба
 * документа разом: «Отмена» откатывает и WAF, и nginx, сколько бы вкладок
 * оператор ни обошёл.
 */
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

/**
 * Два вида одной карточки, а не флаг внутри неё.
 *
 * Свой конфиг -- это не «ещё одна настройка», а замена всего сгенерированного
 * блока: с ним не работают ни оверлеи, ни handler, ни инспекторы, и форма
 * конструктора рядом с ним показывала настройки, которых в файле не будет.
 * Поэтому переключатель стоит первой строкой карточки и меняет форму целиком:
 * общими остаются только поля, которые печатаются снаружи блока (у сервера --
 * hostname, порты и сертификаты; у пути -- match и путь).
 *
 * Сохранённое конструктором при переключении не пропадает: `raw` -- отдельный
 * флаг документа, и вернуться назад значит снова начать печатать оверлеи.
 *
 * Третья вкладка -- просмотр: блок, который даёт карточка, настоящим
 * компилятором. Это не вид документа, а состояние формы: закрыл карточку --
 * вернулся конструктор. Компилятор дёргается только пока вкладка открыта,
 * поэтому на каждое нажатие клавиши в конструкторе он не бежит.
 */
export type RouteMode = "config" | "raw" | "preview";

export function routeMode(raw: boolean): RouteMode {
  return raw ? "raw" : "config";
}

/** Переключатель вида. Первая строка карточки: он решает, что дальше. */
export function RouteModeTabs({
  t,
  mode,
  onMode,
  raw = true,
}: {
  t: Translate;
  mode: RouteMode;
  onMode: (next: RouteMode) => void;
  /** Есть ли у карточки свой конфиг; у пула его нет -- вкладки две. */
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

/**
 * Форма своего конфига: чего не будет в файле, что остаётся за панелью и сам
 * текст блока. Редактор высокий -- он здесь единственное, что правят.
 */
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
