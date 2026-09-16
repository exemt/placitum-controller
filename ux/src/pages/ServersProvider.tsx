import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { loadServers } from "../store/slices/pages/servers.ts";

export function ServersProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadServers(scope));
  }, [dispatch, scope]);

  return children;
}
