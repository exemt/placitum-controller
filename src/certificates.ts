import type { Pool } from "./db.ts";
import { KIND_ACCEPTS } from "./model/listen.ts";
import type {
  Certificate,
  CertificateKind,
  CertificateType,
} from "./model/listen.ts";
import type { BoundCertificate } from "./model/server.ts";

interface CertificateRow {
  id: string;
  http_space_id: string;
  name: string;
  kind: CertificateType;
  cert_store_id: string;
  key_store_id: string | null;
  chain_store_id: string | null;
  sans: string[];
  not_before: Date | null;
  not_after: Date | null;
  fingerprint: string;
  subject: string;
  issuer: string;
  serial: string;
  crl_store_id: string | null;
  crl_this_update: Date | null;
  crl_next_update: Date | null;
  crl_revoked: number | null;
  crl_issuer: string | null;
}

function ofCertificate(row: CertificateRow): Certificate {
  return {
    id: row.id,
    httpSpaceId: row.http_space_id,
    name: row.name,
    type: row.kind,
    certStoreId: row.cert_store_id,
    keyStoreId: row.key_store_id ?? undefined,
    chainStoreId: row.chain_store_id ?? undefined,
    sans: row.sans ?? [],
    notBefore: row.not_before ?? undefined,
    notAfter: row.not_after ?? undefined,
    fingerprint: row.fingerprint,
    subject: row.subject ?? "",
    issuer: row.issuer ?? "",
    serial: row.serial ?? "",
    crl:
      row.crl_store_id === null
        ? undefined
        : {
            storeId: row.crl_store_id,
            issuer: row.crl_issuer ?? "",
            thisUpdate: row.crl_this_update ?? undefined,
            nextUpdate: row.crl_next_update ?? undefined,
            revoked: row.crl_revoked ?? undefined,
          },
  };
}

const COLS = `id, http_space_id, name, kind, cert_store_id, key_store_id, chain_store_id,
              sans, not_before, not_after, fingerprint, subject, issuer, serial,
              crl_store_id, crl_this_update, crl_next_update, crl_revoked, crl_issuer`;

interface BindRow extends Omit<CertificateRow, "kind"> {
  bind_id: string;
  server_id: string;
  kind: CertificateKind;
  cert_kind: CertificateType;
}

function ofBind(row: BindRow): BoundCertificate {
  return {
    id: row.bind_id,
    serverId: row.server_id,
    certificateId: row.id,
    kind: row.kind,
    certificate: ofCertificate({ ...row, kind: row.cert_kind }),
  };
}

const BIND_COLS = `sc.id as bind_id, sc.server_id, sc.kind,
                   c.id, c.http_space_id, c.name, c.kind as cert_kind, c.cert_store_id,
                   c.key_store_id, c.chain_store_id, c.sans, c.not_before, c.not_after,
                   c.fingerprint, c.subject, c.issuer, c.serial,
                   c.crl_store_id, c.crl_this_update, c.crl_next_update,
                   c.crl_revoked, c.crl_issuer`;

const BIND_ORDER = `case sc.kind
                      when 'server' then 0
                      when 'client_ca' then 1
                      else 2
                    end, c.name`;

export interface CertificateInsert {
  httpSpaceId: string;
  name: string;
  type: CertificateType;
  certStoreId: string;
  keyStoreId?: string;
  chainStoreId?: string;
  sans: string[];
  notBefore?: Date;
  notAfter?: Date;
  fingerprint: string;
  subject: string;
  issuer: string;
  serial: string;
}

export interface CertificateCrlUpdate {
  storeId: string;
  issuer: string;
  thisUpdate?: Date;
  nextUpdate?: Date;
  revoked?: number;
}

export class CertificateRepo {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async list(httpSpaceId?: string): Promise<Certificate[]> {
    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<CertificateRow>(
            `select ${COLS} from certificates order by name`,
          )
        : await this.pool.query<CertificateRow>(
            `select ${COLS} from certificates
              where http_space_id = $1
              order by name`,
            [httpSpaceId],
          );

    return rows.map(ofCertificate);
  }

  async get(id: string): Promise<Certificate | null> {
    const { rows } = await this.pool.query<CertificateRow>(
      `select ${COLS} from certificates where id = $1`,
      [id],
    );

    return rows.length === 0 ? null : ofCertificate(rows[0]);
  }

  async insert(input: CertificateInsert): Promise<Certificate> {
    const { rows } = await this.pool.query<CertificateRow>(
      `insert into certificates
         (http_space_id, name, kind, cert_store_id, key_store_id, chain_store_id,
          sans, not_before, not_after, fingerprint, subject, issuer, serial)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning ${COLS}`,
      [
        input.httpSpaceId,
        input.name,
        input.type,
        input.certStoreId,
        input.keyStoreId ?? null,
        input.chainStoreId ?? null,
        input.sans,
        input.notBefore ?? null,
        input.notAfter ?? null,
        input.fingerprint,
        input.subject,
        input.issuer,
        input.serial,
      ],
    );

    return ofCertificate(rows[0]);
  }

  async setCrl(
    id: string,
    crl: CertificateCrlUpdate,
  ): Promise<Certificate | null> {
    const { rows } = await this.pool.query<CertificateRow>(
      `update certificates
          set crl_store_id    = $2,
              crl_issuer      = $3,
              crl_this_update = $4,
              crl_next_update = $5,
              crl_revoked     = $6
        where id = $1
        returning ${COLS}`,
      [
        id,
        crl.storeId,
        crl.issuer,
        crl.thisUpdate ?? null,
        crl.nextUpdate ?? null,
        crl.revoked ?? null,
      ],
    );

    return rows.length === 0 ? null : ofCertificate(rows[0]);
  }

  async clearCrl(id: string): Promise<Certificate | null> {
    const { rows } = await this.pool.query<CertificateRow>(
      `update certificates
          set crl_store_id    = null,
              crl_issuer      = null,
              crl_this_update = null,
              crl_next_update = null,
              crl_revoked     = null
        where id = $1
        returning ${COLS}`,
      [id],
    );

    return rows.length === 0 ? null : ofCertificate(rows[0]);
  }

  async delete(id: string): Promise<Certificate | null> {
    const { rows } = await this.pool.query<CertificateRow>(
      `delete from certificates where id = $1 returning ${COLS}`,
      [id],
    );

    return rows.length === 0 ? null : ofCertificate(rows[0]);
  }

  async listBinds(
    httpSpaceId?: string,
    serverId?: string,
  ): Promise<BoundCertificate[]> {
    if (serverId !== undefined) {
      const { rows } = await this.pool.query<BindRow>(
        `select ${BIND_COLS}
           from server_certificates sc
           join certificates c on c.id = sc.certificate_id
          where sc.server_id = $1
          order by ${BIND_ORDER}`,
        [serverId],
      );
      return rows.map(ofBind);
    }

    const { rows } =
      httpSpaceId === undefined
        ? await this.pool.query<BindRow>(
            `select ${BIND_COLS}
               from server_certificates sc
               join certificates c on c.id = sc.certificate_id
              order by ${BIND_ORDER}`,
          )
        : await this.pool.query<BindRow>(
            `select ${BIND_COLS}
               from server_certificates sc
               join certificates c on c.id = sc.certificate_id
              where c.http_space_id = $1
              order by ${BIND_ORDER}`,
            [httpSpaceId],
          );

    return rows.map(ofBind);
  }

  async getBind(id: string): Promise<BoundCertificate | null> {
    const { rows } = await this.pool.query<BindRow>(
      `select ${BIND_COLS}
         from server_certificates sc
         join certificates c on c.id = sc.certificate_id
        where sc.id = $1`,
      [id],
    );
    return rows.length === 0 ? null : ofBind(rows[0]);
  }

  async bind(input: {
    serverId: string;
    certificateId: string;
    kind: CertificateKind;
  }): Promise<BoundCertificate> {
    const cert = await this.get(input.certificateId);
    if (cert === null) {
      throw Object.assign(new Error("unknown_certificate"), {
        status: 400,
        error: "unknown_certificate",
      });
    }

    if (!KIND_ACCEPTS[input.kind].includes(cert.type)) {
      throw Object.assign(new Error("kind_mismatch"), {
        status: 400,
        error: "kind_mismatch",
      });
    }

    const { rows } = await this.pool.query<{ id: string }>(
      `insert into server_certificates (server_id, certificate_id, kind)
       values ($1, $2, $3)
       returning id`,
      [input.serverId, input.certificateId, input.kind],
    );

    const row = await this.getBind(rows[0].id);
    if (row === null) {
      throw new Error("certificate bind vanished");
    }
    return row;
  }

  async unbind(id: string): Promise<BoundCertificate | null> {
    const current = await this.getBind(id);
    if (current === null) {
      return null;
    }
    await this.pool.query(`delete from server_certificates where id = $1`, [id]);
    return current;
  }
}
