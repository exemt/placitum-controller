import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import DeleteIcon from "@mui/icons-material/Delete";
import SettingsIcon from "@mui/icons-material/Settings";

import { Form, formDrawerPaperSx } from "../components/Form.tsx";
import {
  DataTable,
  FilterCell,
  RowActionsHead,
  TableIconButton,
  TableNotice,
  TableNoticeRow,
  useRowOps,
  usePager,
} from "../components/data-table/index.ts";
import type { CertificateKind, RouteServer } from "../api.ts";
import { Chips, Section } from "../components/fields.tsx";
import { dataCellSx } from "../components/settings-table.tsx";
import {
  CELL_PX,
  flushTableSx,
  HeadCell,
  SectionNotice,
} from "../components/table-block.tsx";
import { TrafficBar } from "../components/TrafficBar.tsx";
import { nginxServerName, useServerTraffic, useTrafficLive } from "../traffic.ts";
import { onFormOpen } from "../store/forms.ts";
import { useT } from "../i18n/index.ts";
import { thunkError } from "../errors.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  closePanel,
  deleteServerThunk,
  loadServerCertificates,
  loadServerListens,
  loadServers,
  openPanel,
  saveServerThunk,
} from "../store/slices/pages/servers.ts";
import {
  sanitizeWaf,
  type Doc,
} from "./config-fields.tsx";
import { RouteBody, RouteOffNotice, RoutePower } from "../config/RouteBody.tsx";
import {
  FORM_SERVER_ADD_CERT,
  ServerAddCertificateForm,
  certKindLabel,
  formatCertDate,
  shortFingerprint,
} from "./ServerAddCertificateForm.tsx";
import {
  FORM_SERVER_ADD_LISTEN,
  ServerAddListenForm,
  defaultTakenBy,
  listenSslMode,
  portLine,
} from "./ServerAddListenForm.tsx";
import { CatalogProvider } from "../config/editors.tsx";
import { useCatalogBundle, useInheritance } from "../config/usePreview.ts";

/* Ящик карточки: 908, как у пути -- под четыре оси таблицы снимка. */
const PANEL_WIDTH = 908;

/*
 * Черновик привязок карточки. `bind_id` -- то, что уже есть на сервере; его
 * отсутствие означает «добавлено в этой сессии правки». Раньше привязки
 * существующего сервера писались в базу сразу, мимо кнопки «Сохранить», и
 * оператор менял конфигурацию контура, думая, что ещё редактирует карточку.
 */
type DraftBind = {
  port_id: string;
  default_server: boolean;
  bind_id?: string | null;
};
type DraftCert = {
  certificate_id: string;
  kind: CertificateKind;
  bind_id?: string | null;
};

/*
 * Ширины колонок обеих таблиц привязок. Сумма фиксированных плюс отступы
 * держится ниже ширины секции: горизонтальный скролл внутри ящика 768 --
 * дефект, а не режим просмотра.
 */
const TLS_W = 64;
const DEFAULT_W = 80;
const ACTIONS_W = 48;
const KIND_W = 104;
const AFTER_W = 96;
const FP_W = 116;

/** Ячейка строки: метрика таблиц внутри секции, отступ -- как у соседей. */
const cellSx = { ...dataCellSx, px: CELL_PX } as const;

/*
 * Таблица, которая и есть содержимое секции (`Section flush`). Верхней линии у
 * неё нет: черту под шапкой рисует сама секция, и вторая рядом читается
 * двойной. Всё остальное -- общая метрика таблиц внутри секции.
 */
const sectionTableSx = { ...flushTableSx, borderTop: 0 } as const;

/** Фишка в строке данных: 20px, иначе строка вырастает выше своих 36. */
const tableChipSx = { height: 20, fontSize: "0.7rem" } as const;

function hostLabel(row: { name: string; server_names: string[] }): string {
  return row.server_names.join(" ") || row.name;
}

/**
 * Адреса сервера в строке таблицы.
 *
 * Фишкой на адрес, а не строкой через запятую: у сервера их обычно один-два,
 * и глазами их сравнивают между строками сверху вниз. `ssl` дописан к адресу,
 * потому что это свойство сокета, а не отдельная ось, -- ровно так же он
 * стоит в `listen` конфига.
 */
function ListenChips({ row }: { row: RouteServer }) {
  const t = useT();

  if (row.listens.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        {t("servers.noListens")}
      </Typography>
    );
  }

  return (
    <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
      {row.listens.map((bind) => (
        <Tooltip key={bind.uuid} title={portLine(bind)}>
          <Chip
            size="small"
            variant="outlined"
            sx={{ ...tableChipSx, fontFamily: "monospace" }}
            label={`${bind.address}:${bind.port}${bind.ssl ? " ssl" : ""}`}
          />
        </Tooltip>
      ))}
    </Stack>
  );
}

export default function Servers() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const rows = useAppSelector((s) => s.pages.servers.rows);
  const loading = useAppSelector((s) => s.pages.servers.loading);
  const error = useAppSelector((s) => s.pages.servers.error);
  const panelId = useAppSelector((s) => s.pages.servers.panelId);
  const pager = usePager(rows);
  /*
   * Копии у сервера нет: сервер -- это ещё порты, сертификаты и маршруты, и
   * ручки, которая размножила бы всё это одним разом, у контроллера нет.
   * Кнопка серая с причиной, а не спрятана: колонка одна на все страницы.
   */
  const ops = useRowOps<RouteServer>({
    nameOf: (row) => hostLabel(row) || row.name,
    /*
     * Маршруты уходят вместе с сервером (каскад в базе), и вопрос называет их
     * числом: удалять сервер и не знать, что при этом исчезнет, -- худшее из
     * того, что может сделать подтверждение.
     */
    deleteText: (row) =>
      row.location_count > 0
        ? t("servers.deleteWithPaths", {
            name: hostLabel(row) || row.name,
            count: String(row.location_count),
          })
        : t("table.deleteAsk", { name: hostLabel(row) || row.name }),
    remove: async (row) =>
      thunkError(
        await dispatch(deleteServerThunk({ scope: scope ?? "", id: row.uuid })),
      ),
  });
  // Темп приезжает кадром флота, который уже лежит в сторе: страница ничего
  // не запрашивает и ни на что не подписывается сама.
  const traffic = useServerTraffic();
  const live = useTrafficLive();

  usePageBar({
    flush: scope !== null,
    onCreate: () => {
      dispatch(openPanel(null));
    },
    onUpdate: () => {
      void dispatch(loadServers(scope));
    },
    createDisabled: scope === null,
    updateDisabled: scope === null,
  });

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <>
      {error !== null && rows.length > 0 && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {error}
        </Alert>
      )}
      <DataTable loading={loading} error={error}>
        <DataTable.Head>
          <TableCell>{t("servers.names")}</TableCell>
          <TableCell>{t("servers.listens")}</TableCell>
          <TableCell>{t("common.enabled")}</TableCell>
          <TableCell>{t("servers.traffic")}</TableCell>
          <TableCell align="right">{t("servers.locations")}</TableCell>
          <RowActionsHead extra={1} />
        </DataTable.Head>
        <DataTable.Body>
          {pager.rows.map((row) => (
            <TableRow
              key={row.uuid}
              hover
              selected={panelId === row.uuid}
              onClick={() => {
                dispatch(openPanel(row.uuid));
              }}
              sx={{ cursor: "pointer" }}
            >
              <TableCell sx={{ fontFamily: "monospace" }}>
                {hostLabel(row) || t("common.none")}
              </TableCell>
              <TableCell>
                <ListenChips row={row} />
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={row.enabled ? t("common.yes") : t("common.no")}
                  color={row.enabled ? "success" : "default"}
                  variant="outlined"
                />
              </TableCell>
              <TableCell>
                <TrafficBar
                  traffic={traffic.get(nginxServerName(row))}
                  live={live}
                />
              </TableCell>
              {/*
                Число путей и есть ссылка на них: отдельная кнопка в хвосте
                строки означала то же самое, но стояла в двух сантиметрах от
                числа, которое её объясняет.
              */}
              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                <Tooltip title={t("servers.openPaths")}>
                  <Box
                    component={Link}
                    to={`/structure/paths?server=${row.uuid}`}
                    aria-label={t("nav.paths")}
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                      color: "text.primary",
                      textDecoration: "none",
                      fontVariantNumeric: "tabular-nums",
                      "&:hover": { color: "primary.main" },
                    }}
                  >
                    <AttachFileIcon sx={{ fontSize: 15, opacity: 0.7 }} />
                    {row.location_count}
                  </Box>
                </Tooltip>
              </TableCell>
              {ops.cell(
                row,
                { copy: t("servers.copyOff") },
                <TableIconButton
                  icon={<SettingsIcon />}
                  tooltip={t("routeSettings.general")}
                  onClick={() => {
                    dispatch(openPanel(row.uuid));
                  }}
                />,
              )}
            </TableRow>
          ))}
        </DataTable.Body>
        <DataTable.Empty
          message={t("servers.empty")}
          actionLabel={t("common.create")}
          onAction={() => {
            dispatch(openPanel(null));
          }}
        />
        <DataTable.Error onRetry={() => void dispatch(loadServers(scope))} />
        <DataTable.Pager pager={pager} />
      </DataTable>
      {ops.modals}
      <Drawer
        anchor="right"
        open={panelId !== undefined}
        onClose={() => dispatch(closePanel())}
        slotProps={{
          paper: {
            sx: {
              width: { xs: "100%", sm: PANEL_WIDTH },
              ...formDrawerPaperSx,
              borderLeft: 1,
              borderColor: "divider",
            },
          },
        }}
      >
        {panelId !== undefined && (
          <ServerForm
            key={panelId ?? "new"}
            scope={scope}
            id={panelId}
            onClose={() => dispatch(closePanel())}
          />
        )}
      </Drawer>
    </>
  );
}

function ServerForm({
  scope,
  id,
  onClose,
}: {
  scope: string;
  id: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const row = useAppSelector((s) =>
    id === null ? null : (s.pages.servers.rows.find((item) => item.uuid === id) ?? null),
  );
  const [names, setNames] = useState<string[]>(row?.server_names ?? []);
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [nginx, setNginx] = useState<Doc>(row?.nginx ?? {});
  const [waf, setWaf] = useState<Doc>(row?.waf ?? {});
  const [raw, setRaw] = useState(row?.raw ?? false);
  const [rawNginx, setRawNginx] = useState(row?.raw_nginx ?? "");
  /*
   * `null` -- «ещё не засеяно с сервера». Пустой массив -- законное состояние
   * (оператор снял все привязки), и путать их нельзя: иначе снятая привязка
   * тут же вернулась бы из стора.
   */
  const [draftBinds, setDraftBinds] = useState<DraftBind[] | null>(null);
  const [draftCerts, setDraftCerts] = useState<DraftCert[] | null>(null);
  // Родительская цепочка и каталоги: без первой пустая строка формы означала
  // бы сразу три разные вещи, без вторых имена набирались бы руками.
  // Сервер наследует из http {} независимо от того, сохранён он или нет.
  const parents = useInheritance(scope, { level: "server" });
  const catalog = useCatalogBundle(scope);
  const ports = useAppSelector((s) => s.pages.servers.ports);
  const listens = useAppSelector((s) => s.pages.servers.listens);
  const certBinds = useAppSelector((s) => s.pages.servers.certBinds);
  const binds = draftBinds ?? [];
  const certs = draftCerts ?? [];
  // Считается по черновику, а не по стору: пока карточка открыта, правда --
  // то, что видит оператор.
  const sslMode = listenSslMode(
    binds.flatMap((row) => {
      const port = ports.find((item) => item.uuid === row.port_id);
      return port === undefined ? [] : [port];
    }),
  );

  /*
   * Привязки тянет карточка, а не блоки: секция сворачивается вместе со своим
   * содержимым, и загрузка внутри блока оставляла бы в сторе списки прошлого
   * сервера -- по ним считается sslMode и требование серверного сертификата.
   */
  useEffect(() => {
    if (id === null) {
      return;
    }
    void dispatch(loadServerListens({ scope, serverId: id }));
    void dispatch(loadServerCertificates({ scope, serverId: id }));
  }, [dispatch, scope, id]);

  /*
   * Засев черновика привязок из стора.
   *
   * Пока оператор ничего не трогал, черновик просто повторяет то, что пришло
   * с сервера, -- и пересевается на каждую загрузку. Отдельный флаг нужен
   * потому, что «пусто» -- законное состояние черновика (сняли все привязки),
   * и отличить его от «ещё не загрузили» по самому массиву нельзя: загрузка
   * начинается с пустого списка, и первый же засев залипал бы на нём.
   */
  const bindsTouched = useRef(false);
  const certsTouched = useRef(false);

  useEffect(() => {
    bindsTouched.current = false;
    certsTouched.current = false;
    setDraftBinds(id === null ? [] : null);
    setDraftCerts(id === null ? [] : null);
  }, [id]);

  useEffect(() => {
    if (id === null || bindsTouched.current) {
      return;
    }
    setDraftBinds(
      listens
        .filter((item) => item.server_id === id)
        .map((item) => ({
          port_id: item.port_id,
          default_server: item.default_server,
          bind_id: item.uuid,
        })),
    );
  }, [id, listens]);

  useEffect(() => {
    if (id === null || certsTouched.current) {
      return;
    }
    setDraftCerts(
      certBinds
        .filter((item) => item.server_id === id)
        .map((item) => ({
          certificate_id: item.certificate_id,
          kind: item.kind,
          bind_id: item.uuid,
        })),
    );
  }, [id, certBinds]);

  const editBinds = (next: DraftBind[]) => {
    bindsTouched.current = true;
    setDraftBinds(next);
  };

  const editCerts = (next: DraftCert[]) => {
    certsTouched.current = true;
    setDraftCerts(next);
  };

  useEffect(() => {
    if (row === null) {
      return;
    }
    setNames(row.server_names);
    setEnabled(row.enabled);
    setNginx(row.nginx);
    setWaf(row.waf);
    setRaw(row.raw);
    setRawNginx(row.raw_nginx);
  }, [row]);

  const hostOk = names.length > 0;
  const title = id === null ? t("servers.newTitle") : t("servers.editTitle");

  const save = () => {
    void dispatch(
      saveServerThunk({
        scope,
        id,
        body: {
          name: names[0],
          server_names: names,
          enabled,
          nginx,
          waf: sanitizeWaf(waf),
          raw,
          raw_nginx: rawNginx,
        },
        binds,
        certs,
        // Что сейчас на сервере: по разнице считается, что привязать, что
        // отвязать и у чего переставить default_server.
        currentBinds: id === null ? [] : listens.filter((r) => r.server_id === id),
        currentCerts: id === null ? [] : certBinds.filter((r) => r.server_id === id),
      }),
    );
  };
  const saveLabel = id === null ? t("common.create") : t("common.save");
  const saveActions = (
    <>
      <Button onClick={onClose}>{t("common.cancel")}</Button>
      <Button variant="contained" disabled={!hostOk} onClick={save}>
        {saveLabel}
      </Button>
    </>
  );

  return (
    <CatalogProvider value={catalog}>
    <Box sx={{ ...formDrawerPaperSx, flexDirection: "row" }}>
    <Box sx={{ ...formDrawerPaperSx, flex: 1, minWidth: 0, position: "relative" }}>
    <Form id="server" sx={{ flex: 1, minWidth: 0 }}>
      <Form.Header sx={{ py: 1.5 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>
        <RoutePower t={t} enabled={enabled} onChange={setEnabled} />
        <Form.Close onClick={onClose} />
      </Form.Header>
      {!enabled && <RouteOffNotice t={t} level="server" />}
      <Form.Body spacing={2} scroll>
        <RouteBody
          t={t}
          scope={scope}
          level="server"
          raw={raw}
          onRaw={setRaw}
          rawNginx={rawNginx}
          onRawNginx={setRawNginx}
          waf={waf}
          nginx={nginx}
          onWaf={setWaf}
          onNginx={setNginx}
          parents={parents}
          /*
            Просмотр печатает то, что уедет по «Сохранить»: документ карточки
            и её привязки из черновика, а не из стора -- порт, добавленный в
            этой сессии, обязан быть в `listen` до записи.
          */
          preview={{
            draft: {
              server: {
                uuid: id ?? "",
                server_names: names,
                enabled,
                nginx,
                waf: sanitizeWaf(waf),
                raw,
                raw_nginx: rawNginx,
                listens: binds.map((row) => ({
                  port_id: row.port_id,
                  default_server: row.default_server,
                })),
                certificates: certs.map((row) => ({
                  certificate_id: row.certificate_id,
                  kind: row.kind,
                })),
              },
            },
            node: { kind: "server", uuid: id ?? "" },
          }}
          outside={
            <Chips
              t={t}
              label={t("servers.names")}
              helper={t("servers.namesHint")}
              value={names}
              onChange={(v) => setNames(v ?? [])}
            />
          }
          own={
            /*
              Порты и сертификаты -- две секции: сворачивают их порознь,
              каталоги у них разные, и общая шапка называлась бы «привязки» --
              словом, которого нет ни в одном конфиге. Содержимое каждой --
              одна таблица, поэтому секция `flush`. Раскрыт только listen: за
              ним в карточку обычно и приходят.
            */
            <>
              <Section
                title={t("servers.listens")}
                hint={t("servers.listensHint")}
                flush
                defaultExpanded
              >
                <ListenBinds
                  scope={scope}
                  serverId={id}
                  draft={binds}
                  onDraft={editBinds}
                />
              </Section>
              <Section title={t("servers.certs")} hint={t("servers.certsHint")} flush>
                <CertBinds
                  scope={scope}
                  serverId={id}
                  draft={certs}
                  onDraft={editCerts}
                  needServerCert={sslMode === true}
                />
              </Section>
            </>
          }
        />
      </Form.Body>
      <Form.Actions>{saveActions}</Form.Actions>
    </Form>
    </Box>
        <ServerAddListenForm
          onLocalAdd={(portId) => {
            bindsTouched.current = true;
            setDraftBinds((cur) => [
              ...(cur ?? []),
              { port_id: portId, default_server: false },
            ]);
          }}
        />
        <ServerAddCertificateForm
          onLocalAdd={(certificateId, kind) => {
            certsTouched.current = true;
            setDraftCerts((cur) =>
              (cur ?? []).some((row) => row.kind === kind)
                ? cur
                : [...(cur ?? []), { certificate_id: certificateId, kind }],
            );
          }}
        />
    </Box>
    </CatalogProvider>
  );
}

/**
 * Порты сервера.
 *
 * Содержимое секции -- одна таблица и ничего кроме: шапку с именем и серой
 * строкой рисует сама секция (`flush`), второй заголовок внутри повторял бы
 * её слово в слово. Заводить порт здесь нечем: listen живёт в каталоге, сюда
 * его только привязывают.
 */
function ListenBinds({
  scope,
  serverId,
  draft,
  onDraft,
}: {
  scope: string;
  serverId: string | null;
  draft: DraftBind[];
  onDraft: (next: DraftBind[]) => void;
}) {
  const t = useT();
  const openAdd = onFormOpen(FORM_SERVER_ADD_LISTEN);
  const ports = useAppSelector((s) => s.pages.servers.ports);
  const servers = useAppSelector((s) => s.pages.servers.rows);

  const rows = draft.flatMap((row) => {
    const port = ports.find((item) => item.uuid === row.port_id);
    return port === undefined
      ? []
      : [
          {
            key: row.port_id,
            portId: row.port_id,
            listen: port,
            default_server: row.default_server,
          },
        ];
  });

  /*
   * И занятые порты, и режим считаются по черновику, а не по стору: пока
   * карточка открыта, правда -- то, что видит оператор. По стору снятая
   * привязка держала бы свой порт занятым, а её ssl -- режим сервера: сняв
   * единственный обычный listen, tls-порт было не привязать до сохранения.
   */
  const used = draft.map((row) => row.port_id);
  const sslMode = listenSslMode(rows.map((row) => row.listen));

  return (
    <Table size="small" sx={sectionTableSx}>
      <TableHead>
        <TableRow>
          <HeadCell
            label={t("ports.listen")}
            help={t("servers.listenColHint")}
            minWidth={140}
          />
          <HeadCell label={t("servers.tls")} help={t("servers.tlsHint")} width={TLS_W} />
          <HeadCell
            label={t("servers.defaultServer")}
            help={t("servers.defaultServerHint")}
            width={DEFAULT_W}
          />
          <FilterCell width={ACTIONS_W}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
              <TableIconButton
                color="success"
                icon={<AddIcon />}
                tooltip={t("servers.addListenTitle")}
                disabled={ports.length === 0}
                onClick={() => openAdd({ scope, serverId, used, sslMode })}
              />
            </Box>
          </FilterCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.length === 0 && (
          /*
            Пустой каталог -- не то же самое, что «ещё не привязали», и
            отвечает на это та же пустая строка: заводят порты в своём
            разделе, туда и ведёт ссылка.
          */
          <TableNoticeRow
            colSpan={4}
            kind="empty"
            message={
              ports.length === 0 ? (
                <>
                  {t("servers.needPorts")} <Link to="/structure/ports">{t("nav.ports")}</Link>
                </>
              ) : (
                t("servers.listenEmpty")
              )
            }
          />
        )}
        {rows.map((row) => {
          const catalog = ports.find((item) => item.uuid === row.portId);
          const takenBy = defaultTakenBy(catalog, serverId);
          const takenName =
            takenBy === null
              ? ""
              : (servers.find((item) => item.uuid === takenBy)?.server_names[0] ??
                servers.find((item) => item.uuid === takenBy)?.name ??
                takenBy);
          const locked = takenBy !== null && !row.default_server;
          const toggle = (value: boolean) => {
            if (locked) {
              return;
            }
            onDraft(
              draft.map((item) =>
                item.port_id === row.portId ? { ...item, default_server: value } : item,
              ),
            );
          };
          const remove = () => {
            onDraft(draft.filter((item) => item.port_id !== row.portId));
          };
          /*
           * Галочка, а не тумблер: строка данных ровно 36px, и переключатель в
           * ней стоит выше соседних ячеек -- ритм таблицы ломается на первой
           * же строке.
           */
          const check = (
            <Checkbox
              size="small"
              checked={row.default_server}
              disabled={locked}
              onChange={(_, on) => toggle(on)}
              slotProps={{ input: { "aria-label": t("servers.defaultServer") } }}
              sx={{ p: 0.25 }}
            />
          );
          return (
            <TableRow key={row.key} hover>
              <TableCell sx={{ ...cellSx, fontFamily: "monospace" }}>
                {portLine(row.listen)}
              </TableCell>
              <TableCell sx={{ ...cellSx, width: TLS_W }}>
                <Chip
                  size="small"
                  variant="outlined"
                  label={row.listen.ssl ? t("common.yes") : t("common.no")}
                  color={row.listen.ssl ? "success" : "default"}
                  sx={tableChipSx}
                />
              </TableCell>
              <FilterCell width={DEFAULT_W}>
                {locked ? (
                  <Tooltip title={t("servers.defaultTakenBy", { name: takenName })}>
                    <span style={{ display: "inline-flex" }}>{check}</span>
                  </Tooltip>
                ) : (
                  check
                )}
              </FilterCell>
              <FilterCell width={ACTIONS_W}>
                <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                  <TableIconButton
                    color="error"
                    icon={<DeleteIcon />}
                    tooltip={t("servers.unbindAria")}
                    onClick={remove}
                  />
                </Box>
              </FilterCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * Сертификаты сервера.
 *
 * Своя секция, а не блок рядом с портами: назначения свои, каталог свой, и
 * сворачивают их по отдельности. Назначение (ssl_certificate,
 * ssl_client_certificate, ssl_trusted_certificate) -- ключ строки: на одно
 * назначение сервер берёт один сертификат, поэтому строк здесь не больше трёх.
 */
function CertBinds({
  scope,
  serverId,
  draft,
  onDraft,
  needServerCert,
}: {
  scope: string;
  serverId: string | null;
  draft: DraftCert[];
  onDraft: (next: DraftCert[]) => void;
  needServerCert: boolean;
}) {
  const t = useT();
  const openAdd = onFormOpen(FORM_SERVER_ADD_CERT);
  const certificates = useAppSelector((s) => s.pages.servers.certificates);
  const binds = useAppSelector((s) => s.pages.servers.certBinds);

  const usedKinds: CertificateKind[] = draft.map((row) => row.kind);

  /*
   * Строки -- из черновика: карточка показывает то, что уедет по «Сохранить»,
   * а не то, что уже в базе. Отзыв (`has_crl`) берётся у привязки, если она
   * там есть: у только что добавленной его ещё нет.
   */
  const rows = draft.flatMap((row) => {
    const cert = certificates.find((item) => item.uuid === row.certificate_id);
    if (cert === undefined) {
      return [];
    }
    const bound = binds.find((item) => item.uuid === row.bind_id);
    return [
      {
        key: row.kind,
        kind: row.kind,
        name: cert.name,
        not_after: cert.not_after,
        fingerprint: cert.fingerprint,
        hasCrl: bound?.has_crl,
      },
    ];
  });
  const hasServerCert = usedKinds.includes("server");

  // mTLS без списка отзыва работает, но отозванные сертификаты продолжают
  // проходить проверку -- об этом стоит сказать на карточке сервера, а не
  // только на странице сертификатов.
  const caWithoutCrl = rows.some((row) => row.kind === "client_ca" && row.hasCrl === false);

  /*
   * Строка над таблицей -- только про то, чего не хватает файлу: ssl-порт без
   * серверного сертификата nginx не поднимет, а корень mTLS без CRL молча
   * пропускает отозванных. Постоянного текста здесь нет: пока всё на месте,
   * секция -- одна таблица.
   */
  const notice =
    needServerCert && !hasServerCert && certificates.length > 0 ? (
      <TableNotice kind="info" severity="warning" message={t("servers.needServerCert")} />
    ) : serverId !== null && caWithoutCrl ? (
      <TableNotice kind="info" severity="warning" message={t("servers.mtlsNoCrl")} />
    ) : undefined;

  return (
    <>
      {notice !== undefined && <SectionNotice>{notice}</SectionNotice>}
      {/* Со строкой предупреждения таблице нужна своя верхняя линия: под шапкой
          секции она уже не первая. */}
      <Table size="small" sx={notice === undefined ? sectionTableSx : flushTableSx}>
        <TableHead>
          <TableRow>
            <HeadCell label={t("common.name")} minWidth={120} />
            <HeadCell
              label={t("certificates.kind.label")}
              help={t("servers.certKindHint")}
              width={KIND_W}
            />
            <HeadCell label={t("certificates.notAfter")} width={AFTER_W} />
            <HeadCell label={t("certificates.fingerprint")} width={FP_W} />
            <FilterCell width={ACTIONS_W}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                <TableIconButton
                  color="success"
                  icon={<AddIcon />}
                  tooltip={
                    usedKinds.length >= 3
                      ? t("servers.certKindsFull")
                      : t("servers.addCertTitle")
                  }
                  disabled={certificates.length === 0 || usedKinds.length >= 3}
                  onClick={() => openAdd({ scope, serverId, usedKinds })}
                />
              </Box>
            </FilterCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableNoticeRow
              colSpan={5}
              kind="empty"
              message={
                certificates.length === 0 ? (
                  <>
                    {t("servers.needCerts")}{" "}
                    <Link to="/datasets/certificates">{t("nav.certificates")}</Link>
                  </>
                ) : (
                  t("servers.certEmpty")
                )
              }
            />
          )}
          {rows.map((row) => {
            const remove = () => {
              onDraft(draft.filter((item) => item.kind !== row.kind));
            };
            return (
              <TableRow key={row.key} hover>
                <TableCell sx={cellSx}>{row.name}</TableCell>
                <TableCell sx={{ ...cellSx, width: KIND_W, fontFamily: "monospace" }}>
                  {certKindLabel(row.kind, t)}
                </TableCell>
                <TableCell sx={{ ...cellSx, width: AFTER_W }}>
                  {formatCertDate(row.not_after)}
                </TableCell>
                <TableCell sx={{ ...cellSx, width: FP_W, fontFamily: "monospace" }}>
                  <Tooltip title={row.fingerprint}>
                    <Box component="span">{shortFingerprint(row.fingerprint)}</Box>
                  </Tooltip>
                </TableCell>
                <FilterCell width={ACTIONS_W}>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                    <TableIconButton
                      color="error"
                      icon={<DeleteIcon />}
                      tooltip={t("servers.unbindCert")}
                      onClick={remove}
                    />
                  </Box>
                </FilterCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
