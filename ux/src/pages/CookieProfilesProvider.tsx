import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadCookieInspectors,
  loadCookieProfiles,
} from "../store/slices/pages/cookie-profiles.ts";

export function CookieProfilesProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadCookieProfiles(scope));
    void dispatch(loadCookieInspectors(scope));
  }, [dispatch, scope]);

  return children;
}
