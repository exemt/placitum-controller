import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Select from "@mui/material/Select";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InputBase from "@mui/material/InputBase";
import Checkbox from "@mui/material/Checkbox";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import {
  type BodyStoreRow,
  type Dataset,
  type DatasetType,
  type DenyResponseRow,
  type DenyResponseUse,
  type LogFormatRow,
} from "../api.ts";
import { isNewRow, type CatalogDraft } from "./catalog-draft.tsx";
import {
  dataActionCellSx,
  dataCellSx,
  dataHeadSx,
  dataInputSx,
} from "../components/settings-table.tsx";
import { SectionBleed } from "../components/settings-table.tsx";
import { Modal } from "../components/Modal.tsx";
import { DraftAddCell, draftKey } from "../components/table-block.tsx";
import { TableIconButton } from "../components/data-table/index.ts";
import {
  DialogLines,
  DialogRow,
  DialogSelect,
  DialogText,
  dialogInputSx,
} from "../components/dialog-kit.tsx";
import { useT, type Translate } from "../i18n/index.ts";
import type { LayerItem } from "./layer-tabs.tsx";
import { Picker } from "./Picker.tsx";

/**
 * Каталоги блока `http {}`: то, что контур объявляет, чтобы маршрут мог на это
 * сослаться по имени.
 *
 * Отдельной страницы у них нет намеренно -- это опции `http`, и живут они
 * вкладками раздела «WAF» на его странице. Списки при этом заводятся не здесь: набор с составом --
 * сущность раздела «Данные», а `http` лишь объявляет, какие из них попадут в
 * шаблон слотом `waf_local_dataset`.
 *
 * Сами таблицы ничего не пишут: правки уходят в черновик каталогов
 * (`useHttpCatalogDraft`), и на сервер их отдаёт «Сохранить» строки состояния
 * -- как у директив той же страницы. Раньше каждая ячейка коммитила PUT по
 * blur, и «не разослано» вспыхивало до кнопки.
 */

// Метрика строки данных -- общая, см. settings-table.tsx.
const headSx = dataHeadSx;
const cellSx = dataCellSx;
const actionCellSx = dataActionCellSx;

/**
 * Каталоги -- вкладки второго слоя раздела «WAF» страницы http. Обменник объектов
 * и форматы логов -- одна вкладка «Дополнительно»: по строке-двум на контур,
 * на отдельные вкладки они не тянули и раздували ряд.
 */
export const HTTP_CATALOG_IDS = ["lists", "deny", "advanced"] as const;

export type HttpCatalogId = (typeof HTTP_CATALOG_IDS)[number];

export function httpCatalogItems(t: Translate): LayerItem<HttpCatalogId>[] {
  return HTTP_CATALOG_IDS.map((id) => ({
    id,
    label: t(`httpCat.${id}`),
    hint: t(`httpCat.${id}Hint`),
  }));
}

export function HttpCatalogs({
  catalog,
  only,
}: {
  /** Черновик каталогов страницы: данные, правки и ошибка живут в нём. */
  catalog: CatalogDraft;
  /**
   * Какой каталог показывать: страница выбирает его вкладкой, а компонент
   * остаётся смонтированным -- иначе каждое переключение перерисовывало бы
   * все таблицы заново.
   */
  only: HttpCatalogId;
}) {
  const t = useT();

  return (
    <>
      {catalog.error !== null && <Alert severity="error">{catalog.error}</Alert>}

      {only === "lists" && <ListsSection catalog={catalog} />}

      {only === "deny" && <DenySection catalog={catalog} />}

      {only === "advanced" && (
        <Stack spacing={3}>
          <Stack spacing={1}>
            <SubHead title={t("httpCat.store")} hint={t("httpCat.storeHint")} />
            {catalog.stores.length > 1 && (
              <Alert severity="error">{t("httpCat.storeMany")}</Alert>
            )}
            {catalog.loaded && catalog.stores.length === 0 && (
              <Alert severity="warning">{t("httpCat.storeNone")}</Alert>
            )}
            {/* У несохранённого обменника адреса нет по построению: его печатает сервер. */}
            {catalog.stores.some((row) => !isNewRow(row.uuid) && row.url === "") && (
              <Alert severity="warning">{t("httpCat.storeUrlUnset")}</Alert>
            )}
            <StoreSection catalog={catalog} />
          </Stack>
          <Stack spacing={1}>
            <SubHead title={t("httpCat.formats")} hint={t("httpCat.formatsHint")} />
            <FormatSection catalog={catalog} />
          </Stack>
        </Stack>
      )}
    </>
  );
}

/** Подзаголовок блока внутри вкладки: имя каталога и его подсказка. */
function SubHead({ title, hint }: { title: string; hint: string }) {
  return (
    <Box>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        {hint}
      </Typography>
    </Box>
  );
}

/**
 * Списки локального слоя -- `waf_local_dataset`:
 *
 *     waf_local_dataset tokens type=string limit=10000 active;
 *     waf_local_dataset office type=cidr   limit=1024   internal;
 *
 * Режимов ровно два, и один из них обязателен: `active` синхронизируется с
 * контроллером через шину и меняется без reload, `internal` живёт внутри
 * конфига и меняется вместе с ним.
 *
 * `ttl=` есть только у active -- это срок живых записей, автобана от rate и
 * точечного add; у internal задать его `nginx -t`.
 *
 * Состав правится в «Данных»: здесь объявление слота, там наполнение.
 *
 * Поэтому в таблице только объявленные (`in_nginx`), а не все наборы контура:
 * иначе страница `http` показывает чужое -- наборы ip-компилятора и черновики
 * из «Данных», которых в шаблоне нет и не будет. Добавление -- выбор готового
 * из «Данных», как набор правил выбирают в профиле; создание оставлено
 * последним пунктом того же селектора, чтобы за новым именем не уходить на
 * другую страницу.
 */
function ListsSection({ catalog }: { catalog: CatalogDraft }) {
  const t = useT();
  const [adding, setAdding] = useState<string | null>(null);

  const rows = catalog.lists;
  const declared = rows.filter((row) => row.in_nginx !== false);
  const spare = rows.filter((row) => row.in_nginx === false);


  const save = (row: Dataset, patch: Parameters<CatalogDraft["patchList"]>[1]) =>
    catalog.patchList(row.uuid, patch);

  return (
    <Stack spacing={1}>
      <SectionBleed scroll>
      <Table size="small">
        <TableHead>
          <TableRow>
            <Head width={200} hint={t("httpCat.listNameHint")}>{t("httpCat.name")}</Head>
            <Head width={120} hint={t("httpCat.listTypeHint")}>type=</Head>
            <Head width={140} hint={t("httpCat.listModeHint")}>{t("httpCat.listMode")}</Head>
            <Head width={120} hint={t("httpCat.listLimitHint")}>limit=</Head>
            <Head width={100} hint={t("httpCat.listTtlHint")}>ttl=</Head>
            <Head width={80} hint={t("httpCat.listHashHint")}>hash=</Head>
            <Head width={120} hint={t("httpCat.listSizeHint")}>{t("httpCat.listSize")}</Head>
            <Head width={48} />
          </TableRow>
        </TableHead>
        <TableBody>
          {declared.map((row) => (
            <TableRow key={row.uuid} hover>
              <TableCell sx={cellSx}>
                <InlineText
                  value={row.name}
                  mono
                  onCommit={(name) => name !== row.name && save(row, { name })}
                />
              </TableCell>
              <TableCell sx={{ ...cellSx, color: "text.secondary" }}>{row.type}</TableCell>
              <TableCell sx={cellSx}>
                {/*
                  Режим здесь не выбирают: он говорит, откуда набор взялся.
                  Набор из «Данных» наполняется контроллером через шину --
                  active; заведённый прямо в конфиге держит записи в нём самом
                  -- internal. Сменить режим значило бы перенести состав из
                  одного места в другое, а это не правка строки таблицы.

                  Подсказка на самой строке, а не только на шапке: разница
                  «через шину» или «вместе с конфигом» из слова `active` не
                  читается.
                */}
                <Tooltip
                  arrow
                  placement="top"
                  title={t(row.active ? "httpCat.modeActive" : "httpCat.modeInternal")}
                >
                  <Box sx={{ color: "text.secondary" }}>
                    {row.active ? "active" : "internal"}
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell sx={cellSx}>
                <InlineText
                  value={String(row.max_entries)}
                  placeholder="1000000"
                  onCommit={(raw) => {
                    const n = Number(raw);
                    if (Number.isInteger(n) && n > 0) save(row, { limit: n });
                  }}
                />
              </TableCell>
              <TableCell sx={cellSx}>
                {/* ttl= есть только у active: у internal это `nginx -t`. */}
                {row.active ? (
                  <InlineText
                    value={row.ttl ?? ""}
                    placeholder="5m"
                    onCommit={(ttl) => save(row, { ttl: ttl.trim() })}
                  />
                ) : (
                  <Box sx={{ color: "text.disabled" }}>—</Box>
                )}
              </TableCell>
              <TableCell sx={{ ...cellSx, color: "text.secondary" }}>
                {/*
                  hash=md5 ставят в «Данных» у пустого набора строк: здесь
                  только читается, как и type= -- смена флага у набора с
                  составом превратила бы его в мусор.
                */}
                {row.hash === true ? "md5" : <Box sx={{ color: "text.disabled" }}>—</Box>}
              </TableCell>
              <TableCell sx={{ ...cellSx, color: "text.secondary" }}>
                {/* Сколько записей. Открывают состав в «Данных», не отсюда. */}
                {row.size}
              </TableCell>
              <TableCell sx={actionCellSx}>
                <TableIconButton
                  icon={<LinkOffIcon sx={{ fontSize: 16 }} />}
                  tooltip={t("httpCat.undeclare")}
                  onClick={() => save(row, { in_nginx: false })}
                />
              </TableCell>
            </TableRow>
          ))}
          {declared.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} sx={{ ...cellSx, color: "text.secondary" }}>
                {t("httpCat.listsEmpty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </SectionBleed>
      {adding === null ? (
        <DeclareListRow
          spare={spare}
          onDeclare={(row) => save(row, { in_nginx: true })}
          onNew={() => setAdding("")}
        />
      ) : (
        <NewListRow
          value={adding}
          onValue={setAdding}
          onCancel={() => setAdding(null)}
          sources={rows}
          onCreate={(name, type, copyFrom) => {
            /*
             * Заведённый здесь набор -- internal: его записи живут в этом же
             * конфиге. Active приходит из «Данных» -- туда его наполняет
             * контроллер, и завести его отсюда значило бы объявить слот,
             * который некому наполнять. Отсюда же нет ни ttl=, ни subject=:
             * и то, и другое у internal отвергает `nginx -t`.
             */
            catalog.addList({ name, type: type as DatasetType, copyFrom });
            setAdding(null);
          }}
        />
      )}
    </Stack>
  );
}

/**
 * `waf_deny_response`: чем контур отвечает заблокированному.
 *
 *     waf_deny_response blocked    status=403 page=@waf_deny;
 *     waf_deny_response too_many   status=429 page=@waf_deny;
 *     waf_deny_response grpc_denied type=grpc code=7 message="blocked";
 *
 * Строка правится на месте: выбрать тело или сменить код -- одно действие, и
 * прятать его за кнопкой «править» значит требовать два.
 *
 * Тело зависит от типа. У `http` это `page=@имя` -- именованный путь, на
 * который nginx уводит через `error_page`; модуль сам на страницу не ходит, он
 * отдаёт статус и имя записи. У `grpc` и `websocket` страницы нет вовсе:
 * там `code=` и `message=`, потому что отдавать HTML в gRPC-ответ некуда.
 */
function DenySection({ catalog }: { catalog: CatalogDraft }) {
  const t = useT();
  const rows = catalog.deny;
  const pages = catalog.pages;
  /*
    Добавление -- диалогом с «+» в шапке, как у проверок локального слоя и у
    объектов снимка. Черновая строка внизу читалась готовой записью: серый
    дубль имени среди настоящих строк, а погашенный «+» на краю не объяснял,
    чего ей не хватает. Диалог собирает запись целиком до записи.
  */
  const [addOpen, setAddOpen] = useState(false);
  const create = (input: Omit<DenyResponseRow, "uuid">) => {
    catalog.addDeny(input);
    setAddOpen(false);
  };

  const save = (row: DenyResponseRow, patch: Partial<Omit<DenyResponseRow, "uuid">>) =>
    catalog.patchDeny(row.uuid, patch);

  const pageOptions = pages.map((p) => ({
    value: `@${p.name}`,
    hint: t("httpCat.fromPages"),
  }));

  /*
   * Страница записи -- именованный путь `@<имя набора>`, так его и собирает
   * список выше. Путь, написанный руками (общий `@waf_deny` с try_files,
   * например), набором не назван: разбирать нечего, и перечень остаётся без
   * сверки, а не с выдуманным предупреждением.
   */
  const varsOf = (page: string | undefined): string[] | null =>
    pages.find((p) => `@${p.name}` === page)?.vars ?? null;

  return (
    <Stack spacing={1}>
      <SectionBleed scroll>
      <Table size="small">
        <TableHead>
          <TableRow>
            <Head hint={t("httpCat.denyNameHint")}>{t("httpCat.name")}</Head>
            <Head width={120} hint={t("httpCat.denyTypeHint")}>type=</Head>
            <Head width={90} hint={t("httpCat.denyStatusHint")}>{t("httpCat.denyCode")}</Head>
            <Head hint={t("httpCat.denyBodyHint")}>{t("httpCat.denyBody")}</Head>
            <Head width={180} hint={t("httpCat.denyParamsHint")}>params=</Head>
            <TableCell sx={{ ...headSx, width: 48, textAlign: "right" }}>
              <TableIconButton
                color="success"
                icon={<AddIcon sx={{ fontSize: 16 }} />}
                tooltip={t("httpCat.denyAdd")}
                onClick={() => setAddOpen(true)}
              />
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const http = row.type === "http";
            const uses = row.uses ?? [];
            return (
              <TableRow key={row.uuid} hover>
                <TableCell sx={cellSx}>
                  <InlineText
                    value={row.name}
                    mono
                    onCommit={(name) => name !== row.name && save(row, { name })}
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  <InlineSelect
                    value={row.type}
                    options={["http", "grpc", "websocket"]}
                    onChange={(type) =>
                      save(row, { type: type as DenyResponseRow["type"] })
                    }
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  {/* http отвечает статусом, grpc -- своим кодом: это разные поля. */}
                  <InlineText
                    value={String((http ? row.spec.status : row.spec.code) ?? "")}
                    placeholder={http ? "403" : "7"}
                    onCommit={(raw) => {
                      const n = raw.trim() === "" ? undefined : Number(raw);
                      if (raw.trim() !== "" && !Number.isInteger(n)) return;
                      const spec = { ...row.spec };
                      if (http) spec.status = n;
                      else spec.code = n;
                      save(row, { spec });
                    }}
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  {/*
                    Тело -- то, что уходит клиенту: у http страница, у grpc и
                    websocket текст. Своей фразы у страницы тут нет: текст
                    отказа живёт в самой странице («Данные -> Файлы»).

                    Перечень params= стоит соседней колонкой, а не второй
                    строкой этой ячейки: две настройки в одной ячейке ломают
                    метрику строки и не читаются шапкой.
                  */}
                  {http ? (
                    <Picker
                      free
                      plain
                      value={row.spec.page ?? ""}
                      placeholder={t("httpCat.denyPagePick")}
                      options={pageOptions}
                      onChange={(page) =>
                        save(row, {
                          spec: { ...row.spec, page: page === "" ? undefined : page },
                        })
                      }
                    />
                  ) : (
                    <InlineText
                      value={row.spec.message ?? ""}
                      placeholder={t("httpCat.denyMessagePlaceholder")}
                      onCommit={(message) =>
                        save(row, {
                          spec: {
                            ...row.spec,
                            message: message.trim() === "" ? undefined : message,
                          },
                        })
                      }
                    />
                  )}
                </TableCell>
                <TableCell sx={cellSx}>
                  {/*
                    params= есть только у http: у grpc и websocket страницы
                    нет вовсе, и открывать ей нечего. Пустая ячейка читалась
                    бы «перечень не задан» -- тире с причиной говорит, что
                    настройки здесь нет.
                  */}
                  {http ? (
                    <InlineParams
                      value={row.spec.params ?? []}
                      vars={varsOf(row.spec.page)}
                      onChange={(params) =>
                        save(row, {
                          spec: {
                            ...row.spec,
                            params: params.length === 0 ? undefined : params,
                          },
                        })
                      }
                    />
                  ) : (
                    <Tooltip arrow placement="top" title={t("httpCat.denyParamsOff")}>
                      <Box sx={{ color: "text.disabled", width: "fit-content" }}>—</Box>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell sx={actionCellSx}>
                  {/*
                    Занятую запись не удалить: её именем держат
                    waf_deny_response_default, порог счёта или локальный слой,
                    и без неё сборка контура падает на unknown_deny_response.
                    Корзинка гаснет, тултип называет места; контроллер тот же
                    список отдаёт 409 -- на случай, когда ссылка появилась
                    после загрузки таблицы.
                  */}
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                    disabled={uses.length > 0}
                    tooltip={
                      uses.length > 0
                        ? `${t("httpCat.denyInUse")} ${denyUsesLine(uses)}`
                        : t("common.delete")
                    }
                    onClick={() => catalog.removeDeny(row.uuid)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </SectionBleed>

      {addOpen && (
        <DenyAddDialog
          pages={pageOptions}
          varsOf={varsOf}
          onClose={() => setAddOpen(false)}
          onCreate={create}
        />
      )}
    </Stack>
  );
}

/**
 * Новый ответ отказа: имя, тип, код и тело одним окном.
 *
 * Поля те же, что в строке таблицы, но собранные до записи: у типов разные
 * тела (у `http` -- страница, у `grpc` и `websocket` -- текст), и код без
 * значения получает умолчание. Внизу -- строка, которая ляжет в конфиг: у
 * записи с умолчаниями это единственный способ увидеть результат целиком.
 */
function DenyAddDialog({
  pages,
  varsOf,
  onClose,
  onCreate,
}: {
  pages: { value: string; hint?: string }[];
  varsOf: (page: string | undefined) => string[] | null;
  onClose: () => void;
  onCreate: (input: Omit<DenyResponseRow, "uuid">) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState({
    name: "",
    type: "http" as DenyResponseRow["type"],
    code: "",
    body: "",
    params: [] as string[],
  });

  const http = draft.type === "http";
  const code = draft.code.trim() === "" ? undefined : Number(draft.code);
  const ready = draft.name.trim() !== "" && (code === undefined || Number.isInteger(code));

  const line = () => {
    const name = draft.name.trim() === "" ? "?" : draft.name.trim();
    const body = draft.body.trim();
    const parts = [`waf_deny_response ${name}`];
    if (http) {
      parts.push(`status=${String(code ?? 403)}`);
      if (body !== "") parts.push(`page=${body}`);
      if (draft.params.length > 0) parts.push(`params=${draft.params.join(",")}`);
    } else {
      parts.push(`type=${draft.type}`, `code=${String(code ?? 7)}`);
      if (body !== "") parts.push(`message="${body}"`);
    }
    return `${parts.join(" ")};`;
  };

  const create = () => {
    const body = draft.body.trim() === "" ? undefined : draft.body.trim();
    onCreate({
      name: draft.name.trim(),
      type: draft.type,
      spec: http
        ? {
            status: code ?? 403,
            page: body,
            params: draft.params.length > 0 ? draft.params : undefined,
          }
        : { code: code ?? 7, message: body },
    });
  };

  return (
    <Modal
      onClose={onClose}
      title={t("httpCat.denyAddTitle")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={create}>
            {t("common.create")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={1.75}>
          <DialogRow label={t("httpCat.name")} hint={t("httpCat.denyNameHint")}>
            <DialogText
              mono
              value={draft.name}
              placeholder="blocked"
              onChange={(name) => setDraft({ ...draft, name })}
            />
          </DialogRow>

          <DialogRow label="type=">
            <DialogSelect
              value={draft.type}
              width={140}
              options={(["http", "grpc", "websocket"] as const).map((type) => ({
                value: type,
                label: type,
              }))}
              onChange={(type) =>
                setDraft((prev) => ({
                  ...prev,
                  type,
                  /* Страница и текст -- разные поля: чужое значение не переносится. */
                  body: (prev.type === "http") === (type === "http") ? prev.body : "",
                }))
              }
            />
          </DialogRow>

          <DialogRow
            label={t("httpCat.denyCode")}
            hint={http ? t("httpCat.denyStatusHint") : undefined}
          >
            <DialogText
              value={draft.code}
              width={80}
              placeholder={http ? "403" : "7"}
              onChange={(next) => setDraft({ ...draft, code: next })}
            />
          </DialogRow>

          <DialogRow
            label={t("httpCat.denyBody")}
            hint={t(http ? "httpCat.denyPageHint" : "httpCat.denyMessageHint")}
          >
            {http ? (
              <Box sx={{ ...dialogInputSx, width: 220, display: "flex", alignItems: "center" }}>
                <Picker
                  free
                  plain
                  value={draft.body}
                  placeholder={t("httpCat.denyPagePick")}
                  options={pages}
                  onChange={(page) => setDraft({ ...draft, body: page })}
                />
              </Box>
            ) : (
              <DialogText
                value={draft.body}
                width={220}
                placeholder={t("httpCat.denyMessagePlaceholder")}
                onChange={(body) => setDraft({ ...draft, body })}
              />
            )}
          </DialogRow>

          {http && (
            <DialogRow
              label="params="
              hint={t("httpCat.denyParamsHint")}
            >
              <Box sx={{ ...dialogInputSx, width: 220, display: "flex", alignItems: "center" }}>
                <InlineParams
                  value={draft.params}
                  vars={varsOf(draft.body.trim())}
                  onChange={(params) => setDraft({ ...draft, params })}
                />
              </Box>
            </DialogRow>
          )}

          <DialogLines title={t("httpCat.denyLine")} lines={[line()]} />
        </Stack>
    </Modal>
  );
}

/**
 * Текст, который сохраняется по уходу фокуса или Enter.
 *
 * На каждое нажатие клавиши слать PUT незачем -- запись перечитывается целиком
 * и строка прыгала бы под руками; ждать кнопки «сохранить» тоже незачем, когда
 * поле одно.
 */
function InlineText({
  value,
  placeholder,
  mono,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  mono?: boolean;
  onCommit: (next: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <InputBase
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      sx={{
        ...dataInputSx,
        fontFamily: mono === true ? "monospace" : undefined,
      }}
    />
  );
}

/**
 * Места, где запись держат, одной строкой -- тем же языком, что detail
 * ответа 409 (`default @ server x`, `check $var @ location /y`): полоса
 * ошибки после отказа показала бы ровно это.
 */
function denyUsesLine(uses: DenyResponseUse[]): string {
  const shown = uses.slice(0, 5).map((use) => {
    const place = use.by === undefined ? use.at : `${use.by} @ ${use.at}`;
    return `${use.kind} ${place}`;
  });
  const more = uses.length - shown.length;
  return more > 0 ? `${shown.join(", ")} +${more}` : shown.join(", ");
}

/** Словарь params= записи отказа. Порядок -- порядок слов в печати. */
const DENY_PARAMS = ["ray", "addr", "scope", "subject", "retry"] as const;

/*
 * Слово перечня -- хвост имени переменной: `params=ray` отпирает
 * `$waf_deny_ray`. Связь нужна, чтобы сверить перечень с тем, что страница
 * печатает на самом деле (Dataset.vars считает контроллер из её тела).
 */
function denyVar(word: string): string {
  return `waf_deny_${word}`;
}

/*
 * Диагностика: её гейт `params=` не закрывает вовсе -- этими переменными
 * распоряжаются логи и аудит, а не запись каталога. Страница, которая их
 * печатает, отдаёт клиенту то, чего перечнем уже не отнять, и сказать об этом
 * надо там, где перечень выбирают.
 */
const DENY_DIAG_VARS = [
  "waf_ray",
  "waf_rid",
  "waf_reason",
  "waf_score",
  "waf_node_id",
];

/*
 * Что запись отдаёт клиенту: мультиселект по словарю params=. Пустой выбор --
 * не «ничего», а «всё»: perечня нет, и модуль открывает странице каждый
 * параметр. Это одно состояние, и рисуется оно словом, а не пустотой.
 *
 * `vars` -- имена, которые читает выбранная страница. Перечень и шаблон друг
 * о друге не знают: открытое слово, которого в шаблоне нет, не печатается, а
 * запертое, ради которого написана ветка, оставляет клиенту пустоту. Ни то,
 * ни другое из двух полей не видно, поэтому расхождение показывается здесь, а
 * не обнаруживается на живом отказе. `null` -- страница не из каталога
 * (свободно вписанный путь) либо её тело не разобрать: сверять не с чем, и
 * панель молчит, а не выдумывает предупреждение.
 */
function InlineParams({
  value,
  onChange,
  vars,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  vars: string[] | null;
}) {
  const t = useT();

  const prints = (word: string) => vars !== null && vars.includes(denyVar(word));

  /*
   * Заперто то, что страница печатает. Только при непустом перечне: пустой --
   * это «всё открыто», и запертого в нём нет по определению.
   */
  const silenced =
    value.length === 0 ? [] : DENY_PARAMS.filter((w) => prints(w) && !value.includes(w));

  const diag = vars === null ? [] : DENY_DIAG_VARS.filter((v) => vars.includes(v));

  const warning =
    silenced.length === 0 && diag.length === 0 ? null : (
      <>
        {silenced.length > 0 && (
          <Box>
            {t("httpCat.denyParamsSilenced", {
              list: silenced.map((w) => denyVar(w)).join(", "),
            })}
          </Box>
        )}
        {diag.length > 0 && (
          <Box>{t("httpCat.denyParamsDiag", { list: diag.join(", ") })}</Box>
        )}
      </>
    );

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
    <Select
      multiple
      displayEmpty
      value={value}
      onChange={(e) => {
        const raw = e.target.value;
        const next = typeof raw === "string" ? raw.split(",") : raw;
        // Порядок чипов -- порядок словаря, а не кликов: печать стабильна.
        onChange(DENY_PARAMS.filter((w) => next.includes(w)));
      }}
      renderValue={(selected) =>
        selected.length === 0 ? (
          <Box component="span" sx={{ color: "text.disabled" }}>
            {t("httpCat.denyParamsAll")}
          </Box>
        ) : (
          `params=${selected.join(",")}`
        )
      }
      variant="outlined"
      fullWidth
      sx={{
        fontSize: "0.8rem",
        "& .MuiSelect-select": { py: 0, pl: 0, minHeight: "unset" },
        "& .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
      }}
    >
      {DENY_PARAMS.map((w) => (
        <MenuItem key={w} value={w} sx={{ fontSize: "0.8rem" }}>
          <Checkbox size="small" checked={value.includes(w)} sx={{ p: 0.25, mr: 0.75 }} />
          {t(`httpCat.denyParam.${w}`)}
          {/*
            Слово, которого в шаблоне нет: открывать его не вредно, но и не
            имеет смысла -- печатать его странице нечем. Пометка серым, а не
            запретом: страницу правят отдельно, и завтра ветка появится.
          */}
          {vars !== null && !prints(w) && (
            <Box component="span" sx={{ ml: 0.75, color: "text.disabled" }}>
              {t("httpCat.denyParamUnused")}
            </Box>
          )}
        </MenuItem>
      ))}
    </Select>
    {warning !== null && (
      <Tooltip arrow placement="top" title={warning}>
        <WarningAmberIcon color="warning" sx={{ fontSize: 15, flexShrink: 0 }} />
      </Tooltip>
    )}
    </Stack>
  );
}


function InlineSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(String(e.target.value))}
      variant="outlined"
      fullWidth
      sx={{
        fontSize: "0.8rem",
        "& .MuiSelect-select": { py: 0, pl: 0, minHeight: "unset" },
        "& .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&:hover .MuiOutlinedInput-notchedOutline": { border: 0 },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: 0 },
      }}
    >
      {options.map((o) => (
        <MenuItem key={o} value={o} sx={{ fontSize: "0.8rem" }}>
          {o}
        </MenuItem>
      ))}
    </Select>
  );
}

/**
 * `waf_store`: горячий обменник контура.
 *
 *     waf_store driver=redis url=redis://redis:6379 ttl=30s retain_ttl=5m max=8m;
 *
 * Один на конфигурацию, имени у директивы нет -- маршрут обменник не выбирает.
 *
 * Драйвер и адрес строка показывает, но не правит. Тот же redis объявлен ещё
 * дважды -- у агента (`agent.conf`) и у инспекторов (`REDIS_URL`), -- и правка
 * одного из трёх развела бы их молча: модуль клал бы объект в новое
 * хранилище, а инспекторы читали бы старое. Их печатает контроллер из своего
 * окружения; выбирать между `redis`, `none` и `inline` тем более незачем --
 * последние два на горячем пути не участвуют и ломают `nginx -t` первому же
 * маршруту со снимком.
 *
 * Настройка здесь -- сроки и пределы: `retain_ttl=` меньше `ttl=` --
 * `nginx -t`, архив терял бы ключ раньше обычного put.
 */
function StoreSection({ catalog }: { catalog: CatalogDraft }) {
  const t = useT();
  const rows = catalog.stores;
  const [more, setMore] = useState<BodyStoreRow | null>(null);

  const save = (row: BodyStoreRow, spec: BodyStoreRow["spec"]) =>
    catalog.patchStore(row.uuid, spec);

  const commit = (row: BodyStoreRow, key: string, next: string) => {
    const spec = { ...row.spec };
    if (next.trim() === "") delete spec[key];
    else spec[key] = next.trim();
    save(row, spec);
  };

  return (
    <SectionBleed scroll>
    <Table size="small">
      <TableHead>
        <TableRow>
          <Head hint={t("httpCat.storeWhereHint")}>{t("httpCat.storeWhere")}</Head>
          <Head width={100} hint={t("httpCat.storeTtlHint")}>ttl=</Head>
          <Head width={110} hint={t("httpCat.storeRetainHint")}>retain_ttl=</Head>
          <Head width={100} hint={t("httpCat.storeMaxHint")}>max=</Head>
          <Head width={48} />
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.uuid} hover>
            <TableCell sx={cellSx}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
                <Box sx={{ fontSize: "0.75rem" }}>redis</Box>
                <Box
                  component="code"
                  sx={{
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    color: row.url === "" ? "warning.main" : "text.secondary",
                  }}
                >
                  {row.url === "" ? "—" : row.url}
                </Box>
              </Stack>
            </TableCell>
            {(["ttl", "retain_ttl", "max"] as const).map((key) => (
              <TableCell key={key} sx={cellSx}>
                <InlineText
                  value={String(row.spec[key] ?? "")}
                  placeholder={STORE_HINTS[key]}
                  onCommit={(next) => commit(row, key, next)}
                />
              </TableCell>
            ))}
            <TableCell sx={actionCellSx}>
              <TableIconButton
                icon={<SettingsOutlinedIcon sx={{ fontSize: 16 }} />}
                tooltip={t("httpCat.storeMoreHint")}
                aria-label={t("httpCat.storeMore")}
                onClick={() => setMore(row)}
              />
            </TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} sx={cellSx}>
              <Button size="small" startIcon={<AddIcon />} onClick={() => catalog.addStore()}>
                {t("httpCat.storeCreate")}
              </Button>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>

    {more !== null && (
      <StoreDialog
        row={more}
        onClose={() => setMore(null)}
        onApply={(spec) => {
          save(more, spec);
          setMore(null);
        }}
      />
    )}
    </SectionBleed>
  );
}

/**
 * Остальные ключи обменника: пул, таймауты, номер базы.
 *
 * Правятся они несравнимо реже сроков, а в строку не помещаются: восемь
 * колонок в ящике 768px дают горизонтальный скролл. Черновик держится до
 * «Применить», внизу -- строка, которая уйдёт в конфиг: адрес и драйвер в ней
 * видно, хотя задать их тут нельзя.
 */
const STORE_MORE = ["pool", "connect_timeout", "op_timeout", "reconnect_wait", "db"] as const;

const STORE_MORE_HINT: Record<(typeof STORE_MORE)[number], string> = {
  pool: "httpCat.storePoolHint",
  connect_timeout: "httpCat.storeConnectHint",
  op_timeout: "httpCat.storeOpHint",
  reconnect_wait: "httpCat.storeReconnectHint",
  db: "httpCat.storeDbHint",
};

function storeLine(row: BodyStoreRow, spec: BodyStoreRow["spec"]): string {
  const parts = ["driver=redis", `url=${row.url === "" ? "?" : row.url}`];
  for (const [key, value] of Object.entries(spec)) {
    parts.push(`${key}=${value}`);
  }
  return `waf_store ${parts.join(" ")};`;
}

function StoreDialog({
  row,
  onClose,
  onApply,
}: {
  row: BodyStoreRow;
  onClose: () => void;
  onApply: (spec: BodyStoreRow["spec"]) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<BodyStoreRow["spec"]>(row.spec);

  const patch = (key: string, next: string) => {
    const spec = { ...draft };
    if (next.trim() === "") delete spec[key];
    else spec[key] = next.trim();
    setDraft(spec);
  };

  const fieldSx = { "& .MuiInputBase-input": { fontSize: "0.85rem" } } as const;

  return (
    <Modal
      onClose={onClose}
      size="xs"
      title={t("httpCat.storeDialog")}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => onApply(draft)}>
            {t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
        <Stack spacing={2.5}>
          {STORE_MORE.map((key) => (
            <TextField
              key={key}
              size="small"
              label={`${key}=`}
              value={String(draft[key] ?? "")}
              helperText={t(STORE_MORE_HINT[key])}
              sx={fieldSx}
              onChange={(e) => patch(key, e.target.value)}
            />
          ))}

          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              px: 1.5,
              py: 1,
              bgcolor: "background.default",
            }}
          >
            <Typography
              variant="caption"
              sx={{ display: "block", color: "text.secondary", pb: 0.5 }}
            >
              {t("httpCat.storeLine")}
            </Typography>
            <Box
              component="code"
              sx={{
                display: "block",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                wordBreak: "break-all",
              }}
            >
              {storeLine(row, draft)}
            </Box>
          </Box>
        </Stack>
    </Modal>
  );
}

const STORE_HINTS: Record<string, string> = {
  ttl: "30s",
  retain_ttl: "5m",
  max: "8m",
};

/**
 * Форматы access-лога nginx:
 *
 *     log_format main '$remote_addr $status rt=$request_time';
 *
 * Раньше каталог держал и `waf_log_format` -- снят вместе с `waf_audit`:
 * запись аудита пишет агент по фиксированной схеме.
 */
function FormatSection({ catalog }: { catalog: CatalogDraft }) {
  const t = useT();
  const rows = catalog.formats;
  /*
    Черновая строка внизу таблицы: имя, вид и тело набираются там же, где
    потом правятся у готовых записей. Раньше была кнопка «Создать» под
    таблицей, раскрывавшая поле имени; запись создавалась с телом по
    умолчанию, и тело всё равно приходилось править второй раз.
  */
  const [draft, setDraft] = useState({ name: "", body: "" });
  const nameRef = useRef<HTMLInputElement>(null);
  const ready = draft.name.trim() !== "";
  const create = () => {
    catalog.addFormat({ name: draft.name.trim(), format: draft.body });
    setDraft({ name: "", body: "" });
    nameRef.current?.focus();
  };
  const onKey = draftKey(ready, create);

  const save = (row: LogFormatRow, patch: Partial<Omit<LogFormatRow, "uuid">>) =>
    catalog.patchFormat(row.uuid, patch);

  return (
    <Stack spacing={1}>
      <SectionBleed scroll>
      <Table size="small">
        <TableHead>
          <TableRow>
            <Head width={180} hint={t("httpCat.formatNameHint")}>
              {t("httpCat.name")}
            </Head>
            <Head hint={t("httpCat.formatBodyHint")}>{t("httpCat.body")}</Head>
            <Head width={48} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            return (
              <TableRow key={row.uuid} hover>
                <TableCell sx={cellSx}>
                  <InlineText
                    value={row.name}
                    mono
                    onCommit={(name) => name !== row.name && save(row, { name })}
                  />
                </TableCell>
                <TableCell sx={cellSx}>
                  <InlineText
                    value={row.format}
                    placeholder="$remote_addr $status"
                    onCommit={(next) => save(row, { format: next })}
                  />
                </TableCell>
                <TableCell sx={actionCellSx}>
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon sx={{ fontSize: 16 }} />}
                    tooltip={t("common.delete")}
                    onClick={() => catalog.removeFormat(row.uuid)}
                  />
                </TableCell>
              </TableRow>
            );
          })}
          <TableRow>
            <TableCell sx={cellSx}>
              <InputBase
                inputRef={nameRef}
                value={draft.name}
                placeholder="main"
                inputProps={{ "aria-label": t("httpCat.name") }}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={onKey}
                sx={{ ...dataInputSx, fontFamily: "monospace" }}
              />
            </TableCell>
            <TableCell sx={cellSx}>
              <InputBase
                value={draft.body}
                placeholder="$remote_addr $status"
                inputProps={{ "aria-label": t("httpCat.body") }}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                onKeyDown={onKey}
                sx={dataInputSx}
              />
            </TableCell>
            <DraftAddCell label={t("common.create")} ready={ready} onAdd={create} />
          </TableRow>
        </TableBody>
      </Table>
      </SectionBleed>
    </Stack>
  );
}

/** Заголовок колонки с подсказкой по наведению: имя директивы и что оно значит. */
function Head({
  children,
  hint,
  width,
}: {
  children?: React.ReactNode;
  hint?: string;
  width?: number;
}) {
  const cell = (
    <TableCell sx={{ ...headSx, width, minWidth: width }}>{children}</TableCell>
  );
  if (hint === undefined) {
    return cell;
  }
  return (
    <Tooltip arrow placement="top" title={hint}>
      {cell}
    </Tooltip>
  );
}

/** Autocomplete в ячейке: тот же выбор с поиском, что и в остальных формах. */

/**
 * Значение пункта «завести новый»: он стоит в том же селекторе, что и готовые
 * наборы, и от имени набора его отличает ведущий пробел -- имя контроллер
 * обрезает по краям, поэтому такого имени в списке быть не может.
 */
const NEW_LIST = " new";

/**
 * Объявить набор в конфиге: выбор из тех, что в «Данных» есть, а слота не
 * имеют.
 *
 * Выбор здесь -- действие, а не значение поля: набор уезжает в таблицу выше,
 * и поле возвращается к подписи. Поэтому после каждого выбора селектор
 * пересоздаётся -- иначе в нём остаётся имя строки, которой в нём уже нет.
 */
function DeclareListRow({
  spare,
  onDeclare,
  onNew,
}: {
  spare: Dataset[];
  onDeclare: (row: Dataset) => void;
  onNew: () => void;
}) {
  const t = useT();
  const [seq, setSeq] = useState(0);

  return (
    <Box sx={{ width: 320 }}>
      <Picker
        key={seq}
        value=""
        placeholder={t("httpCat.declareList")}
        options={[
          ...spare.map((row) => ({
            value: row.name,
            hint: `${row.type} · ${row.active ? "active" : "internal"} · ${row.size}`,
          })),
          // Пункт-действие -- последним: обычный путь здесь выбрать готовое.
          { value: NEW_LIST, label: t("httpCat.newList") },
        ]}
        onChange={(picked) => {
          if (picked === "") {
            return;
          }
          setSeq((n) => n + 1);
          if (picked === NEW_LIST) {
            onNew();
            return;
          }
          const row = spare.find((item) => item.name === picked);
          if (row !== undefined) {
            onDeclare(row);
          }
        }}
      />
    </Box>
  );
}

/**
 * Новый список: имя, тип элемента и необязательный источник состава.
 *
 * Начинать с чистого листа приходится редко -- чаще берут готовый набор
 * (офисные подсети, прежний блок-лист) и правят. Копируются только живые
 * записи и только из набора того же типа: строку с адресом не сравнить.
 */
function NewListRow({
  value,
  onValue,
  onCancel,
  sources,
  onCreate,
}: {
  value: string;
  onValue: (next: string) => void;
  onCancel: () => void;
  sources: Dataset[];
  onCreate: (name: string, type: string, copyFrom?: string) => void;
}) {
  const t = useT();
  const [type, setType] = useState("ipv4");
  const [from, setFrom] = useState("");

  const same = sources.filter((r) => r.type === type);

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", flexWrap: "wrap" }}
    >
      <TextField
        size="small"
        autoFocus
        placeholder="blocklist"
        label={t("httpCat.name")}
        value={value}
        onChange={(e) => onValue(e.target.value)}
      />
      <Box sx={{ width: 130 }}>
        <Picker
          value={type}
          onChange={(next) => {
            if (next !== "") {
              setType(next);
              setFrom("");
            }
          }}
          options={["ipv4", "ip", "string", "numeric"].map((o) => ({ value: o }))}
        />
      </Box>
      <Tooltip arrow title={t("httpCat.copyFromHint")}>
        <Box sx={{ width: 220 }}>
          <Picker
            value={from}
            placeholder={t("httpCat.copyFrom")}
            options={same.map((r) => ({ value: r.name, hint: String(r.size) }))}
            onChange={setFrom}
          />
        </Box>
      </Tooltip>
      <Button size="small" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button
        size="small"
        variant="contained"
        disabled={value.trim() === ""}
        onClick={() =>
          onCreate(
            value.trim(),
            type,
            same.find((r) => r.name === from)?.uuid,
          )
        }
      >
        {t("common.create")}
      </Button>
    </Stack>
  );
}
