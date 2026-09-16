import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import FilterAltIcon from "@mui/icons-material/FilterAlt";

import {
  fetchAuditGroups,
  fetchAuditSearch,
  frameAddr,
  type AuditGroupDim,
  type AuditGroupRow,
  type AuditGroupSort,
  type AuditSearchEvent,
  type AuditSearchQuery,
  type AuditSearchVerdict,
  fetchDeclaredInspectors,
  fetchLocations,
  fetchServers,
  type RouteLocation,
  type RouteServer,
} from "../api.ts";
import { verdictColor, type AuditFilter } from "../audit.ts";
import {
  DataTable,
  FilterRange,
  FilterSelect,
  FilterText,
  RangeField,
  useServerPager,
  defaultRange,
  rangeCaption,
  rangeISO,
  snapshotPreset,
  weekStart,
  type DateRange,
} from "../components/data-table/index.ts";
import { useT } from "../i18n/index.ts";
import { FieldPick, FilterPick } from "../components/pick-multi.tsx";
import { nginxLocationName, nginxServerName } from "../traffic.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppSelector } from "../store/hooks.ts";
import {
  InspectorChips,
  IpCell,
  MarkerCell,
  UserCell,
  GeoCell,
  PhaseChip,
  Seekable,
  StatusCell,
  VerdictChip,
  type SeekField,
  type SeekState,
} from "./incident-cells.tsx";
import { GEO_FIELDS, IpAddress } from "../components/ip-geo/index.ts";
import {
  IncidentCard,
  type PreviewQuery,
  type SeekPreview,
  type SiblingRecord,
} from "./IncidentCard.tsx";
import {
  CHIP_SX,
  COL_MIN,
  ColumnPicker,
  FieldInput,
  GroupAxes,
  QueryLine,
  RAY_TAIL_MIN,
  RayToggle,
  SearchSection,
  TIME_MS_MIN,
  TimeOrderToggle,
  TimeToggle,
  ToolbarSection,
  clock,
  emptyFields,
  queryTerms,
  rayTail,
  readFiltersOpen,
  readGroupOpen,
  readHiddenCols,
  readRayTail,
  readSearchFields,
  readSearchOpen,
  readTimeAsc,
  readTimeMs,
  visibleCols,
  writeFiltersOpen,
  writeGroupOpen,
  writeHiddenCols,
  writeRayTail,
  writeSearchFields,
  writeSearchOpen,
  writeTimeAsc,
  writeTimeMs,
  type AuditFields,
  type ListCol,
  type SearchKind,
} from "./incident-toolbar.tsx";

const METHODS = ["", "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;

const DRILL_W = 128;

const GROUP_DIMS = [
  "ip",
  "host",
  "server",
  "uri",
  "route",
  "method",
  "status",
  "verdict",
  "phase",
  "marker",
  "user",
  "country",
  "asn",
] as const satisfies readonly AuditGroupDim[];

type Draft = AuditFields;

const emptyDraft: Draft = emptyFields;

export default function Incidents() {
  const t = useT();
  const locale = useAppSelector((s) => s.ui.locale);
  const scope = useAppSelector((s) => s.session.scope);
  const [routes, setRoutes] = useState<Map<string, RouteLocation>>(new Map());
  useEffect(() => {
    if (scope === null) {
      return;
    }
    let alive = true;
    fetchLocations(scope)
      .then((rows) => {
        if (alive) {
          setRoutes(new Map(rows.map((row) => [row.uuid, row])));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [scope]);
  const routeName = (id: string): string => {
    const row = routes.get(id);
    return row === undefined ? id : `${row.server_name} ${nginxLocationName(row)}`;
  };
  const [servers, setServers] = useState<RouteServer[]>([]);
  const [declared, setDeclared] = useState<string[]>([]);
  useEffect(() => {
    if (scope === null) {
      return;
    }
    let alive = true;
    fetchServers(scope)
      .then((rows) => {
        if (alive) {
          setServers(rows);
        }
      })
      .catch(() => {});
    fetchDeclaredInspectors(scope)
      .then((rows) => {
        if (alive) {
          setDeclared(rows.map((row) => row.name));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [scope]);
  const serverOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const row of [...servers].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = nginxServerName(row);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ value: key, label: key === row.name ? key : `${row.name} (${key})` });
    }
    return out;
  }, [servers]);
  const inspectorOptions = useMemo(
    () => [
      { value: "", label: t("incidentsPage.filter.all") },
      ...[...declared].sort().map((name) => ({ value: name, label: name })),
    ],
    [declared, t],
  );
  const routeOptions = useMemo(
    () =>
      [...routes.values()]
        .sort(
          (a, b) =>
            a.server_name.localeCompare(b.server_name) || a.position - b.position,
        )
        .map((row) => ({
          value: row.uuid,
          label: `${row.server_name} ${nginxLocationName(row)}`,
        })),
    [routes],
  );
  const [verdict, setVerdict] = useState<AuditFilter>("all");
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [applied, setApplied] = useState<Draft>(emptyDraft);
  const pager = useServerPager({ fallback: 25 });
  const { page, pageSize, setPage } = pager;
  const [items, setItems] = useState<AuditSearchEvent[]>([]);
  const [groupBy, setGroupBy] = useState<AuditGroupDim[]>([]);
  const [groupSort, setGroupSort] = useState<AuditGroupSort>({ key: "hits", dir: "desc" });
  const [groups, setGroups] = useState<AuditGroupRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [hidden, setHidden] = useState<ListCol[]>(readHiddenCols);
  useEffect(() => writeHiddenCols(hidden), [hidden]);
  const [searchFields, setSearchFields] = useState<SearchKind[]>(readSearchFields);
  useEffect(() => writeSearchFields(searchFields), [searchFields]);
  const [searchOpen, setSearchOpen] = useState<boolean>(readSearchOpen);
  useEffect(() => writeSearchOpen(searchOpen), [searchOpen]);
  const [groupOpen, setGroupOpen] = useState<boolean>(readGroupOpen);
  useEffect(() => writeGroupOpen(groupOpen), [groupOpen]);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(readFiltersOpen);
  useEffect(() => writeFiltersOpen(filtersOpen), [filtersOpen]);
  const [rayTailOnly, setRayTailOnly] = useState<boolean>(readRayTail);
  useEffect(() => writeRayTail(rayTailOnly), [rayTailOnly]);
  const [timeMs, setTimeMs] = useState<boolean>(readTimeMs);
  useEffect(() => writeTimeMs(timeMs), [timeMs]);
  const [timeAsc, setTimeAsc] = useState<boolean>(readTimeAsc);
  useEffect(() => writeTimeAsc(timeAsc), [timeAsc]);

  const verdicts = useMemo(
    () =>
      (["all", "deny", "allow", "redirect"] as const).map((row) => ({
        value: row,
        label: t(`incidentsPage.filter.${row}`),
      })),
    [t],
  );

  const methods = useMemo(
    () =>
      METHODS.map((row) => ({
        value: row,
        label: row === "" ? t("incidentsPage.filter.all") : row,
      })),
    [t],
  );

  const phases = useMemo(
    () =>
      ["", "request", "response", "frame", "session"].map((row) => ({
        value: row,
        label: row === "" ? t("incidentsPage.filter.all") : t(`incidentsPage.phaseValue.${row}`),
      })),
    [t],
  );

  const rangeLabel =
    rangeCaption(range, (id) => t(`incidentsPage.range.${id}`)) || t("incidentsPage.time");

  usePageBar({
    flush: true,
    onUpdate: () => {
      if (range.preset !== "") {
        setRange(snapshotPreset(range.preset, new Date(), weekStart(locale)));
      }
      setTick((n) => n + 1);
    },
    meta: rangeLabel,
  });

  useEffect(() => {
    const id = window.setTimeout(() => {
      const next: Draft = {
        ray: draft.ray.trim(),
        ip: draft.ip.trim(),
        method: draft.method,
        host: draft.host.trim(),
        server: draft.server.trim(),
        uri: draft.uri.trim(),
        route: draft.route.trim(),
        status: draft.status.trim(),
        phase: draft.phase,
        inspector: draft.inspector.trim(),
        user: draft.user.trim(),
        marker: draft.marker.trim(),
        country: draft.country.trim(),
        asn: draft.asn.trim(),
        header: draft.header.trim(),
        param: draft.param.trim(),
        body: draft.body.trim(),
      };
      setApplied((prev) => {
        if (
          prev.ray === next.ray &&
          prev.ip === next.ip &&
          prev.method === next.method &&
          prev.host === next.host &&
          prev.server === next.server &&
          prev.uri === next.uri &&
          prev.route === next.route &&
          prev.status === next.status &&
          prev.phase === next.phase &&
          prev.inspector === next.inspector &&
          prev.user === next.user &&
          prev.marker === next.marker &&
          prev.country === next.country &&
          prev.asn === next.asn &&
          prev.header === next.header &&
          prev.param === next.param &&
          prev.body === next.body
        ) {
          return prev;
        }
        setPage(0);
        return next;
      });
    }, 400);
    return () => window.clearTimeout(id);
  }, [draft]);

  useEffect(() => {
    if (!pager.ready) {
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const window = rangeISO(range);
    const query: AuditSearchQuery = {
      verdict: verdict === "all" ? "" : (verdict as AuditSearchVerdict),
      method: applied.method,
      host: applied.host,
      server: applied.server,
      uri: applied.uri,
      route: applied.route,
      status: applied.status,
      phase: applied.phase,
      inspector: applied.inspector,
      user: applied.user,
      marker: applied.marker,
      country: applied.country,
      asn: applied.asn,
      ray: applied.ray,
      ip: applied.ip,
      header: applied.header,
      param: applied.param,
      body: applied.body,
      from: window.from,
      to: window.to,
      limit: pageSize,
      offset: page * pageSize,
    };

    const failed = (err: unknown) => {
      if (ac.signal.aborted) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg === "search_unreachable" ? t("incidentsPage.unreachable") : msg);
      setItems([]);
      setGroups([]);
      setTotal(0);
    };

    const done = () => {
      if (!ac.signal.aborted) {
        setLoading(false);
      }
    };

    if (groupBy.length > 0) {
      void fetchAuditGroups(query, groupBy, groupSort)
        .then((row) => {
          if (ac.signal.aborted) {
            return;
          }
          setGroups(row.items);
          setTotal(row.total);
        })
        .catch(failed)
        .finally(done);
    } else {
      void fetchAuditSearch({ ...query, order: timeAsc ? "asc" : undefined })
        .then((row) => {
          if (ac.signal.aborted) {
            return;
          }
          setItems(row.items);
          setTotal(row.total);
        })
        .catch(failed)
        .finally(done);
    }

    return () => ac.abort();
  }, [
    applied,
    groupBy,
    groupSort,
    page,
    pageSize,
    pager.ready,
    range,
    t,
    tick,
    timeAsc,
    verdict,
  ]);

  const filtered =
    applied.ray !== "" ||
    applied.ip !== "" ||
    applied.method !== "" ||
    applied.host !== "" ||
    applied.server !== "" ||
    applied.uri !== "" ||
    applied.route !== "" ||
    applied.status !== "" ||
    applied.phase !== "" ||
    applied.inspector !== "" ||
    applied.user !== "" ||
    applied.marker !== "" ||
    applied.country !== "" ||
    applied.asn !== "" ||
    applied.header !== "" ||
    applied.param !== "" ||
    applied.body !== "" ||
    range.preset !== "24h";

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };
  const routeIds = draft.route === "" ? [] : draft.route.split(",");
  const setRouteIds = (ids: string[]) => {
    setField("route", ids.join(","));
    setPage(0);
  };
  const serverKeys = draft.server === "" ? [] : draft.server.split(",");
  const setServerKeys = (keys: string[]) => {
    setField("server", keys.join(","));
    setPage(0);
  };

  const previewQuery: PreviewQuery = {
    header: applied.header,
    param: applied.param,
    body: applied.body,
  };

  const forced = useMemo(() => {
    const set = new Set<ListCol>();
    for (const col of [
      "ip",
      "phase",
      "method",
      "host",
      "uri",
      "server",
      "route",
      "status",
      "inspector",
      "user",
      "marker",
      "country",
      "asn",
    ] as const) {
      if (applied[col] !== "") {
        set.add(col);
      }
    }
    if (verdict !== "all") {
      set.add("verdict");
    }
    return set;
  }, [applied, verdict]);
  const cols = useMemo(() => visibleCols(hidden, forced), [hidden, forced]);

  const terms = useMemo(
    () => queryTerms({ range, verdict, fields: applied, routeName }),
    [range, verdict, applied, routes],
  );

  const filterChips: { key: string; label: string; clear: () => void }[] = [];
  {
    const push = (key: string, name: string, value: string, clear: () => void) => {
      if (value !== "") {
        filterChips.push({ key, label: `${name.toLocaleLowerCase()}: ${value}`, clear });
      }
    };
    const list = (raw: string, name: (id: string) => string) =>
      raw === "" ? "" : raw.split(",").filter((id) => id !== "").map(name).join(", ");

    if (range.preset !== "24h") {
      filterChips.push({
        key: "time",
        label: `${t("incidentsPage.time").toLocaleLowerCase()}: ${rangeLabel}`,
        clear: () => {
          setRange(defaultRange);
          setPage(0);
        },
      });
    }
    push("ray", t("incidentsPage.ray"), applied.ray, () => clearField("ray"));
    push("ip", t("incidentsPage.ip"), applied.ip, () => clearField("ip"));
    push(
      "phase",
      t("incidentsPage.phase"),
      applied.phase === "" ? "" : t(`incidentsPage.phaseValue.${applied.phase}`),
      () => clearField("phase"),
    );
    push("method", t("incidentsPage.method"), applied.method, () => clearField("method"));
    push("host", t("incidentsPage.host"), applied.host, () => clearField("host"));
    push("server", t("incidentsPage.server"), list(applied.server, (id) => id), () =>
      clearField("server"),
    );
    push("uri", t("incidentsPage.uri"), applied.uri, () => clearField("uri"));
    push("route", t("incidentsPage.route"), list(applied.route, routeName), () =>
      clearField("route"),
    );
    push("status", t("incidentsPage.status"), applied.status, () => clearField("status"));
    if (verdict !== "all") {
      filterChips.push({
        key: "verdict",
        label: `${t("incidentsPage.verdict").toLocaleLowerCase()}: ${verdict}`,
        clear: () => {
          setVerdict("all");
          setPage(0);
        },
      });
    }
    push("inspector", t("incidentsPage.inspector"), applied.inspector, () =>
      clearField("inspector"),
    );
    push("user", t("incidentsPage.user"), applied.user, () => clearField("user"));
    push("marker", t("incidentsPage.marker"), applied.marker, () => clearField("marker"));
    push("country", t("incidentsPage.country"), applied.country.toUpperCase(), () =>
      clearField("country"),
    );
    push("asn", t("incidentsPage.asn"), applied.asn === "" ? "" : `AS${applied.asn}`, () =>
      clearField("asn"),
    );
  }

  const seek: SeekPreview = (kind, name, value) => {
    const head = kind === "header" ? name.toLowerCase() : name;
    const query = value === undefined ? head : `${head}=${value}`;
    const key = kind === "header" ? "header" : "param";
    setDraft((prev) => ({ ...prev, [key]: query }));
    setApplied((prev) => ({ ...prev, [key]: query }));
    setSearchFields((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setPage(0);
  };

  const cellSeek: SeekState = {
    active: {
      ray: applied.ray,
      ip: applied.ip,
      phase: applied.phase,
      method: applied.method,
      host: applied.host,
      server: applied.server,
      uri: applied.uri,
      route: applied.route,
      status: applied.status,
      inspector: applied.inspector,
      user: applied.user,
      marker: applied.marker,
      country: applied.country,
      asn: applied.asn,
      verdict: verdict === "all" ? "" : verdict,
    },
    apply: (field: SeekField, value: string) => {
      if (field === "verdict") {
        setVerdict((prev) => (prev === value ? "all" : (value as AuditFilter)));
        setPage(0);
        return;
      }

      if (field === "route" || field === "server") {
        const current = draft[field] === "" ? [] : draft[field].split(",");
        const list = current.includes(value)
          ? current.filter((id) => id !== value)
          : [...current, value];
        const joined = list.join(",");
        setDraft((prev) => ({ ...prev, [field]: joined }));
        setApplied((prev) => ({ ...prev, [field]: joined }));
        setPage(0);
        return;
      }

      const next = draft[field] === value ? "" : value;
      setDraft((prev) => ({ ...prev, [field]: next }));
      setApplied((prev) => ({ ...prev, [field]: next }));
      setPage(0);
    },
  };

  const grouped = groupBy.length > 0;

  const dropRows = () => {
    setItems([]);
    setGroups([]);
    setTotal(0);
  };

  const toggleDim = (dim: AuditGroupDim) => {
    dropRows();
    setGroupBy((prev) => {
      const next = prev.includes(dim)
        ? prev.filter((row) => row !== dim)
        : [...prev, dim];
      setGroupSort((sort) =>
        sort.key === dim && !next.includes(dim) ? { key: "hits", dir: "desc" } : sort,
      );
      return next;
    });
    setPage(0);
  };

  const sortGroups = (key: AuditGroupSort["key"]) => {
    setGroupSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "hits" || key === "denied" || key === "last" ? "desc" : "asc" },
    );
    setPage(0);
  };

  const resetFilters = () => {
    setDraft(emptyDraft);
    setApplied(emptyDraft);
    setVerdict("all");
    setRange(defaultRange);
    setPage(0);
  };

  const clearField = (key: keyof Draft) => {
    setDraft((prev) => ({ ...prev, [key]: "" }));
    setApplied((prev) => ({ ...prev, [key]: "" }));
    setPage(0);
  };

  const intoFields = (fields: Draft, dim: AuditGroupDim, value: string): Draft => {
    switch (dim) {
      case "ip":
      case "host":
      case "server":
      case "uri":
      case "route":
      case "status":
      case "phase":
      case "country":
      case "asn":
      case "marker":
        return { ...fields, [dim]: value };
      case "user":
        return { ...fields, user: value };
      case "method":
        return (METHODS as readonly string[]).includes(value)
          ? { ...fields, method: value }
          : fields;
      case "verdict":
        if (value === "deny" || value === "allow" || value === "redirect") {
          setVerdict(value);
        }
        return fields;
      default:
        return fields;
    }
  };

  const pickDim = (dim: AuditGroupDim, value: string) => {
    if (value === "") {
      return;
    }

    const next = intoFields(draft, dim, value);
    setDraft(next);
    setApplied(next);
    toggleDim(dim);
  };

  const drill = (row: AuditGroupRow) => {
    dropRows();
    let next = { ...draft };
    for (const dim of groupBy) {
      next = intoFields(next, dim, row.keys[dim] ?? "");
    }
    setDraft(next);
    setApplied(next);
    setGroupBy([]);
    setPage(0);
  };

  const headCells: Record<ListCol, ReactNode> = {
    time: (
      <FilterRange
        value={range}
        onChange={(next) => {
          setRange(next);
          setPage(0);
        }}
        placeholder={t("incidentsPage.time")}
        width={timeMs ? 200 : 160}
        minWidth={timeMs ? TIME_MS_MIN : COL_MIN.time}
        action={
          <>
            <TimeOrderToggle
              asc={timeAsc}
              onToggle={() => {
                setTimeAsc((on) => !on);
                setPage(0);
              }}
            />
            <TimeToggle ms={timeMs} onToggle={() => setTimeMs((on) => !on)} />
          </>
        }
      />
    ),
    ray: (
      <FilterText
        value={draft.ray}
        onChange={(next) => setField("ray", next)}
        placeholder={t("incidentsPage.ray")}
        width={rayTailOnly ? 120 : 140}
        minWidth={rayTailOnly ? RAY_TAIL_MIN : COL_MIN.ray}
        mono
        clearable
        action={<RayToggle tail={rayTailOnly} onToggle={() => setRayTailOnly((on) => !on)} />}
      />
    ),
    ip: (
      <FilterText
        value={draft.ip}
        onChange={(next) => setField("ip", next)}
        placeholder={t("incidentsPage.cidr")}
        width={160}
        minWidth={COL_MIN.ip}
        mono
        clearable
      />
    ),
    phase: (
      <FilterSelect
        value={draft.phase}
        onChange={(next) => {
          setField("phase", next);
          setPage(0);
        }}
        options={phases}
        placeholder={t("incidentsPage.phase")}
        unset=""
        width={110}
        minWidth={COL_MIN.phase}
      />
    ),
    method: (
      <FilterSelect
        value={draft.method}
        onChange={(next) => {
          setField("method", next);
          setPage(0);
        }}
        options={methods}
        placeholder={t("incidentsPage.method")}
        unset=""
        width={88}
        minWidth={COL_MIN.method}
      />
    ),
    host: (
      <FilterText
        value={draft.host}
        onChange={(next) => setField("host", next)}
        placeholder={t("incidentsPage.host")}
        width="16%"
        minWidth={COL_MIN.host}
        mono
        clearable
      />
    ),
    uri: (
      <FilterText
        value={draft.uri}
        onChange={(next) => setField("uri", next)}
        placeholder={t("incidentsPage.uri")}
        width="28%"
        minWidth={COL_MIN.uri}
        mono
        clearable
      />
    ),
    server: (
      <FilterPick
        value={serverKeys}
        onChange={setServerKeys}
        options={serverOptions}
        placeholder={t("incidentsPage.server")}
        width="10%"
        minWidth={COL_MIN.server}
      />
    ),
    route: (
      <FilterPick
        value={routeIds}
        onChange={setRouteIds}
        options={routeOptions}
        placeholder={t("incidentsPage.route")}
        width="12%"
        minWidth={COL_MIN.route}
      />
    ),
    status: (
      <FilterText
        value={draft.status}
        onChange={(next) => setField("status", next.replace(/\D/g, "").slice(0, 3))}
        placeholder={t("incidentsPage.status")}
        width={64}
        minWidth={COL_MIN.status}
        mono
        clearable
      />
    ),
    verdict: (
      <FilterSelect
        value={verdict}
        onChange={(next) => {
          setVerdict(next);
          setPage(0);
        }}
        options={verdicts}
        placeholder={t("incidentsPage.verdict")}
        unset="all"
        width={110}
        minWidth={COL_MIN.verdict}
      />
    ),
    score: (
      <TableCell sx={{ minWidth: COL_MIN.score }}>{t("incidentsPage.score")}</TableCell>
    ),
    inspector: (
      <FilterSelect
        value={draft.inspector}
        onChange={(next) => {
          setField("inspector", next);
          setPage(0);
        }}
        options={inspectorOptions}
        placeholder={t("incidentsPage.inspector")}
        unset=""
        width="16%"
        minWidth={COL_MIN.inspector}
      />
    ),
    user: (
      <FilterText
        value={draft.user}
        onChange={(next) => setField("user", next)}
        placeholder={t("incidentsPage.user")}
        title={t("incidentsPage.userHint")}
        width={180}
        minWidth={COL_MIN.user}
        mono
        clearable
      />
    ),
    marker: (
      <FilterText
        value={draft.marker}
        onChange={(next) => setField("marker", next)}
        placeholder={t("incidentsPage.marker")}
        width={140}
        minWidth={COL_MIN.marker}
        clearable
      />
    ),
    country: (
      <FilterText
        value={draft.country}
        onChange={(next) => setField("country", next.toLowerCase())}
        placeholder={t("incidentsPage.country")}
        title={t("incidentsPage.countryHint")}
        width={80}
        minWidth={COL_MIN.country}
        mono
        clearable
      />
    ),
    asn: (
      <FilterText
        value={draft.asn}
        onChange={(next) => setField("asn", next.replace(/\D+/g, ""))}
        placeholder={t("incidentsPage.asn")}
        title={t("incidentsPage.asnHint")}
        width={100}
        minWidth={COL_MIN.asn}
        mono
        clearable
      />
    ),
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <QueryLine
        terms={terms}
        onReset={filtered || verdict !== "all" ? resetFilters : undefined}
      />
      <SearchSection
        open={searchOpen}
        onOpen={setSearchOpen}
        fields={searchFields}
        onFields={setSearchFields}
        values={draft}
        onChange={setField}
        onClear={clearField}
      />
      <ToolbarSection
        title={t("incidentsPage.group.title")}
        open={groupOpen}
        onOpen={setGroupOpen}
        filled={grouped}
        summary={
          groupOpen || !grouped ? undefined : (
            <GroupAxes
              all={GROUP_DIMS}
              chosen={groupBy}
              label={(dim) => t(`incidentsPage.group.dim.${dim}`)}
              onToggle={toggleDim}
              summary
            />
          )
        }
        extra={
          <>
            {grouped && (
              <Chip
                size="small"
                variant="outlined"
                label={loading ? "…" : t("incidentsPage.group.total", { count: total })}
                sx={{ ...CHIP_SX, color: "text.secondary" }}
              />
            )}
            {!grouped && (
              <ColumnPicker hidden={hidden} forced={forced} onChange={setHidden} />
            )}
          </>
        }
      >
        <GroupAxes
          all={GROUP_DIMS}
          chosen={groupBy}
          label={(dim) => t(`incidentsPage.group.dim.${dim}`)}
          onToggle={toggleDim}
        />
      </ToolbarSection>
      {grouped && (
        <ToolbarSection
          title={t("incidentsPage.group.filters")}
          open={filtersOpen}
          onOpen={setFiltersOpen}
          filled={filtered || verdict !== "all"}
          summary={
            filtersOpen ? undefined : (
              <>
                {filterChips.map((chip) => (
                  <Chip
                    key={chip.key}
                    size="small"
                    variant="outlined"
                    color="primary"
                    label={chip.label}
                    title={chip.label}
                    onClick={() => setFiltersOpen(true)}
                    onDelete={chip.clear}
                    sx={{ ...CHIP_SX, maxWidth: 240 }}
                  />
                ))}
              </>
            )
          }
        >
          <RangeField
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(0);
            }}
            placeholder={t("incidentsPage.time")}
          />
          <FieldInput
            value={draft.ray}
            onChange={(next) => setField("ray", next)}
            onClear={() => clearField("ray")}
            placeholder={t("incidentsPage.ray")}
            width={120}
          />
          <FieldInput
            value={draft.ip}
            onChange={(next) => setField("ip", next)}
            onClear={() => clearField("ip")}
            placeholder={t("incidentsPage.cidr")}
            width={140}
          />
          <FieldSelect
            value={draft.phase}
            onChange={(next) => {
              setField("phase", next);
              setPage(0);
            }}
            options={phases}
            placeholder={t("incidentsPage.phase")}
            unset=""
            width={100}
          />
          <FieldSelect
            value={draft.method}
            onChange={(next) => {
              setField("method", next);
              setPage(0);
            }}
            options={methods}
            placeholder={t("incidentsPage.method")}
            unset=""
            width={90}
          />
          <FieldInput
            value={draft.host}
            onChange={(next) => setField("host", next)}
            onClear={() => clearField("host")}
            placeholder={t("incidentsPage.host")}
            width={150}
          />
          <FieldPick
            value={serverKeys}
            onChange={setServerKeys}
            options={serverOptions}
            placeholder={t("incidentsPage.server")}
            width={170}
          />
          <FieldInput
            value={draft.uri}
            onChange={(next) => setField("uri", next)}
            onClear={() => clearField("uri")}
            placeholder={t("incidentsPage.uri")}
            width={170}
          />
          <FieldPick
            value={routeIds}
            onChange={setRouteIds}
            options={routeOptions}
            placeholder={t("incidentsPage.route")}
            width={200}
          />
          <FieldInput
            value={draft.status}
            onChange={(next) => setField("status", next.replace(/\D/g, "").slice(0, 3))}
            onClear={() => clearField("status")}
            placeholder={t("incidentsPage.status")}
            width={70}
          />
          <FieldSelect
            value={verdict}
            onChange={(next) => {
              setVerdict(next);
              setPage(0);
            }}
            options={verdicts}
            placeholder={t("incidentsPage.verdict")}
            unset="all"
            width={100}
          />
          <FieldSelect
            value={draft.inspector}
            onChange={(next) => {
              setField("inspector", next);
              setPage(0);
            }}
            options={inspectorOptions}
            placeholder={t("incidentsPage.inspector")}
            unset=""
            width={130}
          />
          <FieldInput
            value={draft.user}
            onChange={(next) => setField("user", next)}
            onClear={() => clearField("user")}
            placeholder={t("incidentsPage.user")}
            width={180}
          />
          <FieldInput
            value={draft.marker}
            onChange={(next) => setField("marker", next)}
            onClear={() => clearField("marker")}
            placeholder={t("incidentsPage.marker")}
            width={160}
          />
          <FieldInput
            value={draft.country}
            onChange={(next) => setField("country", next.toLowerCase())}
            onClear={() => clearField("country")}
            placeholder={t("incidentsPage.country")}
            width={90}
          />
          <FieldInput
            value={draft.asn}
            onChange={(next) => setField("asn", next.replace(/\D+/g, ""))}
            onClear={() => clearField("asn")}
            placeholder={t("incidentsPage.asn")}
            width={110}
          />
        </ToolbarSection>
      )}
      <DataTable
        loading={loading && (grouped ? groups.length === 0 : items.length === 0)}
        error={error}
        colSpan={grouped ? groupBy.length + 4 : cols.length}
        sx={{ flex: 1, minHeight: 0 }}
      >
        {grouped ? (
          <DataTable.Head>
            <SortHead
              label={t("incidentsPage.group.last")}
              sortKey="last"
              sort={groupSort}
              onSort={sortGroups}
            />
            {groupBy.map((dim) => (
              <SortHead
                key={dim}
                label={t(`incidentsPage.group.dim.${dim}`)}
                sortKey={dim}
                sort={groupSort}
                onSort={sortGroups}
              />
            ))}
            <SortHead
              label={t("incidentsPage.group.hits")}
              sortKey="hits"
              sort={groupSort}
              onSort={sortGroups}
              right
            />
            <SortHead
              label={t("incidentsPage.group.outcomes")}
              sortKey="denied"
              sort={groupSort}
              onSort={sortGroups}
              right
            />
            <TableCell sx={{ width: DRILL_W, minWidth: DRILL_W }} />
          </DataTable.Head>
        ) : (
          <DataTable.Head>
            {cols.map((col) => (
              <Fragment key={col}>{headCells[col]}</Fragment>
            ))}
          </DataTable.Head>
        )}
        <DataTable.Body>
          {grouped &&
            groups.map((row) => (
              <GroupRow
                key={groupBy.map((dim) => row.keys[dim] ?? "").join("\0")}
                row={row}
                by={groupBy}
                maxHits={groups[0]?.hits ?? row.hits}
                onOpen={() => drill(row)}
                onPick={pickDim}
                routeName={routeName}
              />
            ))}
          {!grouped && items.map((row) => {
            const key = rowKey(row);
            const sibling = siblingOf(items, row);
            return (
              <IncidentRows
                key={key}
                row={row}
                cols={cols}
                rayTailOnly={rayTailOnly}
                timeMs={timeMs}
                open={open === key}
                onToggle={() => setOpen((cur) => (cur === key ? null : key))}
                onSeek={seek}
                cell={cellSeek}
                query={previewQuery}
                sibling={sibling === undefined ? undefined : {
                  phase: sibling.phase,
                  open: () => setOpen(rowKey(sibling)),
                }}
              />
            );
          })}
        </DataTable.Body>
        <DataTable.Empty
          kind={grouped || filtered ? "none" : "empty"}
          message={
            grouped
              ? t("incidentsPage.group.none")
              : filtered
                ? t("incidentsPage.none")
                : t("incidentsPage.empty")
          }
        />
        <DataTable.Error onRetry={() => setTick((n) => n + 1)} />
        <DataTable.Pager
          page={page}
          total={total}
          size={pager}
          disabled={loading}
          onPageChange={setPage}
        />
      </DataTable>
    </Box>
  );
}

function FieldSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  unset,
  width,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  placeholder: string;
  unset: T;
  width: number;
}) {
  const active = value !== unset;
  return (
    <Select
      variant="standard"
      disableUnderline
      displayEmpty
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      renderValue={(cur) =>
        cur === unset
          ? placeholder
          : (options.find((row) => row.value === cur)?.label ?? String(cur))
      }
      inputProps={{ "aria-label": placeholder }}
      sx={{
        minWidth: width,
        maxWidth: width,
        height: 26,
        px: 1,
        border: 1,
        borderColor: active ? "primary.main" : "divider",
        borderRadius: "2px",
        fontSize: "0.78rem",
        fontFamily: "monospace",
        color: active ? "text.primary" : "text.secondary",
        "& .MuiSelect-select": {
          py: 0,
          height: "100%",
          display: "flex",
          alignItems: "center",
          boxSizing: "border-box",
        },
      }}
    >
      {options.map((row) => (
        <MenuItem key={row.value} value={row.value} sx={{ fontSize: "0.8rem" }}>
          {row.label}
        </MenuItem>
      ))}
    </Select>
  );
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  right,
}: {
  label: string;
  sortKey: AuditGroupSort["key"];
  sort: AuditGroupSort;
  onSort: (key: AuditGroupSort["key"]) => void;
  right?: boolean;
}) {
  const active = sort.key === sortKey;
  return (
    <TableCell
      align={right === true ? "right" : "left"}
      sortDirection={active ? sort.dir : false}
    >
      <TableSortLabel
        active={active}
        direction={active ? sort.dir : "desc"}
        onClick={() => onSort(sortKey)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
}

function siblingOf(items: AuditSearchEvent[], row: AuditSearchEvent): AuditSearchEvent | undefined {
  const same = (other: AuditSearchEvent) =>
    other !== row && other.node === row.node && other.ray === row.ray;
  const want =
    row.phase === "frame" || row.phase === "session"
      ? ["request"]
      : row.phase === "request"
        ? ["session", "response"]
        : ["request"];
  for (const phase of want) {
    const found = items.find((other) => same(other) && other.phase === phase);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function rowKey(row: AuditSearchEvent): string {
  return `${row.node}\0${row.ray}\0${row.phase}\0${frameAddr(row)}`;
}

function verdictSx(verdict: string): string {
  const color = verdictColor(verdict);
  return color === "default" ? "text.primary" : `${color}.main`;
}

function GroupRow({
  row,
  by,
  maxHits,
  onOpen,
  onPick,
  routeName,
}: {
  row: AuditGroupRow;
  by: readonly AuditGroupDim[];
  maxHits: number;
  onOpen: () => void;
  onPick: (dim: AuditGroupDim, value: string) => void;
  routeName: (id: string) => string;
}) {
  const t = useT();

  const cell = (dim: AuditGroupDim): string => {
    const value = row.keys[dim] ?? "";
    if (value === "") {
      return "—";
    }
    if (dim === "route") {
      return routeName(value);
    }
    if (dim === "phase") {
      return t(`incidentsPage.phaseValue.${value}`);
    }
    if (dim === "verdict") {
      return t(`incidentsPage.filter.${value}`);
    }
    if (dim === "asn") {
      return `AS${value}`;
    }
    if (dim === "country") {
      return value.toUpperCase();
    }
    return value;
  };

  const barPct = maxHits > 0 ? Math.max(2, Math.round((row.hits / maxHits) * 100)) : 0;

  return (
    <TableRow
      hover
      onClick={onOpen}
      sx={{ cursor: "pointer", "&:hover .drill-hint": { opacity: 1 } }}
    >
      <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>
        {clock(row.last)}
      </TableCell>
      {by.map((dim) => (
        <TableCell key={dim} sx={{ fontFamily: "monospace" }}>
          <GroupValue dim={dim} value={row.keys[dim] ?? ""} onPick={onPick}>
          {dim === "ip" && (row.keys.ip ?? "") !== "" ? (
            <IpAddress
              value={row.keys.ip ?? ""}
              geoFields={GEO_FIELDS.filter((field) => !by.includes(field))}
            />
          ) : dim === "uri" ? (
            <Typography
              component="span"
              variant="body2"
              noWrap
              sx={{ display: "block", maxWidth: 480, fontFamily: "monospace" }}
            >
              {cell(dim)}
            </Typography>
          ) : dim === "verdict" ? (
            <Typography
              component="span"
              variant="body2"
              sx={{ fontFamily: "monospace", color: verdictSx(row.keys.verdict ?? "") }}
            >
              {cell(dim)}
            </Typography>
          ) : (
            cell(dim)
          )}
          </GroupValue>
        </TableCell>
      ))}
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        <Box
          sx={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "flex-end",
            minWidth: 112,
            height: 18,
            px: 0.75,
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: `${barPct}%`,
              bgcolor: "primary.main",
              opacity: 0.22,
            }}
          />
          <Box
            component="span"
            sx={{
              position: "relative",
              fontFamily: "monospace",
              fontSize: "0.83rem",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {row.hits}
          </Box>
        </Box>
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        <VerdictCounts row={row} />
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
        <Chip
          size="small"
          variant="outlined"
          icon={<FilterAltIcon />}
          label={t("incidentsPage.group.open")}
          className="drill-hint"
          sx={{ opacity: 0, transition: "opacity .15s", pointerEvents: "none" }}
        />
      </TableCell>
    </TableRow>
  );
}

function GroupValue({
  dim,
  value,
  onPick,
  children,
}: {
  dim: AuditGroupDim;
  value: string;
  onPick: (dim: AuditGroupDim, value: string) => void;
  children: ReactNode;
}) {
  const t = useT();

  if (value === "") {
    return <>{children}</>;
  }

  return (
    <Box
      component="span"
      title={t("incidentsPage.group.pick")}
      onClick={(e) => {
        e.stopPropagation();
        onPick(dim, value);
      }}
      sx={{
        display: "inline-block",
        boxSizing: "content-box",
        maxWidth: "100%",
        minWidth: 0,
        px: 0.5,
        mx: -0.5,
        borderRadius: "2px",
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      {children}
    </Box>
  );
}

const OUTCOME_W = 96;

function VerdictCounts({ row }: { row: AuditGroupRow }) {
  const t = useT();
  const parts = [
    { key: "allow", n: row.allowed ?? 0, color: "success.main" },
    { key: "redirect", n: row.redirected ?? 0, color: "warning.main" },
    { key: "deny", n: row.denied, color: "error.main" },
  ].filter((part) => part.n > 0);

  if (parts.length === 0) {
    return <Box component="span" sx={{ color: "text.disabled" }}>—</Box>;
  }

  const rest = Math.max(0, row.hits - parts.reduce((sum, part) => sum + part.n, 0));

  return (
    <Tooltip
      arrow
      placement="left"
      title={
        <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "2px 6px" }}>
          {parts.map((part) => (
            <Fragment key={part.key}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: part.color,
                  alignSelf: "center",
                }}
              />
              <Box component="span">{t(`incidentsPage.filter.${part.key}`)}</Box>
              <Box
                component="span"
                sx={{ fontFamily: "monospace", fontVariantNumeric: "tabular-nums" }}
              >
                {part.n}
              </Box>
            </Fragment>
          ))}
        </Box>
      }
    >
      <Box
        sx={{
          display: "inline-flex",
          width: OUTCOME_W,
          height: 6,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "action.selected",
          verticalAlign: "middle",
        }}
      >
        {parts.map((part) => (
          <Box
            key={part.key}
            sx={{
              flex: part.n,
              minWidth: 2,
              bgcolor: part.color,
            }}
          />
        ))}
        {rest > 0 && <Box sx={{ flex: rest }} />}
      </Box>
    </Tooltip>
  );
}

function IncidentRows({
  row,
  cols,
  rayTailOnly,
  timeMs,
  open,
  onToggle,
  onSeek,
  cell,
  query,
  sibling,
}: {
  row: AuditSearchEvent;
  cols: readonly ListCol[];
  rayTailOnly: boolean;
  timeMs: boolean;
  open: boolean;
  onToggle: () => void;
  onSeek: SeekPreview;
  cell: SeekState;
  query: PreviewQuery;
  sibling?: SiblingRecord;
}) {
  const method = (METHODS as readonly string[]).includes(row.method)
    ? row.method
    : "";

  const tailFields = GEO_FIELDS.filter((field) => !cols.includes(field));

  const cells: Record<ListCol, ReactNode> = {
    time: (
      <TableCell sx={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>
        {clock(row.ts, timeMs)}
      </TableCell>
    ),
    ray: (
      <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
        <Seekable field="ray" value={row.ray} seek={cell}>
          <Box component="span" title={rayTailOnly ? row.ray : undefined}>
            {row.ray === "" ? "—" : rayTailOnly ? rayTail(row.ray) : row.ray}
          </Box>
        </Seekable>
      </TableCell>
    ),
    ip: (
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <IpCell value={row.client_ip} seek={cell} geoFields={tailFields} />
      </TableCell>
    ),
    phase: (
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <PhaseChip phase={row.phase} seek={cell} />
      </TableCell>
    ),
    method: (
      <TableCell sx={{ fontFamily: "monospace" }}>
        <Seekable field="method" value={method} seek={cell}>
          {row.method || "—"}
        </Seekable>
      </TableCell>
    ),
    host: (
      <TableCell sx={{ fontFamily: "monospace" }}>
        <Seekable field="host" value={row.host} seek={cell}>
          {row.host || "—"}
        </Seekable>
      </TableCell>
    ),
    uri: (
      <TableCell>
        <Seekable field="uri" value={row.uri} seek={cell} sx={{ maxWidth: 360 }}>
          <Typography
            component="span"
            variant="body2"
            noWrap
            sx={{ display: "block", fontFamily: "monospace" }}
          >
            {row.uri || "—"}
          </Typography>
        </Seekable>
      </TableCell>
    ),
    server: (
      <TableCell>
        <Seekable
          field="server"
          value={row.server_name ?? ""}
          seek={cell}
          sx={{ maxWidth: 160 }}
        >
          <Typography
            component="span"
            variant="body2"
            noWrap
            sx={{ display: "block", fontFamily: "monospace" }}
          >
            {row.server_name || "—"}
          </Typography>
        </Seekable>
      </TableCell>
    ),
    route: (
      <TableCell>
        <Seekable
          field="route"
          value={row.location_id ?? ""}
          seek={cell}
          sx={{ maxWidth: 220 }}
        >
          <Typography
            component="span"
            variant="body2"
            noWrap
            title={row.server_name}
            sx={{ display: "block", fontFamily: "monospace" }}
          >
            {row.location || "—"}
          </Typography>
        </Seekable>
      </TableCell>
    ),
    status: (
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <StatusCell row={row} seek={cell} />
      </TableCell>
    ),
    verdict: (
      <TableCell>
        <VerdictChip verdict={row.verdict} seek={cell} />
      </TableCell>
    ),
    score: (
      <TableCell sx={{ fontFamily: "monospace" }}>
        {row.score !== 0 ? String(row.score) : "—"}
      </TableCell>
    ),
    inspector: (
      <TableCell>
        <InspectorChips row={row} seek={cell} />
      </TableCell>
    ),
    user: (
      <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
        <UserCell row={row} seek={cell} />
      </TableCell>
    ),
    marker: (
      <TableCell>
        <MarkerCell row={row} seek={cell} />
      </TableCell>
    ),
    country: (
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <GeoCell row={row} field="country" seek={cell} />
      </TableCell>
    ),
    asn: (
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <GeoCell row={row} field="asn" seek={cell} />
      </TableCell>
    ),
  };

  return (
    <>
      <TableRow hover onClick={onToggle} sx={{ cursor: "pointer" }} selected={open}>
        {cols.map((col) => (
          <Fragment key={col}>{cells[col]}</Fragment>
        ))}
      </TableRow>
      <TableRow>
        <TableCell
          colSpan={cols.length}
          sx={{
            py: 0,
            px: 0,
            "&.MuiTableCell-root": { pl: 0, pr: 0 },
            "&.MuiTableCell-root:first-of-type": { pl: 0 },
            "&.MuiTableCell-root:last-of-type": { pr: 0 },
            borderBottom: open ? undefined : 0,
          }}
        >
          <Collapse in={open} unmountOnExit>
            <IncidentCard row={row} onSeek={onSeek} query={query} sibling={sibling} cell={cell} />
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
