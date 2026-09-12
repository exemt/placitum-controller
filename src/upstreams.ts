import type { Pool } from "./db.ts";
import type {
  Upstream,
  UpstreamMethod,
  UpstreamPeer,
  UpstreamTree,
} from "./model/upstream.ts";
import { isUpstreamMethod } from "./model/upstream.ts";

interface UpstreamRow {
  id: string;
  http_space_id: string;
  name: string;
  method: string;
  hash_key: string | null;
  keepalive: number | null;
  keepalive_requests: number | null;
  keepalive_timeout_ms: number | null;
  tls: boolean;
  tls_name: string | null;
  host_header: string | null;
}

interface PeerRow {
  id: string;
  upstream_id: string;
  host: string;
  port: number;
  weight: number;
  max_fails: number | null;
  fail_timeout_ms: number | null;
  backup: boolean;
  down: boolean;
  position: number;
}

function ofMethod(value: string): UpstreamMethod {
  if (!isUpstreamMethod(value)) {
    throw new Error(`unknown upstream method "${value}"`);
  }
  return value;
}

function ofUpstream(row: UpstreamRow): Upstream {
  const up: Upstream = {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    method: ofMethod(row.method),
  };
  if (row.hash_key !== null) {
    up.hashKey = row.hash_key;
  }
  if (row.keepalive !== null) {
    up.keepalive = row.keepalive;
  }
  if (row.keepalive_requests !== null) {
    up.keepaliveRequests = row.keepalive_requests;
  }
  if (row.keepalive_timeout_ms !== null) {
    up.keepaliveTimeoutMs = row.keepalive_timeout_ms;
  }
  if (row.tls) {
    up.tls = true;
  }
  if (row.tls_name !== null) {
    up.tlsName = row.tls_name;
  }
  if (row.host_header !== null) {
    up.hostHeader = row.host_header;
  }
  return up;
}

function ofPeer(row: PeerRow): UpstreamPeer {
  const peer: UpstreamPeer = {
    id: row.id,
    upstreamId: row.upstream_id,
    host: row.host,
    port: row.port,
    weight: row.weight,
    backup: row.backup,
    down: row.down,
    position: row.position,
  };
  if (row.max_fails !== null) {
    peer.maxFails = row.max_fails;
  }
  if (row.fail_timeout_ms !== null) {
    peer.failTimeoutMs = row.fail_timeout_ms;
  }
  return peer;
}

const UP_COLS = `id, http_space_id, name, method, hash_key,
                 keepalive, keepalive_requests, keepalive_timeout_ms,
                 tls, tls_name, host_header`;

const PEER_COLS = `id, upstream_id, host, port, weight, max_fails,
                   fail_timeout_ms, backup, down, position`;

export interface UpstreamPeerInsert {
  host: string;
  port: number;
  weight: number;
  maxFails?: number;
  failTimeoutMs?: number;
  backup: boolean;
  down: boolean;
}

export interface UpstreamInsert {
  httpSpaceId: string;
  name: string;
  method: UpstreamMethod;
  hashKey?: string;
  keepalive?: number;
  keepaliveRequests?: number;
  keepaliveTimeoutMs?: number;
  tls?: boolean;
  tlsName?: string;
  hostHeader?: string;
  peers: UpstreamPeerInsert[];
}

export interface UpstreamPatch {
  name?: string;
  method?: UpstreamMethod;
  hashKey?: string | null;
  keepalive?: number | null;
  keepaliveRequests?: number | null;
  keepaliveTimeoutMs?: number | null;
  tls?: boolean;
  tlsName?: string | null;
  hostHeader?: string | null;
  peers?: UpstreamPeerInsert[];
}

function treeOf(up: Upstream, peers: UpstreamPeer[]): UpstreamTree {
  return {
    ...up,
    peers: peers
      .filter((row) => row.upstreamId === up.id)
      .sort((a, b) => a.position - b.position || a.host.localeCompare(b.host)),
  };
}

export class UpstreamRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<UpstreamTree[]> {
    const { rows: upRows } =
      httpSpaceId === undefined
        ? await this.pool.query<UpstreamRow>(
            `select ${UP_COLS} from upstreams order by name`,
          )
        : await this.pool.query<UpstreamRow>(
            `select ${UP_COLS} from upstreams
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    if (upRows.length === 0) {
      return [];
    }

    const ids = upRows.map((row) => row.id);
    const { rows: peerRows } = await this.pool.query<PeerRow>(
      `select ${PEER_COLS} from upstream_peers
        where upstream_id = any($1::uuid[])
        order by upstream_id, position, host`,
      [ids],
    );

    const peers = peerRows.map(ofPeer);
    return upRows.map((row) => treeOf(ofUpstream(row), peers));
  }

  async get(id: string): Promise<UpstreamTree | null> {
    const { rows } = await this.pool.query<UpstreamRow>(
      `select ${UP_COLS} from upstreams where id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return null;
    }

    const { rows: peerRows } = await this.pool.query<PeerRow>(
      `select ${PEER_COLS} from upstream_peers
        where upstream_id = $1
        order by position, host`,
      [id],
    );
    return treeOf(ofUpstream(rows[0]), peerRows.map(ofPeer));
  }

  async insert(input: UpstreamInsert): Promise<UpstreamTree> {
    const client = await this.pool.connect();
    let id: string;
    try {
      await client.query("begin");
      const { rows } = await client.query<UpstreamRow>(
        `insert into upstreams
           (http_space_id, name, method, hash_key,
            keepalive, keepalive_requests, keepalive_timeout_ms,
            tls, tls_name, host_header)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning ${UP_COLS}`,
        [
          input.httpSpaceId,
          input.name,
          input.method,
          input.method === "hash" ? (input.hashKey ?? null) : null,
          input.keepalive ?? null,
          input.keepaliveRequests ?? null,
          input.keepaliveTimeoutMs ?? null,
          input.tls ?? false,
          input.tlsName ?? null,
          input.hostHeader ?? null,
        ],
      );
      id = rows[0].id;
      await replacePeers(client, id, input.peers);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    const row = await this.get(id);
    if (row === null) {
      throw new Error("upstream insert vanished");
    }
    return row;
  }

  async update(id: string, patch: UpstreamPatch): Promise<UpstreamTree | null> {
    const current = await this.get(id);
    if (current === null) {
      return null;
    }

    const method = patch.method ?? current.method;
    const hashKey =
      method === "hash"
        ? patch.hashKey !== undefined
          ? patch.hashKey
          : (current.hashKey ?? null)
        : null;
    const keepalive =
      patch.keepalive !== undefined ? patch.keepalive : (current.keepalive ?? null);
    const keepaliveRequests =
      patch.keepaliveRequests !== undefined
        ? patch.keepaliveRequests
        : (current.keepaliveRequests ?? null);
    const keepaliveTimeoutMs =
      patch.keepaliveTimeoutMs !== undefined
        ? patch.keepaliveTimeoutMs
        : (current.keepaliveTimeoutMs ?? null);
    const tls = patch.tls !== undefined ? patch.tls : (current.tls ?? false);
    const tlsName =
      patch.tlsName !== undefined ? patch.tlsName : (current.tlsName ?? null);
    const hostHeader =
      patch.hostHeader !== undefined
        ? patch.hostHeader
        : (current.hostHeader ?? null);

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<UpstreamRow>(
        `update upstreams set
           name                   = $2,
           method                 = $3,
           hash_key               = $4,
           keepalive              = $5,
           keepalive_requests     = $6,
           keepalive_timeout_ms   = $7,
           tls                    = $8,
           tls_name               = $9,
           host_header            = $10
         where id = $1
         returning ${UP_COLS}`,
        [
          id,
          patch.name ?? current.name,
          method,
          hashKey,
          keepalive,
          keepaliveRequests,
          keepaliveTimeoutMs,
          tls,
          tlsName,
          hostHeader,
        ],
      );
      if (rows.length === 0) {
        await client.query("rollback");
        return null;
      }
      if (patch.peers !== undefined) {
        await replacePeers(client, id, patch.peers);
      }
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }

    return this.get(id);
  }

  async delete(id: string): Promise<UpstreamTree | null> {
    const current = await this.get(id);
    if (current === null) {
      return null;
    }
    await this.pool.query(`delete from upstreams where id = $1`, [id]);
    return current;
  }
}

async function replacePeers(
  client: { query: Pool["query"] },
  upstreamId: string,
  peers: UpstreamPeerInsert[],
): Promise<void> {
  await client.query(`delete from upstream_peers where upstream_id = $1`, [
    upstreamId,
  ]);
  for (const [index, peer] of peers.entries()) {
    await client.query(
      `insert into upstream_peers
         (upstream_id, host, port, weight, max_fails, fail_timeout_ms,
          backup, down, position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        upstreamId,
        peer.host,
        peer.port,
        peer.weight,
        peer.maxFails ?? null,
        peer.failTimeoutMs ?? null,
        peer.backup,
        peer.down,
        index,
      ],
    );
  }
}
