import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import type { Diagnostic } from '../../modsec/diagnostics';

interface CounterProps {
  /**
   * Что посчитано — словами и вместе с самим числом.
   *
   * Число входит в текст, потому что подсказка служит чипу ещё и именем для
   * чтения с экрана: «Замечаний об этих условиях» без числа — не счётчик.
   */
  hint: string;
  count: number;
  /**
   * Худший уровень среди посчитанного — тогда счётчик про замечания, а не
   * про содержимое блока, и красится по нему.
   */
  severity?: Diagnostic['severity'];
}

/**
 * Счётчик у правого края полосы блока.
 *
 * Голое число там читается как загадка, а у «Условий» их два подряд: чипы «1»
 * и «1» выглядят одинаково, но говорят о разном — сколько в цепочке звеньев и
 * сколько о них сказано. Разводит их подсказка: она называет счёт словами, а
 * не повторяет цифру.
 */
export function Counter({ hint, count, severity }: CounterProps) {
  return (
    <Tooltip title={hint}>
      <Chip
        size="small"
        variant="outlined"
        color={severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'default'}
        label={count}
      />
    </Tooltip>
  );
}
