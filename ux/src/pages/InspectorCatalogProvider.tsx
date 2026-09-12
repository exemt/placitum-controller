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

  /*
   * Живые реплики в колонке «Запущено» приходят из пульса. Кадр сокета
   * догонит сам, но первый показ страницы был бы с нулями у каждой строки --
   * а ноль здесь значит «процесс не поднят», и врать этим нельзя.
   */
  useEffect(() => {
    void fetchFleet()
      .then((row) => {
        dispatch(applyFleetSnapshot(row));
      })
      .catch(() => {
        // живой поток сокета всё равно догонит
      });
  }, [dispatch]);

  return children;
}
