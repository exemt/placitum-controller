import { useEffect, type ReactNode } from "react";

import { fetchFleet } from "../api.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { applyFleetSnapshot } from "../store/fleet-ingest.ts";
import { loadInspectors } from "../store/slices/pages/inspector-catalog.ts";

export function InspectorCatalogProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadInspectors(scope));
  }, [dispatch, scope]);

  useEffect(() => {
    void fetchFleet()
      .then((row) => {
        dispatch(applyFleetSnapshot(row));
      })
      .catch(() => {
      });
  }, [dispatch]);

  return children;
}
