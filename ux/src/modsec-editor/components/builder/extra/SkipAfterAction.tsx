import { MarkerPreview } from '../../MarkerPreview';
import { serializeAction } from '../../../modsec/serialize';
import type { ExtraActionProps } from './types';

/**
 * `skipAfter:LABEL` — чип с переходом к метке, если она есть в наборе.
 *
 * Правки поля нет: значение правят в текстовой вкладке. Связь же нужна
 * здесь: смысл действия лежит в метке, а не в самой записи.
 */
export function SkipAfterAction({ action }: ExtraActionProps) {
  const label = action.value ?? '';
  return (
    <MarkerPreview
      label={label}
      caption={serializeAction(action)}
      chipSx={{ fontFamily: 'ui-monospace, Consolas, monospace' }}
    />
  );
}
