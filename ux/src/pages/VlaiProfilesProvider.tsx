import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadVlaiInspectors,
  loadVlaiProfiles,
} from "../store/slices/pages/vlai-profiles.ts";

export function VlaiProfilesProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadVlaiProfiles(scope));
    void dispatch(loadVlaiInspectors(scope));
  }, [dispatch, scope]);

  return children;
}
