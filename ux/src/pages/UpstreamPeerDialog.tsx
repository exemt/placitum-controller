import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import type { UpstreamPeer } from "../api.ts";
import { Duration, Flag, Num, Text } from "../components/fields.tsx";
import { Modal } from "../components/Modal.tsx";
import { FlushSectionProvider, SettingsTable } from "../components/settings-table.tsx";
import type { Translate } from "../i18n/index.ts";

/** Строка `server` пула, пока она правится: значения -- текстом, как в полях. */
export type PeerDraft = {
  host: string;
  port: string;
  weight: string;
  maxFails: string;
  failTimeoutMs: string;
  backup: boolean;
  down: boolean;
  resolve: boolean;
};

/* Умолчания nginx: их показывает и запертое поле окна, и погашенная ячейка
   таблицы -- вместо пустоты, из которой не видно, что будет работать. */
export const PEER_WEIGHT = 1;
export const PEER_MAX_FAILS = 1;
export const PEER_FAIL_TIMEOUT_MS = 10_000;

const PORT_PRESETS = [80, 443, 8080] as const;
const WEIGHT_PRESETS = [1, 2, 5] as const;
const MAX_FAILS_PRESETS = [1, 3, 5] as const;
const FAIL_TIMEOUT_PRESETS = [10_000, 30_000, 60_000] as const;

export function emptyPeer(): PeerDraft {
  return {
    host: "",
    port: "80",
    weight: String(PEER_WEIGHT),
    maxFails: "",
    failTimeoutMs: "",
    backup: false,
    down: false,
    resolve: false,
  };
}

export function peerFromRow(row: UpstreamPeer): PeerDraft {
  return {
    host: row.host,
    port: String(row.port),
    weight: String(row.weight),
    maxFails: row.max_fails === null ? "" : String(row.max_fails),
    failTimeoutMs: row.fail_timeout_ms === null ? "" : String(row.fail_timeout_ms),
    backup: row.backup,
    down: row.down,
    resolve: row.resolve,
  };
}

/** Пусто -- «ключа нет»: строка директивы обойдётся без этого параметра. */
export function parseOptInt(value: string, min: number): number | null | "bad" {
  const text = value.trim();
  if (text === "") {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    return "bad";
  }
  const n = Number(text);
  return Number.isInteger(n) && n >= min ? n : "bad";
}

export function parsePort(value: string): number | "bad" {
  const n = parseOptInt(value, 1);
  if (n === null || n === "bad" || n > 65535) {
    return "bad";
  }
  return n;
}

/** Собранная строка -- та, что уедет в файл: пустых полей в пуле не бывает. */
export function peerReady(peer: PeerDraft): boolean {
  const weight = parseOptInt(peer.weight, 1);
  return (
    peer.host.trim() !== "" &&
    parsePort(peer.port) !== "bad" &&
    weight !== "bad" &&
    weight !== null &&
    parseOptInt(peer.maxFails, 0) !== "bad" &&
    parseOptInt(peer.failTimeoutMs, 0) !== "bad"
  );
}

/**
 * Строка `server` так, как её печатает компилятор
 * (`controller/src/compile/nginx-http.ts`, `compileUpstream`): умолчания в файл
 * не едут, `fail_timeout` -- в миллисекундах с суффиксом `ms`.
 */
export function peerLine(peer: PeerDraft): string {
  const host = peer.host.trim();
  const port = peer.port.trim();
  const parts = [`${host === "" ? "…" : host}:${port === "" ? "…" : port}`];
  const weight = peer.weight.trim();
  if (weight !== "" && weight !== String(PEER_WEIGHT)) {
    parts.push(`weight=${weight}`);
  }
  if (peer.maxFails.trim() !== "") {
    parts.push(`max_fails=${peer.maxFails.trim()}`);
  }
  if (peer.failTimeoutMs.trim() !== "") {
    parts.push(`fail_timeout=${peer.failTimeoutMs.trim()}ms`);
  }
  if (peer.backup) {
    parts.push("backup");
  }
  if (peer.down) {
    parts.push("down");
  }
  if (peer.resolve) {
    parts.push("resolve");
  }
  return `server ${parts.join(" ")};`;
}

/**
 * Сервер пула -- окном, а не строкой, которая правится на месте.
 *
 * У строки восемь параметров, и три из них (`weight=`, `max_fails=`,
 * `fail_timeout=`) в ячейке таблицы стояли голыми числами: ни выбрать `s`
 * вместо `ms`, ни увидеть, что возьмёт nginx, когда поле пустое. В окне это
 * те же строки настроек, что у keepalive рядом, -- подсказка, подстановки,
 * селектор единиц и «умолчание», -- а внизу готовая строка `server`, как она
 * уйдёт в файл. Черновая строка внизу таблицы (`DraftAddCell`) отсюда ушла:
 * из неё не было видно ни того, ни другого, и «+» в её конце читался
 * продолжением списка, а не кнопкой «завести сервер».
 */
export function PeerDialog({
  t,
  peer,
  onClose,
  onApply,
}: {
  t: Translate;
  /** `null` -- новый сервер пула. */
  peer: PeerDraft | null;
  onClose: () => void;
  onApply: (next: PeerDraft) => void;
}) {
  const initial = peer ?? emptyPeer();
  const [draft, setDraft] = useState<PeerDraft>(initial);
  const patch = (next: Partial<PeerDraft>) => setDraft((cur) => ({ ...cur, ...next }));
  const ready = peerReady(draft);
  /* Набранный руками адрес не выбрасывается промахом мимо окна. */
  const dirty = (Object.keys(initial) as (keyof PeerDraft)[]).some(
    (key) => draft[key] !== initial[key],
  );
  const apply = () => {
    if (ready) {
      onApply({ ...draft, host: draft.host.trim() });
    }
  };

  return (
    <Modal
      onClose={onClose}
      spacing={0}
      dirty={dirty}
      title={peer === null ? t("upstreams.addPeer") : t("upstreams.editPeer")}
      /* Enter -- то же, что кнопка: так добавляла черновая строка, и привычка
         пережила её. */
      onEnter={apply}
      actions={
        <>
          <Modal.Cancel />
          <Modal.Submit disabled={!ready} onClick={apply}>
            {peer === null ? t("common.add") : t("common.apply")}
          </Modal.Submit>
        </>
      }
    >
        {/*
          Строки стоят в полях окна, а не выходят за них: окно и так рамка, и
          вторая линия по её краю читалась бы вторым краем. `flush` здесь
          пришит явно -- иначе он достался бы окну от секции, в которой
          открыта таблица, и поля менялись бы от места вызова.
        */}
        <FlushSectionProvider value={true}>
        <SettingsTable>
          <Text
            mono
            label={t("upstreams.host")}
            helper={t("upstreams.hostHint")}
            placeholder="app.internal"
            value={draft.host}
            onChange={(host) => patch({ host })}
          />
          <Num
            label={t("upstreams.port")}
            helper={t("upstreams.portHint")}
            fallback={80}
            presets={PORT_PRESETS}
            value={draft.port}
            onChange={(port) => patch({ port })}
          />
          <Num
            label={t("upstreams.weight")}
            helper={t("upstreams.weightHint")}
            fallback={PEER_WEIGHT}
            presets={WEIGHT_PRESETS}
            value={draft.weight}
            onChange={(weight) => patch({ weight })}
          />
          <Num
            optional
            label={t("upstreams.maxFails")}
            helper={t("upstreams.maxFailsHint")}
            fallback={PEER_MAX_FAILS}
            presets={MAX_FAILS_PRESETS}
            value={draft.maxFails}
            onChange={(maxFails) => patch({ maxFails })}
          />
          <Duration
            base="ms"
            optional
            label={t("upstreams.failTimeoutMs")}
            helper={t("upstreams.failTimeoutHint")}
            fallback={PEER_FAIL_TIMEOUT_MS}
            presets={FAIL_TIMEOUT_PRESETS}
            value={draft.failTimeoutMs === "" ? undefined : Number(draft.failTimeoutMs)}
            onChange={(next) =>
              patch({ failTimeoutMs: next === undefined ? "" : String(next) })
            }
          />
          <Flag
            label={t("upstreams.backup")}
            helper={t("upstreams.backupHint")}
            checked={draft.backup}
            onChange={(backup) => patch({ backup })}
          />
          <Flag
            label={t("upstreams.down")}
            helper={t("upstreams.downHint")}
            checked={draft.down}
            onChange={(down) => patch({ down })}
          />
          <Flag
            label={t("upstreams.resolve")}
            helper={t("upstreams.resolveHint")}
            checked={draft.resolve}
            onChange={(resolve) => patch({ resolve })}
          />
        </SettingsTable>
        </FlushSectionProvider>
        {/* Готовая строка директивы внизу окна -- как у условий строки. */}
        <Box sx={{ pt: 2 }}>
          <Typography
            sx={{
              fontSize: "0.68rem",
              fontWeight: 600,
              textTransform: "uppercase",
              color: "text.secondary",
              lineHeight: 1,
              mb: 0.5,
            }}
          >
            {t("upstreams.peerLineTitle")}
          </Typography>
          <Box
            component="code"
            sx={{
              display: "block",
              px: 1.25,
              py: 0.75,
              borderRadius: 0.75,
              bgcolor: "background.default",
              border: 1,
              borderColor: "divider",
              fontSize: "0.74rem",
              lineHeight: 1.5,
              fontFamily: "monospace",
              color: "text.secondary",
              wordBreak: "break-all",
            }}
          >
            {peerLine(draft)}
          </Box>
        </Box>
    </Modal>
  );
}
