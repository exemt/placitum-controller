import { useCallback } from "react";
import Alert from "@mui/material/Alert";

import { exportIpAsnAddresses } from "../api.ts";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadIpAsnAddresses,
  loadIpAsns,
  selectAsn,
} from "../store/slices/pages/ip-asns.ts";
import { IpSetCatalog } from "./IpSetCatalog.tsx";

export default function IpAsns() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const error = useAppSelector((s) => s.pages.ipAsns.error);
  const rows = useAppSelector((s) => s.pages.ipAsns.rows);
  const loading = useAppSelector((s) => s.pages.ipAsns.loading);
  const selectedId = useAppSelector((s) => s.pages.ipAsns.selectedId);
  const addresses = useAppSelector((s) => s.pages.ipAsns.addresses);
  const addressesTotal = useAppSelector((s) => s.pages.ipAsns.addressesTotal);
  const addressesPage = useAppSelector((s) => s.pages.ipAsns.addressesPage);
  const addressesPageSize = useAppSelector((s) => s.pages.ipAsns.addressesPageSize);
  const addressesLoading = useAppSelector((s) => s.pages.ipAsns.addressesLoading);
  const addressesQuery = useAppSelector((s) => s.pages.ipAsns.addressesQuery);

  usePageBar({
    flush: scope !== null,
    onUpdate: () => {
      void dispatch(loadIpAsns(scope));
      if (scope !== null && selectedId !== null) {
        void dispatch(
          loadIpAsnAddresses({
            scope,
            id: selectedId,
            page: addressesPage,
            pageSize: addressesPageSize,
            q: addressesQuery,
          }),
        );
      }
    },
    updateDisabled: scope === null,
  });

  const loadAddresses = useCallback(
    (id: string, page: number, pageSize: number, q: string) => {
      if (scope !== null) {
        void dispatch(loadIpAsnAddresses({ scope, id, page, pageSize, q }));
      }
    },
    [dispatch, scope],
  );

  const exportAddresses = useCallback(
    (id: string) => {
      if (scope === null) {
        return Promise.reject(new Error("no space"));
      }
      return exportIpAsnAddresses(scope, id);
    },
    [scope],
  );

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <IpSetCatalog
      formId="ip-asn"
      keyLabel={t("ipAsns.asn")}
      empty={t("ipAsns.empty")}
      noAddresses={t("ipAsns.noAddresses")}
      error={error}
      rows={rows.map((row) => ({
        uuid: row.uuid,
        key: String(row.asn),
        type: row.type,
        description: row.description,
        size: row.size,
      }))}
      loading={loading}
      selectedId={selectedId}
      addresses={addresses}
      addressesTotal={addressesTotal}
      addressesLoading={addressesLoading}
      onSelect={(id) => dispatch(selectAsn(id))}
      onReload={() => void dispatch(loadIpAsns(scope))}
      onLoadAddresses={loadAddresses}
      onExportAddresses={exportAddresses}
    />
  );
}
