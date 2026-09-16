import { alpha, type Theme } from "@mui/material/styles";

export function scrollbarSx(theme: Theme) {
  const dark = theme.palette.mode === "dark";
  const thumb = alpha(theme.palette.primary.main, dark ? 0.34 : 0.26);
  const hover = alpha(theme.palette.primary.main, dark ? 0.56 : 0.42);
  return {
    scrollbarWidth: "thin",
    scrollbarColor: `${thumb} transparent`,
    "&::-webkit-scrollbar": {
      width: 8,
      height: 8,
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent",
    },
    "&::-webkit-scrollbar-corner": {
      background: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: thumb,
      borderRadius: 8,
      border: "2px solid transparent",
      backgroundClip: "padding-box",
    },
    "&::-webkit-scrollbar-thumb:hover": {
      backgroundColor: hover,
    },
  } as const;
}
