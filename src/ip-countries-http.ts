import { Router } from "express";

import { parseAddressQuery } from "./address-query.ts";
import type { IpCountryRepo } from "./ip-countries.ts";
import { asUuid } from "./model/id.ts";
import type { IpCountry, IpCountryAddress } from "./model/ip-profile.ts";
import { attachmentName, pageEnvelope, pageQuery } from "./page-query.ts";
import { scopeOf } from "./scope.ts";
import {
  ipCountrySelectors,
  selectIpCountriesInSpace,
} from "./state/slices/ip-countries.ts";
import type { RootState } from "./state/types.ts";

function jsonCountry(row: IpCountry) {
  return {
    uuid: row.id,
    http_space_id: row.httpSpaceId,
    code: row.code,
    type: row.type,
    description: row.description,
    size: row.size,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function jsonAddress(row: IpCountryAddress) {
  return {
    uuid: row.id,
    country_id: row.countryId,
    address: row.address,
  };
}

export function ipCountriesRouter(
  getState: () => RootState,
  repo: IpCountryRepo,
): Router {
  const router = Router({ mergeParams: true });

  router.get("/", (req, res) => {
    const scope = scopeOf(req);

    if (scope === undefined) {
      res.status(400).json({ error: "invalid_scope" });
      return;
    }

    res.json({
      ip_countries: selectIpCountriesInSpace(getState(), scope).map(jsonCountry),
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

    const row = ipCountrySelectors.selectById(getState(), id);

    if (row === undefined || row.httpSpaceId !== scope) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(jsonCountry(row));
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

      const meta = ipCountrySelectors.selectById(getState(), id);

      if (meta === undefined || meta.httpSpaceId !== scope) {
        res.status(404).json({ error: "not_found" });
        return;
      }

      const lines = await repo.addressTexts(id);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${attachmentName(`${meta.code}-${meta.type}`)}"`,
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

      const meta = ipCountrySelectors.selectById(getState(), id);

      if (meta === undefined || meta.httpSpaceId !== scope) {
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
