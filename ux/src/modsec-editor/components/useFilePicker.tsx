import { useRef } from 'react';
import type { ReactElement } from 'react';

/** Что предлагает выбрать окно открытия файла правил. */
export const FILE_ACCEPT = '.conf,.txt,text/plain';

interface FilePickerOptions {
  accept: string;
  /** Текст выбранного файла. */
  onText: (text: string) => void;
  /** Выбранное не прочиталось: не текст, нет доступа. */
  onError?: () => void;
}

/**
 * Скрытое поле выбора файла и способ его позвать.
 *
 * Открыть окно выбора можно только из настоящего `input`, поэтому он есть у
 * каждого места, откуда файл берут. Спрятан он и убран из обхода по Tab:
 * нажимают на пункт меню рядом, и второе «Открыть» для клавиатуры и
 * скринридера было бы обманом.
 *
 * Отдаёт текст, а не файл набора: в панели файлы набора заводит каталог, а
 * с диска берут одно — содержимое, которым заменяют текст открытого файла.
 */
export function useFilePicker(options: FilePickerOptions): {
  input: ReactElement;
  open: () => void;
} {
  const ref = useRef<HTMLInputElement>(null);
  const { accept, onText, onError } = options;

  const input = (
    <input
      ref={ref}
      type="file"
      accept={accept}
      hidden
      tabIndex={-1}
      onChange={(event) => {
        const picked = event.target.files?.[0];
        // Сбрасываем значение: иначе выбор того же файла второй раз не поднимет
        // событие, и «открыть» перестанет работать.
        event.target.value = '';
        if (picked === undefined) return;
        void picked.text().then(onText, () => onError?.());
      }}
    />
  );

  return { input, open: () => ref.current?.click() };
}
