import { useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { ChoiceField } from './ChoiceField';
import { useI18n } from '../../i18n/useI18n';
import { HANDLE_COLUMN, ICON_COLUMN } from './layout';
import { pipelineKinds } from '../../modsec/semantics';
import { transformChoices } from '../../modsec/choices';
import { recommendedTransforms } from '../../modsec/suggestions';
import type { ValueKind } from '../../modsec/semantics';
import type { VisualTarget } from '../../modsec/model';

interface TransformPipelineProps {
  transforms: string[];
  /** Тип значения, приходящего от областей проверки, — начало конвейера. */
  baseKind: ValueKind;
  /** Области проверки: по ним отбирается уместное на этом месте. */
  targets: VisualTarget[];
  /** Конвейер недоступен (например, включён подсчёт `&`). */
  disabled: boolean;
  disabledReason: string;
  onChange: (next: string[]) => void;
}

/**
 * Одна сетка на строку конвейера: ручка, список, крестик. Ручка и крестик
 * появляются не всегда, но их колонки заняты всегда — так левый край
 * списков не прыгает между пустым конвейером и заполненным.
 */
const rowSx = {
  display: 'grid',
  gridTemplateColumns: `${HANDLE_COLUMN}px minmax(0, 1fr) ${ICON_COLUMN}px`,
  columnGap: 0.5,
  alignItems: 'center',
} as const;

/**
 * Упорядоченный конвейер преобразований.
 *
 * Порядок значим: ModSecurity применяет `t:` слева направо, поэтому
 * `t:lowercase,t:urlDecode` и `t:urlDecode,t:lowercase` — разные проверки.
 * Отсюда перетаскивание за ручку вместо простого набора флажков.
 *
 * По той же причине каждый шаг выбирается из своего списка, а не из общего:
 * в руках у него то, что оставил предыдущий. После `t:length` это число, и
 * список честно говорит, что приводить его к нижнему регистру нечему.
 */
export function TransformPipeline({
  transforms,
  baseKind,
  targets,
  disabled,
  disabledReason,
  onChange,
}: TransformPipelineProps) {
  const { t } = useI18n();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  /**
   * Незаполненный шаг в конце конвейера.
   *
   * Живёт здесь, а не в модели: текст правила — единственный источник
   * правды, а записать «шаг, который ещё не выбрали», в него нечем — `t:`
   * без имени не преобразование. Подставлять что-то за человека тоже
   * нельзя: `t:lowercase`, появившийся сам, попадёт в правило и будет
   * применяться, даже если его никто не читал.
   */
  const [pending, setPending] = useState(false);

  const recommended = recommendedTransforms(targets);
  // На вход шага приходит то, что отдал предыдущий; последний элемент —
  // выход всего конвейера, и для выбора он уже не нужен.
  const kinds = pipelineKinds(baseKind, transforms);

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...transforms];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  if (disabled) {
    // Недоступный конвейер гаснет, но не исчезает: набранные шаги остаются
    // в правиле, и подменять их пустым «Нет» — значит показывать не то, что
    // в нём написано. Человек тогда не понимает, о каком конвейере говорит
    // замечание «подсчёт игнорирует преобразования» и что ему очищать.
    if (transforms.length > 0) {
      return (
        <Stack spacing={1.75} sx={{ width: '100%' }}>
          {transforms.map((transform, index) => (
            <Box key={`${transform}-${index}`} sx={rowSx}>
              <Box sx={{ gridColumn: 2 }}>
                <ChoiceField
                  disabled
                  prefix="t:"
                  label={t('builder.transform')}
                  // Шаг не просто недоступен — он написан в правиле и не
                  // сработает. Серым это неотличимо от «здесь пока пусто»,
                  // поэтому шаг красный: то же, что и у остальных полей,
                  // которые в таком виде отдавать наружу нельзя.
                  error={disabledReason}
                  disabledReason={disabledReason}
                  choices={transformChoices(kinds[index], recommended, transform)}
                  value={transform}
                  onChange={() => {}}
                />
              </Box>
            </Box>
          ))}
        </Stack>
      );
    }

    return (
      <Box sx={{ ...rowSx, width: '100%' }}>
        <Box sx={{ gridColumn: 2 }}>
          <ChoiceField
            disabled
            label={t('builder.transform')}
            disabledReason={disabledReason}
            emptyLabel={t('builder.transformNone')}
            choices={[]}
            value=""
            onChange={() => {}}
          />
        </Box>
      </Box>
    );
  }

  // Пустой конвейер показываем не пустотой, а явным «Нет»: так видно, что
  // преобразований нет намеренно, и сразу понятно, где их выбирать.
  // Начатый шаг это «Нет» отменяет — он ниже, вместе с остальными.
  if (transforms.length === 0 && !pending) {
    return (
      <Box sx={{ ...rowSx, width: '100%' }}>
        <Box sx={{ gridColumn: 2 }}>
          <ChoiceField
            prefix="t:"
            label={t('builder.transform')}
            emptyLabel={t('builder.transformNone')}
            choices={transformChoices(baseKind, recommended, '')}
            value=""
            onChange={(name) => onChange(name === '' ? [] : [name])}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Stack spacing={1.75} sx={{ width: '100%' }}>
      {transforms.map((transform, index) => (
        <Box
          key={`${transform}-${index}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null) move(dragIndex, index);
            setDragIndex(null);
          }}
          sx={{ ...rowSx, opacity: dragIndex === index ? 0.4 : 1 }}
        >
          <Tooltip title={t('builder.dragTransform')}>
            <Box
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              sx={{ display: 'flex', justifyContent: 'center', cursor: 'grab', color: 'text.disabled' }}
            >
              <DragIndicatorIcon fontSize="small" />
            </Box>
          </Tooltip>

          <ChoiceField
            prefix="t:"
            label={t('builder.transform')}
            choices={transformChoices(kinds[index], recommended, transform)}
            value={transform}
            onChange={(name) =>
              onChange(transforms.map((v, i) => (i === index ? name : v)))
            }
            inputSx={{ color: 'primary.light' }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <IconButton
              size="small"
              onClick={() => onChange(transforms.filter((_, i) => i !== index))}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      ))}

      {/* Пустой шаг занимает место кнопки: пока он не заполнен, добавлять
          следующий незачем, а его собственный крестик отменяет добавление. */}
      {pending ? (
        <Box sx={rowSx}>
          <Box sx={{ gridColumn: 2 }}>
            <ChoiceField
              autoFocus
              prefix="t:"
              label={t('builder.transform')}
              error={t('builder.transformRequired')}
              // Выбирать есть из чего только по тому, что оставил последний
              // шаг: после `t:length` в руках уже число.
              choices={transformChoices(kinds[kinds.length - 1], recommended, '')}
              value=""
              onChange={(name) => {
                if (name === '') return;
                setPending(false);
                onChange([...transforms, name]);
              }}
              inputSx={{ color: 'primary.light' }}
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <IconButton size="small" onClick={() => setPending(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      ) : (
        <Box sx={rowSx}>
          <Box sx={{ gridColumn: 2 }}>
            <Tooltip title={t('builder.addTransform')}>
              <IconButton
                size="small"
                onClick={() => setPending(true)}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}
    </Stack>
  );
}
