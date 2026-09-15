import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadIpProfileActions,
  loadIpProfileDenyResponses,
  loadIpProfileInspectors,
  loadIpProfileLive,
  loadIpProfileSets,
  loadIpProfiles,
} from "../store/slices/pages/ip-profiles.ts";

export function IpProfilesProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadIpProfiles(scope));
    void dispatch(loadIpProfileSets(scope));
    void dispatch(loadIpProfileLive(scope));
    void dispatch(loadIpProfileInspectors(scope));
    void dispatch(loadIpProfileDenyResponses(scope));
    void dispatch(loadIpProfileActions());
  }, [dispatch, scope]);

  return children;
}
