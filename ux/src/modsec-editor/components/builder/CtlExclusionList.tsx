import Stack from '@mui/material/Stack';
import { CtlExclusionRow } from './CtlExclusionRow';
import { ctlExclusionActions, readCtlExclusionRuns } from '../../modsec/exclusions';
import type { ExclusionEntry } from '../../modsec/exclusions';
import type { RuleAction } from '../../modsec/types';

interface CtlExclusionListProps {
  /** Список действий, которому исключения принадлежат: звено или само правило. */
  actions: RuleAction[];
  /**
   * Что проверки узнали об исключениях этого утверждения — в том же порядке.
   *
   * Порядок и есть связка: индекс собирает записи по ходу действий, и здесь
   * они перебираются так же. Связывать их записью нельзя — двух одинаковых
   * `ctl` в одном правиле никто не запрещал.
   */
  entries: ExclusionEntry[];
  onChange: (next: RuleAction[]) => void;
  /** Номер звена, в котором стоят эти действия, и всего звеньев в правиле. */
  link: number;
  links: number;
}

/**
 * Исключения `ctl` одного утверждения — строками с полями.
 *
 * Отдельно от {@link CtlExclusionRow}, потому что мест, где такие исключения
 * стоят, два: действия правила и звено цепочки. Список знает только, как
 * заменить свой отрезок действий, — а куда этот массив вернуть, решает
 * владелец.
 *
 * Отрезок, а не одно действие: строка формы снимает столько целей, сколько в
 * ней набрано, а запись `ctl` — ровно одну. Правка строки поэтому меняет
 * длину списка действий, и записи её строки стоят подряд — иначе новые уехали
 * бы к первой из них, переставив всё, что стояло между.
 */
export function CtlExclusionList({
  actions,
  entries,
  onChange,
  link,
  links,
}: CtlExclusionListProps) {
  const runs = readCtlExclusionRuns(actions);
  if (runs.length === 0) return null;

  /**
   * Отметки берутся у первой записи строки.
   *
   * Их и хватает: записи строки различаются целью, а до кого исключение
   * дотянулось, задаёт выборка — у всех записей одна и та же.
   */
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
