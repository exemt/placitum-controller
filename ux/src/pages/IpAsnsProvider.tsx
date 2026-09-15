import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { loadIpAsns } from "../store/slices/pages/ip-asns.ts";

export function IpAsnsProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadIpAsns(scope));
  }, [dispatch, scope]);

  return children;
}
