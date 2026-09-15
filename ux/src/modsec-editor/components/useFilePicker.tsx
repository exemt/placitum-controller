import { useRef } from 'react';
import type { ReactElement } from 'react';

export const FILE_ACCEPT = '.conf,.txt,text/plain';

interface FilePickerOptions {
  accept: string;
  onText: (text: string) => void;
  onError?: () => void;
}

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
        event.target.value = '';
        if (picked === undefined) return;
        void picked.text().then(onText, () => onError?.());
      }}
    />
  );

  return { input, open: () => ref.current?.click() };
}
