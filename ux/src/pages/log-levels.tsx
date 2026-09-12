/*
 * Уровни журнала сервисов контура: кнопка в шапке «Журналов» и окно с таблицей.
 *
 * Правка уходит в KV сразу (policy/log-levels) -- без черновика и рассылки:
 * уровень -- ручка расследования, а не конфигурация контура, и сервис
 * переставляет порог первым же событием watch, без рестарта. Подтверждение --
 * его же строка «log level applied» в этом журнале.
 *
 * Кнопка стоит здесь, а не в «Состоянии»: уровень поднимают, когда смотрят в
 * журнал и не видят нужного, -- и видят результат на той же странице.
 *
 * Инспекторов в таблице нет: их уровень -- запись каталога и едет поколением,
 * и вторая ручка для того же порога давала бы два ответа на один вопрос.
 */

import { useEffect, useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import TuneIcon from "@mui/icons-material/Tune";

import {
  fetchLogLevels,
  INSPECTOR_LOG_LEVELS,
  saveLogLevels,
  type InspectorLogLevel,
  type LogLevels,
} from "../api.ts";
import { Modal } from "../components/Modal.tsx";
import { TableIconButton } from "../components/data-table/index.ts";
import { useT } from "../i18n/index.ts";
import type { FormNotice } from "../store/slices/forms.ts";

/** Кнопка шапки: окно живёт в её состоянии и монтируется только открытым. */
export function LogLevelsButton() {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableIconButton
        icon={<TuneIcon />}
        tooltip={t("logsPage.levels.button")}
        onClick={() => setOpen(true)}
      />
      {open && <LogLevelsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

type Draft = Record<string, InspectorLogLevel | "">;

function LogLevelsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [state, setState] = useState<LogLevels | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<FormNotice | null>(null);

  useEffect(() => {
    let alive = true;

    fetchLogLevels()
      .then((row) => {
        if (alive) {
          setState(row);
          setDraft(row.levels);
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setNotice({ text: t("logsPage.levels.loadFailed", { error: message(err) }) });
        }
      });

    return () => {
      alive = false;
    };
  }, [t]);

  /*
   * Таблица уезжает целиком: ключ без значения снимается, и сервис
   * возвращается к переменной окружения. Документ один на контур, и частичная
   * правка означала бы угадывать, что лежит в соседних ключах.
   */
  const save = async () => {
    if (state === null) {
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      const levels: Record<string, InspectorLogLevel | null> = {};

      for (const svc of state.services) {
        const word = draft[svc.name] ?? "";
        levels[svc.name] = word === "" ? null : word;
      }

      await saveLogLevels(levels);
      onClose();
    } catch (err) {
      setNotice({ text: t("logsPage.levels.saveFailed", { error: message(err) }) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title={t("logsPage.levels.title")}
      hint={t("logsPage.levels.hint")}
      busy={busy}
      notice={notice}
      onNoticeClose={() => setNotice(null)}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit onClick={() => void save()} disabled={state === null || busy}>
            {t("common.save")}
          </Modal.Submit>
        </>
      }
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t("logsPage.levels.service")}</TableCell>
            <TableCell>{t("logsPage.levels.level")}</TableCell>
            <TableCell>{t("logsPage.levels.env")}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(state?.services ?? []).map((svc) => (
            <TableRow key={svc.name}>
              <TableCell sx={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>
                {svc.name}
              </TableCell>
              <TableCell sx={{ width: 180 }}>
                <TextField
                  select
                  size="small"
                  fullWidth
                  value={draft[svc.name] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [svc.name]: e.target.value as InspectorLogLevel | "",
                    })
                  }
                  slotProps={{
                    input: { sx: { fontFamily: "monospace" } },
                    htmlInput: { "aria-label": svc.name },
                    // Пустое значение -- не «ничего», а «из окружения»: без
                    // displayEmpty селектор показал бы пустую ячейку.
                    select: { displayEmpty: true },
                  }}
                >
                  <MenuItem value="">
                    <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
                      {t("logsPage.levels.fromEnv")}
                    </Typography>
                  </MenuItem>
                  {INSPECTOR_LOG_LEVELS.map((level) => (
                    <MenuItem key={level} value={level} sx={{ fontFamily: "monospace" }}>
                      {level}
                    </MenuItem>
                  ))}
                </TextField>
              </TableCell>
              <TableCell
                sx={{ fontFamily: "monospace", whiteSpace: "nowrap", color: "text.secondary" }}
              >
                {svc.env}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Typography variant="body2" sx={{ mt: 2, color: "text.secondary" }}>
        {t("logsPage.levels.others")}
      </Typography>
    </Modal>
  );
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
