import type { FleetSnapshot } from "../fleet.ts";
import type { AppDispatch, RootState } from "./index.ts";
import { setSnapshot } from "./slices/fleet.ts";
import { setInspectors } from "./slices/inspectors.ts";

/** Один кадр шины: ноды остаются во флоте, инспекторы — в своём слайсе. */
export function applyFleetSnapshot(snap: FleetSnapshot) {
  return (dispatch: AppDispatch, getState: () => RootState) => {
    const current = getState().fleet.snapshot;
    if (current !== null && snap.seq <= current.seq) {
      return;
    }
    dispatch(setSnapshot(snap));
    dispatch(
      setInspectors({
        seq: snap.seq,
        rows: snap.inspectors ?? [],
      }),
    );
  };
}
