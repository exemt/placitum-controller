import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadAuthDatasets,
  loadAuthDenyResponses,
  loadAuthProfiles,
  loadAuthServers,
  loadAuthSources,
} from "../store/slices/pages/auth.ts";

export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadAuthProfiles(scope));
    void dispatch(loadAuthSources(scope));
    void dispatch(loadAuthServers(scope));
    void dispatch(loadAuthDatasets(scope));
    void dispatch(loadAuthDenyResponses(scope));
  }, [dispatch, scope]);

  return children;
}
