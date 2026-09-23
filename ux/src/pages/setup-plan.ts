import {
  bindServerCertificate,
  bindServerPort,
  createPort,
  createServer,
  createUpstream,
  fetchLocations,
  updateLocation,
  type Certificate,
  type ListenPort,
  type LocationInput,
  type PortInput,
  type RouteServer,
  type ServerInput,
  type UpstreamInput,
  type UpstreamMethod,
  type UpstreamPool,
} from "../api.ts";

/** Куда уходит корень сервера-перенаправления. */
export const REDIRECT_URL = "https://$host$request_uri";

export const REDIRECT_STATUS = 301;

export type SetupMode = "https" | "http" | "custom";

export type PeerDraft = { host: string; port: string };

export type SetupDraft = {
  mode: SetupMode;
  address: string;
  port: string;
  ssl: boolean;
  http2: boolean;
  proxyProtocol: boolean;
  redirect: boolean;
  portName: string;
  names: string[];
  serverName: string;
  peers: PeerDraft[];
  poolName: string;
  method: UpstreamMethod;
  poolTls: boolean;
  hostHeader: string;
  certificateId: string;
  defaultServer: boolean;
};

export type SetupCatalog = {
  ports: ListenPort[];
  servers: RouteServer[];
  pools: UpstreamPool[];
  certificates: Certificate[];
};

export const emptyCatalog: SetupCatalog = {
  ports: [],
  servers: [],
  pools: [],
  certificates: [],
};

export function emptyDraft(): SetupDraft {
  return {
    mode: "https",
    address: "0.0.0.0",
    port: "443",
    ssl: true,
    http2: true,
    proxyProtocol: false,
    redirect: true,
    portName: "",
    names: [],
    serverName: "",
    peers: [{ host: "", port: "80" }],
    poolName: "",
    method: "round_robin",
    poolTls: false,
    hostHeader: "",
    certificateId: "",
    defaultServer: true,
  };
}

/** Умолчания шага «адрес»: https — 443 с ssl и http2, http — 80 без них. */
export function modeDefaults(mode: SetupMode): {
  port: string;
  ssl: boolean;
  http2: boolean;
} {
  if (mode === "http") {
    return { port: "80", ssl: false, http2: false };
  }
  if (mode === "https") {
    return { port: "443", ssl: true, http2: true };
  }
  return { port: "8080", ssl: false, http2: false };
}

export function listenLine(row: {
  address: string;
  port: number;
  ssl?: boolean;
  http2?: boolean;
  proxy_protocol?: boolean;
}): string {
  const flags = [
    row.ssl === true ? "ssl" : null,
    row.http2 === true ? "http2" : null,
    row.proxy_protocol === true ? "proxy_protocol" : null,
  ].filter((item): item is string => item !== null);
  return `${row.address}:${row.port}${flags.length > 0 ? " " + flags.join(" ") : ""}`;
}

/** example.com → example-com: имя объекта, а не hostname. */
export function slugOf(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

export function freeName(base: string, taken: readonly string[]): string {
  const seed = base === "" ? "server" : base;
  if (!taken.includes(seed)) {
    return seed;
  }
  for (let n = 2; n < 1000; n += 1) {
    const next = `${seed}-${n}`;
    if (!taken.includes(next)) {
      return next;
    }
  }
  return `${seed}-${Date.now()}`;
}

export function portNum(text: string): number | null {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : null;
}

/** Порт каталога с тем же адресом: второй такой же завести нельзя. */
export function portMatch(
  ports: readonly ListenPort[],
  address: string,
  port: number | null,
): ListenPort | null {
  if (port === null) {
    return null;
  }
  const host = address.trim();
  return ports.find((row) => row.address === host && row.port === port) ?? null;
}

function peerKeys(peers: readonly { host: string; port: number }[]): string {
  return [...peers]
    .map((peer) => `${peer.host.trim()}:${peer.port}`)
    .sort()
    .join(" ");
}

/** Пул с тем же набором узлов — берём готовый. */
export function poolMatch(
  pools: readonly UpstreamPool[],
  peers: readonly PeerDraft[],
): UpstreamPool | null {
  const want = peerKeys(
    peers
      .map((peer) => ({ host: peer.host, port: portNum(peer.port) }))
      .filter((peer): peer is { host: string; port: number } => peer.port !== null),
  );
  if (want === "") {
    return null;
  }
  return pools.find((pool) => peerKeys(pool.peers) === want) ?? null;
}

export type PlanStepKind =
  | "port"
  | "portRedirect"
  | "pool"
  | "server"
  | "cert"
  | "bind"
  | "root"
  | "serverRedirect"
  | "bindRedirect"
  | "rootRedirect";

export type PlanStep = {
  kind: PlanStepKind;
  reuse: boolean;
  label: string;
  vars: Record<string, string>;
};

export type SetupPlan = {
  port: { existing: ListenPort | null; input: PortInput };
  redirectPort: { existing: ListenPort | null; input: PortInput } | null;
  pool: { existing: UpstreamPool | null; input: UpstreamInput };
  server: ServerInput;
  redirectServer: ServerInput | null;
  certificate: Certificate | null;
  /** TLS без сертификата: серверы заводим выключенными, иначе конфигурация не соберётся. */
  serverOff: boolean;
  defaultMain: boolean;
  defaultRedirect: boolean;
  steps: PlanStep[];
};

function peerInputs(peers: readonly PeerDraft[]): UpstreamInput["peers"] {
  const rows: UpstreamInput["peers"] = [];
  for (const peer of peers) {
    const host = peer.host.trim();
    const port = portNum(peer.port);
    if (host === "" || port === null) {
      continue;
    }
    rows.push({ host, port, weight: 1, backup: false, down: false });
  }
  return rows;
}

export function peersLine(peers: readonly PeerDraft[]): string {
  return peerInputs(peers)
    .map((peer) => `${peer.host}:${peer.port}`)
    .join(", ");
}

/** Имена по умолчанию: порт — по схеме, сервер и пул — по первому hostname. */
export function suggestPortName(ssl: boolean, port: number | null): string {
  return `${ssl ? "https" : "http"}-${port ?? 0}`;
}

export function suggestServerName(names: readonly string[]): string {
  return slugOf(names[0] ?? "");
}

export function suggestPoolName(names: readonly string[]): string {
  const base = slugOf(names[0] ?? "");
  return base === "" ? "" : `${base}-pool`;
}

export function buildPlan(draft: SetupDraft, cat: SetupCatalog): SetupPlan {
  const address = draft.address.trim();
  const port = portNum(draft.port);
  const existingPort = portMatch(cat.ports, address, port);
  const portTaken = cat.ports.map((row) => row.name);
  const portName =
    draft.portName.trim() === ""
      ? freeName(suggestPortName(draft.ssl, port), portTaken)
      : draft.portName.trim();

  const redirectOn = draft.redirect && draft.ssl;
  const existingRedirect = redirectOn ? portMatch(cat.ports, address, 80) : null;
  const redirectName = freeName(
    suggestPortName(false, 80),
    existingPort === null ? portTaken : [...portTaken, portName],
  );

  const serverTaken = cat.servers.map((row) => row.name);
  const serverName =
    draft.serverName.trim() === ""
      ? freeName(suggestServerName(draft.names), serverTaken)
      : freeName(draft.serverName.trim(), serverTaken);
  const redirectServerName = redirectOn
    ? freeName(`${serverName}-redirect`, [...serverTaken, serverName])
    : "";

  const existingPool = poolMatch(cat.pools, draft.peers);
  const poolName =
    draft.poolName.trim() === ""
      ? freeName(
          suggestPoolName(draft.names),
          cat.pools.map((row) => row.name),
        )
      : draft.poolName.trim();

  const names = draft.names.map((name) => name.trim()).filter((name) => name !== "");
  const hostHeader = draft.hostHeader.trim();
  const certificate = draft.ssl
    ? (cat.certificates.find((row) => row.uuid === draft.certificateId) ?? null)
    : null;
  const serverOff = draft.ssl && certificate === null;

  const defaultMain =
    draft.defaultServer &&
    (existingPort === null || existingPort.default_server_id === null);
  const defaultRedirect =
    draft.defaultServer &&
    redirectOn &&
    (existingRedirect === null || existingRedirect.default_server_id === null);

  const listen = listenLine({
    address,
    port: port ?? 0,
    ssl: draft.ssl,
    http2: draft.http2,
    proxy_protocol: draft.proxyProtocol,
  });

  const steps: PlanStep[] = [
    {
      kind: "port",
      reuse: existingPort !== null,
      label: "setup.task.port",
      vars: {
        listen: existingPort === null ? listen : listenLine(existingPort),
        name: existingPort?.name ?? portName,
      },
    },
  ];

  if (redirectOn) {
    steps.push({
      kind: "portRedirect",
      reuse: existingRedirect !== null,
      label: "setup.task.portRedirect",
      vars: {
        listen:
          existingRedirect === null
            ? listenLine({ address, port: 80, proxy_protocol: draft.proxyProtocol })
            : listenLine(existingRedirect),
        name: existingRedirect?.name ?? redirectName,
      },
    });
  }

  steps.push(
    {
      kind: "pool",
      reuse: existingPool !== null,
      label: "setup.task.pool",
      vars: {
        name: existingPool?.name ?? poolName,
        peers:
          existingPool === null
            ? peersLine(draft.peers)
            : existingPool.peers.map((peer) => `${peer.host}:${peer.port}`).join(", "),
      },
    },
    {
      kind: "server",
      reuse: false,
      label: serverOff ? "setup.task.serverOff" : "setup.task.server",
      vars: { name: serverName, names: names.join(" ") },
    },
    ...(certificate === null
      ? []
      : [
          {
            kind: "cert" as const,
            reuse: false,
            label: "setup.task.cert",
            vars: { name: certificate.name, server: serverName },
          },
        ]),
    {
      kind: "bind",
      reuse: false,
      label: "setup.task.bind",
      vars: { port: existingPort?.name ?? portName, server: serverName },
    },
    {
      kind: "root",
      reuse: false,
      label: "setup.task.root",
      vars: { server: serverName, pool: existingPool?.name ?? poolName },
    },
  );

  if (redirectOn) {
    steps.push(
      {
        kind: "serverRedirect",
        reuse: false,
        label: "setup.task.serverRedirect",
        vars: { name: redirectServerName },
      },
      {
        kind: "bindRedirect",
        reuse: false,
        label: "setup.task.bind",
        vars: {
          port: existingRedirect?.name ?? redirectName,
          server: redirectServerName,
        },
      },
      {
        kind: "rootRedirect",
        reuse: false,
        label: "setup.task.rootRedirect",
        vars: { server: redirectServerName },
      },
    );
  }

  return {
    port: {
      existing: existingPort,
      input: {
        name: portName,
        address,
        port: port ?? 0,
        ssl: draft.ssl,
        http2: draft.http2,
        proxy_protocol: draft.proxyProtocol,
      },
    },
    redirectPort: redirectOn
      ? {
          existing: existingRedirect,
          input: {
            name: redirectName,
            address,
            port: 80,
            ssl: false,
            http2: false,
            proxy_protocol: draft.proxyProtocol,
          },
        }
      : null,
    pool: {
      existing: existingPool,
      input: {
        name: poolName,
        method: draft.method,
        hash_key: null,
        keepalive: null,
        keepalive_requests: null,
        keepalive_timeout_ms: null,
        tls: draft.poolTls,
        tls_name: null,
        host_header: hostHeader === "" ? null : hostHeader,
        peers: peerInputs(draft.peers),
      },
    },
    server: {
      name: serverName,
      server_names: names,
      enabled: !serverOff,
      nginx: {},
      waf: {},
      raw: false,
      raw_nginx: "",
    },
    redirectServer: redirectOn
      ? {
          name: redirectServerName,
          server_names: names,
          enabled: !serverOff,
          nginx: {},
          waf: {},
          raw: false,
          raw_nginx: "",
        }
      : null,
    certificate,
    serverOff,
    defaultMain,
    defaultRedirect,
    steps,
  };
}

export function planReady(draft: SetupDraft): boolean {
  return (
    draft.address.trim() !== "" &&
    portNum(draft.port) !== null &&
    draft.names.some((name) => name.trim() !== "") &&
    peerInputs(draft.peers).length > 0
  );
}

export type RunState = "wait" | "run" | "done" | "fail";

/** Что уже создано: повтор после ошибки не заводит те же объекты заново. */
export type PlanProgress = {
  portId?: string;
  certBound?: boolean;
  redirectPortId?: string;
  poolId?: string;
  serverId?: string;
  bound?: boolean;
  root?: boolean;
  redirectServerId?: string;
  redirectBound?: boolean;
  redirectRoot?: boolean;
};

export type RunOutcome = {
  ok: boolean;
  failed?: PlanStepKind;
  error?: string;
};

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function rootTo(
  scope: string,
  serverId: string,
  patch: Partial<LocationInput>,
): Promise<void> {
  const rows = await fetchLocations(scope, serverId);
  const root =
    rows.find((row) => row.builtin) ?? rows.find((row) => row.path === "/") ?? null;
  if (root === null) {
    throw new Error("root_location_missing");
  }
  const body: LocationInput = {
    match: root.match,
    path: root.path,
    enabled: true,
    handler: root.handler,
    protocol: root.protocol ?? "http",
    upstream_id: null,
    upstream_uri: null,
    return_status: null,
    return_page: null,
    return_url: null,
    nginx: root.nginx,
    waf: root.waf,
    raw: root.raw,
    raw_nginx: root.raw_nginx,
    ...patch,
  };
  await updateLocation(scope, root.uuid, body);
}

/**
 * Выполняет план по шагам. Уже сделанное пропускает, о каждом шаге
 * сообщает через onStep, на первой ошибке останавливается.
 */
export async function runPlan(
  scope: string,
  plan: SetupPlan,
  progress: PlanProgress,
  onStep: (kind: PlanStepKind, state: RunState, error?: string) => void,
): Promise<RunOutcome> {
  const steps: { kind: PlanStepKind; run: () => Promise<void> }[] = [
    {
      kind: "port",
      run: async () => {
        if (progress.portId !== undefined) {
          return;
        }
        progress.portId =
          plan.port.existing?.uuid ?? (await createPort(scope, plan.port.input)).uuid;
      },
    },
  ];

  if (plan.redirectPort !== null) {
    const redirect = plan.redirectPort;
    steps.push({
      kind: "portRedirect",
      run: async () => {
        if (progress.redirectPortId !== undefined) {
          return;
        }
        progress.redirectPortId =
          redirect.existing?.uuid ?? (await createPort(scope, redirect.input)).uuid;
      },
    });
  }

  steps.push(
    {
      kind: "pool",
      run: async () => {
        if (progress.poolId !== undefined) {
          return;
        }
        progress.poolId =
          plan.pool.existing?.uuid ??
          (await createUpstream(scope, plan.pool.input)).uuid;
      },
    },
    {
      kind: "server",
      run: async () => {
        if (progress.serverId !== undefined) {
          return;
        }
        progress.serverId = (await createServer(scope, plan.server)).uuid;
      },
    },
    ...(plan.certificate === null
      ? []
      : [
          {
            kind: "cert" as const,
            run: async () => {
              if (progress.certBound === true || plan.certificate === null) {
                return;
              }
              if (progress.serverId === undefined) {
                throw new Error("server_missing");
              }
              await bindServerCertificate(scope, progress.serverId, {
                certificate_id: plan.certificate.uuid,
                kind: "server",
              });
              progress.certBound = true;
            },
          },
        ]),
    {
      kind: "bind",
      run: async () => {
        if (progress.bound === true) {
          return;
        }
        if (progress.serverId === undefined || progress.portId === undefined) {
          throw new Error("server_missing");
        }
        await bindServerPort(scope, progress.serverId, {
          port_id: progress.portId,
          default_server: plan.defaultMain,
        });
        progress.bound = true;
      },
    },
    {
      kind: "root",
      run: async () => {
        if (progress.root === true) {
          return;
        }
        if (progress.serverId === undefined || progress.poolId === undefined) {
          throw new Error("server_missing");
        }
        await rootTo(scope, progress.serverId, {
          handler: "proxy",
          protocol: "http",
          upstream_id: progress.poolId,
        });
        progress.root = true;
      },
    },
  );

  if (plan.redirectServer !== null) {
    const server = plan.redirectServer;
    steps.push(
      {
        kind: "serverRedirect",
        run: async () => {
          if (progress.redirectServerId !== undefined) {
            return;
          }
          progress.redirectServerId = (await createServer(scope, server)).uuid;
        },
      },
      {
        kind: "bindRedirect",
        run: async () => {
          if (progress.redirectBound === true) {
            return;
          }
          if (
            progress.redirectServerId === undefined ||
            progress.redirectPortId === undefined
          ) {
            throw new Error("server_missing");
          }
          await bindServerPort(scope, progress.redirectServerId, {
            port_id: progress.redirectPortId,
            default_server: plan.defaultRedirect,
          });
          progress.redirectBound = true;
        },
      },
      {
        kind: "rootRedirect",
        run: async () => {
          if (progress.redirectRoot === true) {
            return;
          }
          if (progress.redirectServerId === undefined) {
            throw new Error("server_missing");
          }
          await rootTo(scope, progress.redirectServerId, {
            handler: "return",
            return_status: REDIRECT_STATUS,
            return_url: REDIRECT_URL,
          });
          progress.redirectRoot = true;
        },
      },
    );
  }

  for (const step of steps) {
    onStep(step.kind, "run");
    try {
      await step.run();
    } catch (err: unknown) {
      const text = errorText(err);
      onStep(step.kind, "fail", text);
      return { ok: false, failed: step.kind, error: text };
    }
    onStep(step.kind, "done");
  }

  return { ok: true };
}
