import Stack from '@mui/material/Stack';
import { CtlExclusionRow } from './CtlExclusionRow';
import { ctlExclusionActions, readCtlExclusionRuns } from '../../modsec/exclusions';
import type { ExclusionEntry } from '../../modsec/exclusions';
import type { RuleAction } from '../../modsec/types';

interface CtlExclusionListProps {
  actions: RuleAction[];
  entries: ExclusionEntry[];
  onChange: (next: RuleAction[]) => void;
  link: number;
  links: number;
}

export function CtlExclusionList({
  actions,
  entries,
  onChange,
  link,
  links,
}: CtlExclusionListProps) {
  const runs = readCtlExclusionRuns(actions);
  if (runs.length === 0) return null;

  let seen = 0;

  return (
    <Stack spacing={1.5}>
      {runs.map(({ at, value }) => {
        const entry = entries[seen];
        seen += at.length;

        const replace = (next: RuleAction[]) =>
          onChange([...actions.slice(0, at[0]), ...next, ...actions.slice(at[0] + at.length)]);

        return (
          <CtlExclusionRow
            key={at[0]}
            value={value}
            entry={entry}
            link={link}
            links={links}
            onChange={(next) => replace(ctlExclusionActions(next))}
            onRemove={() => replace([])}
          />
        );
      })}
    </Stack>
  );
}
