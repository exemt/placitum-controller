export interface CertificateMetadataInput {
  scope: string;
  certStoreId: string;
  keyStoreId?: string;
  chainStoreId?: string;
}

export interface CertificateMetadata {
  sans: string[];
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
  subject: string;
  issuer: string;
  serial: string;
  isCa: boolean;
}

export interface CrlMetadataInput {
  scope: string;
  crlStoreId: string;
}

export interface CrlMetadata {
  issuer: string;
  thisUpdate: Date;
  nextUpdate?: Date;
  revoked: number;
}

export type CertificateMetadataError =
  | "invalid_uuid"
  | "store_object_not_found"
  | "undecryptable"
  | "invalid_certificate"
  | "invalid_crl"
  | "key_mismatch"
  | "crypto_unavailable";

export class CertificateMetadataRejected extends Error {
  readonly status: number;
  readonly error: CertificateMetadataError;

  constructor(status: number, error: CertificateMetadataError) {
    super(`certificate metadata rejected: ${error}`);
    this.status = status;
    this.error = error;
  }
}

const ERROR_STATUS: Record<CertificateMetadataError, number> = {
  invalid_uuid: 400,
  store_object_not_found: 404,
  undecryptable: 422,
  invalid_certificate: 422,
  invalid_crl: 422,
  key_mismatch: 422,
  crypto_unavailable: 502,
};

function isCertificateMetadataError(
  value: unknown,
): value is CertificateMetadataError {
  return typeof value === "string" && value in ERROR_STATUS;
}

export class CryptoServiceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs = 10_000) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  async fetchCertificateMetadata(
    input: CertificateMetadataInput,
  ): Promise<CertificateMetadata> {
    const body = await this.post<{
      sans: string[];
      not_before: string;
      not_after: string;
      fingerprint: string;
      subject: string;
      issuer: string;
      serial: string;
      is_ca: boolean;
    }>("/v1/certificates/metadata", {
      scope: input.scope,
      cert_store_id: input.certStoreId,
      key_store_id: input.keyStoreId ?? null,
      chain_store_id: input.chainStoreId ?? null,
    });

    return {
      sans: body.sans,
      notBefore: new Date(body.not_before),
      notAfter: new Date(body.not_after),
      fingerprint: body.fingerprint,
      subject: body.subject ?? "",
      issuer: body.issuer ?? "",
      serial: body.serial ?? "",
      isCa: body.is_ca === true,
    };
  }

  async fetchCrlMetadata(input: CrlMetadataInput): Promise<CrlMetadata> {
    const body = await this.post<{
      issuer: string;
      this_update: string;
      next_update: string;
      revoked: number;
    }>("/v1/crl/metadata", {
      scope: input.scope,
      crl_store_id: input.crlStoreId,
    });

    return {
      issuer: body.issuer ?? "",
      thisUpdate: new Date(body.this_update),
      nextUpdate:
        body.next_update === "" || body.next_update === undefined
          ? undefined
          : new Date(body.next_update),
      revoked: body.revoked ?? 0,
    };
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    if (this.baseUrl === "") {
      throw new CertificateMetadataRejected(502, "crypto_unavailable");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      throw new CertificateMetadataRejected(502, "crypto_unavailable");
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: unknown;
      };
      const error = isCertificateMetadataError(body.error)
        ? body.error
        : "crypto_unavailable";
      throw new CertificateMetadataRejected(ERROR_STATUS[error], error);
    }

    return (await res.json()) as T;
  }
}
