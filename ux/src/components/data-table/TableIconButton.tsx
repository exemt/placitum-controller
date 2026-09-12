import type { ReactNode } from "react";
import Button, { type ButtonProps } from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import { alpha } from "@mui/material/styles";

export type TableIconButtonProps = Omit<
  ButtonProps,
  "children" | "startIcon" | "endIcon"
> & {
  icon: ReactNode;
  tooltip: ReactNode;
};

function mute(main: string) {
  return {
    color: alpha(main, 0.68),
    borderColor: alpha(main, 0.26),
    "&:hover": {
      color: alpha(main, 0.86),
      borderColor: alpha(main, 0.42),
      backgroundColor: alpha(main, 0.06),
    },
  };
}

const squareSx = {
  width: 20,
  height: 20,
  minWidth: 20,
  maxWidth: 20,
  minHeight: 20,
  maxHeight: 20,
  padding: 0,
  lineHeight: 0,
  boxSizing: "border-box" as const,
  "& .MuiSvgIcon-root, & svg": {
    fontSize: 12,
    width: 12,
    height: 12,
  },
};

export function TableIconButton({
  icon,
  tooltip,
  disabled,
  sx,
  "aria-label": ariaLabel,
  ...props
}: TableIconButtonProps) {
  const label =
    ariaLabel ?? (typeof tooltip === "string" && tooltip !== "" ? tooltip : undefined);
  const button = (
    <Button
      variant="outlined"
      size="small"
      disabled={disabled}
      aria-label={label}
      {...props}
      sx={[
        squareSx,
        (theme) => ({
          ...mute(theme.palette.primary.main),
          "&.MuiButton-colorSuccess": mute(theme.palette.success.main),
          "&.MuiButton-colorError": mute(theme.palette.error.main),
          "&.MuiButton-colorWarning": mute(theme.palette.warning.main),
          "&.MuiButton-colorInfo": mute(theme.palette.info.main),
          /*
           * Выключённая кнопка -- серая: mute() красит цвет и рамку из `sx`,
           * и штатное правило `.Mui-disabled` из-под него не видно -- «+»
           * без свободных объектов оставался зелёным, как рабочий.
           */
          "&.MuiButton-root.Mui-disabled": {
            color: theme.palette.action.disabled,
            borderColor: theme.palette.action.disabledBackground,
          },
        }),
        ...(Array.isArray(sx) ? sx : sx !== undefined ? [sx] : []),
      ]}
    >
      {icon}
    </Button>
  );

  if (tooltip === "" || tooltip === false || tooltip == null) {
    return button;
  }

  return (
    <Tooltip title={tooltip}>
      <span style={{ display: "inline-flex" }}>{button}</span>
    </Tooltip>
  );
}
