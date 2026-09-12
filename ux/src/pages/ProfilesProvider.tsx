import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { loadProfileLists, loadProfiles } from "../store/slices/pages/profiles.ts";

export function ProfilesProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadProfiles(scope));
    void dispatch(loadProfileLists(scope));
  }, [dispatch, scope]);

  return children;
}
