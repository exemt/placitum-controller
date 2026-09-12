/**
 * Полоса состояния канала на его странице.
 *
 * Одна на все шесть страниц: расхождение выглядит одинаково, где бы его ни
 * показывали, а шесть похожих, но чуть разных предупреждений -- верный способ
 * получить шесть по-разному врущих.
 *
 * Ничего не считает. Состояние, причина и право нажать приходят от
 * контроллера: хеш обязан быть посчитан тем же кодом, который печатает файл
 * на `send`.
 */

import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

import type { ChannelId } from "../api.ts";
import { PAGE_RAIL, TABLE_RAIL } from "./PageBar.tsx";
import {
  CHANNEL_TONE,
  channelReason,
  channelStateLabel,
  useChannel,
} from "../convergence.tsx";
import { useT } from "../i18n/index.ts";
import { useAppSelector } from "../store/hooks.ts";

/** Состояния, о которых на странице говорить нечего. */
const QUIET = new Set(["ok", "empty", "unmanaged", "nobody"]);

const SEVERITY = {
  default: "info",
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
} as const;

/**
 * Поля полосы над таблицей: расхождение канала, отказ, «поколение разослано».
 * Одна на все три -- три полосы в одном месте экрана обязаны начинаться на
 * одной линии, и на той же, что список под ними.
 *
 * Слева -- `TABLE_RAIL`: под полосой идёт таблица, и её первая колонка
 * начинается там же. Значка severity нет: он отжимал текст на 34px вправо, и
 * состояние канала читалось на своей вертикали, ни с чем на странице не
 * совпадающей. Цвет полосы и первое слово в ней («не разослано») говорят то
 * же, что говорил бы треугольник.
 *
 * Справа -- `PAGE_RAIL`: `Alert` уводит свои действия на -8px, и кнопка
 * кончалась на 8px от края окна вместо линии, на которой кончаются кнопки
 * полосы страницы и последняя колонка таблицы.
 *
 * Снизу -- закрывающая линия: полоса стоит прямо на шапке таблицы, и без неё
 * подложка полосы перетекала в подложку шапки одним пятном. Линия та же, что
 * разделяет строки списка, -- полоса кончается там же, где кончилась бы
 * строка над первой колонкой.
 */
export const pageNoticeSx = {
  borderRadius: 0,
  alignItems: "center",
  pl: `${TABLE_RAIL}px`,
  pr: `${PAGE_RAIL}px`,
  borderBottom: 1,
  borderColor: "divider",
  "& .MuiAlert-action": { alignItems: "center", pt: 0, mr: 0 },
} as const;

export default function ChannelNotice({ id }: { id: ChannelId }) {
  const t = useT();
  const { channel, canSend, sending, send } = useChannel(id);
  const error = useAppSelector((s) => s.convergence.error);

  if (channel === null) {
    return null;
  }

  if (QUIET.has(channel.state) && error === null) {
    return null;
  }

  if (error !== null) {
    return (
      <Alert severity="error" icon={false} sx={pageNoticeSx}>
        <AlertTitle>{t("convergence.sendFailed")}</AlertTitle>
        {error}
      </Alert>
    );
  }

  const reason = channelReason(t, channel);
  const withButton = canSend || sending;

  /*
    Одна строка: состояние с причиной, справа кнопка. Заголовок над причиной
    делал полосу двухэтажной, хотя читается она целиком и сразу. Там, где есть
    кнопка, подпись состояния не печатается: «не разослана» рядом с «Разослать»
    -- дважды одно и то же, о состоянии говорят цвет полосы и причина.
    Кнопка остаётся и на время рассылки -- с колесом вместо пропажи: исчезни
    она, полоса дёргалась бы шириной, а оператор не видел бы, что нажатие
    принято.
  */
  return (
    <Alert
      severity={SEVERITY[CHANNEL_TONE[channel.state]]}
      icon={false}
      sx={{
        ...pageNoticeSx,
        "& .MuiAlert-message": { display: "flex", alignItems: "baseline", minWidth: 0 },
      }}
      action={
        withButton ? (
          <Button
            color="warning"
            variant="contained"
            size="small"
            disabled={sending}
            onClick={send}
            startIcon={
              sending ? <CircularProgress size={14} color="inherit" /> : undefined
            }
            sx={{ whiteSpace: "nowrap" }}
          >
            {t("common.send")}
          </Button>
        ) : undefined
      }
    >
      {!withButton && (
        <Box component="span" sx={{ fontWeight: 600, mr: 1, whiteSpace: "nowrap" }}>
          {channelStateLabel(t, channel.state)}
        </Box>
      )}
      {reason}
    </Alert>
  );
}
