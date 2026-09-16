import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadCounterDenyResponses,
  loadCounterProfiles,
  loadCounterShared,
} from "../store/slices/pages/counter.ts";

export function CounterProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadCounterProfiles(scope));
    void dispatch(loadCounterShared(scope));
    void dispatch(loadCounterDenyResponses(scope));
  }, [dispatch, scope]);

  return children;
}
