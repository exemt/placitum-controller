/**
 * Чип сходимости в шапке.
 *
 * Стоит у правого края, рядом с чипом соединения, а не слит с лампой
 * живости: живой контур с невыкаченной политикой -- обычное рабочее
 * состояние, и красить его рядом с настоящими авариями значит обесценить
 * оба знака. Живость отвечает «кто дышит», этот -- «то ли на них стоит».
 */

import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import type { ChannelView, ConvergenceSnapshot } from "../api.ts";
import {
  CHANNEL_TONE,
  canSendState,
  channelLabel,
  channelReason,
  channelStateLabel,
  useConvergence,
  type Tone,
} from "../convergence.tsx";
import { useT } from "../i18n/index.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { sendConvergenceChannel } from "../store/slices/convergence.ts";
import { pageBarBtnSx } from "../components/PageBar.tsx";

/** Чип сходимости -- в масштабе чипа соединения рядом, а не своей палитрой. */
const LAMP_CHIP: Record<
  ConvergenceSnapshot["lamp"],
  "success" | "warning" | "error"
> = {
  green: "success",
  yellow: "warning",
  red: "error",
};

/** Состояние в строке -- цветным текстом, без рамки чипа. */
const STATE_COLOR: Record<Tone, string> = {
  default: "text.secondary",
  info: "info.main",
  success: "success.main",
  warning: "warning.main",
  error: "error.main",
};

export default function ConfigLamp() {
  const t = useT();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const scope = useAppSelector((s) => s.session.scope);
  const sending = useAppSelector((s) => s.convergence.sending);
  const error = useAppSelector((s) => s.convergence.error);
  const { snapshot } = useConvergence();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (snapshot === null) {
    return null;
  }

  const label = t(`convergence.lamp.${snapshot.lamp}`);
  // В счёте -- только каналы, которые лечатся кнопкой «Разослать». Едущие и
  // молчащие в него не идут: число в подписи -- «сколько нажатий осталось»,
  // а общую беду показывает цвет чипа.
  const unsent = snapshot.channels.filter((row) => canSendState(row.state));

  const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const close = () => setAnchor(null);

  const go = (channel: ChannelView) => {
    close();
    void navigate(channel.page);
  };

  const send = (channel: ChannelView) => {
    if (scope !== null) {
      void dispatch(sendConvergenceChannel({ scope, channel }));
    }
  };

  /*
   * Последовательно, а не Promise.all: каждая рассылка завершается пересчётом
   * снимка, и параллельные перезаписывали бы его наперегонки -- последним
   * пришёл бы не самый свежий, а самый медленный.
   */
  const sendAll = () => {
    if (scope === null) {
      return;
    }
    void (async () => {
      for (const channel of unsent) {
        await dispatch(sendConvergenceChannel({ scope, channel }));
      }
    })();
  };

  return (
    <>
      <Tooltip title={t("convergence.title")}>
        {/*
          Чип, а не лампочка: цвет один и тот же, но состояние читается словом
          и без наведения -- как у чипа соединения по соседству. Число несётся
          в подписи, чтобы не вешать бейдж на чип.
        */}
        <Chip
          size="small"
          color={LAMP_CHIP[snapshot.lamp]}
          label={unsent.length > 0 ? `${label} · ${unsent.length}` : label}
          onClick={open}
          aria-label={t("convergence.title")}
          sx={{ mr: 1 }}
        />
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        slotProps={{ paper: { sx: { minWidth: 520, maxWidth: 680 } } }}
      >
        <Stack direction="row" spacing={1.5} sx={{ px: 2, py: 1, alignItems: "center" }}>
          <Typography sx={{ fontSize: "0.8rem", fontWeight: 600, flex: 1 }}>
            {t("convergence.blurb")}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            sx={{ ...pageBarBtnSx, flexShrink: 0 }}
            disabled={unsent.length === 0 || sending.length > 0}
            onClick={sendAll}
          >
            {t("convergence.sendAll")}
          </Button>
        </Stack>
        <Divider />

        {error !== null && (
          <Typography
            variant="caption"
            sx={{ px: 2, py: 0.5, color: "error.main", display: "block" }}
          >
            {error}
          </Typography>
        )}

        {snapshot.channels.map((channel) => {
          /*
            Канал без участников в списке не показывается: такого инспектора на
            контуре не подняли, и строка «нет участников» ничего не просит --
            ни кнопки, ни взгляда. Появится участник -- появится и строка.
          */
          if (channel.state === "nobody") {
            return null;
          }

          const reason = channelReason(t, channel);
          const busy = sending.includes(channel.id);
          const withButton = busy || canSendState(channel.state);
          const tone = CHANNEL_TONE[channel.state];
          /*
            Строка, которая ждёт нажатия, окрашена тоном состояния -- текстом,
            не подложкой: имя и причина того же цвета, каким справа стояла бы
            подпись. Фон строки остаётся общим, цветное пятно в меню выглядело
            бы как выделение, а не как состояние.
          */
          const lit = withButton && tone !== "default";

          return (
            <MenuItem
              key={channel.id}
              onClick={() => go(channel)}
              sx={{ alignItems: "flex-start", py: 1, gap: 1 }}
            >
              <ListItemText
                sx={{ my: 0 }}
                primary={
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: lit ? STATE_COLOR[tone] : undefined,
                    }}
                  >
                    {channelLabel(t, channel.id)}
                  </Typography>
                }
                secondary={
                  reason === null ? undefined : (
                    <Typography
                      variant="caption"
                      sx={{
                        color: lit ? STATE_COLOR[tone] : "text.secondary",
                        whiteSpace: "normal",
                      }}
                    >
                      {reason}
                    </Typography>
                  )
                }
              />
              {/*
                Кнопка остаётся и на строке: каналы независимы по ревизии и
                откату, точечную правку рассылают точечно. «Разослать всё»
                сверху -- на случай, когда рассылки ждут несколько каналов.
                Подпись состояния рядом с кнопкой не печатается: «не разослана»
                и «Разослать» -- дважды одно и то же, о состоянии говорит
                цвет текста строки.
              */}
              {withButton ? (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy}
                  sx={{ ...pageBarBtnSx, flexShrink: 0 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    send(channel);
                  }}
                >
                  {t("common.send")}
                </Button>
              ) : (
                <Typography
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    lineHeight: "20px",
                    color: STATE_COLOR[tone],
                    flexShrink: 0,
                  }}
                >
                  {channelStateLabel(t, channel.state)}
                </Typography>
              )}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
