import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadActionInspectors,
  loadActionProfiles,
} from "../store/slices/pages/action-profiles.ts";

export function ActionProfilesProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadActionProfiles(scope));
    void dispatch(loadActionInspectors(scope));
  }, [dispatch, scope]);

  return children;
}
