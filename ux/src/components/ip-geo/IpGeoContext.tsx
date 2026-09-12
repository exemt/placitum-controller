import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useAppSelector } from "../../store/hooks.ts";
import { GeoStore } from "./geoStore.ts";

const GeoStoreContext = createContext<GeoStore | null>(null);

/**
 * Общий контекст для всех карточек IP-адреса на странице (и между страниц,
 * пока не перезагрузили вкладку). Один `GeoStore` на всё дерево — кэш и
 * очередь пачки общие, поэтому одинаковый адрес в двух таблицах не
 * спрашивается дважды.
 *
 * Отвечает каталог пространства, значит и кэш у каждого пространства свой:
 * на смену `scope` заводится новый store, старые ответы не переезжают.
 * Пространства ещё нет (сессия не загрузилась) — карточки просто ждут.
 */
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
