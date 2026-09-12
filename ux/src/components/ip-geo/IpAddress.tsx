import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { useT, type Translate } from "../../i18n/index.ts";
import { useIpGeo } from "./useIpGeo.ts";
import type { GeoHit } from "./geoStore.ts";

/** Что подпись значит для фильтра: поле и значение, как их принимает список. */
export type GeoField = "country" | "asn";

/** Клик по подписи: страна и ASN просятся в фильтр так же, как адрес. */
export type GeoSeek = {
  apply: (field: GeoField, value: string) => void;
  /** Что сейчас в фильтрах: подпись подсвечена, повторный клик снимает. */
  active?: Partial<Record<GeoField, string>>;
  hint?: (active: boolean) => string;
};

/** Подпись к адресу: что показать, что сказать под курсором, чем отбирать. */
interface GeoTag {
  title: string;
  label: string;
  /*
   * Значение для фильтра -- не то же, что подпись: в подписи `AS9009` и
   * хвост `+2`, а отбирают по голому номеру. Пусто -- подпись не отбирает
   * (прочерк «каталог не знает»).
   */
  field?: GeoField;
  value?: string;
}

function extraOf(count: number): string {
  return count > 1 ? ` +${count - 1}` : "";
}

function countryTag(geo: GeoHit): GeoTag | undefined {
  const country = geo.countries[0];
  if (country === undefined) {
    return undefined;
  }
  return {
    title: geo.countries.map((row) => row.name ?? row.code.toUpperCase()).join(", "),
    label: `${country.code.toUpperCase()}${extraOf(geo.countries.length)}`,
    field: "country",
    value: country.code,
  };
}

function asnTag(geo: GeoHit): GeoTag | undefined {
  const asn = geo.asns[0];
  if (asn === undefined) {
    return undefined;
  }
  return {
    title: geo.asns.map((row) => row.name ?? `AS${row.asn}`).join(", "),
    label: `AS${asn.asn}${extraOf(geo.asns.length)}`,
    field: "asn",
    value: String(asn.asn),
  };
}

/**
 * Одна подпись адреса по имени поля -- для тех, кто показывает её сам
 * (колонка списка), а не хвостом карточки. `undefined` -- каталог адреса не
 * знает: рисовать нечего.
 */
export function geoTagOf(
  geo: GeoHit,
  field: GeoField,
): { label: string; value: string } | undefined {
  const tag = field === "country" ? countryTag(geo) : asnTag(geo);

  return tag === undefined || tag.value === undefined
    ? undefined
    : { label: tag.label, value: tag.value };
}

/** Что показывать хвостом, если не сказано иного. */
export const GEO_FIELDS: readonly GeoField[] = ["asn", "country"];

/**
 * Хвост адреса: ASN, потом код страны. Кодер знает не всё -- неизвестное
 * не занимает места, а на пустой ответ идёт один прочерк с подсказкой,
 * иначе прочерк читается как поломка. Кодера не спросили (`error`) --
 * прочерк тот же, но подсказка другая: это разные вещи.
 *
 * `fields` -- чего в строке ещё нет своей колонкой: у поднятой колонки
 * значение уже стоит рядом, и подпись повторяла бы его. Пустой список --
 * хвоста нет вовсе, включая прочерк: «не знает» скажет сама колонка.
 */
function geoTags(
  geo: GeoHit,
  t: Translate,
  fields: readonly GeoField[],
): GeoTag[] {
  if (fields.length === 0) {
    return [];
  }

  if (geo.status === "error") {
    return [{ title: t("geo.unreachable"), label: "—" }];
  }

  const tags = fields
    .map((field) => (field === "asn" ? asnTag(geo) : countryTag(geo)))
    .filter((tag): tag is GeoTag => tag !== undefined);

  if (tags.length === 0) {
    return [{ title: t("geo.unknown"), label: "—" }];
  }

  return tags;
}

/** Разделитель между адресом и подписями: точка по центру строки. */
function Dot() {
  return (
    <Typography
      component="span"
      variant="caption"
      color="text.disabled"
      aria-hidden
      sx={{ userSelect: "none" }}
    >
      ·
    </Typography>
  );
}

function GeoLabel({ tag, seek }: { tag: GeoTag; seek?: GeoSeek }) {
  const clickable =
    seek !== undefined && tag.field !== undefined && tag.value !== undefined;
  const on =
    clickable && (seek.active?.[tag.field!] ?? "") === tag.value;

  return (
    <Tooltip title={tag.title}>
      <Typography
        component="span"
        variant="caption"
        color="text.secondary"
        title={clickable ? seek.hint?.(on) : undefined}
        onClick={
          clickable
            ? (e) => {
                e.stopPropagation();
                seek.apply(tag.field!, tag.value!);
              }
            : undefined
        }
        sx={{
          fontFamily: "monospace",
          whiteSpace: "nowrap",
          ...(clickable && {
            // Подсветка снаружи значения -- как у самого адреса выше.
            boxSizing: "content-box",
            px: 0.5,
            mx: -0.5,
            borderRadius: "2px",
            cursor: "pointer",
            bgcolor: on ? "action.selected" : "transparent",
            "&:hover": { bgcolor: "action.hover" },
          }),
        }}
      >
        {tag.label}
      </Typography>
    </Tooltip>
  );
}

/** Хвост подписей с точками-разделителями перед каждой. */
function GeoTail({ tags, seek }: { tags: GeoTag[]; seek?: GeoSeek }) {
  return (
    <>
      {tags.map((tag) => (
        <Stack
          key={tag.label}
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center" }}
        >
          <Dot />
          <GeoLabel tag={tag} seek={seek} />
        </Stack>
      ))}
    </>
  );
}

export function IpGeo({ value }: { value: string }) {
  const geo = useIpGeo(value);
  const t = useT();
  if (geo.status === "pending") {
    return null;
  }
  const tag = countryTag(geo) ?? {
    title: geo.status === "error" ? t("geo.unreachable") : t("geo.unknown"),
    label: "—",
  };
  return <GeoLabel tag={tag} />;
}

export function IpAsn({ value }: { value: string }) {
  const geo = useIpGeo(value);
  const t = useT();
  if (geo.status === "pending") {
    return null;
  }
  const tag = asnTag(geo) ?? {
    title: geo.status === "error" ? t("geo.unreachable") : t("geo.unknown"),
    label: "—",
  };
  return <GeoLabel tag={tag} />;
}

/**
 * Карточка одного IP-адреса: `адрес · ASN · страна`. Сам поход за страной и
 * ASN не делает -- заявка и ответ идут через `IpGeoProvider` (см. `useIpGeo`),
 * поэтому сотня таких карточек на странице бьёт кодер одной пачкой, а не
 * сотней запросов.
 */
export function IpAddress({
  value,
  mono = true,
  onSeek,
  seekHint,
  seekActive = false,
  geoSeek,
  geoFields = GEO_FIELDS,
}: {
  value: string;
  mono?: boolean;
  /** Клик по самому адресу: `ip=` в фильтре списка. */
  onSeek?: () => void;
  seekHint?: string;
  seekActive?: boolean;
  /**
   * Клик по подписи. Страна и ASN -- такие же значения фильтра, как адрес
   * (журнал отбирает по ним словарём каталога), поэтому и кликаются так же.
   * Без этого поля подпись остаётся текстом: там, где фильтра нет, «клик»,
   * ничего не меняющий, хуже отсутствия клика.
   */
  geoSeek?: GeoSeek;
  /**
   * Какие подписи показывать. По умолчанию обе; строка таблицы отдаёт сюда
   * только то, чего у неё нет своей колонкой.
   */
  geoFields?: readonly GeoField[];
}) {
  const geo = useIpGeo(value);
  const t = useT();
  const settled = geo.status !== "pending";

  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{ alignItems: "center", minWidth: 0 }}
    >
      <Typography
        component="span"
        variant="body2"
        noWrap
        title={onSeek !== undefined ? seekHint : undefined}
        onClick={
          onSeek === undefined
            ? undefined
            : (e) => {
                e.stopPropagation();
                onSeek();
              }
        }
        sx={{
          fontFamily: mono ? "monospace" : undefined,
          ...(onSeek !== undefined && {
            // Паддинг подсветки -- снаружи значения, а не за его счёт: см.
            // `Seekable` в `pages/incident-cells.tsx`.
            boxSizing: "content-box",
            px: 0.5,
            mx: -0.5,
            borderRadius: "2px",
            cursor: "pointer",
            bgcolor: seekActive ? "action.selected" : "transparent",
            "&:hover": { bgcolor: "action.hover" },
          }),
        }}
      >
        {value}
      </Typography>
      {settled && <GeoTail tags={geoTags(geo, t, geoFields)} seek={geoSeek} />}
    </Stack>
  );
}
