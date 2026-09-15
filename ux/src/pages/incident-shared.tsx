import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";

import { useT, type Translate } from "../i18n/index.ts";

export function useRemote<T>(
  key: string,
  load: () => Promise<T>,
): { data: T | null; loading: boolean; error: string | null } {
  const t = useT();
  const ref = useRef(load);
  ref.current = load;

  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });

  useEffect(() => {
    let live = true;
    setState({ data: null, loading: true, error: null });

    ref.current()
      .then((data) => {
        if (live) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!live) {
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        setState({
          data: null,
          loading: false,
          error: msg === "search_unreachable" ? t("incidentsPage.unreachable") : msg,
        });
      });

    return () => {
      live = false;
    };
  }, [key, t]);

  return state;
}

export function Waiting() {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", py: 0.5 }}>
      <CircularProgress size={14} />
    </Stack>
  );
}

export function Failed({ message }: { message: string }) {
  return (
    <Alert severity="error" sx={{ py: 0, fontSize: 12 }}>
      {message}
    </Alert>
  );
}

export function Note({
  text,
  severity = "info",
}: {
  text: string;
  severity?: "info" | "warning";
}) {
  return (
    <Alert severity={severity} sx={{ py: 0, mb: 0.75, fontSize: 12 }}>
      {text}
    </Alert>
  );
}

export function reasonText(t: Translate, reason: string): string {
  const key = `incidentsPage.reason.${reason}`;
  const text = t(key);

  return text === key ? reason : text;
}

export function bytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }

  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }

  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
