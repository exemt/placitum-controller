import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

import { useT, type Translate } from "../../i18n/index.ts";
import { useIpGeo } from "./useIpGeo.ts";
import type { GeoHit } from "./geoStore.ts";

export type GeoField = "country" | "asn";

export type GeoSeek = {
  apply: (field: GeoField, value: string) => void;
  active?: Partial<Record<GeoField, string>>;
  hint?: (active: boolean) => string;
};

interface GeoTag {
  title: string;
  label: string;
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

export function geoTagOf(
  geo: GeoHit,
  field: GeoField,
): { label: string; value: string } | undefined {
  const tag = field === "country" ? countryTag(geo) : asnTag(geo);

  return tag === undefined || tag.value === undefined
    ? undefined
    : { label: tag.label, value: tag.value };
}

export const GEO_FIELDS: readonly GeoField[] = ["asn", "country"];

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
  onSeek?: () => void;
  seekHint?: string;
  seekActive?: boolean;
  geoSeek?: GeoSeek;
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
