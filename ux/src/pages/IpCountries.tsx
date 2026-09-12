import { useCallback } from "react";
import Alert from "@mui/material/Alert";

import { exportIpCountryAddresses } from "../api.ts";
import { useT } from "../i18n/index.ts";
import { usePageBar } from "../layout/PageBarHost.tsx";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadIpCountries,
  loadIpCountryAddresses,
  selectCountry,
} from "../store/slices/pages/ip-countries.ts";
import { IpSetCatalog } from "./IpSetCatalog.tsx";

export default function IpCountries() {
  const t = useT();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const error = useAppSelector((s) => s.pages.ipCountries.error);
  const rows = useAppSelector((s) => s.pages.ipCountries.rows);
  const loading = useAppSelector((s) => s.pages.ipCountries.loading);
  const selectedId = useAppSelector((s) => s.pages.ipCountries.selectedId);
  const addresses = useAppSelector((s) => s.pages.ipCountries.addresses);
  const addressesTotal = useAppSelector((s) => s.pages.ipCountries.addressesTotal);
  const addressesPage = useAppSelector((s) => s.pages.ipCountries.addressesPage);
  const addressesPageSize = useAppSelector(
    (s) => s.pages.ipCountries.addressesPageSize,
  );
  const addressesLoading = useAppSelector(
    (s) => s.pages.ipCountries.addressesLoading,
  );
  const addressesQuery = useAppSelector((s) => s.pages.ipCountries.addressesQuery);

  usePageBar({
    flush: scope !== null,
    onUpdate: () => {
      void dispatch(loadIpCountries(scope));
      if (scope !== null && selectedId !== null) {
        void dispatch(
          loadIpCountryAddresses({
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
        void dispatch(loadIpCountryAddresses({ scope, id, page, pageSize, q }));
      }
    },
    [dispatch, scope],
  );

  const exportAddresses = useCallback(
    (id: string) => {
      if (scope === null) {
        return Promise.reject(new Error("no space"));
      }
      return exportIpCountryAddresses(scope, id);
    },
    [scope],
  );

  if (scope === null) {
    return <Alert severity="warning">{t("errors.noSpace")}</Alert>;
  }

  return (
    <IpSetCatalog
      formId="ip-country"
      keyLabel={t("ipCountries.code")}
      empty={t("ipCountries.empty")}
      noAddresses={t("ipCountries.noAddresses")}
      error={error}
      rows={rows.map((row) => ({
        uuid: row.uuid,
        key: row.code,
        type: row.type,
        description: row.description,
        size: row.size,
      }))}
      loading={loading}
      selectedId={selectedId}
      addresses={addresses}
      addressesTotal={addressesTotal}
      addressesLoading={addressesLoading}
      onSelect={(id) => dispatch(selectCountry(id))}
      onReload={() => void dispatch(loadIpCountries(scope))}
      onLoadAddresses={loadAddresses}
      onExportAddresses={exportAddresses}
    />
  );
}
