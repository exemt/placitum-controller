import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { loadPaths, setServerFilter } from "../store/slices/pages/paths.ts";

export function PathsProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const [params] = useSearchParams();
  const server = params.get("server");

  useEffect(() => {
    dispatch(setServerFilter(server));
    void dispatch(loadPaths({ scope }));
  }, [dispatch, scope, server]);

  return children;
}
