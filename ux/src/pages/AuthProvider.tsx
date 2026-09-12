import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadAuthDatasets,
  loadAuthDenyResponses,
  loadAuthProfiles,
  loadAuthServers,
  loadAuthSources,
} from "../store/slices/pages/auth.ts";

/*
 * Источники, профили и наборы грузятся вместе: профиль ссылается на источник,
 * провайдер local называет набор именем, и выбирать их в формах надо из уже
 * загруженных списков.
 */
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
