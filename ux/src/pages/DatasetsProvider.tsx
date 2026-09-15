import { useEffect, type ReactNode } from "react";

import type { Dataset } from "../api.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadAddresses,
  loadContent,
  loadDatasets,
} from "../store/slices/pages/datasets.ts";

export function DatasetsProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const panelId = useAppSelector((s) => s.pages.datasets.panelId);
  const row = useAppSelector((s) =>
    typeof panelId === "string"
      ? (s.pages.datasets.rows.find((item: Dataset) => item.uuid === panelId) ?? null)
      : null,
  );

  useEffect(() => {
    void dispatch(loadDatasets(scope));
  }, [dispatch, scope]);

  useEffect(() => {
    if (scope === null || panelId === undefined || panelId === null) {
      return;
    }
    if (row === null) {
      return;
    }
    if (row.kind === "content") {
      void dispatch(loadContent({ scope, datasetId: panelId }));
      return;
    }
    void dispatch(loadAddresses({ scope, datasetId: panelId }));
  }, [dispatch, scope, panelId, row]);

  return children;
}
