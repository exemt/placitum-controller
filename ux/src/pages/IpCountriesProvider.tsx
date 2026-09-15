import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { loadIpCountries } from "../store/slices/pages/ip-countries.ts";

export function IpCountriesProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadIpCountries(scope));
  }, [dispatch, scope]);

  return children;
}
