import { useEffect, type ReactNode } from "react";

import { useAppDispatch } from "../store/hooks.ts";
import { loadSpaces, pingHealth } from "../store/slices/session.ts";

export function SessionProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    void dispatch(loadSpaces());
  }, [dispatch]);

  useEffect(() => {
    void dispatch(pingHealth());
    const id = window.setInterval(() => {
      void dispatch(pingHealth());
    }, 5000);
    return () => {
      window.clearInterval(id);
    };
  }, [dispatch]);

  return children;
}
