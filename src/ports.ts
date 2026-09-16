import type { Pool } from "./db.ts";
import type { Port } from "./model/listen.ts";

interface PortRow {
  id: string;
  http_space_id: string;
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxy_protocol: boolean;
}

interface BindRow extends PortRow {
  bind_id: string;
  server_id: string;
  default_server: boolean;
}

function ofPort(row: PortRow): Port {
  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    address: row.address,
    port: row.port,
    ssl: row.ssl,
    http2: row.http2,
    proxyProtocol: row.proxy_protocol,
  };
}

export interface PortBind {
  id: string;
  serverId: string;
  portId: string;
  defaultServer: boolean;
  port: Port;
}

function ofBind(row: BindRow): PortBind {
  return {
    id: row.bind_id,
    serverId: row.server_id,
    portId: row.id,
    defaultServer: row.default_server,
    port: ofPort(row),
  };
}

const PORT_COLS = `id, http_space_id, name, address, port, ssl, http2, proxy_protocol`;

const BIND_COLS = `sp.id as bind_id, sp.server_id, sp.default_server,
                   p.id, p.http_space_id, p.name, p.address, p.port,
                   p.ssl, p.http2, p.proxy_protocol`;

export interface PortInsert {
  httpSpaceId: string;
  name: string;
  address: string;
  port: number;
  ssl: boolean;
  http2: boolean;
  proxyProtocol: boolean;
}

export interface PortPatch {
  name?: string;
  address?: string;
  port?: number;
  ssl?: boolean;
  http2?: boolean;
  proxyProtocol?: boolean;
}

export class PortRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<Port[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<PortRow>(
            `select ${PORT_COLS} from ports order by port, address, name`,
          )
        : await this.pool.query<PortRow>(
            `select ${PORT_COLS} from ports
              where http_space_id = $1
              order by port, address, name`,
            [httpSpaceId],
          );

    return rows.map(ofPort);
  }

  async get(id: string): Promise<Port | null> {
    const { rows } = await this.pool.query<PortRow>(
      `select ${PORT_COLS} from ports where id = $1`,
      [id],
    );
    return rows.length === 0 ? null : ofPort(rows[0]);
  }

  async insert(input: PortInsert): Promise<Port> {
    const { rows } = await this.pool.query<PortRow>(
      `insert into ports
         (http_space_id, name, address, port, ssl, http2, proxy_protocol)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${PORT_COLS}`,
      [
        input.httpSpaceId,
        input.name,
        input.address,
        input.port,
        input.ssl,
        input.http2,
        input.proxyProtocol,
      ],
    );
    return ofPort(rows[0]);
  }

  async update(id: string, patch: PortPatch): Promise<Port | null> {
    const { rows } = await this.pool.query<PortRow>(
      `update ports set
         name           = coalesce($2, name),
         address        = coalesce($3, address),
         port           = coalesce($4, port),
         ssl            = coalesce($5, ssl),
         http2          = coalesce($6, http2),
         proxy_protocol = coalesce($7, proxy_protocol)
       where id = $1
       returning ${PORT_COLS}`,
      [
        id,
        patch.name ?? null,
        patch.address ?? null,
        patch.port ?? null,
        patch.ssl ?? null,
        patch.http2 ?? null,
        patch.proxyProtocol ?? null,
      ],
    );

    if (rows.length === 0) {
      return null;
    }

    const port = ofPort(rows[0]);
    await this.pool.query(
      `update server_ports set
         ssl            = $2,
         http2          = $3,
         proxy_protocol = $4
       where port_id = $1`,
      [id, port.ssl, port.http2, port.proxyProtocol],
    );
    return port;
  }

  async delete(id: string): Promise<Port | null> {
    const { rows } = await this.pool.query<PortRow>(
      `delete from ports where id = $1 returning ${PORT_COLS}`,
      [id],
    );
    return rows.length === 0 ? null : ofPort(rows[0]);
  }

  async listBinds(httpSpaceId?: string, serverId?: string): Promise<PortBind[]> {
    if (serverId !== undefined) {
      const { rows } = await this.pool.query<BindRow>(
        `select ${BIND_COLS}
           from server_ports sp
           join ports p on p.id = sp.port_id
          where sp.server_id = $1
          order by p.port, p.address`,
        [serverId],
      );
      return rows.map(ofBind);
    }

    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<BindRow>(
            `select ${BIND_COLS}
               from server_ports sp
               join ports p on p.id = sp.port_id
              order by p.port, p.address`,
          )
        : await this.pool.query<BindRow>(
            `select ${BIND_COLS}
               from server_ports sp
               join ports p on p.id = sp.port_id
              where p.http_space_id = $1
              order by p.port, p.address`,
            [httpSpaceId],
          );

    return rows.map(ofBind);
  }

  async getBind(id: string): Promise<PortBind | null> {
    const { rows } = await this.pool.query<BindRow>(
      `select ${BIND_COLS}
         from server_ports sp
         join ports p on p.id = sp.port_id
        where sp.id = $1`,
      [id],
    );
    return rows.length === 0 ? null : ofBind(rows[0]);
  }

  async bind(input: {
    serverId: string;
    portId: string;
    defaultServer: boolean;
  }): Promise<PortBind> {
    const port = await this.get(input.portId);
    if (port === null) {
      throw Object.assign(new Error("unknown_port"), {
        status: 400,
        error: "unknown_port",
      });
    }

    const existing = await this.listBinds(undefined, input.serverId);
    if (existing.some((row) => row.port.ssl !== port.ssl)) {
      throw Object.assign(new Error("ssl_mismatch"), {
        status: 409,
        error: "ssl_mismatch",
      });
    }

    const { rows } = await this.pool.query<{ id: string }>(
      `insert into server_ports
         (server_id, port_id, ssl, http2, proxy_protocol, default_server)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        input.serverId,
        input.portId,
        port.ssl,
        port.http2,
        port.proxyProtocol,
        input.defaultServer,
      ],
    );

    const row = await this.getBind(rows[0].id);
    if (row === null) {
      throw new Error("port bind vanished");
    }
    return row;
  }

  async updateBind(
    id: string,
    patch: { defaultServer: boolean },
  ): Promise<PortBind | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `update server_ports set default_server = $2
        where id = $1
    returning id`,
      [id, patch.defaultServer],
    );
    return rows.length === 0 ? null : this.getBind(id);
  }

  async unbind(id: string): Promise<PortBind | null> {
    const current = await this.getBind(id);
    if (current === null) {
      return null;
    }
    await this.pool.query(`delete from server_ports where id = $1`, [id]);
    return current;
  }
}
