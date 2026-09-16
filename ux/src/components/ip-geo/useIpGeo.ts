import { useEffect, useSyncExternalStore } from "react";

import { useGeoStore } from "./IpGeoContext.tsx";
import type { GeoHit } from "./geoStore.ts";

export function useIpGeo(address: string): GeoHit {
  const store = useGeoStore();

  useEffect(() => {
    store.request(address);
  }, [store, address]);

  return useSyncExternalStore(
    (listener) => store.subscribe(address, listener),
    () => store.get(address),
  );
}
