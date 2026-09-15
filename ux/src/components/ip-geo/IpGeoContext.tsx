import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useAppSelector } from "../../store/hooks.ts";
import { GeoStore } from "./geoStore.ts";

const GeoStoreContext = createContext<GeoStore | null>(null);

export function IpGeoProvider({ children }: { children: ReactNode }) {
  const scope = useAppSelector((s) => s.session.scope);
  const store = useMemo(() => new GeoStore(scope ?? ""), [scope]);

  return (
    <GeoStoreContext.Provider value={store}>{children}</GeoStoreContext.Provider>
  );
}

export function useGeoStore(): GeoStore {
  const store = useContext(GeoStoreContext);
  if (store === null) {
    throw new Error("useGeoStore: нет IpGeoProvider выше по дереву");
  }
  return store;
}
