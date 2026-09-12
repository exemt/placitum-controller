import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadCertificates,
  loadCryptoStatus,
} from "../store/slices/pages/certificates.ts";

export function CertificatesProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadCertificates(scope));
    void dispatch(loadCryptoStatus(scope));
  }, [dispatch, scope]);

  return children;
}
