/*
  Полоса прокрутки панели -- один рецепт на все прокручиваемые области.

  Системная полоса Windows шире содержимого, которое она прокручивает, и в
  тёмной теме светится серым поверх почти чёрного кода. Рецепт был написан
  дважды -- в диалогах (theme.tsx) и в панелях форм (Form.tsx), -- и третья
  копия появилась бы у каждого следующего окна с прокруткой.

  Здесь только косметика: ширина, ползунок, прозрачный жёлоб. `overflow`
  остаётся за тем, кто прокручивает: у формы он по вертикали, у редактора
  конфигурации -- по обеим осям.
*/
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
    // Угол между полосами: без него на пересечении остаётся серый квадрат.
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
