import { Router } from "express";
import type { Request, Response } from "express";

import {
  parseCertificateBindCreate,
  parseCertificateCreate,
  parseCrlUpdate,
} from "./certificates-parse.ts";
import type { CryptoServiceClient } from "./crypto-service-client.ts";
import { CertificateMetadataRejected } from "./crypto-service-client.ts";
import { sendWriteError } from "./http-error.ts";
import { log } from "./log.ts";
import { asUuid } from "./model/id.ts";
import type { Certificate } from "./model/listen.ts";
import type { BoundCertificate } from "./model/server.ts";
import { scopeOf } from "./scope.ts";
import {
  bindCertificate,
  certificateBindSelectors,
  certificateSelectors,
  clearCertificateCrl,
  createCertificate,
  deleteCertificate,
  selectCertBindsOnServer,
  selectCertificatesInSpace,
  setCertificateCrl,
  unbindCertificate,
} from "./state/index.ts";
import type { AppDispatch, RootState } from "./state/types.ts";

export function jsonCertificate(row: Certificate) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    name: row.name,
    type: row.type,
    cert_store_id: row.certStoreId,
    key_store_id: row.keyStoreId ?? null,
    chain_store_id: row.chainStoreId ?? null,
    sans: row.sans,
    not_before: row.notBefore?.toISOString() ?? null,
    not_after: row.notAfter?.toISOString() ?? null,
    fingerprint: row.fingerprint,
    subject: row.subject,
    issuer: row.issuer,
    serial: row.serial,
    crl:
      row.crl === undefined
        ? null
        : {
            store_id: row.crl.storeId,
            issuer: row.crl.issuer,
            this_update: row.crl.thisUpdate?.toISOString() ?? null,
            next_update: row.crl.nextUpdate?.toISOString() ?? null,
            revoked: row.crl.revoked ?? null,
          },
  };
}

export function jsonCertificateBind(row: BoundCertificate) {
  return {
    uuid: row.id,
    server_id: row.serverId,
    certificate_id: row.certificateId,
    kind: row.kind,
    type: row.certificate.type,
    name: row.certificate.name,
    sans: row.certificate.sans,
    not_before: row.certificate.notBefore?.toISOString() ?? null,
    not_after: row.certificate.notAfter?.toISOString() ?? null,
    fingerprint: row.certificate.fingerprint,
    subject: row.certificate.subject,
    has_crl: row.certificate.crl !== undefined,
  };
}

function certificateInScope(
  getState: () => RootState,
  id: string,
  scope: string,
): Certificate | undefined {
  const row = certificateSelectors.selectById(getState(), id);
  if (row === undefined || row.httpSpaceId !== scope) {
    return undefined;
  }
  return row;
}

export function certificatesRouter(
  dispatch: AppDispatch,
  getState: () => RootState,
  crypto: CryptoServiceClient,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const scope = scopeOf(req);
    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    res.json({
      certificates: selectCertificatesInSpace(getState(), scope).map(jsonCertificate),
    });
  });

  router.get("/:uuid", (req, res) => {
    const scope = scopeOf(req);
    const id = asUuid(req.params.uuid);
    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }
    if (id === undefined) {
      res.status(400).json({ error: "invalid_uuid" });
      return;
    }

    const row = certificateInScope(getState, id, scope);
    if (row === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(jsonCertificate(row));
  });

  router.post("/", async (req: Request, res: Response, next) => {
    try {
      const spaceId = scopeOf(req);
      if (spaceId === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const parsed = parseCertificateCreate(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      // Метаданные -- из crypto-сервиса, не от браузера: SAN и срок в теле
      // запроса, даже если бы их прислали, значения не имели бы. Контроллер
      // ciphertext не открывает, поэтому верить некому, кроме держателя
      // приватного ключа контура. См. docs/crypto-service.md.
      let metadata;
      try {
        metadata = await crypto.fetchCertificateMetadata({
          scope: spaceId,
          certStoreId: parsed.value.certStoreId,
          keyStoreId: parsed.value.keyStoreId,
          chainStoreId: parsed.value.chainStoreId,
        });
      } catch (err) {
        if (err instanceof CertificateMetadataRejected) {
          res.status(err.status).json({ error: err.error });
          return;
        }
        throw err;
      }

      // Тип сверяется с самим сертификатом, а не берётся на слово: корень
      // mTLS обязан быть CA (BasicConstraints), иначе nginx примет его в
      // ssl_client_certificate, но не построит по нему цепочку клиента.
      if (parsed.value.type === "client_ca" && !metadata.isCa) {
        res.status(422).json({ error: "not_a_ca" });
        return;
      }

      const row = await dispatch(
        createCertificate({
          httpSpaceId: spaceId,
          name: parsed.value.name,
          type: parsed.value.type,
          certStoreId: parsed.value.certStoreId,
          keyStoreId: parsed.value.keyStoreId,
          chainStoreId: parsed.value.chainStoreId,
          sans: metadata.sans,
          notBefore: metadata.notBefore,
          notAfter: metadata.notAfter,
          fingerprint: metadata.fingerprint,
          subject: metadata.subject,
          issuer: metadata.issuer,
          serial: metadata.serial,
        }),
      ).unwrap();

      log("info", "certificate created", {
        uuid: row.id,
        name: row.name,
        type: row.type,
      });
      res.status(201).json(jsonCertificate(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.delete("/:uuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }
      if (certificateInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = await dispatch(deleteCertificate({ id })).unwrap();
      log("info", "certificate deleted", { uuid: row.id, name: row.name });
      res.json(jsonCertificate(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  /**
   * Список отзыва живёт на строке client_ca: nginx печатает `ssl_crl` рядом
   * с `ssl_client_certificate`, один список на один корень. PUT, не POST --
   * замена, а не накопление: у CA в каждый момент ровно один актуальный CRL.
   *
   * Как и у сертификата, разбор -- у crypto-сервиса. Контроллер видит только
   * ciphertext и не может сам сказать, сколько там отозванных серийников.
   */
  router.put("/:uuid/crl", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }

      const cert = certificateInScope(getState, id, scope);
      if (cert === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (cert.type !== "client_ca") {
        res.status(400).json({ error: "crl_needs_client_ca" });
        return;
      }

      const parsed = parseCrlUpdate(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      let metadata;
      try {
        metadata = await crypto.fetchCrlMetadata({
          scope,
          crlStoreId: parsed.value.crlStoreId,
        });
      } catch (err) {
        if (err instanceof CertificateMetadataRejected) {
          res.status(err.status).json({ error: err.error });
          return;
        }
        throw err;
      }

      // Чужой CRL nginx проглотит, а проверять им ничего не станет:
      // подпись не сойдётся с корнем. Ловим это здесь, где ещё видно оба
      // subject, а не в `nginx -t` на ноде.
      if (
        cert.subject !== "" &&
        metadata.issuer !== "" &&
        cert.subject !== metadata.issuer
      ) {
        res.status(422).json({ error: "crl_issuer_mismatch" });
        return;
      }

      const row = await dispatch(
        setCertificateCrl({
          id,
          crl: {
            storeId: parsed.value.crlStoreId,
            issuer: metadata.issuer,
            thisUpdate: metadata.thisUpdate,
            nextUpdate: metadata.nextUpdate,
            revoked: metadata.revoked,
          },
        }),
      ).unwrap();

      log("info", "certificate crl set", {
        uuid: row.id,
        name: row.name,
        revoked: metadata.revoked,
      });
      res.json(jsonCertificate(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.delete("/:uuid/crl", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }
      if (certificateInScope(getState, id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const row = await dispatch(clearCertificateCrl({ id })).unwrap();
      log("info", "certificate crl cleared", { uuid: row.id, name: row.name });
      res.json(jsonCertificate(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  return router;
}

export function mountServerCertificateRoutes(
  router: Router,
  dispatch: AppDispatch,
  getState: () => RootState,
  serverInScope: (id: string, scope: string) => unknown,
): void {
  router.get("/:uuid/certificates", (req, res) => {
    const scope = scopeOf(req);
    const id = asUuid(req.params.uuid);
    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }
    if (id === undefined) {
      res.status(400).json({ error: "invalid_uuid" });
      return;
    }
    if (serverInScope(id, scope) === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({
      certificates: selectCertBindsOnServer(getState(), id).map(jsonCertificateBind),
    });
  });

  router.post("/:uuid/certificates", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const id = asUuid(req.params.uuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (id === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }
      if (serverInScope(id, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const parsed = parseCertificateBindCreate(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      if (certificateInScope(getState, parsed.value.certificateId, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const row = await dispatch(
        bindCertificate({
          serverId: id,
          certificateId: parsed.value.certificateId,
          kind: parsed.value.kind,
        }),
      ).unwrap();
      log("info", "certificate bound", {
        server: id,
        certificate: row.certificateId,
        kind: row.kind,
      });
      res.status(201).json(jsonCertificateBind(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });

  router.delete("/:uuid/certificates/:bindUuid", async (req: Request, res: Response, next) => {
    try {
      const scope = scopeOf(req);
      const serverId = asUuid(req.params.uuid);
      const bindId = asUuid(req.params.bindUuid);
      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }
      if (serverId === undefined || bindId === undefined) {
        res.status(400).json({ error: "invalid_uuid" });
        return;
      }
      if (serverInScope(serverId, scope) === undefined) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const bind = certificateBindSelectors.selectById(getState(), bindId);
      if (bind === undefined || bind.serverId !== serverId) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      const row = await dispatch(unbindCertificate({ id: bindId })).unwrap();
      res.json(jsonCertificateBind(row));
    } catch (err) {
      sendWriteError(err, res, next);
    }
  });
}
