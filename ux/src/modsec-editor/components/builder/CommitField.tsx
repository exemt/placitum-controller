import { useEffect, useRef, useState } from 'react';
import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';

type CommitFieldProps = Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

/**
 * Текстовое поле, которое отдаёт значение наружу не на каждый символ,
 * а по завершении ввода (blur / Enter).
 *
 * Так сделано намеренно: любое изменение конструктора пересобирает текст
 * правила и заново его компилирует. Промежуточные состояния вроде пустого
 * `id` — это ошибка компиляции, и коммить их на каждое нажатие клавиши
 * значит ронять визуальный режим прямо под руками у пользователя.
 */
export function CommitField({ value, onCommit, ...rest }: CommitFieldProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  // Escape уводит фокус, а обработчик потери фокуса видит ещё не обновлённый
  // черновик — без этой отметки отменённая правка всё равно бы сохранилась.
  const reverted = useRef(false);

  // Пока поле в фокусе, внешние обновления не перетирают ввод.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    if (next !== value) onCommit(next);
  };

  return (
    <TextField
      {...rest}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        if (reverted.current) {
          reverted.current = false;
          return;
        }
        commit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !rest.multiline) {
          event.preventDefault();
          commit(draft);
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === 'Escape') {
          // Escape отменяет правку поля — и на этом останавливается. Без
          // остановки всплытия он доходит до диалога, в котором живёт весь
          // редактор, и закрывает его вместе с несохранённой работой.
          event.stopPropagation();
          reverted.current = true;
          setDraft(value);
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
