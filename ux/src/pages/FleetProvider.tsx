import { useEffect, type ReactNode } from "react";

import { fetchFleet } from "../api.ts";
import { useAppDispatch } from "../store/hooks.ts";
import { applyFleetSnapshot } from "../store/fleet-ingest.ts";
import { enter, leave } from "../store/slices/pages/fleet.ts";

export function FleetProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(enter());
    void fetchFleet()
      .then((row) => {
        dispatch(applyFleetSnapshot(row));
      })
      .catch(() => {
      });
    return () => {
      dispatch(leave());
    };
  }, [dispatch]);

  return children;
}
