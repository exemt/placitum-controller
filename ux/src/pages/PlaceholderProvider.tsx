import { useEffect, type ReactNode } from "react";

import { useAppDispatch } from "../store/hooks.ts";
import { trafficEnter, trafficLeave } from "../store/slices/pages/shell.ts";

export function PlaceholderProvider({
  page,
  children,
}: {
  page: "traffic";
  children: ReactNode;
}) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(trafficEnter());
    return () => {
      dispatch(trafficLeave());
    };
  }, [dispatch, page]);

  return children;
}
