import { useEffect, useRef, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import CheckOutlinedIcon from '@mui/icons-material/CheckOutlined';
import { useI18n } from '../../i18n/useI18n';
import { compileDocument } from '../../modsec/compile';
import { parseModsec } from '../../modsec/parser';

interface MarkerFieldProps {
  value: string;
  onCommit: (text: string) => void;
  'aria-label': string;
}

/**
 * Строка `SecMarker` целиком — правится черновиком и уходит в файл только
 * по кнопке справа.
 *
 * На каждый символ коммитить нельзя: промежуточное «SecMark» превратит
 * метку в незнакомую директиву и выкинет блок из своего разряда. Blur тоже
 * не сохраняет — иначе недописанное имя ушло бы в файл само. Кнопка
 * активна, когда черновик отличается от значения и проходит ту же сборку,
 * что решает, доступен ли конструктор: незакрытая кавычка, пустое имя и
 * прочий мусор, от которого правила не загрузятся, кнопку гасят.
 */
export function MarkerField({ value, onCommit, 'aria-label': ariaLabel }: MarkerFieldProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const reverted = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const trimmed = draft.trim();
  const dirty = trimmed !== value;
  const valid = isValidMarkerLine(trimmed);
  const canSave = dirty && valid;

  const save = () => {
    if (!canSave) return;
    onCommit(trimmed);
  };

  return (
    <TextField
      fullWidth
      value={draft}
      error={dirty && !valid}
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
        // Несохранённый черновик остаётся в поле, пока его не сменит
        // внешнее значение или Escape: иначе недописанное имя пропало бы
        // от случайного ухода фокуса.
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (!canSave) return;
          save();
          (event.target as HTMLInputElement).blur();
        }
        if (event.key === 'Escape') {
          event.stopPropagation();
          reverted.current = true;
          setDraft(value);
          (event.target as HTMLInputElement).blur();
        }
      }}
      sx={{
        '& .MuiInputBase-input': { fontFamily: 'ui-monospace, Consolas, monospace' },
        '& .MuiInputBase-adornedEnd .MuiInputBase-input': { pr: 0.5 },
      }}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={t('builder.saveMarker')}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!canSave}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={save}
                    aria-label={t('builder.saveMarker')}
                  >
                    <CheckOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </InputAdornment>
          ),
        },
        htmlInput: { 'aria-label': ariaLabel, spellCheck: false },
      }}
    />
  );
}

/**
 * Собирается ли строка ровно одной меткой с непустым именем.
 *
 * Одного разбора мало: парсер толерантен и снимет незакрытую кавычку как
 * часть имени, а конфигурацию с такой строкой ModSecurity не загрузит.
 * Компиляция знает про непарные кавычки — та же проверка, что блокирует
 * вкладку конструктора.
 */
function isValidMarkerLine(text: string): boolean {
  if (text === '') return false;
  const compiled = compileDocument(parseModsec(text));
  if (!compiled.ok) return false;
  const [block] = compiled.blocks;
  return block !== undefined && block.kind === 'marker' && block.label !== '';
}
