import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadRewriteDenyResponses,
  loadRewriteProfiles,
} from "../store/slices/pages/rewrite-profiles.ts";

export function RewriteProfilesProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadRewriteProfiles(scope));
    void dispatch(loadRewriteDenyResponses(scope));
  }, [dispatch, scope]);

  return children;
}
