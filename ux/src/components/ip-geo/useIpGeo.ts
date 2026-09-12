import { useEffect, useSyncExternalStore } from "react";

import { useGeoStore } from "./IpGeoContext.tsx";
import type { GeoHit } from "./geoStore.ts";

/**
 * Заявка карточки на страну и ASN своего адреса. Заявка уходит в эффекте
 * (не во время рендера), сам хук лишь читает снимок текущего состояния —
 * `pending` до ответа кодера, дальше `ready` либо `error`.
 */
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
