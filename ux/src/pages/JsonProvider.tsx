import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadJsonDenyResponses,
  loadJsonDocuments,
  loadJsonProfiles,
} from "../store/slices/pages/json.ts";

export function JsonProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadJsonProfiles(scope));
    void dispatch(loadJsonDocuments(scope));
    void dispatch(loadJsonDenyResponses(scope));
  }, [dispatch, scope]);

  return children;
}
