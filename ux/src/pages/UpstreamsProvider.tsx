import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { loadUpstreams } from "../store/slices/pages/upstreams.ts";

export function UpstreamsProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadUpstreams(scope));
  }, [dispatch, scope]);

  return children;
}
