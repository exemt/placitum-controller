import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { Optional } from "../components/fields.tsx";
import { SettingsRow, UnitSelect } from "../components/settings-table.tsx";
import { useT } from "../i18n/index.ts";
import {
  dropKey,
  offValue,
  resolve,
  seedFor,
  setKey,
  type Doc,
  type ParentChain,
} from "./inherit.ts";

export interface InheritedCtx {
  value: unknown;
  inheriting: boolean;
  off: boolean;
  set: (next: unknown) => void;
  drop: () => void;
}

export function InheritedRow({
  label,
  help,
  fieldKey,
  doc,
  parents,
  onChange,
  offable,
  unit,
  seed: emptySeed,
  end,
  children,
}: {
  label: string;
  help?: string;
  fieldKey: string;
  doc: Doc;
  parents: ParentChain;
  onChange: (next: Doc) => void;
  offable?: boolean;
  unit?: ReactNode;
  seed?: unknown;
  end?: (row: InheritedCtx) => ReactNode;
  children: (value: unknown, set: (next: unknown) => void, row: InheritedCtx) => ReactNode;
}) {
  const t = useT();
  const state = resolve(doc, fieldKey, parents);
  const inheriting = state.state === "inherit";
  const set = (next: unknown) => onChange(setKey(doc, fieldKey, next));
  const ctx: InheritedCtx = {
    value: state.value,
    inheriting,
    off: state.state === "off",
    set,
    drop: () => onChange(dropKey(doc, fieldKey)),
  };

  const seed = () => {
    const inherited = seedFor(fieldKey, state);
    set(inherited === "" || inherited === undefined ? emptySeed : inherited);
  };
  const aside = (
    <Optional
      overridden={!inheriting}
      onOverridden={(on) => (on ? seed() : ctx.drop())}
    />
  );
  const modeSelect =
    offable === true && !inheriting ? (
      <UnitSelect<"set" | "off">
        label={label}
        value={state.state === "off" ? "off" : "set"}
        options={[
          { value: "set", label: t("routeSettings.kind.override") },
          { value: "off", label: t("routeSettings.kind.none") },
        ]}
        onChange={(next) => {
          if (next === "off" && state.state !== "off") {
            onChange({ ...doc, [fieldKey]: offValue(fieldKey) });
          } else if (next === "set" && state.state === "off") {
            seed();
          }
        }}
      />
    ) : undefined;

  return (
    <SettingsRow
      quiet
      grow
      label={label}
      help={help}
      unit={modeSelect ?? unit}
      check={aside}
      end={ctx.off ? undefined : end?.(ctx)}
    >
      <Box
        sx={{
          width: "100%",
          minWidth: 0,
          opacity: inheriting ? 0.62 : 1,
        }}
      >
        {ctx.off ? (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t("inherit.off")}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>{children(state.value, set, ctx)}</Box>
            {inheriting && state.from !== undefined && (
              <Typography
                component="span"
                sx={{ fontSize: "0.7rem", color: "text.secondary", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                ({t(`inherit.tag.${state.from}`)})
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </SettingsRow>
  );
}
