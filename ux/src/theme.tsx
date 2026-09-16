import { useMemo, type ReactNode } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { alpha, createTheme, ThemeProvider } from "@mui/material/styles";

import { TOOLBAR_HEIGHT } from "./components/PageBar.tsx";
import { scrollbarSx } from "./components/scrollbar.ts";
import { useAppSelector } from "./store/hooks.ts";

const FONT =
  '"IBM Plex Sans", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';
const FONT_MONO =
  '"IBM Plex Mono", ui-monospace, "Cascadia Code", Consolas, monospace';

function buildTheme(mode: "dark" | "light") {
  const dark = mode === "dark";
  const primary = dark ? "#6aa8ff" : "#1b5fb8";
  const secondary = dark ? "#9ec0e0" : "#3d5a80";
  const paper = dark ? "#0c121c" : "#f6f8fb";

  return createTheme({
    palette: {
      mode,
      primary: {
        main: primary,
        contrastText: dark ? "#071018" : "#f4f8ff",
      },
      secondary: {
        main: secondary,
        contrastText: dark ? "#071018" : "#f4f8ff",
      },
      success: { main: dark ? "#3dd68c" : "#1b8a4a" },
      warning: { main: dark ? "#f0b429" : "#b8860b" },
      error: { main: dark ? "#ff5c7a" : "#c6284a" },
      info: { main: dark ? "#6aa8ff" : "#1565c0" },
      background: {
        default: dark ? "#070b12" : "#eef2f6",
        paper,
      },
      divider: dark ? alpha(primary, 0.14) : alpha(primary, 0.16),
      text: {
        primary: dark ? "#d6e2f0" : "#13202c",
        secondary: dark ? "#8496ad" : "#4a5c70",
      },
    },
    typography: {
      fontFamily: FONT,
      fontSize: 14,
      htmlFontSize: 16,
      h5: { fontWeight: 600, letterSpacing: "-0.02em" },
      h6: { fontWeight: 600, letterSpacing: "-0.02em" },
      subtitle2: { fontWeight: 600, letterSpacing: "0.04em" },
      overline: { letterSpacing: "0.12em", fontWeight: 600 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    shape: { borderRadius: 5 },
    zIndex: {
      appBar: 1000,
      modal: 4000,
      tooltip: 4100,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": {
            "--cell-paper": paper,
            "--cell-ring-bg": alpha(primary, 0.05),
            "--cell-ring-shadow": `inset 0 0 0 1px ${alpha(primary, 0.5)}`,
          },
          html: { fontSize: "80%" },
          body: {
            fontFamily: FONT,
            backgroundImage: dark
              ? `linear-gradient(180deg, ${alpha(primary, 0.04)} 0%, transparent 28%), radial-gradient(1200px 500px at 0% -10%, ${alpha(primary, 0.07)}, transparent 50%)`
              : `linear-gradient(180deg, ${alpha(primary, 0.05)} 0%, transparent 32%)`,
            backgroundAttachment: "fixed",
          },
          code: { fontFamily: FONT_MONO },
          "textarea, pre": { fontFamily: FONT_MONO },
        },
      },
      MuiAppBar: {
        defaultProps: { color: "transparent" },
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: dark
              ? "rgba(12, 18, 28, 0.86)"
              : "rgba(246, 248, 251, 0.9)",
            color: theme.palette.text.primary,
            borderBottom: `1px solid ${theme.palette.divider}`,
            backdropFilter: "blur(14px)",
            boxShadow: "none",
          }),
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: TOOLBAR_HEIGHT,
            "@media (min-width: 600px)": { minHeight: TOOLBAR_HEIGHT },
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            backgroundImage: "none",
            borderRadius: 0,
            borderRight: `1px solid ${theme.palette.divider}`,
          }),
          modal: {
            zIndex: 4000,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        },
      },
      MuiDialogTitle: {
        defaultProps: { component: "div" },
        styleOverrides: {
          root: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: ({ theme }) => ({
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            padding: 16,
            overscrollBehavior: "contain",
            ...scrollbarSx(theme),
            ".MuiDialogTitle-root + &": {
              paddingTop: 16,
            },
          }),
          dividers: {
            padding: 16,
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: "12px 16px",
          },
        },
      },
      MuiTextField: {
        defaultProps: { size: "small" },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 2,
          },
          input: {
            paddingTop: 6,
            paddingBottom: 6,
          },
        },
      },
      MuiInputLabel: {
        defaultProps: { size: "small" },
        styleOverrides: {
          root: {
            "&.MuiInputLabel-outlined:not(.MuiInputLabel-shrink)": {
              transform: "translate(14px, 6px) scale(1)",
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
            borderRadius: 5,
          },
          outlined: ({ theme }) => ({
            borderColor: theme.palette.divider,
          }),
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 5,
            backgroundImage: dark
              ? `linear-gradient(180deg, ${alpha(theme.palette.primary.main, 0.05)}, transparent 48%)`
              : "none",
            borderColor: theme.palette.divider,
          }),
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: 5,
            "&:first-of-type": { borderRadius: 5 },
            "&:last-of-type": { borderRadius: 5 },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: "2px",
            minWidth: 0,
          },
          sizeSmall: {
            height: 20,
            minHeight: 20,
            padding: "0 6px",
            fontSize: "0.7rem",
            lineHeight: "20px",
            borderRadius: "2px",
          },
        },
        variants: [
          {
            props: { size: "small" },
            style: {
              height: 20,
              minHeight: 20,
              padding: "0 6px",
              fontSize: "0.7rem",
              lineHeight: "20px",
              borderRadius: "2px",
              minWidth: 0,
            },
          },
          {
            props: { size: "small", variant: "outlined" },
            style: {
              height: 20,
              minHeight: 20,
              padding: "0 6px",
              borderRadius: "2px",
            },
          },
          {
            props: { size: "small", variant: "contained" },
            style: {
              height: 20,
              minHeight: 20,
              padding: "0 6px",
              borderRadius: "2px",
            },
          },
        ],
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            borderRadius: "2px",
            height: 20,
            minHeight: 20,
            "& .MuiChip-label": {
              paddingLeft: 6,
              paddingRight: 6,
              fontSize: "0.7rem",
              lineHeight: "20px",
            },
            "& .MuiChip-icon": {
              fontSize: 12,
              marginLeft: 4,
              marginRight: -2,
            },
            "& .MuiChip-deleteIcon": {
              fontSize: 12,
              marginLeft: -2,
              marginRight: 4,
            },
          },
          sizeSmall: {
            height: 20,
            minHeight: 20,
          },
          sizeMedium: {
            height: 20,
            minHeight: 20,
          },
          outlined: ({ theme }) => ({
            borderColor: theme.palette.divider,
          }),
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 0,
            margin: "1px 0",
            paddingTop: 5,
            paddingBottom: 5,
            minHeight: 32,
            "&.Mui-selected": {
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              boxShadow: `inset 2px 0 0 ${theme.palette.primary.main}`,
              "&:hover": {
                backgroundColor: alpha(theme.palette.primary.main, 0.16),
              },
            },
          }),
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: { minWidth: 32, color: "inherit" },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 3,
            overflow: "hidden",
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor:
              theme.palette.mode === "light"
                ? "#ffffff"
                : theme.palette.background.paper,
          }),
        },
      },
      MuiTableBody: {
        styleOverrides: {
          root: ({ theme }) => {
            const night = theme.palette.mode === "dark";
            return {
              "& .MuiTableRow-root:nth-of-type(odd)": {
                backgroundColor: night
                  ? alpha("#000", 0.07)
                  : alpha("#000", 0.02),
              },
              "& .MuiTableRow-root:nth-of-type(even)": {
                backgroundColor: "transparent",
              },
              "& .MuiTableRow-root.Mui-selected": {
                backgroundColor: alpha(theme.palette.primary.main, 0.12),
              },
              "& .MuiTableRow-root.MuiTableRow-hover:hover": {
                backgroundColor: alpha(
                  theme.palette.primary.main,
                  night ? 0.1 : 0.07,
                ),
              },
            };
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderBottom: `1px solid ${alpha(theme.palette.primary.main, 0.055)}`,
            "&:first-of-type": {
              paddingLeft: 16,
            },
            "&:last-of-type": {
              paddingRight: 16,
            },
          }),
          head: {
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            fontSize: "0.7rem",
          },
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: {
          tooltip: ({ theme }) => ({
            fontSize: "0.75rem",
            fontWeight: 500,
            maxWidth: 380,
            padding: "8px 10px",
            backgroundColor: dark ? "#05080c" : "#ffffff",
            color: theme.palette.text.primary,
            border: `1px solid ${alpha(theme.palette.primary.main, dark ? 0.2 : 0.22)}`,
            boxShadow: dark
              ? "0 8px 24px rgba(0, 0, 0, 0.45)"
              : "0 8px 24px rgba(19, 32, 44, 0.1)",
          }),
          arrow: ({ theme }) => ({
            color: dark ? "#05080c" : "#ffffff",
            "&::before": {
              border: `1px solid ${alpha(theme.palette.primary.main, dark ? 0.2 : 0.22)}`,
              backgroundColor: dark ? "#05080c" : "#ffffff",
              boxSizing: "border-box",
            },
          }),
        },
      },
    },
  });
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const mode = useAppSelector((s) => s.ui.themeMode);
  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
