import { Link } from "react-router-dom";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

import { useT } from "../i18n/index.ts";
import { fleetLamp, type FleetLamp } from "../fleet.ts";
import { useAppSelector } from "../store/hooks.ts";
import { WORDMARK_CAP_HEIGHT, WORDMARK_CAP_LIFT } from "./Wordmark.tsx";

const LAMP_COLOR: Record<FleetLamp, string> = {
  green: "#3dd68c",
  yellow: "#f0b429",
  red: "#ff5c7a",
};

export default function FleetMenu() {
  const t = useT();
  const lamp = useAppSelector((s) =>
    fleetLamp(s.fleet.connected, s.fleet.snapshot),
  );
  const color = LAMP_COLOR[lamp];

  return (
    <Tooltip title={`${t(`fleet.${lamp}`)} — ${t("fleetPage.title")}`}>
      {/*
        Лампа стоит при знаке и равняется по его буквам: ростом с прописные и
        на их середине. Без подъёма она села бы на середину коробки знака, а
        та ниже букв -- в коробку входит отбивка под словом.
      */}
      <IconButton
        size="small"
        component={Link}
        to="/"
        aria-label={t("fleet.aria")}
        sx={{ mr: 1, position: "relative", top: -WORDMARK_CAP_LIFT }}
      >
        <Box
          sx={{
            width: WORDMARK_CAP_HEIGHT,
            height: WORDMARK_CAP_HEIGHT,
            borderRadius: "50%",
            bgcolor: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </IconButton>
    </Tooltip>
  );
}
