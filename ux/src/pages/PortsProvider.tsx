import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { loadPorts } from "../store/slices/pages/ports.ts";

export function PortsProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadPorts(scope));
  }, [dispatch, scope]);

  return children;
}
