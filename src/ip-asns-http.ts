import { Router } from "express";

import { parseAddressQuery } from "./address-query.ts";
import type { IpAsnRepo } from "./ip-asns.ts";
import { asUuid } from "./model/id.ts";
import type { IpAsn, IpAsnAddress } from "./model/ip-profile.ts";
import { attachmentName, pageEnvelope, pageQuery } from "./page-query.ts";
import { scopeOf } from "./scope.ts";

function jsonAsn(row: IpAsn) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    asn: row.asn,
    type: row.type,
    description: row.description,
    size: row.size,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function jsonAddress(row: IpAsnAddress) {
  return {
    uuid: row.id,
    asn_id: row.asnId,
    address: row.address,
  };
}

export function ipAsnsRouter(repo: IpAsnRepo): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res, next) => {
    try {
      const scope = scopeOf(req);

      if (scope === undefined) {
        res.status(400).json({ error: "invalid_scope" });
        return;
      }

      const rows = await repo.list(scope);
      res.json({ ip_asns: rows.map(jsonAsn) });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:uuid", async (req, res, next) => {
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

      const row = await repo.get(id);

      if (row === null || row.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      res.json(jsonAsn(row));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:uuid/addresses/export", async (req, res, next) => {
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

      const meta = await repo.get(id);

      if (meta === null || meta.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const lines = await repo.addressTexts(id);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${attachmentName(`${meta.asn}-${meta.type}`)}"`,
      );
      res.send(lines.join("\n"));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:uuid/addresses", async (req, res, next) => {
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

      const meta = await repo.get(id);

      if (meta === null || meta.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const { page, pageSize, offset } = pageQuery(req.query);
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const { rows, total } = await repo.addressesPage(
        id,
        pageSize,
        offset,
        parseAddressQuery(q),
      );
      res.json({
        addresses: rows.map(jsonAddress),
        ...pageEnvelope(rows.length, total, page, pageSize),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
