import type { Pool } from "../db.ts";
import type { Certificate } from "../model/listen.ts";
import type { InfraUrls, NginxExport } from "./nginx-source.ts";

// Addresses of Redis and NATS as the nodes reach them. By default the same as the controller's
// own; CONTROLLER_NODE_* names them differently when a node runs outside the container network,
// such as nginx on the machine that reaches the containers by their fixed addresses.
export function infraUrls(env: NodeJS.ProcessEnv = process.env): InfraUrls {
  return {
    redisUrl: env.CONTROLLER_NODE_REDIS_URL ?? env.CONTROLLER_REDIS_URL ?? "",
    redisInternalUrl: env.CONTROLLER_NODE_REDIS_INTERNAL_URL ?? env.CONTROLLER_REDIS_INTERNAL_URL ?? "",
    natsUrl: env.CONTROLLER_NODE_NATS_URL ?? env.CONTROLLER_NATS_URL ?? env.NATS_URL ?? "",
    natsUser: env.CONTROLLER_NATS_USER ?? "",
    natsPass: env.CONTROLLER_NATS_PASS ?? "",
    natsToken: env.CONTROLLER_NATS_TOKEN ?? "",
  };
}

function certificateOf(r: {
  id: string;
  http_space_id: string;
  name: string;
  kind: Certificate["type"];
  cert_store_id: string;
  key_store_id: string | null;
  chain_store_id: string | null;
  sans: string[] | null;
  not_before: Date | null;
  not_after: Date | null;
  fingerprint: string;
  subject: string | null;
  issuer: string | null;
  serial: string | null;
  crl_store_id: string | null;
  crl_issuer: string | null;
  crl_this_update: Date | null;
  crl_next_update: Date | null;
  crl_revoked: number | null;
}): Certificate {
  return {
    id: r.id,
    httpSpaceId: r.http_space_id,
    name: r.name,
    type: r.kind,
    certStoreId: r.cert_store_id,
    keyStoreId: r.key_store_id ?? undefined,
    chainStoreId: r.chain_store_id ?? undefined,
    sans: r.sans ?? [],
    notBefore: r.not_before ?? undefined,
    notAfter: r.not_after ?? undefined,
    fingerprint: r.fingerprint,
    subject: r.subject ?? "",
    issuer: r.issuer ?? "",
    serial: r.serial ?? "",
    crl:
      r.crl_store_id === null
        ? undefined
        : {
            storeId: r.crl_store_id,
            issuer: r.crl_issuer ?? "",
            thisUpdate: r.crl_this_update ?? undefined,
            nextUpdate: r.crl_next_update ?? undefined,
            revoked: r.crl_revoked ?? undefined,
          },
  };
}

const EXTENSIONS: Record<string, string> = {
  html: ".html",
  json: ".json",
  xml: ".xml",
  text: ".txt",
};

function extensionOf(type: string): string {
  return EXTENSIONS[type] ?? "";
}

export async function exportNginx(pool: Pool, httpSpaceId: string): Promise<NginxExport> {
  const [
    spaceRows,
    inspectorRows,
    datasetRows,
    datasetAddrRows,
    denyResponseRows,
    bodyStoreRows,
    logFormatRows,
    upstreamRows,
    peerRows,
    portRows,
    certificateRows,
    serverRows,
    serverPortRows,
    serverCertRows,
    locationRows,
    contentRows,
  ] = await Promise.all([
    pool.query(
      `select id, name, nginx_main, nginx, waf_http, waf, raw, raw_nginx,
              created_at, updated_at
       from http_spaces where id = $1`,
      [httpSpaceId],
    ),
    pool.query(
      `select * from inspectors where http_space_id = $1 and installed order by position, name`,
      [httpSpaceId],
    ),
    pool.query(
      `select * from datasets where http_space_id = $1 order by position, name`,
      [httpSpaceId],
    ),
    pool.query(
      `select a.dataset_id, a.address
       from dataset_addresses a
       join datasets d on d.id = a.dataset_id
       where d.http_space_id = $1
         and d.kind = 'list'
         and d.active = false
         and coalesce(d.in_nginx, false) = true
       order by a.address`,
      [httpSpaceId],
    ),
    pool.query(
      `select * from deny_responses where http_space_id = $1 order by position, name`,
      [httpSpaceId],
    ),
    pool.query(
      `select * from body_stores where http_space_id = $1 order by position, name`,
      [httpSpaceId],
    ),
    pool.query(
      `select * from log_formats where http_space_id = $1 order by name`,
      [httpSpaceId],
    ),
    pool.query(
      `select * from upstreams where http_space_id = $1 order by name`,
      [httpSpaceId],
    ),
    pool.query(
      `select up.* from upstream_peers up
       join upstreams u on u.id = up.upstream_id
       where u.http_space_id = $1
       order by up.upstream_id, up.position`,
      [httpSpaceId],
    ),
    pool.query(
      `select * from ports where http_space_id = $1 order by port`,
      [httpSpaceId],
    ),
    pool.query(
      `select id, http_space_id, name, kind, cert_store_id, key_store_id, chain_store_id,
              sans, not_before, not_after, fingerprint, subject, issuer, serial,
              crl_store_id, crl_this_update, crl_next_update, crl_revoked, crl_issuer
       from certificates where http_space_id = $1 order by name`,
      [httpSpaceId],
    ),
    pool.query(
      `select * from servers where http_space_id = $1 order by name`,
      [httpSpaceId],
    ),
    pool.query(
      `select sp.*, p.address, p.port, p.ssl as port_ssl, p.http2 as port_http2,
              p.proxy_protocol as port_proxy_protocol
       from server_ports sp
       join ports p on p.id = sp.port_id
       join servers s on s.id = sp.server_id
       where s.http_space_id = $1`,
      [httpSpaceId],
    ),
    pool.query(
      `select sc.*, c.kind as cert_kind, c.cert_store_id, c.key_store_id,
              c.chain_store_id, c.name as cert_name, c.sans, c.not_before,
              c.not_after, c.fingerprint, c.subject, c.issuer, c.serial,
              c.crl_store_id, c.crl_this_update, c.crl_next_update,
              c.crl_revoked, c.crl_issuer
       from server_certificates sc
       join certificates c on c.id = sc.certificate_id
       join servers s on s.id = sc.server_id
       where s.http_space_id = $1`,
      [httpSpaceId],
    ),
    pool.query(
      `select l.* from locations l
       join servers s on s.id = l.server_id
       where s.http_space_id = $1
       order by s.name, l.position, l.path`,
      [httpSpaceId],
    ),
    pool.query(
      `select d.id, d.name, t.name as content_type, c.body
         from datasets d
         join content_types t on t.id = d.content_type_id
         left join dataset_contents c on c.dataset_id = d.id
        where d.http_space_id = $1 and d.kind = 'content'
        order by d.name`,
      [httpSpaceId],
    ),
  ]);

  if (spaceRows.rows.length === 0) {
    throw Object.assign(new Error("space not found"), { status: 404 });
  }

  const spaceRow = spaceRows.rows[0];
  const space = {
    id: spaceRow.id,
    name: spaceRow.name,
    nginxMain: spaceRow.nginx_main ?? {},
    nginx: spaceRow.nginx ?? {},
    wafHttp: spaceRow.waf_http ?? {},
    waf: spaceRow.waf ?? {},
    raw: spaceRow.raw,
    rawNginx: spaceRow.raw_nginx ?? "",
    createdAt: spaceRow.created_at,
    updatedAt: spaceRow.updated_at,
  };

  const inspectors = inspectorRows.rows.map((r) => ({
    id: r.id,
    httpSpaceId: r.http_space_id,
    name: r.name,
    subject: r.subject,
    phases: r.phases ?? ["request"],
    conf: r.conf ?? "",
    position: r.position ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const entriesByDataset = new Map<string, string[]>();
  for (const row of datasetAddrRows.rows) {
    const list = entriesByDataset.get(row.dataset_id) ?? [];
    list.push(row.address);
    entriesByDataset.set(row.dataset_id, list);
  }

  const datasets = datasetRows.rows.map((r) => ({
    id: r.id,
    httpSpaceId: r.http_space_id,
    name: r.name,
    description: r.description ?? "",
    kind: r.kind ?? "list",
    type: r.type,
    maxEntries: r.max_entries,
    liveMax: r.live_max ?? undefined,
    inNginx: r.in_nginx ?? false,
    position: r.position ?? 0,
    active: r.active ?? true,
    ttl: r.ttl ?? undefined,
    size: r.size ?? 0,
    entries: entriesByDataset.get(r.id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const denyResponses = denyResponseRows.rows.map((r) => ({
    id: r.id,
    httpSpaceId: r.http_space_id,
    name: r.name,
    type: r.type,
    spec: r.spec ?? {},
  }));

  const bodyStores = bodyStoreRows.rows.map((r) => ({
    id: r.id,
    httpSpaceId: r.http_space_id,
    name: r.name,
    driver: r.driver,
    spec: r.spec ?? {},
  }));

  const logFormats = logFormatRows.rows.map((r) => ({
    id: r.id,
    httpSpaceId: r.http_space_id,
    name: r.name,
    kind: "nginx" as const,
    fields: r.fields ?? [],
    format: r.format ?? "",
  }));

  const upstreams = upstreamRows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    method: r.method,
    hashKey: r.hash_key ?? undefined,
    keepalive: r.keepalive ?? undefined,
    keepaliveRequests: r.keepalive_requests ?? undefined,
    keepaliveTimeoutMs: r.keepalive_timeout_ms ?? undefined,
    tls: r.tls === true,
    tlsName: r.tls_name ?? undefined,
    hostHeader: r.host_header ?? undefined,
    peers: peerRows.rows
      .filter((p) => p.upstream_id === r.id)
      .map((p) => ({
        host: p.host,
        port: p.port,
        weight: p.weight,
        maxFails: p.max_fails ?? undefined,
        failTimeoutMs: p.fail_timeout_ms ?? undefined,
        backup: p.backup,
        down: p.down,
        resolve: p.resolve === true,
      })),
  }));

  const ports = portRows.rows.map((r) => ({
    id: r.id,
    httpSpaceId: r.http_space_id,
    name: r.name,
    address: r.address,
    port: r.port,
    ssl: r.ssl,
    http2: r.http2,
    proxyProtocol: r.proxy_protocol,
  }));

  const certificates = certificateRows.rows.map(certificateOf);

  const servers = serverRows.rows.map((sr) => {
    const serverId = sr.id;

    const listens = serverPortRows.rows
      .filter((sp) => sp.server_id === serverId)
      .map((sp) => ({
        id: sp.id,
        serverId: sp.server_id,
        portId: sp.port_id,
        ssl: sp.ssl,
        http2: sp.http2,
        proxyProtocol: sp.proxy_protocol,
        defaultServer: sp.default_server,
        port: {
          id: sp.port_id,
          httpSpaceId,
          name: "",
          address: sp.address,
          port: sp.port,
          ssl: sp.port_ssl,
          http2: sp.port_http2,
          proxyProtocol: sp.port_proxy_protocol,
        },
      }));

    const certs = serverCertRows.rows
      .filter((sc) => sc.server_id === serverId)
      .map((sc) => ({
        id: sc.id,
        serverId: sc.server_id,
        certificateId: sc.certificate_id,
        kind: sc.kind,
        certificate: certificateOf({
          ...sc,
          id: sc.certificate_id,
          http_space_id: httpSpaceId,
          name: sc.cert_name,
          kind: sc.cert_kind,
        }),
      }));

    const locations = locationRows.rows
      .filter((l) => l.server_id === serverId)
      .map((l) => ({
        id: l.id,
        serverId: l.server_id,
        match: l.match,
        path: l.path,
        position: l.position,
        enabled: l.enabled,
        handler: l.handler,
        protocol: l.protocol,
        upstreamId: l.upstream_id ?? undefined,
        upstreamUri: l.upstream_uri ?? undefined,
        returnStatus: l.return_status ?? undefined,
        returnPage: l.return_page ?? undefined,
        returnUrl: l.return_url ?? undefined,
        nginx: l.nginx ?? {},
        waf: l.waf ?? {},
        raw: l.raw,
        rawNginx: l.raw_nginx ?? "",
        builtin: l.builtin === true,
      }));

    return {
      server: {
        id: sr.id,
        httpSpaceId: sr.http_space_id,
        name: sr.name,
        serverNames: sr.server_names ?? [],
        enabled: sr.enabled,
        nginx: sr.nginx ?? {},
        waf: sr.waf ?? {},
        raw: sr.raw,
        rawNginx: sr.raw_nginx ?? "",
      },
      listens,
      certificates: certs,
      locations,
    };
  });

  const contentObjects = contentRows.rows.map((r) => ({
    id: r.id,
    name: r.name,
    file: `${r.name}${extensionOf(r.content_type)}`,
    body: r.body ?? Buffer.alloc(0),
  }));

  return {
    space,
    inspectors,
    datasets,
    denyResponses,
    bodyStores,
    logFormats,
    upstreams,
    ports,
    certificates,
    servers,
    contentObjects,
    infra: infraUrls(),
  };
}
