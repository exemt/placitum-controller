import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { loadSpaceHttp } from "../store/slices/pages/config.ts";

export function ConfigProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadSpaceHttp(scope));
  }, [dispatch, scope]);

  return children;
}
