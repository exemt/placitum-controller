import { useEffect, useRef, useState } from 'react';
import TextField from '@mui/material/TextField';
import type { TextFieldProps } from '@mui/material/TextField';

type CommitFieldProps = Omit<TextFieldProps, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

export function CommitField({ value, onCommit, ...rest }: CommitFieldProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const reverted = useRef(false);

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
          event.stopPropagation();
          reverted.current = true;
          setDraft(value);
          (event.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
