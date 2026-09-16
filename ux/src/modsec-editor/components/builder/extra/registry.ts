import type { ComponentType } from 'react';
import { AppendAction } from './AppendAction';
import { CtlAction } from './CtlAction';
import { DeprecatevarAction } from './DeprecatevarAction';
import { ExecAction } from './ExecAction';
import { ExpirevarAction } from './ExpirevarAction';
import { InitcolAction } from './InitcolAction';
import { MultiMatchAction } from './MultiMatchAction';
import { PauseAction } from './PauseAction';
import { PrependAction } from './PrependAction';
import { SanitiseArgAction } from './SanitiseArgAction';
import { SanitiseMatchedAction } from './SanitiseMatchedAction';
import { SanitiseMatchedBytesAction } from './SanitiseMatchedBytesAction';
import { SanitiseRequestHeaderAction } from './SanitiseRequestHeaderAction';
import { SanitiseResponseHeaderAction } from './SanitiseResponseHeaderAction';
import { SetenvAction } from './SetenvAction';
import { SetrscAction } from './SetrscAction';
import { SetsidAction } from './SetsidAction';
import { SetuidAction } from './SetuidAction';
import { SkipAction } from './SkipAction';
import { SkipAfterAction } from './SkipAfterAction';
import { XmlnsAction } from './XmlnsAction';
import type { ExtraActionProps } from './types';

export const EXTRA_ACTION_COMPONENTS: Record<string, ComponentType<ExtraActionProps>> = {
  append: AppendAction,
  ctl: CtlAction,
  deprecatevar: DeprecatevarAction,
  exec: ExecAction,
  expirevar: ExpirevarAction,
  initcol: InitcolAction,
  multiMatch: MultiMatchAction,
  pause: PauseAction,
  prepend: PrependAction,
  sanitiseArg: SanitiseArgAction,
  sanitiseMatched: SanitiseMatchedAction,
  sanitiseMatchedBytes: SanitiseMatchedBytesAction,
  sanitiseRequestHeader: SanitiseRequestHeaderAction,
  sanitiseResponseHeader: SanitiseResponseHeaderAction,
  setenv: SetenvAction,
  setrsc: SetrscAction,
  setsid: SetsidAction,
  setuid: SetuidAction,
  skip: SkipAction,
  skipAfter: SkipAfterAction,
  xmlns: XmlnsAction,
};
