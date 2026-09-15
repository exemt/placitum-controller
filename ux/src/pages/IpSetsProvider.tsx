import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadIpSetAsns,
  loadIpSetCountries,
  loadIpSetLists,
  loadIpSets,
} from "../store/slices/pages/ip-sets.ts";

export function IpSetsProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadIpSets(scope));
    void dispatch(loadIpSetLists(scope));
    void dispatch(loadIpSetCountries(scope));
    void dispatch(loadIpSetAsns(scope));
  }, [dispatch, scope]);

  return children;
}
