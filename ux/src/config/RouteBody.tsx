/*
  Каркас карточки маршрута -- один на сервер и путь.

  Три уровня конфигурации -- http {}, server {}, location {} -- одна лестница:
  контур задаёт, сервер наследует и переопределяет, путь наследует у сервера.
  Страница http собрана слоем вкладок (`pages/Config.tsx`): WAF, nginx,
  предпросмотр. Карточки сервера и пути -- тот же набор, только стопкой
  секций, потому что у них есть то, чего нет у http: поля снаружи блока
  (hostname, порты; match и путь) и своё тело (сертификаты; обработчик).

  Порядок сверху вниз везде один:

    вид карточки      конструктор / свой конфиг -- решает, что печатается
    снаружи блока     печатается в шапке блока и живёт у обоих видов
    свои блоки        listen и сертификаты; обработчик -- раскрыт только
                      первый: за ним оператор обычно и пришёл
    Списки и лимиты   WafLocal  -- локальный слой, раньше инспекции
    Инспекторы        WafProtect -- кого звать
    Снимок              RouteCapture -- что снять и увезти
    Параметры         RouteParams -- окно WAF | nginx, как страница http

  Просмотр -- третья вкладка того же ряда: блок карточки настоящим
  компилятором, пути сервера в нём заглушками `include` по uuid. Он был в
  карточке и раньше, но дёргал компилятор на каждое нажатие клавиши и тормозил
  форму; теперь компилятор бежит только пока открыта эта вкладка, а в
  конструкторе не бежит вовсе.

  Раньше обе карточки собирали это руками и расходились: у пути обработчик
  лежал россыпью полей между hostname-ом и секциями, а раскрытыми по умолчанию
  были разные секции. Каркас держит
  порядок и умолчания, уровень подставляет своё.
*/
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

/*
  Включённость маршрута -- состояние карточки, а не её поле.

  Раньше это было поле в теле, и у каждого уровня своё: у пути -- тумблер
  под match и путём, у сервера -- селектор рядом с hostname. Выключенный
  маршрут читался как «одно поле чем-то отличается от соседних»: чтобы это
  увидеть, карточку надо было открыть и долистать. Теперь состояние держит
  кнопка в шапке -- на месте, где раньше стояла корзина, -- и цвет говорит
  его с одного взгляда: зелёная -- блок печатается, красная -- нет.

  Подсказки у кнопки нет намеренно. Всплывающая подпись у самого верха окна
  накрывала заголовок, а сказать ей было нечего: то же самое стоит полосой
  под шапкой, пока маршрут выключен.
*/
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

/**
 * Полоса выключенного маршрута: она же объясняет красную кнопку.
 *
 * Стоит между шапкой и телом, а не над подвалом: это не отказ записи, а то,
 * что уже верно про открытую карточку, -- и прочесть это надо раньше, чем
 * оператор начнёт править поля, которые всё равно не напечатаются.
 *
 * Границы у полосы взяты у соседей: сверху линейка -- своя, иначе цветная
 * заливка втекала в шапку и заголовок читался частью предупреждения; снизу
 * её рисует тело (`dividers`), и вторая дала бы двойную черту.
 */
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
  /** Протокол пути; у сервера нет -- фазы у него запрос и ответ. */
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
  /** Документ сервера -- родитель пути для слоя и инспекторов. */
  wafParent?: Doc;
  /** Поля, которые печатаются снаружи блока: есть у обоих видов карточки. */
  outside: ReactNode;
  /** Блоки уровня внутри тела: порты и сертификаты, обработчик. */
  own?: ReactNode;
  /** Черновик карточки и её узел: то, что печатает вкладка просмотра. */
  preview: { draft: PreviewDraft; node: PreviewNode };
}) {
  const phases = phasesFor(level, protocol);
  /*
    Просмотр -- состояние формы, а не документа: `raw` сохраняется, вкладка
    просмотра -- нет. Пока она открыта, компилятор печатает блок по черновику;
    закрыл -- вернулся тот вид, который записан в документе.
  */
  const [showPreview, setShowPreview] = useState(false);
  return (
    <>
      {/*
        Свой конфиг -- не настройка, а замена всего блока: с ним не печатаются
        ни тело, ни оверлеи, ни инспекторы. Поэтому вид выбирается первой
        строкой, а не флагом в секции внизу.
      */}
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
          {/*
            Локальный слой выше инспекции: он бежит раньше и решает
            окончательно -- набор и лимит отвечают 403/429, не отправив на
            шину ни одного сообщения.
          */}
          <Section title={t("routeSettings.local")} hint={t("routeSettings.localHint")} flush>
            <WafLocal
              t={t}
              scope={scope}
              level={level}
              value={waf}
              onChange={onWaf}
              parent={wafParent}
            />
          </Section>
          <Section title={t("routeSettings.protect")} hint={t("routeSettings.protectHint")} flush>
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
          <Section title={t("config.group.capture")} hint={t("config.group.captureHint")} flush>
            <RouteCapture
              waf={waf}
              nginx={nginx}
              phases={phases}
              wafParents={parents.waf}
              onWaf={onWaf}
            />
          </Section>
          {/*
            Решения по запросу и директивы ядра -- за кнопкой: их полсотни,
            правятся они редко, а развёрнутыми секциями отодвигали инспекторов
            и слой на второй экран.
          */}
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
