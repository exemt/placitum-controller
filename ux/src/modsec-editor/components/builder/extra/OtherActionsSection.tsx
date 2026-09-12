import Stack from '@mui/material/Stack';
import { SideTitle } from '../SideTitle';
import { useI18n } from '../../../i18n/useI18n';
import type { RuleAction } from '../../../modsec/types';
import { EXTRA_ACTION_COMPONENTS } from './registry';
import { UnknownAction } from './UnknownAction';

interface OtherActionsSectionProps {
  items: RuleAction[];
}

/**
 * Действия без своего поля в форме: `skipAfter`, `initcol`, неисключающий
 * `ctl` и прочие.
 *
 * Список обходится в исходном порядке — группировка по имени переставила бы
 * соседние записи в правиле. Каждый вид уже своим компонентом: сейчас все
 * рисуют один чип, позже форма появится внутри файла вида, не здесь.
 */
export function OtherActionsSection({ items }: OtherActionsSectionProps) {
  const { t } = useI18n();

  if (items.length === 0) return null;

  return (
    <Stack spacing={0.75}>
      <SideTitle label={t('builder.otherActions')} />
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        {items.map((action, index) => {
          const Comp = EXTRA_ACTION_COMPONENTS[action.name] ?? UnknownAction;
          return <Comp key={index} action={action} />;
        })}
      </Stack>
    </Stack>
  );
}
