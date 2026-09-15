import { alpha, createTheme } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';

export const CONTROL_HEIGHT = 32;

export const BLOCK_ROW = CONTROL_HEIGHT + 16;

export const FIELD_GUTTER = 10;

const LABEL_LIFT = 9;

export const DIALOG_FIELD_TOP = LABEL_LIFT + 3;

const FIELD_ACTION_ICON = 18;
const FIELD_ACTION_PAD = 3;
const FIELD_ACTION_GAP = 2;
export const FIELD_ACTION_INSET = FIELD_GUTTER - 4;

export const FIELD_ACTION_HEIGHT = FIELD_ACTION_ICON + 2 * FIELD_ACTION_PAD;

export const CHIP_HEIGHT = 20;

export const LIST_PADDING = 4;

const LIST_ACCENT = 2;

export const ICON_BUTTON_PAD = 4;

const RADIUS = 4;

const CONTENT_HEIGHT = CONTROL_HEIGHT - 2;

const LINE_HEIGHT = 19;

const PAD_Y = (CONTENT_HEIGHT - LINE_HEIGHT) / 2;

export interface EditorThemeOptions {
  zIndex?: Partial<Theme['zIndex']>;
  fontSize?: number;
}

export function createEditorTheme({
  zIndex,
  fontSize = 13,
}: EditorThemeOptions = {}): Theme {
  return createTheme({
  ...(zIndex === undefined ? {} : { zIndex }),
  palette: {
    mode: 'dark',
    background: { default: '#181b21', paper: '#22262e' },
    primary: { main: '#8b7ce8', light: '#b9a9ff' },
    secondary: { main: '#3fd0c9', light: '#7fe3dd' },
    error: { main: '#e05a4f', light: '#f08a80' },
    warning: { main: '#e8974a', light: '#f0b070' },
    success: { main: '#5ab98a' },
    divider: 'rgba(255,255,255,0.12)',
    text: { primary: '#e6e8ec', secondary: '#98a1b0' },
  },
  shape: { borderRadius: RADIUS },
  typography: { fontSize },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },

    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiAutocomplete: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root.MuiInputBase-sizeSmall': {
            paddingTop: PAD_Y,
            paddingBottom: PAD_Y,
            paddingLeft: FIELD_GUTTER - 4,
            '& .MuiAutocomplete-input': { padding: '0 4px' },
          },

          '&.MuiAutocomplete-hasPopupIcon, &.MuiAutocomplete-hasClearIcon, &.MuiAutocomplete-hasPopupIcon.MuiAutocomplete-hasClearIcon':
            {
              '& .MuiOutlinedInput-root': { paddingRight: FIELD_ACTION_INSET },
            },
        },

        endAdornment: {
          position: 'static',
          transform: 'none',
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          gap: `${FIELD_ACTION_GAP}px`,
          marginTop: -PAD_Y,
          marginBottom: -PAD_Y,
          '& .MuiSvgIcon-root': { fontSize: FIELD_ACTION_ICON },
        },
        clearIndicator: { padding: FIELD_ACTION_PAD, margin: 0 },
        popupIndicator: { padding: FIELD_ACTION_PAD, margin: 0 },

        paper: ({ theme }) => ({
          border: `1px solid ${theme.palette.divider}`,
          boxShadow: theme.shadows[8],
          overflow: 'hidden',
        }),

        listbox: ({ theme }) => ({
          padding: `${LIST_PADDING}px 0`,
          scrollbarWidth: 'thin',
          scrollbarColor: `${alpha('#ffffff', 0.18)} transparent`,
          '& .MuiAutocomplete-option': {
            paddingLeft: FIELD_GUTTER - LIST_ACCENT,
            paddingRight: FIELD_GUTTER,
            borderLeft: `${LIST_ACCENT}px solid transparent`,
            '&[aria-selected="true"]': { borderLeftColor: theme.palette.primary.main },
          },
        }),
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        input: ({ ownerState, theme }) => {
          const autofillTint = {
            WebkitTextFillColor: '#e6e8ec',
            caretColor: '#e6e8ec',
            WebkitBoxShadow: `0 0 0 1000px ${alpha(theme.palette.primary.main, 0.07)} inset`,
            transition: 'background-color 600000s ease-in-out 0s',
          };
          return {
            ...(ownerState.size === 'small' && !ownerState.multiline
              ? { padding: `${PAD_Y}px ${FIELD_GUTTER}px` }
              : {}),
            '&:-webkit-autofill': autofillTint,
            '&:-webkit-autofill:hover': autofillTint,
            '&:-webkit-autofill:focus': autofillTint,
          };
        },
        root: {
          '&.MuiInputBase-adornedStart': { paddingLeft: FIELD_GUTTER },
          '&.MuiInputBase-adornedEnd': { paddingRight: FIELD_ACTION_INSET },
        },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        sizeSmall: {
          transform: `translate(${FIELD_GUTTER}px, ${PAD_Y}px) scale(1)`,
          '&.MuiInputLabel-shrink': {
            transform: `translate(${FIELD_GUTTER}px, -${LABEL_LIFT}px) scale(0.75)`,
          },
        },
      },
    },

    MuiButton: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        sizeSmall: { padding: '2px 8px', minWidth: 0 },
      },
    },

    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: { sizeSmall: { padding: ICON_BUTTON_PAD, borderRadius: RADIUS } },
    },

    MuiInputAdornment: {
      styleOverrides: {
        root: {
          '&.MuiInputAdornment-positionEnd': {
            marginLeft: FIELD_ACTION_GAP,
            height: 'auto',
            marginTop: -PAD_Y,
            marginBottom: -PAD_Y,
          },
          '& .MuiSvgIcon-root': { fontSize: FIELD_ACTION_ICON },
          '& .MuiIconButton-root': { padding: FIELD_ACTION_PAD },
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        sizeSmall: { height: CONTROL_HEIGHT, padding: `0 ${FIELD_GUTTER - 2}px` },
        root: { '&.Mui-selected': { borderColor: 'currentColor' } },
      },
    },

    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        sizeSmall: { height: CHIP_HEIGHT, borderRadius: RADIUS - 1 },
        label: ({ ownerState }) =>
          ownerState.size === 'small' ? { paddingLeft: 6, paddingRight: 6 } : {},
        deleteIcon: ({ ownerState }) =>
          ownerState.size === 'small' ? { fontSize: 15, marginRight: 3 } : {},
      },
    },
  },
  });
}
