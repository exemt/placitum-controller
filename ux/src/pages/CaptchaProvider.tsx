import { useEffect, type ReactNode } from "react";

import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import {
  loadCaptchaDatasets,
  loadCaptchaDenyResponses,
  loadCaptchaProfiles,
  loadCaptchaServers,
} from "../store/slices/pages/captcha.ts";

export function CaptchaProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);

  useEffect(() => {
    void dispatch(loadCaptchaProfiles(scope));
    void dispatch(loadCaptchaServers(scope));
    void dispatch(loadCaptchaDatasets(scope));
    void dispatch(loadCaptchaDenyResponses(scope));
  }, [dispatch, scope]);

  return children;
}
