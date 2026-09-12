import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RemoveIcon from '@mui/icons-material/Remove';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useI18n } from '../../i18n/useI18n';
import type { TranslationKey } from '../../i18n/translations';
import type { VariableUse } from '../../modsec/variables';
import './VariableUseMarks.css';

/** Порядок значков: сначала запись, потом чтение — как секции в подсказке. */
const USE_ORDER: readonly VariableUse[] = [
  'set',
  'add',
  'sub',
  'delete',
  'expire',
  'read',
];

const USE_HINT: Record<VariableUse, TranslationKey> = {
  set: 'builder.variableUse.set',
  add: 'builder.variableUse.add',
  sub: 'builder.variableUse.sub',
  delete: 'builder.variableUse.delete',
  expire: 'builder.variableUse.expire',
  read: 'builder.variableUse.read',
};

const USE_ICON: Record<VariableUse, typeof EditOutlinedIcon> = {
  set: EditOutlinedIcon,
  add: AddIcon,
  sub: RemoveIcon,
  delete: DeleteOutlinedIcon,
  expire: TimerOutlinedIcon,
  read: VisibilityOutlinedIcon,
};

interface VariableUseMarksProps {
  uses: readonly VariableUse[];
}

/**
 * Квадратные чипы «что правило делает с переменной» — перед номером в списке.
 *
 * У одного правила видов бывает несколько: CRS и прибавляет счёт, и читает
 * его в том же блоке. Чипы стоят рядом, а не сменяют друг друга: иначе
 * «и пишет, и читает» превратилось бы в одно из двух. Форма — квадрат с
 * иконкой, той же высоты, что чип номера справа: иначе ряд действий
 * читался бы двумя этажами.
 */
export function VariableUseMarks({ uses }: VariableUseMarksProps) {
  const { t } = useI18n();
  const shown = USE_ORDER.filter((use) => uses.includes(use));
  if (shown.length === 0) return null;

  return (
    <span className="variable-use-marks">
      {shown.map((use) => {
        const Icon = USE_ICON[use];
        const hint = t(USE_HINT[use]);
        return (
          <Tooltip key={use} title={hint}>
            <span
              className={`variable-use-marks__chip variable-use-marks__chip--${use}`}
              aria-label={hint}
            >
              <Icon fontSize="inherit" />
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}

/**
 * Виды использования по номеру правила, без повторов и в устойчивом порядке.
 *
 * Список окна идёт по уникальным `id`, а мест у одного номера бывает несколько
 * — значки собирают все виды, а не только первое место.
 */
export function usesByRuleId(sites: readonly { id: string; use: VariableUse }[]): Map<string, VariableUse[]> {
  const bags = new Map<string, Set<VariableUse>>();
  for (const site of sites) {
    if (site.id === '') continue;
    let bag = bags.get(site.id);
    if (bag === undefined) {
      bag = new Set();
      bags.set(site.id, bag);
    }
    bag.add(site.use);
  }

  const result = new Map<string, VariableUse[]>();
  for (const [id, bag] of bags) {
    result.set(
      id,
      USE_ORDER.filter((use) => bag.has(use)),
    );
  }
  return result;
}
