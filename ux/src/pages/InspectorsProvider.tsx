import { useEffect, type ReactNode } from "react";

import { fetchFleet } from "../api.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { applyFleetSnapshot } from "../store/fleet-ingest.ts";
import { enter, leave, primeExpanded } from "../store/slices/pages/inspectors.ts";

export function InspectorsProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const rows = useAppSelector((s) => s.inspectors.rows);
  const primed = useAppSelector((s) => s.pages.inspectors.primed);

  useEffect(() => {
    dispatch(enter());
    void fetchFleet()
      .then((row) => {
        dispatch(applyFleetSnapshot(row));
      })
      .catch(() => {
        // живой поток сокета всё равно догонит
      });
    return () => {
      dispatch(leave());
    };
  }, [dispatch]);

  useEffect(() => {
    if (primed || rows.length === 0) {
      return;
    }
    const names = [...new Set(rows.map((row) => row.name))];
    dispatch(primeExpanded(names));
  }, [dispatch, primed, rows]);

  return children;
}
